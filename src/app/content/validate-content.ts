/**
 * Automated content validation. Pure function shared by the CLI (scripts/validate-content.ts)
 * and unit tests. Vocabularies are injected so Node can run this file with type stripping.
 */
import type { GameDataBundle, GameItem } from '../core/game-data/game-data.model';
import type {
  BuildAnalysis,
  Claim,
  GlossaryTerm,
  HeroCourse,
  ItemContent,
  ProblemEntry,
  Scenario,
  ScenarioOption,
  Text,
} from './content.model';

export interface Vocab {
  roles: readonly string[];
  threats: readonly string[];
  dims: readonly string[];
  phases: readonly string[];
  claimStatuses: readonly string[];
  scenarioKinds: readonly string[];
  verdicts: readonly string[];
  verdictMin: Record<string, number>;
  contentStatuses: readonly string[];
  forbiddenChars: readonly string[];
  /** Names of items that no longer exist under that name (unless present in current data). */
  outdatedNames?: readonly string[];
  glossaryCategories?: readonly string[];
}

export interface RawContent {
  items: { file: string; data: ItemContent[] }[];
  scenarios: { file: string; data: Scenario[] }[];
  courses: { file: string; data: HeroCourse }[];
  builds: { file: string; data: BuildAnalysis }[];
  problems: { file: string; data: ProblemEntry[] }[];
  glossary?: { file: string; data: GlossaryTerm[] }[];
}

export interface Issue {
  level: 'error' | 'warn';
  where: string;
  msg: string;
}

export interface ValidationReport {
  issues: Issue[];
  errors: number;
  warnings: number;
  stats: Record<string, number | string>;
  /** content id -> item keys it references (for pinning). */
  references: Record<string, string[]>;
}

const VERDICT_ORDER = ['bad', 'weak', 'ok', 'good', 'best'];

function verdictForScore(score: number, min: Record<string, number>): string {
  let v = 'bad';
  for (const name of VERDICT_ORDER) if (score >= (min[name] ?? 0)) v = name;
  return v;
}

/** Effective price of an item when some of its components are already owned. */
export function effectiveCost(item: GameItem, owned: string[], items: Map<string, GameItem>): number {
  let cost = item.cost;
  for (const c of item.components) {
    if (owned.includes(c)) cost -= items.get(c)?.cost ?? 0;
  }
  return Math.max(0, cost);
}

function normName(s: string): string {
  return s.toLowerCase().replace(/[«»"'’`.,!?()[\]]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** True when `text` mentions the item name (en or ru) as a whole phrase. */
export function mentionsItem(text: string, item: GameItem): boolean {
  const t = ` ${normName(text)} `;
  for (const n of [item.name.en, item.name.ru]) {
    const nn = normName(n);
    if (nn.length >= 4 && t.includes(` ${nn} `)) return true;
  }
  return false;
}

export function validateContent(raw: RawContent, game: GameDataBundle, vocab: Vocab): ValidationReport {
  const issues: Issue[] = [];
  const err = (where: string, msg: string) => issues.push({ level: 'error', where, msg });
  const warn = (where: string, msg: string) => issues.push({ level: 'warn', where, msg });
  const items = new Map(game.items.map((i) => [i.key, i]));
  const heroes = new Map(game.heroes.map((h) => [h.key, h]));
  const abilities = new Map(game.heroes.flatMap((h) => h.abilities.map((a) => [a.key, { a, hero: h.key }] as const)));
  const references: Record<string, string[]> = {};
  const ref = (id: string, key: string) => {
    (references[id] ??= []).includes(key) || references[id].push(key);
  };
  const currentNames = new Set(game.items.map((i) => i.name.en.toLowerCase()));
  const outdated = (vocab.outdatedNames ?? []).filter((n) => !currentNames.has(n.toLowerCase())).map((n) => ({ n, re: new RegExp(`(^|[^A-Za-z])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![A-Za-z])`) }));

  const checkText = (where: string, t: Text | undefined, opts: { required?: boolean; max?: number } = {}) => {
    if (!t || typeof t.ru !== 'string' || !t.ru.trim()) {
      if (opts.required !== false) err(where, 'missing ru text');
      return;
    }
    for (const lang of ['ru', 'en'] as const) {
      const s = t[lang];
      if (s === undefined) continue;
      if (typeof s !== 'string') {
        err(where, `${lang} must be a string`);
        continue;
      }
      for (const ch of vocab.forbiddenChars) if (s.includes(ch)) err(where, `${lang}: forbidden dash character "${ch}" (use "-")`);
      if (/<[a-z/][^>]*>/i.test(s)) err(where, `${lang}: HTML is not allowed`);
      if (/\bTODO\b|lorem ipsum/i.test(s)) err(where, `${lang}: placeholder text`);
      for (const o of outdated) if (o.re.test(s)) err(where, `${lang}: outdated item name "${o.n}" (not in the current client)`);
      if (opts.max && s.length > opts.max) warn(where, `${lang}: ${s.length} chars, recommended max ${opts.max}`);
    }
  };
  const checkClaims = (where: string, list: Claim[] | undefined, min: number) => {
    if (!Array.isArray(list)) {
      if (min > 0) err(where, 'missing list');
      return;
    }
    if (list.length < min) err(where, `needs at least ${min} entries`);
    list.forEach((c, i) => {
      checkText(`${where}[${i}]`, c?.text);
      if (c?.status && !vocab.claimStatuses.includes(c.status)) err(`${where}[${i}]`, `bad status ${c.status}`);
    });
  };
  const checkItemKey = (where: string, key: string, id: string | null, opts: { standard?: boolean } = {}): GameItem | null => {
    const it = items.get(key);
    if (!it) {
      err(where, `unknown item "${key}"`);
      return null;
    }
    if (opts.standard !== false && it.mode !== 'standard') warn(where, `item ${it.name.en} is Street Brawl only`);
    if (id) ref(id, key);
    return it;
  };

  /* ---------------- items */
  const seenItems = new Map<string, string>();
  for (const { file, data } of raw.items) {
    if (!Array.isArray(data)) {
      err(file, 'expected an array of item entries');
      continue;
    }
    for (const c of data) {
      const where = `${file}:${c?.key}`;
      if (!c || typeof c.key !== 'string') {
        err(file, 'entry without key');
        continue;
      }
      if (seenItems.has(c.key)) err(where, `duplicate item content (also in ${seenItems.get(c.key)})`);
      seenItems.set(c.key, file);
      const it = checkItemKey(where, c.key, `item:${c.key}`);
      if (!Array.isArray(c.roles) || c.roles.length === 0) err(where, 'roles required');
      for (const r of c.roles ?? []) if (!vocab.roles.includes(r)) err(where, `unknown role "${r}"`);
      for (const t of c.counters ?? []) if (!vocab.threats.includes(t)) err(where, `unknown threat "${t}"`);
      checkText(`${where}.job`, c.job, { max: 220 });
      checkText(`${where}.simple`, c.simple, { max: 450 });
      checkText(`${where}.detail`, c.detail, { max: 1100 });
      checkText(`${where}.example`, c.example, { max: 500 });
      checkText(`${where}.iconCue`, c.iconCue, { required: false, max: 220 });
      checkClaims(`${where}.buyWhen`, c.buyWhen, 1);
      checkClaims(`${where}.skipWhen`, c.skipWhen, 1);
      checkClaims(`${where}.mistakes`, c.mistakes, 1);
      checkClaims(`${where}.doesNotSolve`, c.doesNotSolve, 0);
      if (!Array.isArray(c.alternatives)) err(where, 'alternatives required');
      for (const a of c.alternatives ?? []) {
        if (a.key === c.key) err(where, 'alternative points to itself');
        checkItemKey(`${where}.alternatives`, a.key, null);
        checkText(`${where}.alternatives.${a.key}`, a.when);
      }
      for (const s of c.synergies ?? []) {
        const w = `${where}.synergies.${s.with}`;
        if (s.kind === 'item') checkItemKey(w, s.with, null);
        else if (s.kind === 'hero' && !heroes.has(s.with)) err(w, `unknown hero "${s.with}"`);
        else if (s.kind === 'ability' && !abilities.has(s.with)) err(w, `unknown ability "${s.with}"`);
        checkText(w, s.note);
        if (s.status && !vocab.claimStatuses.includes(s.status)) err(w, `bad status ${s.status}`);
      }
      if (it) {
        if (it.isActive && !c.activeUse) warn(where, 'active item without activeUse guidance');
        if (!it.isActive && c.activeUse) err(where, 'activeUse on a passive item');
        if (it.imbue && !c.imbue) warn(where, 'imbue item without imbue guidance');
        if (!it.imbue && c.imbue) err(where, 'imbue guidance on a non-imbue item');
        if (!it.imbue && c.roles?.includes('imbue')) err(where, 'role "imbue" on a non-imbue item');
      }
      if (c.activeUse) {
        checkText(`${where}.activeUse.when`, c.activeUse.when);
        checkText(`${where}.activeUse.saveFor`, c.activeUse.saveFor);
        checkText(`${where}.activeUse.tooEarly`, c.activeUse.tooEarly);
      }
      if (c.imbue) {
        checkText(`${where}.imbue.goodTargets`, c.imbue.goodTargets);
        checkText(`${where}.imbue.badTargets`, c.imbue.badTargets);
      }
      if (!vocab.contentStatuses.includes(c.status)) err(where, `bad status "${c.status}"`);
    }
  }

  /* ---------------- scenarios */
  const seenScen = new Set<string>();
  const optionKey = (o: ScenarioOption) => o.item ?? o.ability ?? o.action?.ru ?? '';
  for (const { file, data } of raw.scenarios) {
    if (!Array.isArray(data)) {
      err(file, 'expected an array of scenarios');
      continue;
    }
    for (const s of data) {
      const where = `${file}:${s?.id}`;
      if (!s || typeof s.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) {
        err(where, 'bad or missing id (use lowercase, digits and "-")');
        continue;
      }
      if (seenScen.has(s.id)) err(where, 'duplicate scenario id');
      seenScen.add(s.id);
      const id = `scenario:${s.id}`;
      if (!vocab.scenarioKinds.includes(s.kind)) err(where, `bad kind "${s.kind}"`);
      const hero = heroes.get(s.hero);
      if (!hero) err(where, `unknown hero "${s.hero}"`);
      if (!vocab.phases.includes(s.phase)) err(where, `bad phase "${s.phase}"`);
      if (!Number.isInteger(s.souls) || s.souls < 0) err(where, 'souls must be a non-negative integer');
      if (!Number.isInteger(s.difficulty) || s.difficulty < 1 || s.difficulty > 5) err(where, 'difficulty must be 1..5');
      const owned = Array.isArray(s.owned) ? s.owned : [];
      if (new Set(owned).size !== owned.length) err(where, 'duplicate owned items');
      for (const k of owned) checkItemKey(`${where}.owned`, k, id);
      if (owned.length > 16) err(where, 'more than 16 owned items');
      if (!Array.isArray(s.enemies) || s.enemies.length < 1 || s.enemies.length > 6) err(where, 'enemies must have 1..6 heroes');
      for (const e of s.enemies ?? []) {
        if (!heroes.has(e.hero)) err(`${where}.enemies`, `unknown hero "${e.hero}"`);
        for (const k of e.items ?? []) checkItemKey(`${where}.enemies.${e.hero}`, k, id);
        if (e.note) checkText(`${where}.enemies.${e.hero}.note`, e.note, { max: 220 });
      }
      for (const a of s.allies ?? []) if (!heroes.has(a.hero)) err(`${where}.allies`, `unknown hero "${a.hero}"`);
      checkText(`${where}.situation`, s.situation, { max: 900 });
      checkText(`${where}.question`, s.question, { max: 200 });
      checkText(`${where}.principle`, s.principle, { max: 220 });
      (s.symptoms ?? []).forEach((t, i) => checkText(`${where}.symptoms[${i}]`, t, { max: 200 }));
      checkClaims(`${where}.mechanics`, s.mechanics, 1);
      if (!Array.isArray(s.problemTags) || s.problemTags.length === 0) err(where, 'problemTags required');
      for (const t of s.problemTags ?? []) if (!vocab.threats.includes(t)) err(where, `unknown threat "${t}"`);
      if (!Array.isArray(s.dims) || s.dims.length === 0) err(where, 'dims required');
      for (const d of s.dims ?? []) if (!vocab.dims.includes(d)) err(where, `unknown dimension "${d}"`);
      for (const src of s.sources ?? []) if (!/^(item|ability|hero|patch|build|data|stat|expert):/.test(src)) err(where, `bad source "${src}"`);
      if (!s.sources?.length) warn(where, 'no sources listed');
      if (!vocab.contentStatuses.includes(s.status)) err(where, `bad status "${s.status}"`);

      const opts = Array.isArray(s.options) ? s.options : [];
      const minOpts = s.kind === 'surgery' ? 3 : 3;
      const maxOpts = s.kind === 'surgery' ? 8 : 5;
      if (opts.length < minOpts || opts.length > maxOpts) err(where, `options must have ${minOpts}..${maxOpts} entries`);
      const keys = opts.map(optionKey);
      if (new Set(keys).size !== keys.length) err(where, 'duplicate options');
      if (!opts.some((o) => o.verdict === 'best')) err(where, 'no option marked "best"');
      for (const o of opts) {
        const ow = `${where}.option(${optionKey(o)})`;
        if (typeof o.score !== 'number' || o.score < 0 || o.score > 100) err(ow, 'score must be 0..100');
        if (!vocab.verdicts.includes(o.verdict)) err(ow, `bad verdict "${o.verdict}"`);
        else if (verdictForScore(o.score, vocab.verdictMin) !== o.verdict)
          err(ow, `verdict "${o.verdict}" does not match score ${o.score} (expected "${verdictForScore(o.score, vocab.verdictMin)}")`);
        checkText(`${ow}.why`, o.why, { max: 600 });
        if (o.betterWhen) checkText(`${ow}.betterWhen`, o.betterWhen, { max: 400 });
        if (s.kind === 'buy' || s.kind === 'diagnose-buy' || s.kind === 'sell' || s.kind === 'surgery') {
          if (!o.item) {
            err(ow, `${s.kind} options need an item`);
            continue;
          }
          const it = checkItemKey(ow, o.item, id);
          if (!it) continue;
          if (s.kind === 'sell') {
            if (!owned.includes(o.item)) err(ow, 'sell option must be an owned item');
          } else if (owned.includes(o.item)) {
            err(ow, 'option is already owned');
          } else if (s.kind !== 'surgery') {
            const price = effectiveCost(it, owned, items);
            if (price > s.souls && (o.verdict === 'best' || o.verdict === 'good'))
              err(ow, `costs ${price} but only ${s.souls} souls available - cannot be "${o.verdict}"`);
          }
        }
        if (s.kind === 'imbue') {
          if (!o.ability) err(ow, 'imbue options need an ability');
          else {
            const a = abilities.get(o.ability);
            if (!a) err(ow, `unknown ability "${o.ability}"`);
            else if (a.hero !== s.hero) err(ow, 'ability does not belong to the scenario hero');
            else ref(id, o.ability);
          }
        }
        if (s.kind === 'active-timing') {
          if (!o.action) err(ow, 'active-timing options need an action text');
          else checkText(`${ow}.action`, o.action, { max: 200 });
          if (o.item) checkItemKey(ow, o.item, id);
        }
      }
      if (s.kind === 'imbue') {
        const imbueItems = [...owned, ...(s.sources ?? []).filter((x) => x.startsWith('item:')).map((x) => x.slice(5))]
          .map((k) => items.get(k))
          .filter((x): x is GameItem => !!x && !!x.imbue);
        if (!imbueItems.length) err(where, 'imbue scenario must own (or cite as item: source) an imbue item');
      }
      if (s.kind === 'diagnose-buy') {
        const d = s.diagnosis;
        if (!d) err(where, 'diagnose-buy needs a diagnosis block');
        else {
          checkText(`${where}.diagnosis.prompt`, d.prompt);
          if (d.options.length < 3 || d.options.length > 5) err(where, 'diagnosis needs 3..5 options');
          if (!d.options.some((o) => o.correct)) err(where, 'diagnosis needs a correct option');
          d.options.forEach((o) => {
            checkText(`${where}.diagnosis.${o.id}`, o.text);
            checkText(`${where}.diagnosis.${o.id}.why`, o.why);
          });
        }
      }
      if (s.kind === 'surgery') {
        if (!Array.isArray(s.startBuild) || s.startBuild.length < 4) err(where, 'surgery needs a startBuild with 4+ items');
        for (const k of s.startBuild ?? []) checkItemKey(`${where}.startBuild`, k, id);
        if (!s.swaps || s.swaps < 1 || s.swaps > 3) err(where, 'surgery needs swaps 1..3');
        for (const o of opts) if (o.item && s.startBuild?.includes(o.item)) err(where, `surgery option ${o.item} already in startBuild`);
      }
      // Answer leak: the narrative must not name the best answer.
      for (const o of opts.filter((x) => x.verdict === 'best' && x.item)) {
        const it = items.get(o.item as string);
        if (!it) continue;
        const texts = [s.situation?.ru, s.situation?.en, s.question?.ru, s.question?.en, ...(s.symptoms ?? []).flatMap((x) => [x.ru, x.en])];
        if (texts.some((t) => t && mentionsItem(t, it))) err(where, `answer leak: situation/question names the best answer "${it.name.en}"`);
      }
      if (s.tree) {
        checkText(`${where}.tree.problem`, s.tree.problem);
        checkText(`${where}.tree.choice`, s.tree.choice);
        s.tree.solutions.forEach((t, i) => checkText(`${where}.tree.solutions[${i}]`, t));
        s.tree.constraints.forEach((t, i) => checkText(`${where}.tree.constraints[${i}]`, t));
        s.tree.consequences.forEach((t, i) => checkText(`${where}.tree.consequences[${i}]`, t));
      }
    }
  }

  /* ---------------- courses */
  const seenCourse = new Set<string>();
  for (const { file, data: c } of raw.courses) {
    const where = `${file}:${c?.hero}`;
    if (!c || !heroes.has(c.hero)) {
      err(where, `unknown hero "${c?.hero}"`);
      continue;
    }
    if (seenCourse.has(c.hero)) err(where, 'duplicate course');
    seenCourse.add(c.hero);
    const hero = heroes.get(c.hero);
    const heroAbilities = new Set(hero?.abilities.map((a) => a.key));
    checkText(`${where}.summary`, c.summary);
    for (const a of c.archetypes ?? []) {
      checkText(`${where}.archetype.${a.id}.name`, a.name);
      checkText(`${where}.archetype.${a.id}.idea`, a.idea);
      for (const k of a.coreItems) checkItemKey(`${where}.archetype.${a.id}`, k, `course:${c.hero}`);
      for (const k of a.keyAbilities) if (!heroAbilities.has(k)) err(`${where}.archetype.${a.id}`, `ability ${k} is not ${hero?.name.en}'s`);
    }
    for (const n of c.abilityNotes ?? []) {
      if (!heroAbilities.has(n.ability)) err(`${where}.abilityNotes`, `ability ${n.ability} is not ${hero?.name.en}'s`);
      checkText(`${where}.abilityNotes.${n.ability}.role`, n.role);
      for (const s of n.itemSynergy) {
        checkItemKey(`${where}.abilityNotes.${n.ability}`, s.item, `course:${c.hero}`);
        checkText(`${where}.abilityNotes.${n.ability}.${s.item}`, s.note);
      }
      for (const k of n.imbue?.goodItems ?? []) {
        const it = checkItemKey(`${where}.abilityNotes.${n.ability}.imbue`, k, `course:${c.hero}`);
        if (it && !it.imbue) err(`${where}.abilityNotes.${n.ability}.imbue`, `${it.name.en} is not an imbue item`);
      }
    }
    const modIds = new Set<string>();
    for (const m of c.modules ?? []) {
      const mw = `${where}.module.${m.id}`;
      if (modIds.has(m.id)) err(mw, 'duplicate module id');
      modIds.add(m.id);
      checkText(`${mw}.title`, m.title, { max: 90 });
      checkText(`${mw}.goal`, m.goal, { max: 260 });
      if (!m.lesson?.length) err(mw, 'lesson needs paragraphs');
      m.lesson?.forEach((t, i) => checkText(`${mw}.lesson[${i}]`, t, { max: 900 }));
      m.keyPoints?.forEach((t, i) => checkText(`${mw}.keyPoints[${i}]`, t, { max: 260 }));
      for (const k of m.items ?? []) checkItemKey(mw, k, `course:${c.hero}`);
      for (const d of m.focus ?? []) if (!vocab.dims.includes(d)) err(mw, `unknown dimension "${d}"`);
    }
    for (const n of c.itemNotes ?? []) {
      checkItemKey(`${where}.itemNotes`, n.item, `course:${c.hero}`);
      checkText(`${where}.itemNotes.${n.item}`, n.note);
    }
    checkClaims(`${where}.commonMistakes`, c.commonMistakes, 0);
  }

  /* ---------------- builds */
  for (const { file, data: b } of raw.builds) {
    const where = `${file}:${b?.id}`;
    if (!b?.build || !heroes.has(b.build.hero)) {
      err(where, 'build with unknown hero');
      continue;
    }
    const hero = heroes.get(b.build.hero);
    const heroAbilities = new Set(hero?.abilities.map((a) => a.key));
    const buildItems = new Set<string>();
    for (const cat of b.build.categories) {
      for (const r of cat.items) {
        const it = checkItemKey(`${where}.build.${cat.name}`, r.key, `build:${b.id}`);
        buildItems.add(r.key);
        if (r.imbue) {
          if (!heroAbilities.has(r.imbue)) err(`${where}.build`, `imbue target ${r.imbue} is not a hero ability`);
          if (it && !it.imbue) err(`${where}.build`, `${it.name.en} is not an imbue item`);
        }
      }
    }
    checkText(`${where}.title`, b.title);
    checkText(`${where}.overview`, b.overview, { max: 1500 });
    checkClaims(`${where}.strengths`, b.strengths, 1);
    checkClaims(`${where}.risks`, b.risks, 1);
    checkClaims(`${where}.diff`, b.diff, 0);
    for (const [key, a] of Object.entries(b.items ?? {})) {
      const aw = `${where}.items.${key}`;
      if (!buildItems.has(key)) err(aw, 'analysis for an item that is not in the build');
      for (const f of ['why', 'aspect', 'abilityLink', 'timing', 'lessUseful', 'ifSkipped', 'replaceOrSell'] as const)
        checkText(`${aw}.${f}`, a[f], { max: 700 });
      for (const alt of a.alternatives ?? []) {
        checkItemKey(`${aw}.alternatives`, alt.key, null);
        checkText(`${aw}.alternatives.${alt.key}`, alt.when);
      }
      for (const k of a.enablers?.items ?? []) checkItemKey(`${aw}.enablers`, k, null);
      checkText(`${aw}.enablers.note`, a.enablers?.note);
      if (!a.reconsiderSignals?.length) err(aw, 'reconsiderSignals required');
      a.reconsiderSignals?.forEach((t, i) => checkText(`${aw}.reconsiderSignals[${i}]`, t));
    }
    const missing = [...buildItems].filter((k) => !b.items?.[k]);
    if (missing.length) warn(where, `${missing.length} build items without analysis: ${missing.join(', ')}`);
  }

  /* ---------------- problems */
  const seenProblems = new Set<string>();
  for (const { file, data } of raw.problems) {
    for (const p of data ?? []) {
      const where = `${file}:${p?.id}`;
      if (seenProblems.has(p.id)) err(where, 'duplicate problem id');
      seenProblems.add(p.id);
      checkText(`${where}.title`, p.title, { max: 120 });
      checkText(`${where}.explanation`, p.explanation, { max: 900 });
      for (const t of p.threats ?? []) if (!vocab.threats.includes(t)) err(where, `unknown threat "${t}"`);
      for (const s of p.solutions ?? []) {
        checkText(`${where}.solution.title`, s.title);
        checkText(`${where}.solution.note`, s.note, { max: 600 });
        for (const k of s.items) checkItemKey(`${where}.solution`, k, `problem:${p.id}`);
      }
      checkClaims(`${where}.caveats`, p.caveats, 0);
    }
  }

  /* ---------------- glossary */
  const termIds = new Set<string>();
  const allTerms = (raw.glossary ?? []).flatMap((f) => (Array.isArray(f.data) ? f.data.map((t) => ({ file: f.file, t })) : []));
  for (const { file, t } of allTerms) {
    const where = `${file}:${t?.id}`;
    if (!t?.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id)) err(where, 'id must be kebab-case');
    if (termIds.has(t.id)) err(where, 'duplicate term id');
    termIds.add(t.id);
    if (vocab.glossaryCategories && !vocab.glossaryCategories.includes(t.category)) err(where, `unknown category "${t.category}"`);
    if (!vocab.claimStatuses.includes(t.status)) err(where, `bad status ${t.status}`);
    const names = [t.en, ...(Array.isArray(t.ru) ? t.ru : []), ...(t.aliases ?? [])];
    if (typeof t.en !== 'string' || !t.en.trim()) err(where, 'missing en name');
    if (!Array.isArray(t.ru) || !t.ru.length) err(where, 'missing ru names');
    for (const n of names) {
      if (typeof n !== 'string' || !n.trim()) err(where, 'empty name or alias');
      else for (const ch of vocab.forbiddenChars) if (n.includes(ch)) err(where, `forbidden dash character in "${n}"`);
    }
    checkText(`${where}.short`, t.short, { max: 140 });
    checkText(`${where}.explain`, t.explain, { max: 420 });
    checkText(`${where}.example`, t.example, { required: false, max: 420 });
    for (const k of t.items ?? []) checkItemKey(`${where}.items`, k, `glossary:${t.id}`);
  }
  for (const { file, t } of allTerms) {
    for (const r of t.related ?? []) if (!termIds.has(r)) err(`${file}:${t.id}.related`, `unknown term "${r}"`);
  }

  const standard = game.items.filter((i) => i.mode === 'standard');
  const covered = standard.filter((i) => seenItems.has(i.key)).length;
  const scenarioCount = raw.scenarios.reduce((n, f) => n + (Array.isArray(f.data) ? f.data.length : 0), 0);
  const errors = issues.filter((i) => i.level === 'error').length;
  return {
    issues,
    errors,
    warnings: issues.length - errors,
    references,
    stats: {
      itemContent: seenItems.size,
      standardItems: standard.length,
      itemCoverage: `${covered}/${standard.length}`,
      scenarios: scenarioCount,
      courses: raw.courses.length,
      builds: raw.builds.length,
      problems: seenProblems.size,
      glossary: termIds.size,
    },
  };
}
