import type { BuildAnalysis, Dimension, ItemContent, Scenario } from '../content/content.model';
import type { GameItem, HeroData } from '../core/game-data/game-data.model';
import type { ConfidenceMode } from '../core/profile/profile.model';
import type { ItemKnowledge, MasteryLevel, MistakeEntry, QuestionExposure } from './knowledge.model';
import { itemLevel } from './mastery';
import {
  GenContext,
  buildWhy,
  componentQ,
  contrast,
  effectItem,
  fromScenario,
  iconActivation,
  iconName,
  iconRecall,
  iconTier,
  itemEffect,
  mechanicTF,
  nameIcon,
  nameSlot,
  problemItem,
  scenarioItems,
  statItem,
} from './questions/generators';
import type { Question } from './questions/question.model';
import { SECONDS_PER_FORMAT } from './questions/question.model';
import { Rng } from './questions/rng';
import { isDue, retrievability, stabilityDays } from './srs';

export type SessionMode =
  | 'mixed'
  | 'recognition'
  | 'scenarios'
  | 'active'
  | 'mistakes'
  | 'hero'
  | 'build'
  | 'before-match'
  | 'diagnostic'
  | 'module'
  | 'reflection'
  | 'custom'
  | 'shared';

export interface PlanFilters {
  itemKeys?: string[];
  scenarioIds?: string[];
  scenarioTags?: string[];
  threats?: string[];
  enemyHeroes?: string[];
  dims?: Dimension[];
  slots?: GameItem['slot'][];
}

export interface PlanInput {
  now: number;
  minutes: number;
  mode: SessionMode;
  heroKey: string | null;
  /** Items the learner owns in "my build" (highest importance). */
  myBuildItems: string[];
  myBuild: BuildAnalysis | null;
  newPerSession: number;
  confidence: ConfidenceMode;
  timedRecall: boolean;
  filters: PlanFilters;
  items: GameItem[];
  itemMap: Map<string, GameItem>;
  heroMap: Map<string, HeroData>;
  content: Record<string, ItemContent>;
  scenarios: Scenario[];
  knowledge: Map<string, ItemKnowledge>;
  exposures: Map<string, QuestionExposure>;
  mistakes: MistakeEntry[];
  /** Recent accuracy 0..1 (last ~30 answers), used for desirable difficulty. */
  recentAccuracy: number | null;
  rng: Rng;
}

export interface PlannedSession {
  questions: Question[];
  newItems: string[];
  estimatedSeconds: number;
}

interface Candidate {
  item: GameItem;
  dim: Dimension;
  priority: number;
  reason: 'misconception' | 'confusion' | 'principle' | 'due' | 'progress' | 'new' | 'scenario';
  pair?: GameItem;
  scenario?: Scenario;
}

const DAY = 86_400_000;

export function newLimitFor(minutes: number, configured: number): number {
  const scaled = minutes <= 3 ? 2 : minutes <= 5 ? 3 : minutes <= 10 ? 5 : minutes <= 20 ? 8 : 10;
  return Math.max(1, Math.min(scaled, configured + (minutes >= 20 ? 3 : 0)));
}

/** Item importance for the learner: my build > hero core items > everything else. */
function importanceMap(input: PlanInput): Map<string, number> {
  const m = new Map<string, number>();
  const hero = input.heroKey ? input.heroMap.get(input.heroKey) : undefined;
  if (hero) for (const p of [...hero.popular.early, ...hero.popular.mid, ...hero.popular.late]) m.set(p.itemKey, Math.max(m.get(p.itemKey) ?? 0, p.pickPct >= 20 ? 2 : 1.2));
  for (const s of input.scenarios) if (s.hero === input.heroKey) for (const k of scenarioItems(s, input.itemMap)) m.set(k, Math.max(m.get(k) ?? 0, 1.5));
  for (const k of input.myBuildItems) m.set(k, 3);
  for (const k of input.filters.itemKeys ?? []) m.set(k, Math.max(m.get(k) ?? 0, 3));
  return m;
}

/** Order in which new items are introduced. */
function introductionOrder(input: PlanInput, importance: Map<string, number>): GameItem[] {
  const tierBias = (i: GameItem) => i.tier * 0.15;
  return [...input.items].sort((a, b) => (importance.get(b.key) ?? 0) - (importance.get(a.key) ?? 0) || tierBias(a) - tierBias(b) || a.cost - b.cost || a.key.localeCompare(b.key));
}

function difficultyFor(level: MasteryLevel, recentAccuracy: number | null): number {
  let d = [1, 2, 2, 3, 4, 4][level];
  if (recentAccuracy !== null && recentAccuracy > 0.85) d += 1;
  if (recentAccuracy !== null && recentAccuracy < 0.5) d -= 1;
  return Math.max(1, Math.min(5, d));
}

function hintsFor(level: MasteryLevel): 'full' | 'reduced' | 'none' {
  return level >= 4 ? 'none' : level >= 3 ? 'reduced' : 'full';
}

/** Scenarios that teach a given item, best fit first (hero focus, unseen, kind). */
function scenariosFor(item: string, dim: Dimension, input: PlanInput, used: Set<string>): Scenario[] {
  const list = input.scenarios.filter((s) => !used.has(s.id) && scenarioItems(s, input.itemMap).includes(item));
  const kindOk = (s: Scenario) =>
    dim === 'active' ? s.kind === 'active-timing' : dim === 'synergy' ? s.kind === 'imbue' || s.dims.includes('synergy') : s.kind !== 'active-timing' && s.kind !== 'imbue';
  return list
    .filter(kindOk)
    .sort((a, b) => scoreScenario(b, input) - scoreScenario(a, input));
}

function scoreScenario(s: Scenario, input: PlanInput): number {
  let sc = 0;
  if (s.hero === input.heroKey) sc += 5;
  const exp = input.exposures.get(`scenario:${s.id}`);
  if (!exp) sc += 3; // novel situations train transfer
  else if (exp.lastResult !== 'correct') sc += 2;
  else sc -= Math.min(4, exp.seen);
  if (input.filters.scenarioTags?.some((t) => s.tags.includes(t))) sc += 4;
  if (input.filters.threats?.some((t) => (s.problemTags as string[]).includes(t))) sc += 4;
  if (input.filters.enemyHeroes?.some((h) => s.enemies.some((e) => e.hero === h))) sc += 4;
  return sc + input.rng.next();
}

function recentlyCorrect(input: PlanInput, qid: string, hours: number): boolean {
  const e = input.exposures.get(qid);
  return !!e && e.lastResult === 'correct' && input.now - e.lastAt < hours * 3_600_000;
}

function genFor(c: Candidate, input: PlanInput, ctx: GenContext, level: MasteryLevel, usedScen: Set<string>): Question | null {
  const { item, dim } = c;
  const rng = input.rng;
  const diff = difficultyFor(level, input.recentAccuracy);
  const knowledge = input.knowledge.get(item.key);
  const iconState = knowledge?.dims.icon;
  if (c.reason === 'confusion' && c.pair) return contrast(item, c.pair, ctx, rng, dim === 'effect' ? 'effect' : 'icon');
  if (c.scenario) return fromScenario(c.scenario, ctx, rng, hintsFor(level));
  switch (dim) {
    case 'icon': {
      if (!iconState || iconState.correct < 2) return rng.next() < 0.75 || level === 0 ? iconName(item, ctx, rng, Math.min(diff, 2)) : nameIcon(item, ctx, rng, 2);
      if (stabilityDays(iconState) >= 3 && iconState.correct >= 3) return rng.next() < 0.6 ? iconRecall(item, 3, input.timedRecall && level >= 3) : iconName(item, ctx, rng, 4);
      return rng.next() < 0.5 ? nameIcon(item, ctx, rng, diff) : iconName(item, ctx, rng, Math.max(2, diff));
    }
    case 'effect': {
      const q = rng.next() < 0.5 ? itemEffect(item, ctx, rng, diff) : effectItem(item, ctx, rng, diff);
      return q ?? itemEffect(item, ctx, rng, diff) ?? effectItem(item, ctx, rng, diff) ?? mechanicTF(item, ctx, rng, diff);
    }
    case 'mechanics': {
      if (level === 0 && rng.next() < 0.3) return nameSlot(item, rng);
      const r = rng.next();
      if (r < 0.35) return iconActivation(item, rng, diff);
      if (r < 0.7) return mechanicTF(item, ctx, rng, diff);
      return statItem(item, ctx, rng, diff) ?? mechanicTF(item, ctx, rng, diff);
    }
    case 'build': {
      if (input.myBuild && input.myBuild.items[item.key] && rng.next() < 0.5) {
        const q = buildWhy(item, input.myBuild, ctx, rng);
        if (q) return q;
      }
      const sc = scenariosFor(item.key, dim, input, usedScen)[0];
      if (sc && level >= 2 && rng.next() < 0.6) return fromScenario(sc, ctx, rng, hintsFor(level));
      return rng.next() < 0.5 ? (componentQ(item, ctx, rng, diff) ?? iconTier(item, rng, diff)) : iconTier(item, rng, diff);
    }
    case 'counter':
    case 'situation':
    case 'active':
    case 'synergy': {
      const sc = scenariosFor(item.key, dim, input, usedScen)[0];
      if (sc) return fromScenario(sc, ctx, rng, hintsFor(level));
      if (dim === 'counter' || dim === 'situation') return problemItem(item, ctx, rng, diff);
      if (dim === 'active' && item.isActive) return mechanicTF(item, ctx, rng, diff);
      return null;
    }
  }
}

/** Next dimension to work on for an item at a given level. */
function progressDims(level: MasteryLevel, item: GameItem): Dimension[] {
  switch (level) {
    case 0:
      return ['icon'];
    case 1:
      return ['effect', 'mechanics'];
    case 2:
      return ['situation', 'counter'];
    case 3:
      return item.isActive ? ['active', 'build'] : item.imbue ? ['synergy', 'build'] : ['build', 'counter'];
    case 4:
      return ['situation', 'counter'];
    default:
      return ['situation'];
  }
}

function modeAllows(mode: SessionMode, c: Candidate, input: PlanInput): boolean {
  const f = input.filters;
  if (f.dims && !f.dims.includes(c.dim) && c.reason !== 'new') return false;
  if (f.slots && !f.slots.includes(c.item.slot)) return false;
  switch (mode) {
    case 'recognition':
      return c.dim === 'icon' || (c.reason === 'confusion' && c.dim !== 'effect');
    case 'scenarios':
      return !!c.scenario || ['situation', 'counter', 'synergy', 'active'].includes(c.dim);
    case 'active':
      return c.dim === 'active' || c.dim === 'synergy' || (c.item.isActive && c.dim === 'mechanics') || !!c.item.imbue;
    case 'mistakes':
      return c.reason === 'misconception' || c.reason === 'confusion' || c.reason === 'principle';
    default:
      return true;
  }
}

export function planSession(input: PlanInput): PlannedSession {
  const { rng, now } = input;
  const ctx: GenContext = {
    items: input.items,
    itemMap: input.itemMap,
    heroMap: input.heroMap,
    content: input.content,
    confusions: confusionMap(input.mistakes),
    heroKey: input.heroKey,
  };
  const importance = importanceMap(input);
  const restrict = input.filters.itemKeys?.length ? new Set(input.filters.itemKeys) : null;
  const heroScoped = input.mode === 'hero' || input.mode === 'build' || input.mode === 'before-match';
  const scoped = (i: GameItem) => {
    if (restrict) return restrict.has(i.key);
    if (heroScoped) return (importance.get(i.key) ?? 0) > 0;
    return true;
  };

  const budget = Math.max(60, input.minutes * 60);
  const newLimit = input.mode === 'mistakes' || input.mode === 'before-match' ? (input.mode === 'before-match' ? 1 : 0) : newLimitFor(input.minutes, input.newPerSession);
  const levels = new Map<string, MasteryLevel>();
  for (const i of input.items) levels.set(i.key, itemLevel(input.knowledge.get(i.key), i, now));

  // ---------------- candidates
  const cands: Candidate[] = [];
  const jitter = () => rng.next() * 4;
  for (const item of input.items) {
    if (!scoped(item)) continue;
    const k = input.knowledge.get(item.key);
    const imp = importance.get(item.key) ?? 0.5;
    if (!k || !k.introducedAt) continue;
    const level = levels.get(item.key) ?? 0;
    for (const [dimKey, state] of Object.entries(k.dims)) {
      const dim = dimKey as Dimension;
      if (!state) continue;
      if (state.misconception) cands.push({ item, dim, priority: 100 + imp * 5 + jitter(), reason: 'misconception' });
      else if (isDue(state, now)) cands.push({ item, dim, priority: 50 + 30 * (1 - retrievability(state, now)) + imp * 5 + jitter(), reason: 'due' });
    }
    if (k.flagged) cands.push({ item, dim: 'mechanics', priority: 70 + imp * 5, reason: 'progress' });
    for (const dim of progressDims(level, item)) {
      const st = k.dims[dim];
      if (st && !isDue(st, now) && st.correct >= 2) continue;
      cands.push({ item, dim, priority: 30 + (5 - level) * 2 + imp * 6 + jitter(), reason: 'progress' });
    }
  }
  for (const m of input.mistakes) {
    if (m.resolved) continue;
    if (m.kind === 'confusion' && m.items.length === 2) {
      const a = input.itemMap.get(m.items[0]);
      const b = input.itemMap.get(m.items[1]);
      if (a && b && (scoped(a) || scoped(b))) cands.push({ item: a, pair: b, dim: m.dim === 'effect' ? 'effect' : 'icon', priority: 90 + Math.min(10, m.count * 2) + jitter(), reason: 'confusion' });
    }
    if (m.kind === 'principle' && m.ref) {
      const orig = input.scenarios.find((s) => s.id === m.ref);
      if (!orig) continue;
      // Same principle, different situation: never just repeat the identical question.
      const sibling = rng.shuffle(
        input.scenarios.filter((s) => s.id !== orig.id && s.kind === orig.kind && s.problemTags.some((t) => orig.problemTags.includes(t))),
      )[0];
      const pick = sibling ?? (now - m.lastAt > DAY ? orig : undefined);
      const first = pick ? input.itemMap.get(scenarioItems(pick, input.itemMap)[0] ?? '') : undefined;
      if (pick && first) cands.push({ item: first, dim: pick.dims[0] ?? 'situation', priority: 80 + jitter(), reason: 'principle', scenario: pick });
    }
  }
  // explicit scenario requests (shared training, reflection, module)
  const requested = input.filters.scenarioIds?.length
    ? input.scenarios.filter((s) => input.filters.scenarioIds?.includes(s.id))
    : input.mode === 'reflection' || input.mode === 'module' || input.mode === 'scenarios' || input.mode === 'build' || input.mode === 'before-match' || input.mode === 'active'
      ? input.scenarios
          .filter((s) => {
            if (input.mode === 'active' && s.kind !== 'active-timing' && s.kind !== 'imbue') return false;
            if (input.filters.scenarioTags?.length && !input.filters.scenarioTags.some((t) => s.tags.includes(t))) return false;
            if (input.mode === 'build' && !s.tags.includes('my-build')) return false;
            if (input.mode === 'before-match' && s.hero !== input.heroKey) return false;
            if (input.mode === 'reflection') {
              const byThreat = input.filters.threats?.some((t) => (s.problemTags as string[]).includes(t));
              const byEnemy = input.filters.enemyHeroes?.some((h) => s.enemies.some((e) => e.hero === h));
              return !!(byThreat || byEnemy);
            }
            if (input.mode === 'scenarios' && input.heroKey && s.hero !== input.heroKey && !s.tags.includes('general')) return false;
            return true;
          })
          .sort((a, b) => scoreScenario(b, input) - scoreScenario(a, input))
          .slice(0, 40)
      : [];
  for (const s of requested) {
    const first = input.itemMap.get(scenarioItems(s, input.itemMap)[0] ?? '');
    if (first) cands.push({ item: first, dim: s.dims[0] ?? 'situation', priority: 60 + scoreScenario(s, input), reason: 'scenario', scenario: s });
  }
  // new items
  let newCount = 0;
  const newItems: string[] = [];
  if (newLimit > 0) {
    for (const item of introductionOrder(input, importance)) {
      if (newCount >= newLimit * 2) break;
      if (!scoped(item)) continue;
      if (input.knowledge.get(item.key)?.introducedAt) continue;
      if (input.mode === 'scenarios' || input.mode === 'mistakes' || input.mode === 'active') continue;
      cands.push({ item, dim: 'icon', priority: 20 + (importance.get(item.key) ?? 0) * 8 - newCount * 0.5, reason: 'new' });
      newCount++;
    }
  }

  // ---------------- selection within the time budget
  cands.sort((a, b) => b.priority - a.priority);
  const chosen: Question[] = [];
  const perItem = new Map<string, number>();
  const usedIds = new Set<string>();
  const usedScen = new Set<string>();
  let seconds = 0;
  let introduced = 0;
  const allowed = cands.filter((c) => modeAllows(input.mode, c, input));
  const add = (q: Question, c: Candidate) => {
    chosen.push(q);
    usedIds.add(q.id);
    if (q.scenario) usedScen.add(q.scenario.id);
    perItem.set(c.item.key, (perItem.get(c.item.key) ?? 0) + 1);
    seconds += SECONDS_PER_FORMAT[q.format];
  };
  for (const c of allowed) {
    if (seconds >= budget) break;
    if (c.reason === 'new') {
      if (introduced >= newLimit) continue;
    }
    if ((perItem.get(c.item.key) ?? 0) >= (c.reason === 'misconception' || c.reason === 'confusion' ? 3 : 2)) continue;
    if (c.scenario && usedScen.has(c.scenario.id)) continue;
    const level = levels.get(c.item.key) ?? 0;
    const q = genFor(c, input, ctx, level, usedScen);
    if (!q || usedIds.has(q.id)) continue;
    if (c.reason !== 'misconception' && c.reason !== 'confusion' && c.reason !== 'principle' && recentlyCorrect(input, q.id, 10)) continue;
    if (c.reason === 'new') {
      introduced++;
      newItems.push(c.item.key);
    }
    add(q, c);
    // New items are learned through several different formats spread over the session
    // (job, how it works, then recognition again from the other direction), not one card.
    if (c.reason === 'new') {
      const follows = [
        input.content[c.item.key] ? (itemEffect(c.item, ctx, rng, 1) ?? iconActivation(c.item, rng, 1)) : iconActivation(c.item, rng, 1),
        rng.next() < 0.5 ? iconActivation(c.item, rng, 1) : mechanicTF(c.item, ctx, rng, 1),
        nameIcon(c.item, ctx, rng, 2),
      ];
      for (const f of follows) {
        if (seconds >= budget) break;
        if (f && !usedIds.has(f.id)) add(f, { ...c, dim: f.dim });
      }
    }
  }
  // Fill the remaining time with situations: decisions with explanations teach the most.
  if (seconds < budget * 0.85 && input.mode !== 'recognition' && input.mode !== 'mistakes') {
    const studied = new Set([...newItems, ...[...input.knowledge.values()].filter((k) => k.introducedAt).map((k) => k.itemKey)]);
    const avgLevel = studied.size ? [...studied].reduce((n, k) => n + (levels.get(k) ?? 0), 0) / studied.size : 0;
    const maxDiff = avgLevel < 1.5 ? 2 : avgLevel < 2.5 ? 3 : 5;
    const pool = input.scenarios
      .filter((s) => !usedScen.has(s.id) && (s.hero === input.heroKey || s.tags.includes('general')) && s.difficulty <= maxDiff)
      .filter((s) => input.mode !== 'active' || s.kind === 'active-timing' || s.kind === 'imbue')
      .map((s) => ({ s, score: scoreScenario(s, input) + (scenarioItems(s, input.itemMap).some((k) => studied.has(k)) ? 6 : 0) - s.difficulty }))
      .sort((a, b) => b.score - a.score);
    for (const { s } of pool) {
      if (seconds >= budget * 0.95) break;
      const first = input.itemMap.get(scenarioItems(s, input.itemMap)[0] ?? '');
      if (!first) continue;
      const q = fromScenario(s, ctx, rng, hintsFor(levels.get(first.key) ?? 0));
      if (!usedIds.has(q.id)) add(q, { item: first, dim: s.dims[0] ?? 'situation', priority: 0, reason: 'scenario', scenario: s });
    }
  }
  // Too short (e.g. everything learned and not due): top up with the weakest known items.
  if (seconds < budget * 0.5) {
    const extra = input.items
      .filter((i) => scoped(i) && input.knowledge.get(i.key)?.introducedAt)
      .map((i) => ({ i, r: retrievability(input.knowledge.get(i.key)?.dims.icon, now) + rng.next() * 0.1 }))
      .sort((a, b) => a.r - b.r);
    for (const { i } of extra) {
      if (seconds >= budget * 0.8) break;
      if ((perItem.get(i.key) ?? 0) >= 2) continue;
      const level = levels.get(i.key) ?? 0;
      const dims = progressDims(level, i);
      const c: Candidate = { item: i, dim: dims[0], priority: 0, reason: 'progress' };
      if (!modeAllows(input.mode, c, input)) continue;
      const q = genFor(c, input, ctx, level, usedScen);
      if (q && !usedIds.has(q.id)) add(q, c);
    }
  }

  const ordered = interleave(chosen, rng);
  for (const q of ordered) q.askConfidence = shouldAskConfidence(q, input, levels.get(q.targets[0]?.item ?? '') ?? 0, newItems);
  return { questions: ordered, newItems, estimatedSeconds: seconds };
}

function confusionMap(mistakes: MistakeEntry[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const x of mistakes) {
    if (x.kind !== 'confusion' || x.items.length !== 2) continue;
    const [a, b] = x.items;
    if (!m.has(a)) m.set(a, new Set());
    if (!m.has(b)) m.set(b, new Set());
    m.get(a)?.add(b);
    m.get(b)?.add(a);
  }
  return m;
}

function bucketOf(q: Question): 'rec' | 'und' | 'app' {
  if (q.format === 'scenario' || q.format === 'two-step' || q.format === 'surgery' || q.type === 'problem-item' || q.type === 'contrast') return 'app';
  if (q.dim === 'icon') return 'rec';
  return 'und';
}

/**
 * Interleaving: mix question types and buckets, keep the same item at least 3 questions apart,
 * introduce a new item (recognition) before its follow-up, start easy and end on a solvable one.
 */
export function interleave(questions: Question[], rng: Rng): Question[] {
  const pool = [...questions];
  const out: Question[] = [];
  const firstIndexOfItem = new Map<string, number>();
  pool.forEach((q, i) => {
    const it = q.targets[0]?.item;
    if (it && !firstIndexOfItem.has(it)) firstIndexOfItem.set(it, i);
  });
  // warm-up: easiest recognition question
  const warmIdx = pool.findIndex((q) => bucketOf(q) === 'rec' && q.difficulty <= 2);
  if (warmIdx >= 0) out.push(...pool.splice(warmIdx, 1));
  while (pool.length) {
    const recent = out.slice(-3);
    const recentItems = new Set(recent.map((q) => q.targets[0]?.item));
    const last = out[out.length - 1];
    const lastTwoSameType = out.length >= 2 && out[out.length - 1].type === out[out.length - 2].type;
    const score = (q: Question, idx: number) => {
      let s = 0;
      const it = q.targets[0]?.item;
      if (it && recentItems.has(it)) s -= 10;
      if (last && q.type === last.type) s -= lastTwoSameType ? 6 : 2;
      if (last && bucketOf(q) === bucketOf(last)) s -= 1.5;
      if (last && bucketOf(last) === 'app' && bucketOf(q) === 'app') s -= 2;
      // keep an item's first question (introduction) before its later ones
      const firstIdx = it ? firstIndexOfItem.get(it) : undefined;
      if (firstIdx !== undefined && idx > 0 && pool.some((p, j) => j < idx && p.targets[0]?.item === it)) s -= 8;
      return s - idx * 0.05 + rng.next() * 0.5;
    };
    let best = 0;
    let bestScore = -Infinity;
    pool.forEach((q, i) => {
      const s = score(q, i);
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    out.push(...pool.splice(best, 1));
  }
  // End on a question the learner is likely to get right (not a hard scenario).
  if (out.length > 3 && out[out.length - 1].difficulty >= 4) {
    const i = out.findIndex((q, idx) => idx > out.length - 5 && q.difficulty <= 2);
    if (i >= 0) out.push(...out.splice(i, 1));
  }
  return out;
}

function shouldAskConfidence(q: Question, input: PlanInput, level: MasteryLevel, newItems: string[]): boolean {
  if (input.confidence === 'never') return false;
  const isIntro = q.targets[0] && newItems.includes(q.targets[0].item) && q.dim === 'icon';
  if (isIntro) return false;
  if (input.confidence === 'always') return true;
  if (q.format === 'scenario' || q.format === 'two-step') return level >= 2 || input.rng.next() < 0.5;
  if (q.format === 'recall') return true;
  if (q.format === 'tf') return input.rng.next() < 0.5;
  return input.rng.next() < 0.22;
}

/** In-session relearning: a different question on the same knowledge after a mistake. */
export function followUpQuestion(q: Question, input: PlanInput, chosenItem: string | null): Question | null {
  const ctx: GenContext = {
    items: input.items,
    itemMap: input.itemMap,
    heroMap: input.heroMap,
    content: input.content,
    confusions: confusionMap(input.mistakes),
    heroKey: input.heroKey,
  };
  const rng = input.rng;
  const target = input.itemMap.get(q.targets[0]?.item ?? q.expectedItem ?? '');
  if (!target) return null;
  const chosen = chosenItem ? input.itemMap.get(chosenItem) : undefined;
  let next: Question | null = null;
  if (q.scenario) {
    const s = q.scenario;
    const sibling = rng.shuffle(input.scenarios.filter((x) => x.id !== s.id && x.kind === s.kind && x.problemTags.some((t) => s.problemTags.includes(t))))[0];
    next = sibling ? fromScenario(sibling, ctx, rng, q.hints) : problemItem(target, ctx, rng, Math.max(1, q.difficulty - 1));
  } else if (chosen && chosen.key !== target.key && (q.dim === 'icon' || q.dim === 'effect')) {
    next = contrast(target, chosen, ctx, rng, q.dim === 'effect' ? 'effect' : 'icon');
  } else if (q.dim === 'icon') {
    next = q.type === 'icon-name' ? nameIcon(target, ctx, rng, 2) : iconName(target, ctx, rng, 2);
  } else if (q.dim === 'effect') {
    next = q.type === 'item-effect' ? effectItem(target, ctx, rng, 2) : itemEffect(target, ctx, rng, 2);
  } else {
    next = mechanicTF(target, ctx, rng, 2);
  }
  if (!next || next.id === q.id) return null;
  return { ...next, relearn: true, askConfidence: false };
}
