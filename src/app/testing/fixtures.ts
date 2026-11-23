import type { GameItem, HeroData } from '../core/game-data/game-data.model';
import type { ContentBundle } from '../content/content.model';
import itemsJson from '../../../public/data/game/items.json';
import heroesJson from '../../../public/data/game/heroes.json';
import bundleJson from '../../../public/data/content/bundle.json';

/** Real game data and content bundle, so tests verify behaviour against the shipped data. */
export const ITEMS = itemsJson as unknown as GameItem[];
export const HEROES = heroesJson as unknown as HeroData[];
export const BUNDLE = bundleJson as unknown as ContentBundle;
export const STANDARD = ITEMS.filter((i) => i.mode === 'standard');
export const ITEM_MAP = new Map(ITEMS.map((i) => [i.key, i]));
export const HERO_MAP = new Map(HEROES.map((h) => [h.key, h]));

export function item(key: string): GameItem {
  const it = ITEM_MAP.get(key);
  if (!it) throw new Error(`fixture: unknown item ${key}`);
  return it;
}
