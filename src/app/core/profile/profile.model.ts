export type UiLang = 'ru' | 'en';
export type NameLang = 'en' | 'ru';
export type ExplainDepth = 'simple' | 'detailed' | 'technical';
export type ConfidenceMode = 'auto' | 'always' | 'never';
export type LearningGoal = 'recognize' | 'my-build' | 'counters' | 'all';
export type StartLevel = 'new' | 'basic' | 'experienced';

export interface ProfileSettings {
  lang: UiLang;
  /** Language of game names (items, abilities). Default English, as in the player's client. */
  nameLang: NameLang;
  /** Show the other language's name as a hint. */
  showAltNames: boolean;
  explain: ExplainDepth;
  heroFocus: string;
  secondaryHero: string | null;
  sessionMinutes: number;
  goal: LearningGoal;
  startLevel: StartLevel;
  confidence: ConfidenceMode;
  /** Max new items introduced per session (spacing beats cramming). */
  newPerSession: number;
  /** Optional time limit for recognition questions in advanced levels. */
  timedRecall: boolean;
  sound: boolean;
}

export interface ProfileRecord {
  id: string;
  name: string;
  createdAt: number;
  onboarded: boolean;
  /** Build id (content or saved build) used for "Master Your Build". */
  myBuildId: string | null;
  settings: ProfileSettings;
  schema: number;
}

export const DEFAULT_SETTINGS: ProfileSettings = {
  lang: 'ru',
  nameLang: 'en',
  showAltNames: true,
  explain: 'detailed',
  heroFocus: 'hero_hornet',
  secondaryHero: 'hero_necro',
  sessionMinutes: 10,
  goal: 'all',
  startLevel: 'basic',
  confidence: 'auto',
  newPerSession: 5,
  timedRecall: false,
  sound: false,
};

export const PROFILE_SCHEMA = 1;
