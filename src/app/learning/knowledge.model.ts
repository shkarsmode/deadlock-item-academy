import type { Dimension } from '../content/content.model';

/**
 * Knowledge model. Every item has independent knowledge dimensions; each dimension is an
 * FSRS memory card plus evidence counters. A learner can know an icon perfectly and still
 * have no idea when to buy the item - the model keeps those apart.
 */

/** Serializable FSRS card (dates as epoch ms). Mirrors ts-fsrs `Card`. */
export interface StoredCard {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
  last_review: number | null;
}

export type Confidence = 'guess' | 'unsure' | 'likely' | 'sure';
export type ResultKind = 'correct' | 'partial' | 'wrong' | 'dontknow';

export interface DimState {
  card: StoredCard;
  attempts: number;
  correct: number;
  streak: number;
  lastResult: ResultKind | null;
  lastAt: number | null;
  /** Wrong answers given with "sure"/"likely" confidence - misconceptions to fix first. */
  confidentWrong: number;
  /** Active misconception: set by a confident wrong answer, cleared by two later correct answers. */
  misconception: boolean;
  /** Correct answers on first exposure to hard (difficulty >= 4) items without hints. */
  novelHardCorrect: number;
}

export interface ItemKnowledge {
  profileId: string;
  itemKey: string;
  dims: Partial<Record<Dimension, DimState>>;
  introducedAt: number | null;
  /** Set when a game update changed the item's mechanics after the learner studied it. */
  flagged: { version: number; at: number; fields: string[] } | null;
}

/** 0 = not started, 1 Recognition, 2 Understanding, 3 Application, 4 Analysis, 5 Mastery. */
export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface ReviewTarget {
  item: string;
  dim: Dimension;
  /** 0..1 - how strongly the answer is evidence for this (item, dim). */
  weight: number;
}

export interface ReviewRecord {
  id?: number;
  profileId: string;
  ts: number;
  sessionId: string | null;
  questionId: string;
  questionType: string;
  format: string;
  difficulty: number;
  heroKey: string | null;
  targets: ReviewTarget[];
  result: ResultKind;
  /** 0..1, for multi-criteria answers (scenario score / 100). */
  score: number;
  confidence: Confidence | null;
  latencyMs: number;
  /** First time this learner saw this question id. */
  novel: boolean;
  /** Item the learner picked when it was wrong (for confusion analysis). */
  chosenItem: string | null;
  /** Hints mode the question was shown in. */
  hints: 'full' | 'reduced' | 'none';
}

export interface QuestionExposure {
  profileId: string;
  questionId: string;
  seen: number;
  correct: number;
  lastAt: number;
  lastResult: ResultKind;
}

export type MistakeKind = 'confusion' | 'misconception' | 'principle';

export interface MistakeEntry {
  id: string;
  profileId: string;
  kind: MistakeKind;
  /** confusion: [expected, chosen]; misconception: [item]; principle: items involved. */
  items: string[];
  /** Scenario principle / question id for principle mistakes. */
  ref: string | null;
  dim: Dimension | null;
  count: number;
  firstAt: number;
  lastAt: number;
  /** Correct answers on the same principle since the last mistake. */
  fixedStreak: number;
  resolved: boolean;
  note: string | null;
}

export interface SessionRecord {
  id: string;
  profileId: string;
  startedAt: number;
  endedAt: number | null;
  mode: string;
  heroKey: string | null;
  planned: number;
  answered: number;
  correct: number;
  partial: number;
  newItems: string[];
  durationMs: number;
}
