import type { Dimension } from '../content/content.model';
import { DIMENSIONS } from '../content/vocab';
import type { GameItem } from '../core/game-data/game-data.model';
import type { Confidence, ItemKnowledge, MistakeEntry, ReviewRecord } from './knowledge.model';
import { dimKnown, dimStrength, isProblemItem } from './mastery';
import { isDue, retrievability } from './srs';

/**
 * Learning analytics computed from the real answer history. No synthetic scores:
 * every number is a ratio of recorded answers, with the sample size next to it.
 */
export interface Ratio {
  value: number | null;
  n: number;
}

const DAY = 86_400_000;

function ratio(list: ReviewRecord[], f: (r: ReviewRecord) => number = (r) => r.score): Ratio {
  if (!list.length) return { value: null, n: 0 };
  return { value: list.reduce((s, r) => s + f(r), 0) / list.length, n: list.length };
}

export function within(reviews: ReviewRecord[], days: number, now: number): ReviewRecord[] {
  const since = now - days * DAY;
  return reviews.filter((r) => r.ts >= since);
}

export const isScenarioReview = (r: ReviewRecord) => r.format === 'scenario' || r.format === 'two-step' || r.format === 'surgery';
export const hasDim = (r: ReviewRecord, d: Dimension) => r.targets.some((t) => t.dim === d);

export function recognitionAccuracy(reviews: ReviewRecord[]): Ratio {
  return ratio(reviews.filter((r) => r.targets[0]?.dim === 'icon'));
}

export function situationalAccuracy(reviews: ReviewRecord[]): Ratio {
  return ratio(reviews.filter(isScenarioReview));
}

export function counterAccuracy(reviews: ReviewRecord[]): Ratio {
  return ratio(reviews.filter((r) => hasDim(r, 'counter') && (isScenarioReview(r) || r.questionType === 'problem-item')));
}

/** Transfer: first-time answers on situations never seen before vs repeated ones. */
export function novelVsRepeated(reviews: ReviewRecord[]): { novel: Ratio; repeated: Ratio } {
  const sc = reviews.filter(isScenarioReview);
  return { novel: ratio(sc.filter((r) => r.novel)), repeated: ratio(sc.filter((r) => !r.novel)) };
}

export function byDifficulty(reviews: ReviewRecord[]): Ratio[] {
  return [1, 2, 3, 4, 5].map((d) => ratio(reviews.filter((r) => r.difficulty === d)));
}

/** Calibration: accuracy per stated confidence, and the share of confident wrong answers. */
export function calibration(reviews: ReviewRecord[]): { levels: Record<Confidence, Ratio>; confidentWrong: Ratio } {
  const levels = {} as Record<Confidence, Ratio>;
  for (const c of ['guess', 'unsure', 'likely', 'sure'] as Confidence[]) levels[c] = ratio(reviews.filter((r) => r.confidence === c), (r) => (r.result === 'correct' ? 1 : r.result === 'partial' ? 0.5 : 0));
  const confident = reviews.filter((r) => r.confidence === 'sure' || r.confidence === 'likely');
  return { levels, confidentWrong: ratio(confident, (r) => (r.result === 'wrong' ? 1 : 0)) };
}

export interface DayPoint {
  day: number;
  answers: number;
  accuracy: number | null;
  scenario: number | null;
}

export function dailySeries(reviews: ReviewRecord[], days: number, now: number): DayPoint[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const from = start.getTime() - i * DAY;
    const list = reviews.filter((r) => r.ts >= from && r.ts < from + DAY);
    const sc = list.filter(isScenarioReview);
    out.push({
      day: from,
      answers: list.length,
      accuracy: list.length ? list.reduce((s, r) => s + r.score, 0) / list.length : null,
      scenario: sc.length ? sc.reduce((s, r) => s + r.score, 0) / sc.length : null,
    });
  }
  return out;
}

export function errorsBySlot(reviews: ReviewRecord[], items: Map<string, GameItem>): Record<string, Ratio> {
  const out: Record<string, Ratio> = {};
  for (const slot of ['weapon', 'vitality', 'spirit']) {
    const list = reviews.filter((r) => items.get(r.targets[0]?.item ?? '')?.slot === slot);
    out[slot] = ratio(list, (r) => (r.result === 'wrong' || r.result === 'dontknow' ? 1 : 0));
  }
  return out;
}

export function accuracyByDim(reviews: ReviewRecord[]): Record<Dimension, Ratio> {
  const out = {} as Record<Dimension, Ratio>;
  for (const d of DIMENSIONS) out[d] = ratio(reviews.filter((r) => r.targets[0]?.dim === d));
  return out;
}

/** Average memory strength per dimension over items the learner has studied. */
export function strengthByDim(knowledge: Map<string, ItemKnowledge>, now: number): Record<Dimension, Ratio> {
  const out = {} as Record<Dimension, Ratio>;
  for (const d of DIMENSIONS) {
    const vals: number[] = [];
    for (const k of knowledge.values()) {
      const s = k.dims[d];
      if (s && s.attempts > 0) vals.push(dimStrength(s, now));
    }
    out[d] = { value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null, n: vals.length };
  }
  return out;
}

export function dueCount(knowledge: Map<string, ItemKnowledge>, now: number): number {
  let n = 0;
  for (const k of knowledge.values()) for (const s of Object.values(k.dims)) if (s && isDue(s, now)) n++;
  return n;
}

export function problemItems(knowledge: Map<string, ItemKnowledge>, now: number): string[] {
  return [...knowledge.values()].filter((k) => isProblemItem(k, now)).map((k) => k.itemKey);
}

export function wellKnownCount(knowledge: Map<string, ItemKnowledge>, now: number): number {
  let n = 0;
  for (const k of knowledge.values()) if (dimKnown(k.dims.icon, now, { minR: 0.85 }) && dimKnown(k.dims.effect, now, { minR: 0.75, minCorrect: 1 })) n++;
  return n;
}

/** Share of the given items whose icon the learner currently recognizes. */
export function recognizedShare(keys: string[], knowledge: Map<string, ItemKnowledge>, now: number): Ratio {
  if (!keys.length) return { value: null, n: 0 };
  const known = keys.filter((k) => dimKnown(knowledge.get(k)?.dims.icon, now, { minR: 0.8, minCorrect: 1, minStability: 0 })).length;
  return { value: known / keys.length, n: keys.length };
}

export function confusedPairs(mistakes: MistakeEntry[], limit = 8): MistakeEntry[] {
  return mistakes
    .filter((m) => m.kind === 'confusion' && !m.resolved)
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit);
}

/** Studied items whose knowledge has not been refreshed for the longest time. */
export function staleItems(knowledge: Map<string, ItemKnowledge>, now: number, limit = 8): { item: string; lastAt: number; r: number }[] {
  const list: { item: string; lastAt: number; r: number }[] = [];
  for (const k of knowledge.values()) {
    const last = Math.max(0, ...Object.values(k.dims).map((s) => s?.lastAt ?? 0));
    if (!last) continue;
    list.push({ item: k.itemKey, lastAt: last, r: retrievability(k.dims.icon, now) });
  }
  return list.sort((a, b) => a.lastAt - b.lastAt).slice(0, limit);
}

export function streakDays(reviews: ReviewRecord[], now: number): number {
  const days = new Set(reviews.map((r) => new Date(r.ts).toDateString()));
  let n = 0;
  const d = new Date(now);
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1);
  while (days.has(d.toDateString())) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
