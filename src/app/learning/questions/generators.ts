import type { BuildAnalysis, ItemContent, Scenario, Text, Threat } from '../../content/content.model';
import type { GameItem, HeroData, StatLine } from '../../core/game-data/game-data.model';
import { THREAT_LABELS } from '../../content/labels';
import type { QOption, Question, QuestionType } from './question.model';
import type { Rng } from './rng';

/**
 * Question generators. Data questions are derived only from official client data (always
 * correct for the current game version). Content questions use the validated expert layer.
 * Every generator shuffles options, so position never gives the answer away.
 */
export interface GenContext {
  items: GameItem[];
  itemMap: Map<string, GameItem>;
  heroMap: Map<string, HeroData>;
  content: Record<string, ItemContent>;
  /** item -> items the learner confused it with. */
  confusions: Map<string, Set<string>>;
  heroKey: string | null;
}

const T = (ru: string, en: string): Text => ({ ru, en });

/* ------------------------------------------------------------------ distractors */

export function similarity(a: GameItem, b: GameItem, ctx: GenContext): number {
  let s = 0;
  if (a.slot === b.slot) s += 3;
  if (a.tier === b.tier) s += 2;
  else if (Math.abs(a.tier - b.tier) === 1) s += 1;
  if (a.shopGroup && a.shopGroup === b.shopGroup) s += 4;
  if (a.isActive === b.isActive) s += 1;
  if (!!a.imbue === !!b.imbue) s += 0.5;
  const ra = ctx.content[a.key]?.roles ?? [];
  const rb = new Set(ctx.content[b.key]?.roles ?? []);
  s += Math.min(3, ra.filter((r) => rb.has(r)).length);
  if (ctx.confusions.get(a.key)?.has(b.key)) s += 6;
  return s;
}

/** Picks `n` distinct distractors. hardness 0 = random, 1 = most similar items. */
export function pickDistractors(
  target: GameItem,
  n: number,
  ctx: GenContext,
  rng: Rng,
  hardness: number,
  filter: (i: GameItem) => boolean = () => true,
): GameItem[] {
  const pool = ctx.items.filter((i) => i.key !== target.key && i.name.en !== target.name.en && filter(i));
  const scored = pool.map((i) => ({ i, w: Math.exp((hardness * similarity(target, i, ctx)) / 2) }));
  const out: GameItem[] = [];
  const left = [...scored];
  while (out.length < n && left.length) {
    const pick = rng.weighted(left, (x) => x.w);
    if (!pick) break;
    out.push(pick.i);
    left.splice(left.indexOf(pick), 1);
  }
  return out;
}

function hardnessFor(difficulty: number): number {
  return [0, 0.15, 0.45, 0.75, 1, 1.25][Math.max(0, Math.min(5, difficulty))];
}

function itemOptions(correct: GameItem, distractors: GameItem[], rng: Rng): QOption[] {
  return rng.shuffle([correct, ...distractors]).map((i) => ({ id: i.key, itemKey: i.key, correct: i.key === correct.key }));
}

function base(
  type: QuestionType,
  item: GameItem,
  extra: Partial<Question> & Pick<Question, 'format' | 'difficulty' | 'dim' | 'prompt' | 'options' | 'optionView'>,
): Question {
  return {
    id: `${type}:${item.key}`,
    type,
    heroKey: null,
    targets: [{ item: item.key, dim: extra.dim, weight: 1 }],
    allowDontKnow: true,
    askConfidence: false,
    hints: 'full',
    fastMs: 6000,
    expectedItem: item.key,
    explain: { focusItem: item.key, lines: [] },
    ...extra,
  };
}

/** Removes the item's own names from a text (prevents answer leaks in effect questions). */
export function scrubNames(text: string, item: GameItem): string {
  let s = text;
  for (const n of [item.name.en, item.name.ru]) {
    if (!n) continue;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    s = s.replace(new RegExp(`[«"]?${esc}[»"]?('s)?`, 'gi'), '___');
  }
  return s;
}

function firstSentence(s: string): string {
  const clean = s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  const m = clean.match(/^(.{20,220}?[.!?])(\s|$)/);
  return m ? m[1] : clean.slice(0, 220);
}

/* ------------------------------------------------------------------ recognition */

export function iconName(item: GameItem, ctx: GenContext, rng: Rng, difficulty: number): Question {
  const n = difficulty <= 1 ? 2 : difficulty >= 4 ? 4 : 3;
  const distractors = pickDistractors(item, n, ctx, rng, hardnessFor(difficulty));
  return base('icon-name', item, {
    format: 'mc',
    optionView: 'name',
    difficulty,
    dim: 'icon',
    fastMs: 4000,
    prompt: { text: T('Что это за предмет?', 'Which item is this?'), itemKey: item.key, showIcon: true, showName: false },
    options: itemOptions(item, distractors, rng),
  });
}

export function nameIcon(item: GameItem, ctx: GenContext, rng: Rng, difficulty: number): Question {
  const distractors = pickDistractors(item, 3, ctx, rng, hardnessFor(difficulty + 1));
  return base('name-icon', item, {
    format: 'icon-mc',
    optionView: 'icon',
    difficulty,
    dim: 'icon',
    fastMs: 4000,
    prompt: { text: T('Найди иконку предмета', 'Find the icon of'), itemKey: item.key, showIcon: false, showName: true },
    options: itemOptions(item, distractors, rng),
  });
}

export function iconRecall(item: GameItem, difficulty: number, timed: boolean): Question {
  return base('icon-recall', item, {
    format: 'recall',
    optionView: 'name',
    difficulty,
    dim: 'icon',
    fastMs: 7000,
    timeLimitMs: timed ? 15000 : undefined,
    prompt: { text: T('Назови предмет', 'Name this item'), sub: T('Можно по-английски или по-русски', 'English or Russian name'), itemKey: item.key, showIcon: true, showName: false },
    options: [],
    accept: [item.name.en, item.name.ru],
  });
}

export function nameSlot(item: GameItem, rng: Rng): Question {
  const slots: { id: GameItem['slot']; text: Text }[] = [
    { id: 'weapon', text: T('Weapon (оружие, оранжевый)', 'Weapon (orange)') },
    { id: 'vitality', text: T('Vitality (живучесть, зелёный)', 'Vitality (green)') },
    { id: 'spirit', text: T('Spirit (дух, фиолетовый)', 'Spirit (purple)') },
  ];
  return base('icon-slot', item, {
    format: 'mc',
    optionView: 'text',
    difficulty: 1,
    dim: 'mechanics',
    fastMs: 3500,
    prompt: { text: T('В какой вкладке магазина этот предмет?', 'Which shop tab is this item in?'), itemKey: item.key, showIcon: false, showName: true },
    options: rng.shuffle(slots).map((s) => ({ id: s.id, text: s.text, correct: s.id === item.slot })),
  });
}

export function activationKind(item: GameItem): 'passive' | 'passive-imbue' | 'active' | 'active-imbue' {
  if (item.isActive) return item.imbue ? 'active-imbue' : 'active';
  return item.imbue ? 'passive-imbue' : 'passive';
}

export function iconActivation(item: GameItem, rng: Rng, difficulty: number): Question {
  const kinds: { id: ReturnType<typeof activationKind>; text: Text }[] = [
    { id: 'passive', text: T('Пассивный, работает сам', 'Passive, works on its own') },
    { id: 'passive-imbue', text: T('Пассивный, привязывается к способности (imbue)', 'Passive, imbued on an ability') },
    { id: 'active', text: T('Активный, его нужно нажимать', 'Active, must be pressed') },
    { id: 'active-imbue', text: T('Активный и привязывается к способности', 'Active and imbued on an ability') },
  ];
  const k = activationKind(item);
  return base('icon-activation', item, {
    format: 'mc',
    optionView: 'text',
    difficulty,
    dim: 'mechanics',
    fastMs: 5000,
    prompt: {
      text: T('Как работает этот предмет?', 'How does this item work?'),
      itemKey: item.key,
      showIcon: true,
      showName: difficulty <= 2,
    },
    options: rng.shuffle(kinds).map((x) => ({ id: x.id, text: x.text, correct: x.id === k })),
  });
}

export function iconTier(item: GameItem, rng: Rng, difficulty: number): Question {
  const costs = [800, 1600, 3200, 6400];
  return base('icon-tier', item, {
    format: 'mc',
    optionView: 'text',
    difficulty,
    dim: 'build',
    fastMs: 4500,
    prompt: { text: T('Сколько стоит этот предмет?', 'How much does this item cost?'), itemKey: item.key, showIcon: true, showName: difficulty <= 2 },
    options: rng.shuffle(costs).map((c) => ({ id: String(c), text: T(`${c} душ`, `${c} souls`), correct: c === item.cost })),
  });
}

/* ------------------------------------------------------------------ effect & mechanics */

function jobOf(item: GameItem, ctx: GenContext): Text | null {
  const c = ctx.content[item.key];
  if (c?.job?.ru) return { ru: scrubNames(c.job.ru, item), en: c.job.en ? scrubNames(c.job.en, item) : undefined };
  const en = item.summary.en ? scrubNames(firstSentence(item.summary.en), item) : '';
  const ru = item.summary.ru ? scrubNames(firstSentence(item.summary.ru), item) : en;
  return en || ru ? { ru, en } : null;
}

export function itemEffect(item: GameItem, ctx: GenContext, rng: Rng, difficulty: number): Question | null {
  const job = jobOf(item, ctx);
  if (!job) return null;
  const distractors = pickDistractors(item, 3, ctx, rng, hardnessFor(difficulty), (i) => !!jobOf(i, ctx));
  if (distractors.length < 2) return null;
  const opts: QOption[] = rng.shuffle([item, ...distractors]).map((i) => ({
    id: i.key,
    text: jobOf(i, ctx) as Text,
    correct: i.key === item.key,
    itemKey: undefined,
  }));
  return base('item-effect', item, {
    format: 'mc',
    optionView: 'text',
    difficulty,
    dim: 'effect',
    fastMs: 9000,
    prompt: { text: T('Какую задачу решает этот предмет?', 'What job does this item do?'), itemKey: item.key, showIcon: true, showName: true },
    options: opts,
    // Options are other items' jobs: on a wrong pick, compare with that item.
  });
}

export function effectItem(item: GameItem, ctx: GenContext, rng: Rng, difficulty: number): Question | null {
  const job = jobOf(item, ctx);
  if (!job) return null;
  const distractors = pickDistractors(item, 3, ctx, rng, hardnessFor(difficulty));
  return base('effect-item', item, {
    format: difficulty >= 4 ? 'icon-mc' : 'mc',
    optionView: difficulty >= 4 ? 'icon' : 'icon-name',
    difficulty,
    dim: 'effect',
    fastMs: 9000,
    prompt: { text: T('Какой предмет так работает?', 'Which item works like this?'), quote: job },
    options: itemOptions(item, distractors, rng),
  });
}

const STAT_PROPS_SKIP = new Set(['AbilityCooldown', 'AbilityDuration', 'AbilityCastRange', 'AbilityCharges']);

export function keyStats(item: GameItem, max = 4): StatLine[] {
  const lines: StatLine[] = [];
  for (const s of item.sections) for (const l of s.stats) if (!STAT_PROPS_SKIP.has(l.prop)) lines.push(l);
  lines.sort((a, b) => Number(b.important) - Number(a.important));
  return lines.slice(0, max);
}

export function statItem(item: GameItem, ctx: GenContext, rng: Rng, difficulty: number): Question | null {
  const stats = keyStats(item, 4);
  if (stats.length < 2) return null;
  const sig = (i: GameItem) => keyStats(i, 4).map((l) => `${l.prop}:${l.raw}`).join('|');
  const mine = sig(item);
  const distractors = pickDistractors(item, 3, ctx, rng, hardnessFor(difficulty + 1), (i) => sig(i) !== mine);
  return base('stat-item', item, {
    format: 'mc',
    optionView: 'icon-name',
    difficulty,
    dim: 'mechanics',
    fastMs: 10000,
    prompt: { text: T('У какого предмета такие характеристики?', 'Which item has these stats?'), stats },
    options: itemOptions(item, distractors, rng),
  });
}

/** True/false facts derived from client data. */
export function mechanicTF(item: GameItem, ctx: GenContext, rng: Rng, difficulty: number): Question {
  const facts: { id: string; text: Text; truth: boolean; why: Text }[] = [];
  facts.push({
    id: 'active',
    text: T(`${item.name.en} - активный предмет: его нужно нажимать.`, `${item.name.en} is an active item: you have to press it.`),
    truth: item.isActive,
    why: item.isActive
      ? T(`Да: у предмета есть активный эффект${item.cooldown ? `, перезарядка ${item.cooldown} с` : ''}.`, `Yes: it has an active effect${item.cooldown ? `, cooldown ${item.cooldown}s` : ''}.`)
      : T('Нет: эффект пассивный, работает без нажатия.', 'No: the effect is passive.'),
  });
  facts.push({
    id: 'imbue',
    text: T(`${item.name.en} при покупке привязывается к одной из твоих способностей (imbue).`, `${item.name.en} is imbued on one of your abilities when bought.`),
    truth: !!item.imbue,
    why: item.imbue ? T('Да: при покупке выбираешь способность.', 'Yes: you choose an ability on purchase.') : T('Нет: предмет не привязывается к способности.', 'No: it is not imbued.'),
  });
  const other = ctx.items.filter((i) => i.slot === item.slot && i.tier < item.tier && !item.components.includes(i.key));
  if (item.components.length) {
    const comp = ctx.itemMap.get(item.components[0]);
    if (comp)
      facts.push({
        id: `comp-${comp.key}`,
        text: T(`${item.name.en} собирается из ${comp.name.en}.`, `${item.name.en} builds from ${comp.name.en}.`),
        truth: true,
        why: T(`Да: ${comp.name.en} - компонент, его цена засчитывается.`, `Yes: ${comp.name.en} is a component and its cost counts.`),
      });
  }
  if (item.tier >= 2 && other.length) {
    const fake = rng.pick(other);
    facts.push({
      id: `comp-${fake.key}`,
      text: T(`${item.name.en} собирается из ${fake.name.en}.`, `${item.name.en} builds from ${fake.name.en}.`),
      truth: false,
      why: item.components.length
        ? T(`Нет: компонент - ${item.components.map((c) => ctx.itemMap.get(c)?.name.en).join(', ')}.`, `No: the component is ${item.components.map((c) => ctx.itemMap.get(c)?.name.en).join(', ')}.`)
        : T('Нет: у предмета нет компонентов.', 'No: it has no components.'),
    });
  }
  const costs = [800, 1600, 3200, 6400].filter((c) => c !== item.cost);
  const fakeCost = rng.pick(costs);
  const showCost = rng.next() < 0.5 ? item.cost : fakeCost;
  facts.push({
    id: `cost-${showCost}`,
    text: T(`${item.name.en} стоит ${showCost} душ.`, `${item.name.en} costs ${showCost} souls.`),
    truth: showCost === item.cost,
    why: T(`Цена: ${item.cost} душ (Tier ${item.tier}).`, `Price: ${item.cost} souls (Tier ${item.tier}).`),
  });
  const innate = item.sections.find((s) => s.kind === 'innate')?.stats.filter((l) => !l.negative && (l.value ?? 0) > 0) ?? [];
  if (innate.length) {
    const st = rng.pick(innate);
    facts.push({
      id: `stat-${st.prop}`,
      text: T(`${item.name.en} даёт ${st.label.ru} (${st.label.en}).`, `${item.name.en} grants ${st.label.en}.`),
      truth: true,
      why: T(`Да: +${st.raw}${st.unit && !st.raw.endsWith(st.unit) ? st.unit : ''} ${st.label.en}.`, `Yes: +${st.raw}${st.unit} ${st.label.en}.`),
    });
    const mineProps = new Set(item.sections.flatMap((s) => s.stats.map((l) => l.prop)));
    const foreign = ctx.items
      .filter((i) => i.slot === item.slot && i.key !== item.key)
      .flatMap((i) => i.sections.find((s) => s.kind === 'innate')?.stats ?? [])
      .filter((l) => !mineProps.has(l.prop) && !l.negative && (l.value ?? 0) > 0 && !innate.some((x) => x.label.en === l.label.en));
    if (foreign.length) {
      const f = rng.pick(foreign);
      facts.push({
        id: `stat-${f.prop}`,
        text: T(`${item.name.en} даёт ${f.label.ru} (${f.label.en}).`, `${item.name.en} grants ${f.label.en}.`),
        truth: false,
        why: T(`Нет: этого бонуса у предмета нет. Его постоянные бонусы: ${innate.map((l) => l.label.en).join(', ')}.`, `No. Its innate stats: ${innate.map((l) => l.label.en).join(', ')}.`),
      });
    }
  }
  const fact = rng.pick(facts);
  return {
    ...base('mechanic-tf', item, {
      format: 'tf',
      optionView: 'text',
      difficulty,
      dim: fact.id.startsWith('cost') ? 'build' : 'mechanics',
      fastMs: 5000,
      prompt: { text: fact.text, sub: T('Верно или нет?', 'True or false?'), itemKey: item.key, showIcon: true, showName: true },
      options: [
        { id: 'true', text: T('Верно', 'True'), correct: fact.truth },
        { id: 'false', text: T('Неверно', 'False'), correct: !fact.truth },
      ],
      explain: { focusItem: item.key, lines: [fact.why] },
    }),
    id: `mechanic-tf:${item.key}:${fact.id}`,
  };
}

export function componentQ(item: GameItem, ctx: GenContext, rng: Rng, difficulty: number): Question | null {
  if (item.components.length) {
    const comp = ctx.itemMap.get(item.components[0]);
    if (!comp) return null;
    const distractors = pickDistractors(comp, 3, ctx, rng, hardnessFor(difficulty), (i) => i.tier < item.tier && !item.components.includes(i.key));
    return {
      ...base('component', item, {
        format: 'mc',
        optionView: 'icon-name',
        difficulty,
        dim: 'build',
        fastMs: 7000,
        prompt: { text: T('Из какого предмета он собирается?', 'Which item does it build from?'), itemKey: item.key, showIcon: true, showName: true },
        options: itemOptions(comp, distractors, rng),
        expectedItem: comp.key,
        explain: { focusItem: item.key, compare: [comp.key], lines: [T(`${comp.name.en} поглощается при покупке, его цена засчитывается: доплата ${item.cost - comp.cost} душ.`, `${comp.name.en} is consumed; you pay ${item.cost - comp.cost} more souls.`)] },
      }),
      id: `component:${item.key}:from`,
    };
  }
  if (item.upgradesInto.length) {
    const up = ctx.itemMap.get(rng.pick(item.upgradesInto));
    if (!up) return null;
    const distractors = pickDistractors(up, 3, ctx, rng, hardnessFor(difficulty), (i) => i.tier > item.tier && !item.upgradesInto.includes(i.key));
    return {
      ...base('component', item, {
        format: 'mc',
        optionView: 'icon-name',
        difficulty,
        dim: 'build',
        fastMs: 7000,
        prompt: { text: T('Во что улучшается этот предмет?', 'What does this item upgrade into?'), itemKey: item.key, showIcon: true, showName: true },
        options: itemOptions(up, distractors, rng),
        expectedItem: up.key,
        explain: { focusItem: item.key, compare: [up.key], lines: [T(`Покупка ${up.name.en} поглощает ${item.name.en}: доплата ${up.cost - item.cost} душ.`, `Buying ${up.name.en} consumes ${item.name.en}: pay ${up.cost - item.cost} more.`)] },
      }),
      id: `component:${item.key}:into`,
    };
  }
  return null;
}

/** Two items the learner confuses: recognition contrast or function contrast. */
export function contrast(a: GameItem, b: GameItem, ctx: GenContext, rng: Rng, mode: 'icon' | 'effect'): Question {
  const target = rng.next() < 0.5 ? a : b;
  const other = target === a ? b : a;
  const job = jobOf(target, ctx);
  const byFunction = mode === 'effect' && !!job;
  return {
    ...base('contrast', target, {
      format: 'icon-mc',
      optionView: byFunction ? 'icon-name' : 'icon',
      difficulty: 3,
      dim: byFunction ? 'effect' : 'icon',
      fastMs: 6000,
      prompt: byFunction
        ? { text: T('Какой из двух предметов так работает?', 'Which of the two works like this?'), quote: job ?? undefined, pair: [a.key, b.key] }
        : { text: T('Где здесь этот предмет?', 'Which one is this item?'), sub: { ru: target.name.en, en: target.name.en }, pair: [a.key, b.key] },
      options: rng.shuffle([a, b]).map((i) => ({ id: i.key, itemKey: i.key, correct: i.key === target.key })),
      explain: {
        focusItem: target.key,
        compare: [other.key],
        lines: [T('Ты путал эти предметы. Сравни их иконки и задачу ещё раз.', 'You mixed these up. Compare their icons and jobs.')],
      },
    }),
    id: `contrast:${[a.key, b.key].sort().join('|')}:${byFunction ? 'fx' : 'ic'}:${target.key}`,
  };
}

export function problemItem(item: GameItem, ctx: GenContext, rng: Rng, difficulty: number): Question | null {
  const c = ctx.content[item.key];
  if (!c?.counters?.length) return null;
  const threat = rng.pick(c.counters) as Threat;
  const label = THREAT_LABELS[threat];
  if (!label) return null;
  const distractors = pickDistractors(item, 3, ctx, rng, hardnessFor(difficulty), (i) => {
    const ic = ctx.content[i.key];
    return !!ic && !ic.counters.includes(threat);
  });
  if (distractors.length < 2) return null;
  const why = c.buyWhen?.[0]?.text;
  return {
    ...base('problem-item', item, {
      format: 'mc',
      optionView: 'icon-name',
      difficulty,
      dim: 'counter',
      fastMs: 9000,
      prompt: { text: T('Какой из этих предметов отвечает на проблему?', 'Which of these items answers the problem?'), quote: { ru: label.ru, en: label.en } },
      options: itemOptions(item, distractors, rng),
      explain: { focusItem: item.key, lines: why ? [why] : [] },
    }),
    id: `problem-item:${item.key}:${threat}`,
  };
}

export function buildWhy(item: GameItem, analysis: BuildAnalysis, ctx: GenContext, rng: Rng): Question | null {
  const mine = analysis.items[item.key];
  if (!mine) return null;
  const others = Object.entries(analysis.items).filter(([k]) => k !== item.key);
  if (others.length < 2) return null;
  const picks = rng.shuffle(others).slice(0, 3);
  const opts: QOption[] = rng.shuffle([
    { id: item.key, text: mine.aspect, correct: true },
    ...picks.map(([k, a]) => ({ id: k, text: a.aspect, correct: false })),
  ]);
  return {
    ...base('build-why', item, {
      format: 'mc',
      optionView: 'text',
      difficulty: 3,
      dim: 'build',
      fastMs: 12000,
      prompt: { text: T('Что этот предмет усиливает в твоём билде?', 'What does this item amplify in your build?'), itemKey: item.key, showIcon: true, showName: true },
      options: opts,
      explain: { focusItem: item.key, lines: [mine.why, mine.abilityLink] },
    }),
    id: `build-why:${analysis.id}:${item.key}`,
    heroKey: analysis.build.hero,
  };
}

/* ------------------------------------------------------------------ scenarios */

export function bestOptionItems(s: Scenario): string[] {
  return s.options.filter((o) => o.verdict === 'best' && o.item).map((o) => o.item as string);
}

/** Items a scenario teaches (best answers; for imbue/active, the involved item). */
export function scenarioItems(s: Scenario, itemMap: Map<string, GameItem>): string[] {
  const best = bestOptionItems(s);
  if (best.length) return best;
  const fromOptions = s.options.map((o) => o.item).filter((x): x is string => !!x);
  if (fromOptions.length) return [...new Set(fromOptions)].slice(0, 2);
  const cited = (s.sources ?? []).filter((x) => x.startsWith('item:')).map((x) => x.slice(5));
  const imbue = [...s.owned, ...cited].filter((k) => itemMap.get(k)?.imbue);
  return [...new Set(imbue.length ? imbue : cited)].slice(0, 2);
}

export function fromScenario(s: Scenario, ctx: GenContext, rng: Rng, hints: 'full' | 'reduced' | 'none'): Question {
  const items = scenarioItems(s, ctx.itemMap);
  const targets = items.flatMap((item, i) => s.dims.map((dim) => ({ item, dim, weight: i === 0 ? 1 : 0.6 })));
  const optionView: Question['optionView'] = s.kind === 'active-timing' ? 'text' : s.kind === 'imbue' ? 'ability' : 'icon-name';
  const options: QOption[] = rng.shuffle(s.options).map((o, i) => ({
    id: o.item ?? o.ability ?? `a${i}`,
    itemKey: s.kind === 'active-timing' ? undefined : o.item,
    abilityKey: o.ability,
    text: o.action,
    correct: o.verdict === 'best',
    score: o.score,
    verdict: o.verdict,
    why: o.why,
    betterWhen: o.betterWhen,
  }));
  return {
    id: `scenario:${s.id}`,
    type: s.kind === 'diagnose-buy' ? 'diagnose' : s.kind === 'surgery' ? 'surgery' : 'scenario',
    format: s.kind === 'diagnose-buy' ? 'two-step' : s.kind === 'surgery' ? 'surgery' : 'scenario',
    difficulty: s.difficulty,
    heroKey: s.hero,
    targets: targets.length ? targets : [],
    prompt: { text: s.question },
    options,
    scenario: s,
    allowDontKnow: true,
    askConfidence: false,
    hints,
    fastMs: 25000,
    expectedItem: items[0],
    explain: { focusItem: items[0], lines: s.mechanics.map((m) => m.text), rule: s.principle },
    dim: s.dims[0] ?? 'situation',
    optionView,
  };
}
