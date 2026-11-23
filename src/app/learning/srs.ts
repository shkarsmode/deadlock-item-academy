import { Card, FSRS, Grade, Rating, State, createEmptyCard, fsrs, generatorParameters } from 'ts-fsrs';
import type { Confidence, DimState, ResultKind, StoredCard } from './knowledge.model';

/**
 * Spaced repetition on top of FSRS (ts-fsrs). One FSRS card per (item, knowledge dimension).
 * Intra-session relearning is handled by the session planner, so FSRS short-term steps are off:
 * FSRS schedules across days, the planner re-asks within the session.
 */
export const TARGET_RETENTION = 0.9;

let scheduler: FSRS | null = null;
export function getScheduler(): FSRS {
  if (!scheduler) {
    scheduler = fsrs(
      generatorParameters({
        request_retention: TARGET_RETENTION,
        maximum_interval: 365,
        enable_fuzz: true,
        enable_short_term: false,
      }),
    );
  }
  return scheduler;
}

export function toCard(s: StoredCard): Card {
  return {
    due: new Date(s.due),
    stability: s.stability,
    difficulty: s.difficulty,
    elapsed_days: s.elapsed_days,
    scheduled_days: s.scheduled_days,
    learning_steps: s.learning_steps,
    reps: s.reps,
    lapses: s.lapses,
    state: s.state as State,
    last_review: s.last_review ? new Date(s.last_review) : undefined,
  };
}

export function fromCard(c: Card): StoredCard {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state,
    last_review: c.last_review ? c.last_review.getTime() : null,
  };
}

export function newDimState(now: number): DimState {
  return {
    card: fromCard(createEmptyCard(new Date(now))),
    attempts: 0,
    correct: 0,
    streak: 0,
    lastResult: null,
    lastAt: null,
    confidentWrong: 0,
    misconception: false,
    novelHardCorrect: 0,
  };
}

export interface AnswerSignal {
  result: ResultKind;
  /** 0..1 quality for multi-criteria answers (scenario score). */
  score: number;
  confidence: Confidence | null;
  /** Free recall (typed) answers are stronger evidence than multiple choice. */
  recall: boolean;
  /** Number of options shown (guess probability = 1/n). 0 for recall. */
  optionCount: number;
  latencyMs: number;
  /** Typical fast answer time for this question type. */
  fastMs: number;
}

/**
 * Maps an answer to an FSRS grade.
 * - wrong / don't know -> Again
 * - correct but guessed / unsure, or a "partial" scenario answer -> Hard
 * - correct -> Good
 * - correct, sure, fast, and recall (or a strong scenario score) -> Easy
 */
export function gradeFor(sig: AnswerSignal): Grade {
  if (sig.result === 'wrong' || sig.result === 'dontknow') return Rating.Again;
  if (sig.result === 'partial') return Rating.Hard;
  if (sig.confidence === 'guess' || sig.confidence === 'unsure') return Rating.Hard;
  // With 2-3 options a correct answer is weak evidence unless the learner was confident.
  if (!sig.recall && sig.optionCount > 0 && sig.optionCount <= 3 && sig.confidence === null) return Rating.Good;
  const fast = sig.latencyMs > 0 && sig.latencyMs <= sig.fastMs;
  if (sig.confidence === 'sure' && fast && (sig.recall || sig.score >= 0.95)) return Rating.Easy;
  return Rating.Good;
}

/** Applies one answer to a dimension state (pure; returns a new object). */
export function applyAnswer(prev: DimState, sig: AnswerSignal, weight: number, now: number, ctx: { novel: boolean; difficulty: number; hints: 'full' | 'reduced' | 'none' }): DimState {
  const s: DimState = { ...prev, card: { ...prev.card } };
  s.attempts += 1;
  s.lastAt = now;
  s.lastResult = sig.result;
  const good = sig.result === 'correct' || sig.result === 'partial';
  if (good) {
    s.correct += sig.result === 'correct' ? 1 : 0.5;
    s.streak += 1;
    if (s.misconception && s.streak >= 2) s.misconception = false;
    if (ctx.novel && ctx.difficulty >= 4 && ctx.hints === 'none' && sig.result === 'correct') s.novelHardCorrect += 1;
  } else {
    s.streak = 0;
    if (sig.result === 'wrong' && (sig.confidence === 'sure' || sig.confidence === 'likely')) {
      s.confidentWrong += 1;
      s.misconception = true;
    }
  }
  // Weak evidence (weight < 0.5) only nudges the card when the answer was wrong; a lucky
  // secondary hit should not push the next review weeks away.
  if (weight >= 0.5 || !good) {
    const grade = gradeFor(sig);
    const next = getScheduler().next(toCard(s.card), new Date(now), grade);
    s.card = fromCard(next.card);
  }
  return s;
}

/** Probability of recall right now (0..1); 0 for never reviewed. */
export function retrievability(s: DimState | undefined, now: number): number {
  if (!s || s.card.reps === 0 || s.card.last_review === null) return 0;
  return getScheduler().get_retrievability(toCard(s.card), new Date(now), false);
}

export function isDue(s: DimState | undefined, now: number): boolean {
  if (!s || s.card.reps === 0) return false;
  return s.card.due <= now || retrievability(s, now) < TARGET_RETENTION;
}

/** Days of memory stability (how long until recall drops to ~90%). */
export function stabilityDays(s: DimState | undefined): number {
  return s && s.card.reps > 0 ? s.card.stability : 0;
}
