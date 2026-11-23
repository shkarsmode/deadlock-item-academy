import type { AbilityData, GameItem, HeroData } from '../../../core/game-data/game-data.model';
import type { PortableBuild, SavedBuildCategory } from '../build.model';
import type { HeroBuild } from './hero-build';

export interface ImportLookups {
  itemById: Map<number, GameItem>;
  itemByKey: Map<string, GameItem>;
  heroById: Map<number, HeroData>;
  heroByKey: Map<string, HeroData>;
  abilityById: Map<number, { ability: AbilityData; hero: HeroData }>;
}

export interface BuildDraft {
  heroKey: string;
  name: string;
  description?: string;
  categories: SavedBuildCategory[];
  /** Item ids the current game data does not know (removed items). */
  unknownItems: number[];
  ref?: string;
  meta?: { lastUpdated?: number; originBuildId?: number; buildId?: number; lastUsed?: boolean };
}

const DEFAULT_CATEGORY_NAMES: Record<string, string> = {
  '#Citadel_HeroBuilds_EarlyGame': 'Early Game',
  '#Citadel_HeroBuilds_MidGame': 'Mid Game',
  '#Citadel_HeroBuilds_LateGame': 'Late Game',
  '#Citadel_HeroBuilds_DefaultHeroBuild': 'Default build',
};

function categoryName(raw: string | undefined, i: number): string {
  if (!raw) return `Category ${i + 1}`;
  return DEFAULT_CATEGORY_NAMES[raw] ?? raw;
}

/** Converts a hero build (game cache protobuf or API JSON) into an app build draft. */
export function draftFromHeroBuild(b: HeroBuild, lk: ImportLookups): BuildDraft | null {
  const hero = lk.heroById.get(b.hero_id);
  if (!hero) return null;
  const unknown: number[] = [];
  const categories: SavedBuildCategory[] = (b.details?.mod_categories ?? []).map((c, i) => ({
    name: categoryName(c.name, i),
    optional: c.optional || undefined,
    items: c.mods
      .map((m) => {
        const it = lk.itemById.get(m.ability_id);
        if (!it) {
          unknown.push(m.ability_id);
          return null;
        }
        const imbue = m.imbue_target_ability_id ? lk.abilityById.get(m.imbue_target_ability_id)?.ability.key ?? null : null;
        return { key: it.key, imbue, note: m.annotation || null };
      })
      .filter((x): x is { key: string; imbue: string | null; note: string | null } => !!x),
  }));
  return {
    heroKey: hero.key,
    name: (DEFAULT_CATEGORY_NAMES[b.name ?? ''] ?? b.name) || hero.name.en,
    description: b.description || undefined,
    categories: categories.filter((c) => c.items.length),
    unknownItems: unknown,
    meta: { lastUpdated: b.last_updated_timestamp, originBuildId: b.origin_build_id || undefined, buildId: b.hero_build_id },
  };
}

/** Accepts: deadlock-api `/v1/builds` response (array or single), a `hero_build` object, or the app's own export. */
export function draftsFromJson(text: string, lk: ImportLookups): BuildDraft[] {
  const data = JSON.parse(text) as unknown;
  const out: BuildDraft[] = [];
  const visit = (x: unknown) => {
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    if (o['format'] === 'dia-build') {
      const p = o as unknown as PortableBuild;
      if (lk.heroByKey.has(p.hero)) {
        out.push({
          heroKey: p.hero,
          name: p.name,
          description: p.description,
          categories: p.categories.map((c) => ({ ...c, items: c.items.filter((i) => lk.itemByKey.has(i.key)) })),
          unknownItems: [],
        });
      }
      return;
    }
    if (o['hero_build'] && typeof o['hero_build'] === 'object') return visit(o['hero_build']);
    if (typeof o['hero_id'] === 'number' && o['details']) {
      const d = draftFromHeroBuild(o as unknown as HeroBuild, lk);
      if (d) out.push(d);
    }
  };
  if (Array.isArray(data)) data.forEach(visit);
  else visit(data);
  return out;
}

export function toPortable(heroKey: string, name: string, categories: SavedBuildCategory[], description?: string): PortableBuild {
  return { format: 'dia-build', version: 1, hero: heroKey, name, description, categories };
}

/** Public build lookup (no personal data sent: only the public build id). */
export async function fetchPublicBuild(buildId: number, lk: ImportLookups): Promise<BuildDraft[]> {
  const res = await fetch(`https://api.deadlock-api.com/v1/builds?build_id=${encodeURIComponent(String(buildId))}&only_latest=true`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return draftsFromJson(await res.text(), lk).map((d) => ({ ...d, ref: `api:${buildId}` }));
}
