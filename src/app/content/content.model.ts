/**
 * Learning content model (hand-authored expert layer on top of official game data).
 *
 * Source files live in /content/**.json and are validated + bundled by
 * `npm run content:validate` into public/data/content/bundle.json.
 * See docs/CONTENT_GUIDE.md for authoring rules.
 */
import type {
  CLAIM_STATUSES,
  CONTENT_STATUSES,
  DIMENSIONS,
  ITEM_ROLES,
  PHASES,
  SCENARIO_KINDS,
  THREATS,
  VERDICTS,
} from './vocab';

export type ItemRole = (typeof ITEM_ROLES)[number];
export type Threat = (typeof THREATS)[number];
export type Dimension = (typeof DIMENSIONS)[number];
export type Phase = (typeof PHASES)[number];
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];
export type ScenarioKind = (typeof SCENARIO_KINDS)[number];
export type Verdict = (typeof VERDICTS)[number];
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** Authored text. Russian is required; English is optional (UI falls back to Russian). */
export interface Text {
  ru: string;
  en?: string;
}

/** A single statement with its epistemic status. Default status is `expert`. */
export interface Claim {
  text: Text;
  status?: ClaimStatus;
}

export interface ItemAlternative {
  key: string;
  when: Text;
}

export interface Synergy {
  /** Item key, hero key or ability key. */
  with: string;
  kind: 'item' | 'hero' | 'ability';
  note: Text;
  status?: ClaimStatus;
}

export interface ItemContent {
  key: string;
  /** Item hash at authoring time; content is flagged for review when the game changes the item. */
  basedOnHash?: string;
  roles: ItemRole[];
  /** Threats this item is a real answer to. */
  counters: Threat[];
  /** One sentence: which problem the item solves (plain language, no stats). */
  job: Text;
  /** Explanation for a new player (2-3 sentences). */
  simple: Text;
  /** Detailed mechanics and nuance (3-6 sentences). */
  detail: Text;
  buyWhen: Claim[];
  skipWhen: Claim[];
  mistakes: Claim[];
  /** What the item does NOT solve (common misconceptions). */
  doesNotSolve?: Claim[];
  alternatives: ItemAlternative[];
  synergies?: Synergy[];
  /** A concrete match situation where the item matters. */
  example: Text;
  /** Visual memory hook: what the icon shows and how it links to the function. */
  iconCue?: Text;
  activeUse?: { when: Text; saveFor: Text; tooEarly: Text };
  imbue?: { goodTargets: Text; badTargets: Text };
  status: ContentStatus;
}

export interface ScenarioEnemy {
  hero: string;
  items?: string[];
  note?: Text;
}

export interface ScenarioOption {
  /** Item key for buy/sell/surgery options. */
  item?: string;
  /** Free-form action for active-timing options. */
  action?: Text;
  /** Ability key for imbue options. */
  ability?: string;
  score: number;
  verdict: Verdict;
  why: Text;
  /** When this option would be the better choice. */
  betterWhen?: Text;
}

export interface DiagnosisOption {
  id: string;
  text: Text;
  correct: boolean;
  why: Text;
}

export interface DecisionTree {
  problem: Text;
  solutions: Text[];
  constraints: Text[];
  choice: Text;
  consequences: Text[];
}

export interface Scenario {
  id: string;
  kind: ScenarioKind;
  /** Hero key of the player, e.g. `hero_hornet` (Vindicta). */
  hero: string;
  phase: Phase;
  /** Unspent souls available right now. */
  souls: number;
  owned: string[];
  enemies: ScenarioEnemy[];
  allies?: { hero: string; note?: Text }[];
  /** What is happening. Must not name the best answer. */
  situation: Text;
  /** Observable symptoms, used in hard mode instead of the explicit problem statement. */
  symptoms?: Text[];
  question: Text;
  problemTags: Threat[];
  diagnosis?: { prompt: Text; options: DiagnosisOption[] };
  options: ScenarioOption[];
  /** Rule of thumb to remember (one short sentence). */
  principle: Text;
  mechanics: Claim[];
  tree?: DecisionTree;
  difficulty: number;
  tags: string[];
  dims: Dimension[];
  /** e.g. `item:upgrade_rupture`, `patch:2026-10-30`, `build:616630`, `ability:citadel_ability_hornet_snipe`. */
  sources: string[];
  status: ContentStatus;
  /** Filled by the content build: item key -> hash the scenario was validated against. */
  pinned?: Record<string, string>;
  /** For surgery: the starting build (item keys) the learner edits. */
  startBuild?: string[];
  /** For surgery: how many swaps are expected. */
  swaps?: number;
}

export interface CourseModule {
  id: string;
  title: Text;
  goal: Text;
  lesson: Text[];
  keyPoints: Text[];
  items: string[];
  /** Scenario tags used to pick drills for this module. */
  scenarioTags: string[];
  focus: Dimension[];
}

export interface AbilityNote {
  ability: string;
  role: Text;
  itemSynergy: { item: string; note: Text; status?: ClaimStatus }[];
  imbue?: { goodItems: string[]; note: Text };
}

export interface Archetype {
  id: string;
  name: Text;
  idea: Text;
  coreItems: string[];
  keyAbilities: string[];
}

export interface HeroCourse {
  hero: string;
  depth: 'deep' | 'basic';
  summary: Text;
  archetypes: Archetype[];
  abilityNotes: AbilityNote[];
  modules: CourseModule[];
  /** Hero-specific item notes (why this item on this hero). */
  itemNotes?: { item: string; note: Text; status?: ClaimStatus }[];
  commonMistakes?: Claim[];
}

export interface BuildItemRef {
  key: string;
  imbue?: string;
  note?: string;
}

export interface BuildCategory {
  name: string;
  optional?: boolean;
  items: BuildItemRef[];
}

export interface BuildDefinition {
  id: string;
  hero: string;
  name: string;
  /** Where the build comes from (local game cache, API build id, manual). */
  source: { type: 'game-cache' | 'api' | 'manual' | 'preset'; ref?: string; note?: string };
  categories: BuildCategory[];
}

export interface BuildItemAnalysis {
  /** 1. Why the item is in the build. */
  why: Text;
  /** 2. Which aspect of the hero it amplifies. */
  aspect: Text;
  /** 3. Link with abilities / playstyle. */
  abilityLink: Text;
  /** 4. Best purchase timing. */
  timing: Text;
  /** 5. Alternatives. */
  alternatives: ItemAlternative[];
  /** 6. When it becomes less useful. */
  lessUseful: Text;
  /** 7. What happens if you skip it. */
  ifSkipped: Text;
  /** 8. Items that unlock more of its value. */
  enablers: { items: string[]; note: Text };
  /** 9. When to replace or sell. */
  replaceOrSell: Text;
  /** 10. In-match signals to reconsider the purchase. */
  reconsiderSignals: Text[];
  status?: ClaimStatus;
}

export interface BuildAnalysis {
  id: string;
  build: BuildDefinition;
  title: Text;
  overview: Text;
  strengths: Claim[];
  risks: Claim[];
  /** Differences versus the original/public version, if any. */
  diff?: Claim[];
  items: Record<string, BuildItemAnalysis>;
  status: ContentStatus;
}

export interface ProblemEntry {
  id: string;
  title: Text;
  /** Search keywords (ru/en, slang allowed). */
  aliases: string[];
  threats: Threat[];
  explanation: Text;
  solutions: { title: Text; items: string[]; note: Text }[];
  caveats: Claim[];
}

/** Merged, validated content as shipped to the app. */
export interface ContentBundle {
  schema: number;
  builtAt: string;
  gameVersion: number;
  items: Record<string, ItemContent>;
  scenarios: Scenario[];
  courses: HeroCourse[];
  builds: BuildAnalysis[];
  problems: ProblemEntry[];
  /** Content ids whose pinned item data changed since authoring. */
  needsReview: string[];
}
