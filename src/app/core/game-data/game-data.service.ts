import { Injectable, computed, signal } from '@angular/core';
import type { AbilityData, GameDataBundle, GameItem, GameMeta, HeroData, Slot } from './game-data.model';
import { kvGet } from '../db/db';

export const GAME_OVERRIDE_KEY = 'gameData:override';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Game data store. Loads the snapshot bundled with the app (public/data/game) and, if the
 * learner installed a newer snapshot from the live API (Settings -> Game data), that one.
 */
@Injectable({ providedIn: 'root' })
export class GameData {
  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly error = signal<string | null>(null);
  readonly meta = signal<GameMeta | null>(null);
  readonly items = signal<GameItem[]>([]);
  readonly heroes = signal<HeroData[]>([]);
  /** 'bundled' or 'live' (installed from the API at runtime). */
  readonly source = signal<'bundled' | 'live'>('bundled');
  readonly bundledVersion = signal<number | null>(null);

  readonly standardItems = computed(() => this.items().filter((i) => i.mode === 'standard'));
  readonly itemMap = computed(() => new Map(this.items().map((i) => [i.key, i])));
  readonly itemById = computed(() => new Map(this.items().map((i) => [i.id, i])));
  readonly heroMap = computed(() => new Map(this.heroes().map((h) => [h.key, h])));
  readonly heroById = computed(() => new Map(this.heroes().map((h) => [h.id, h])));
  readonly abilityMap = computed(() => {
    const m = new Map<string, { ability: AbilityData; hero: HeroData }>();
    for (const h of this.heroes()) for (const a of h.abilities) m.set(a.key, { ability: a, hero: h });
    return m;
  });
  readonly abilityById = computed(() => {
    const m = new Map<number, { ability: AbilityData; hero: HeroData }>();
    for (const h of this.heroes()) for (const a of h.abilities) m.set(a.id, { ability: a, hero: h });
    return m;
  });
  readonly bySlot = computed(() => {
    const out: Record<Slot, GameItem[]> = { weapon: [], vitality: [], spirit: [] };
    for (const i of this.standardItems()) out[i.slot].push(i);
    for (const s of Object.keys(out) as Slot[]) out[s].sort((a, b) => a.tier - b.tier || a.name.en.localeCompare(b.name.en));
    return out;
  });
  readonly selectableHeroes = computed(() => this.heroes().filter((h) => h.abilities.length === 4));

  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (!this.loading) {
      this.status.set('loading');
      this.loading = this.doLoad().catch((e: unknown) => {
        this.status.set('error');
        this.error.set(e instanceof Error ? e.message : String(e));
        this.loading = null;
        throw e;
      });
    }
    return this.loading;
  }

  private async doLoad(): Promise<void> {
    const [meta, items, heroes] = await Promise.all([
      fetchJson<GameMeta>('data/game/meta.json'),
      fetchJson<GameItem[]>('data/game/items.json'),
      fetchJson<HeroData[]>('data/game/heroes.json'),
    ]);
    this.bundledVersion.set(meta.clientVersion);
    let bundle: GameDataBundle = { meta, items, heroes };
    let source: 'bundled' | 'live' = 'bundled';
    try {
      const override = await kvGet<GameDataBundle>(GAME_OVERRIDE_KEY);
      if (override && override.meta.clientVersion > meta.clientVersion) {
        bundle = override;
        source = 'live';
      }
    } catch {
      // IndexedDB unavailable (private mode): bundled data is enough.
    }
    this.apply(bundle, source);
  }

  apply(bundle: GameDataBundle, source: 'bundled' | 'live'): void {
    this.meta.set(bundle.meta);
    this.items.set(bundle.items);
    this.heroes.set(bundle.heroes);
    this.source.set(source);
    this.status.set('ready');
  }

  item(key: string | null | undefined): GameItem | undefined {
    return key ? this.itemMap().get(key) : undefined;
  }

  hero(key: string | null | undefined): HeroData | undefined {
    return key ? this.heroMap().get(key) : undefined;
  }

  ability(key: string | null | undefined): { ability: AbilityData; hero: HeroData } | undefined {
    return key ? this.abilityMap().get(key) : undefined;
  }

  /** Price for the player, discounting owned components. */
  priceFor(item: GameItem, owned: readonly string[]): number {
    let cost = item.cost;
    for (const c of item.components) if (owned.includes(c)) cost -= this.item(c)?.cost ?? 0;
    return Math.max(0, cost);
  }
}
