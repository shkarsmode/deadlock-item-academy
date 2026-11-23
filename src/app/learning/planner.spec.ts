import { BUNDLE, HERO_MAP, ITEM_MAP, STANDARD } from '../testing/fixtures';
import type { ItemKnowledge, MistakeEntry } from './knowledge.model';
import { PlanInput, interleave, newLimitFor, planSession } from './planner';
import { planDiagnostic } from './diagnostic';
import { makeRng } from './questions/rng';
import { applyAnswer, newDimState } from './srs';

const NOW = Date.UTC(2026, 10, 23, 10);
const myBuild = BUNDLE.builds.find((b) => b.id === 'vindicta-current');
const myBuildItems = myBuild ? [...new Set(myBuild.build.categories.flatMap((c) => c.items.map((i) => i.key)))] : [];

function input(over: Partial<PlanInput> = {}): PlanInput {
  return {
    now: NOW,
    minutes: 10,
    mode: 'mixed',
    heroKey: 'hero_hornet',
    myBuildItems,
    myBuild: myBuild ?? null,
    newPerSession: 5,
    confidence: 'auto',
    timedRecall: false,
    filters: {},
    items: STANDARD,
    itemMap: ITEM_MAP,
    heroMap: HERO_MAP,
    content: BUNDLE.items,
    scenarios: BUNDLE.scenarios,
    knowledge: new Map(),
    exposures: new Map(),
    mistakes: [],
    recentAccuracy: null,
    rng: makeRng(42),
    ...over,
  };
}

describe('planSession', () => {
  it('limits new items for a fresh learner and starts with the learner\'s own build', () => {
    const plan = planSession(input());
    expect(plan.questions.length).toBeGreaterThan(4);
    expect(plan.newItems.length).toBeLessThanOrEqual(newLimitFor(10, 5));
    expect(plan.newItems.length).toBeGreaterThan(0);
    for (const k of plan.newItems) expect(myBuildItems).toContain(k);
  });

  it('keeps the same item at least a few questions apart where possible', () => {
    const plan = planSession(input({ minutes: 20 }));
    let adjacent = 0;
    for (let i = 1; i < plan.questions.length; i++) if (plan.questions[i].targets[0]?.item === plan.questions[i - 1].targets[0]?.item) adjacent++;
    expect(adjacent / plan.questions.length).toBeLessThan(0.2);
  });

  it('prioritizes misconceptions and confusion pairs', () => {
    const k = new Map<string, ItemKnowledge>();
    const s = applyAnswer(newDimState(NOW - 86_400_000), { result: 'wrong', score: 0, confidence: 'sure', recall: false, optionCount: 4, latencyMs: 2000, fastMs: 4000 }, 1, NOW - 86_400_000, { novel: false, difficulty: 2, hints: 'full' });
    k.set('upgrade_metal_skin', { profileId: 'p', itemKey: 'upgrade_metal_skin', dims: { effect: s }, introducedAt: NOW - 86_400_000, flagged: null });
    const mistakes: MistakeEntry[] = [
      { id: 'c:a|b', profileId: 'p', kind: 'confusion', items: ['upgrade_clip_size', 'upgrade_titan_round'], ref: null, dim: 'icon', count: 3, firstAt: NOW - 1e6, lastAt: NOW - 1e5, fixedStreak: 0, resolved: false, note: null },
    ];
    const plan = planSession(input({ knowledge: k, mistakes, mode: 'mistakes' }));
    const ids = plan.questions.map((q) => q.id);
    expect(ids.some((id) => id.includes('upgrade_metal_skin'))).toBe(true);
    expect(ids.some((id) => id.startsWith('contrast:'))).toBe(true);
    expect(plan.newItems.length).toBe(0);
  });

  it('builds a situations session from explicit scenario ids', () => {
    const ids = BUNDLE.scenarios.slice(0, 5).map((s) => s.id);
    const plan = planSession(input({ mode: 'shared', filters: { scenarioIds: ids } }));
    const got = plan.questions.filter((q) => q.scenario).map((q) => q.scenario?.id);
    expect(got.length).toBeGreaterThan(0);
    for (const g of got) expect(ids).toContain(g);
  });

  it('returns nothing for the mistakes mode without mistakes', () => {
    expect(planSession(input({ mode: 'mistakes' })).questions.length).toBe(0);
  });

  it('respects the time budget roughly', () => {
    const short = planSession(input({ minutes: 3 }));
    const long = planSession(input({ minutes: 20 }));
    expect(long.estimatedSeconds).toBeGreaterThan(short.estimatedSeconds);
    expect(short.estimatedSeconds).toBeLessThanOrEqual(3 * 60 + 120);
  });

  it('fills a long session for a fresh learner without exceeding the new-item limit', () => {
    const long = planSession(input({ minutes: 20 }));
    expect(long.estimatedSeconds).toBeGreaterThanOrEqual(20 * 60 * 0.75);
    expect(long.newItems.length).toBeLessThanOrEqual(newLimitFor(20, 5));
    expect(long.questions.some((q) => q.scenario)).toBe(true);
  });
});

describe('interleave', () => {
  it('does not put three questions of the same type in a row when it can avoid it', () => {
    const plan = planSession(input({ minutes: 20 }));
    const seq = interleave(plan.questions, makeRng(5));
    let triples = 0;
    for (let i = 2; i < seq.length; i++) if (seq[i].type === seq[i - 1].type && seq[i].type === seq[i - 2].type) triples++;
    expect(triples / seq.length).toBeLessThanOrEqual(0.1);
  });
});

describe('planDiagnostic', () => {
  it('mixes recognition, mechanics and hero situations', () => {
    const plan = planDiagnostic(input());
    const types = new Set(plan.questions.map((q) => q.type));
    expect(types.has('icon-name')).toBe(true);
    expect(plan.questions.length).toBeGreaterThanOrEqual(10);
    expect(plan.questions.some((q) => q.scenario?.hero === 'hero_hornet')).toBe(true);
  });
});
