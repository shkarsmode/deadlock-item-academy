import type { Threat } from '../../content/content.model';

/** After-match reflection entered by the learner. Nothing here is fetched from match history. */
export interface Reflection {
  id: string;
  profileId: string;
  createdAt: number;
  heroKey: string;
  enemies: string[];
  problems: Threat[];
  bought: string[];
  /** Items the learner was unsure about. */
  doubts: string[];
  result: 'win' | 'loss' | null;
  note: string;
}
