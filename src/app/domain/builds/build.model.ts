export type BuildSourceType = 'game-cache' | 'api' | 'manual' | 'screenshot' | 'json' | 'preset';

export interface SavedBuildItem {
  key: string;
  /** Ability key chosen as imbue target (only for imbue items). */
  imbue?: string | null;
  note?: string | null;
}

export interface SavedBuildCategory {
  name: string;
  optional?: boolean;
  items: SavedBuildItem[];
}

export interface SavedBuild {
  id: string;
  profileId: string;
  heroKey: string;
  name: string;
  description?: string;
  categories: SavedBuildCategory[];
  source: { type: BuildSourceType; ref?: string; note?: string; importedAt: number };
  createdAt: number;
  updatedAt: number;
  /** Marked by the learner as "my build" - used by Master Your Build. */
  isMine: boolean;
}

/** Plain export/import format (also accepts the deadlock-api `hero_build` JSON). */
export interface PortableBuild {
  format: 'dia-build';
  version: 1;
  hero: string;
  name: string;
  description?: string;
  categories: SavedBuildCategory[];
}
