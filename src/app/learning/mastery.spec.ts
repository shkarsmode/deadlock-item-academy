import type { Dimension } from '../content/content.model';
import { item } from '../testing/fixtures';
import type { DimState, ItemKnowledge } from './knowledge.model';
import { isProblemItem, itemLevel } from './mastery';
import { applyAnswer, newDimState } from './srs';

const DAY = 86_400_000;
const t0 = Date.UTC(2026, 9, 1);

/** Builds a dimension state answered correctly `n` times, spaced `gapDays` apart. */
function learned(n: number, gapDays = 3, opts: { novelHard?: boolean } = {}): DimState {
  let s = newDimState(t0);
  for (let i = 0; i < n; i++) {
    s = applyAnswer(s, { result: 'correct', score: 1, confidence: 'likely', recall: true, optionCount: 0, latencyMs: 4000, fastMs: 3000 }, 1, t0 + i * gapDays * DAY, {
      novel: !!opts.novelHard,
      difficulty: opts.novelHard ? 4 : 2,
      hints: opts.novelHard ? 'none' : 'full',
    });
  }
  return s;
}

function knowledge(dims: Partial<Record<Dimension, DimState>>): ItemKnowledge {
  return { profileId: 'p', itemKey: 'upgrade_metal_skin', dims, introducedAt: t0, flagged: null };
}

describe('itemLevel', () => {
  const metalSkin = item('upgrade_metal_skin'); // active item
  const now = t0 + 10 * DAY;

  it('is 0 without knowledge', () => {
    expect(itemLevel(undefined, metalSkin, now)).toBe(0);
  });

  it('needs spaced correct icon recognition for level 1', () => {
    expect(itemLevel(knowledge({ icon: learned(1) }), metalSkin, now)).toBe(0);
    expect(itemLevel(knowledge({ icon: learned(3) }), metalSkin, now)).toBe(1);
  });

  it('moves through understanding and application with the right dimensions', () => {
    const base = { icon: learned(3), effect: learned(3), mechanics: learned(3) };
    expect(itemLevel(knowledge(base), metalSkin, now)).toBe(2);
    expect(itemLevel(knowledge({ ...base, situation: learned(3) }), metalSkin, now)).toBe(3);
  });

  it('requires active-usage knowledge for active items at level 4', () => {
    const k = { icon: learned(3), effect: learned(3), mechanics: learned(3), situation: learned(3), build: learned(3) };
    expect(itemLevel(knowledge(k), metalSkin, now)).toBe(3);
    expect(itemLevel(knowledge({ ...k, active: learned(3) }), metalSkin, now)).toBe(4);
  });

  it('reaches mastery only with novel hard answers and no misconception', () => {
    const k = { icon: learned(3), effect: learned(3), mechanics: learned(3), situation: learned(3, 3, { novelHard: true }), build: learned(3), active: learned(3) };
    expect(itemLevel(knowledge(k), metalSkin, now)).toBe(5);
    const withMisconception = { ...k, effect: { ...learned(3), misconception: true } };
    expect(itemLevel(knowledge(withMisconception), metalSkin, now)).toBeLessThan(5);
  });
});

describe('isProblemItem', () => {
  it('flags open misconceptions', () => {
    const k = knowledge({ icon: { ...learned(2), misconception: true } });
    expect(isProblemItem(k, t0 + DAY)).toBe(true);
  });
  it('does not flag well-known items', () => {
    expect(isProblemItem(knowledge({ icon: learned(4), effect: learned(4) }), t0 + 12 * DAY)).toBe(false);
  });
});
