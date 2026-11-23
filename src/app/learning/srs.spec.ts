import { Rating } from 'ts-fsrs';
import { AnswerSignal, applyAnswer, gradeFor, isDue, newDimState, retrievability, stabilityDays } from './srs';

const base: AnswerSignal = { result: 'correct', score: 1, confidence: null, recall: false, optionCount: 4, latencyMs: 3000, fastMs: 5000 };
const DAY = 86_400_000;

describe('gradeFor', () => {
  it('maps wrong and "don\'t know" to Again', () => {
    expect(gradeFor({ ...base, result: 'wrong' })).toBe(Rating.Again);
    expect(gradeFor({ ...base, result: 'dontknow' })).toBe(Rating.Again);
  });
  it('treats guessed or unsure correct answers as Hard', () => {
    expect(gradeFor({ ...base, confidence: 'guess' })).toBe(Rating.Hard);
    expect(gradeFor({ ...base, confidence: 'unsure' })).toBe(Rating.Hard);
    expect(gradeFor({ ...base, result: 'partial' })).toBe(Rating.Hard);
  });
  it('gives Easy only for sure, fast free recall', () => {
    expect(gradeFor({ ...base, confidence: 'sure', recall: true, latencyMs: 2000 })).toBe(Rating.Easy);
    expect(gradeFor({ ...base, confidence: 'sure', recall: true, latencyMs: 9000 })).toBe(Rating.Good);
    expect(gradeFor({ ...base, confidence: 'sure', recall: false, latencyMs: 2000, score: 0.9 })).toBe(Rating.Good);
  });
  it('does not over-reward a correct pick among 2-3 options', () => {
    expect(gradeFor({ ...base, optionCount: 3 })).toBe(Rating.Good);
  });
});

describe('applyAnswer', () => {
  const now = Date.UTC(2026, 10, 23, 12);
  const ctx = { novel: true, difficulty: 2, hints: 'full' as const };

  it('schedules a correct answer into the future and counts evidence', () => {
    const s = applyAnswer(newDimState(now), base, 1, now, ctx);
    expect(s.attempts).toBe(1);
    expect(s.correct).toBe(1);
    expect(s.card.reps).toBe(1);
    expect(s.card.due).toBeGreaterThan(now);
    expect(stabilityDays(s)).toBeGreaterThan(0);
  });

  it('flags a confident wrong answer as a misconception and clears it after two correct answers', () => {
    let s = applyAnswer(newDimState(now), { ...base, result: 'wrong', confidence: 'sure' }, 1, now, ctx);
    expect(s.misconception).toBe(true);
    expect(s.confidentWrong).toBe(1);
    s = applyAnswer(s, base, 1, now + DAY, ctx);
    expect(s.misconception).toBe(true);
    s = applyAnswer(s, base, 1, now + 3 * DAY, ctx);
    expect(s.misconception).toBe(false);
  });

  it('a wrong answer makes the card due sooner than a correct one', () => {
    const good = applyAnswer(newDimState(now), base, 1, now, ctx);
    const bad = applyAnswer(newDimState(now), { ...base, result: 'wrong' }, 1, now, ctx);
    expect(bad.card.due).toBeLessThanOrEqual(good.card.due);
  });

  it('weak secondary evidence does not move the schedule on a correct answer', () => {
    const s0 = newDimState(now);
    const s = applyAnswer(s0, base, 0.3, now, ctx);
    expect(s.card.reps).toBe(0);
    expect(s.correct).toBe(1);
  });

  it('counts first-time hard, hint-free correct answers for mastery', () => {
    const s = applyAnswer(newDimState(now), base, 1, now, { novel: true, difficulty: 4, hints: 'none' });
    expect(s.novelHardCorrect).toBe(1);
  });
});

describe('retrievability and due', () => {
  it('is zero for an unseen card and decays over time', () => {
    const now = Date.UTC(2026, 10, 1);
    expect(retrievability(newDimState(now), now)).toBe(0);
    const s = applyAnswer(newDimState(now), base, 1, now, { novel: false, difficulty: 2, hints: 'full' });
    const r1 = retrievability(s, now + DAY);
    const r2 = retrievability(s, now + 30 * DAY);
    expect(r1).toBeGreaterThan(r2);
    expect(isDue(s, now + 60 * DAY)).toBe(true);
  });
});
