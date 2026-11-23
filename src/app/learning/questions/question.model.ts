import type { Dimension, Scenario, Text, Verdict } from '../../content/content.model';
import type { StatLine } from '../../core/game-data/game-data.model';
import type { ReviewTarget } from '../knowledge.model';

export type QuestionType =
  | 'icon-name'
  | 'name-icon'
  | 'icon-recall'
  | 'icon-slot'
  | 'icon-activation'
  | 'icon-tier'
  | 'item-effect'
  | 'effect-item'
  | 'stat-item'
  | 'mechanic-tf'
  | 'component'
  | 'contrast'
  | 'problem-item'
  | 'build-why'
  | 'scenario'
  | 'diagnose'
  | 'surgery';

export type QuestionFormat = 'mc' | 'icon-mc' | 'recall' | 'tf' | 'scenario' | 'two-step' | 'surgery';

export interface QOption {
  id: string;
  /** Text option. */
  text?: Text;
  /** Item option (rendered as icon + name). */
  itemKey?: string;
  /** Ability option (imbue scenarios). */
  abilityKey?: string;
  correct: boolean;
  /** Multi-criteria score 0..100 (scenarios). */
  score?: number;
  verdict?: Verdict;
  why?: Text;
  betterWhen?: Text;
}

export interface QPrompt {
  /** Main question line. */
  text: Text;
  /** Secondary line (context, instruction). */
  sub?: Text;
  /** Item shown as an icon (recognition) or by name. */
  itemKey?: string;
  /** Show the item name in the prompt (false = icon only). */
  showName?: boolean;
  /** Show the item icon in the prompt. */
  showIcon?: boolean;
  /** Pair of items for contrast questions. */
  pair?: [string, string];
  /** Stat lines shown instead of the item (stat-item). */
  stats?: StatLine[];
  /** Plain description shown instead of the item (effect-item). */
  quote?: Text;
}

export interface QExplain {
  /** Item that is the answer (feedback shows its summary card). */
  focusItem?: string;
  /** Items to contrast with the answer (e.g. what the learner picked). */
  compare?: string[];
  lines: Text[];
  rule?: Text;
}

export interface Question {
  /** Stable id for exposure tracking: same id = same underlying question. */
  id: string;
  type: QuestionType;
  format: QuestionFormat;
  difficulty: number;
  heroKey: string | null;
  targets: ReviewTarget[];
  prompt: QPrompt;
  options: QOption[];
  /** Accepted answers for free recall. */
  accept?: string[];
  scenario?: Scenario;
  allowDontKnow: boolean;
  askConfidence: boolean;
  hints: 'full' | 'reduced' | 'none';
  timeLimitMs?: number;
  /** Typical fast answer time in ms (for Easy grading). */
  fastMs: number;
  /** For confusion tracking on item questions. */
  expectedItem?: string;
  explain: QExplain;
  /** Main dimension trained (for interleaving and analytics). */
  dim: Dimension;
  /** How options are rendered. */
  optionView: 'name' | 'icon' | 'icon-name' | 'text' | 'ability';
  /** Inserted by in-session relearning after a mistake. */
  relearn?: boolean;
}

/** Estimated seconds per question including feedback (session time budgeting). */
export const SECONDS_PER_FORMAT: Record<QuestionFormat, number> = {
  'icon-mc': 11,
  mc: 15,
  tf: 9,
  recall: 15,
  scenario: 55,
  'two-step': 75,
  surgery: 100,
};
