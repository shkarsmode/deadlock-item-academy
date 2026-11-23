import { Injectable, inject, signal } from '@angular/core';
import type { GameDataBundle, GameDataDiff } from './game-data.model';
import { GAME_OVERRIDE_KEY, GameData } from './game-data.service';
import { RawInputs, diffGameData, normalizeGameData } from './normalize';
import { getDb, kvSet } from '../db/db';
import { Knowledge } from '../../learning/knowledge.service';

const API = 'https://api.deadlock-api.com';

/**
 * In-app game data update: fetches the live API (CORS-enabled), normalizes it with the same
 * code as the build-time sync, shows what changed and, on install, flags affected knowledge.
 * Icons of new items come from the API CDN until the next app release bundles them.
 */
@Injectable({ providedIn: 'root' })
export class GameUpdate {
  private readonly game = inject(GameData);
  private readonly knowledge = inject(Knowledge);

  readonly state = signal<'idle' | 'checking' | 'ready' | 'up-to-date' | 'error' | 'installed'>('idle');
  readonly error = signal<string | null>(null);
  readonly liveVersion = signal<number | null>(null);
  readonly diff = signal<GameDataDiff | null>(null);
  private pending: GameDataBundle | null = null;

  async check(): Promise<void> {
    this.state.set('checking');
    this.error.set(null);
    try {
      const get = async <T>(p: string): Promise<T> => {
        const r = await fetch(`${API}${p}`);
        if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
        return (await r.json()) as T;
      };
      const steamInfo = await get<RawInputs['steamInfo']>('/v1/assets/steam-info');
      this.liveVersion.set(steamInfo.client_version ?? null);
      const current = this.game.meta()?.clientVersion ?? 0;
      if ((steamInfo.client_version ?? 0) <= current) {
        this.state.set('up-to-date');
        return;
      }
      const [itemsEn, itemsRu, heroesEn, heroesRu, generic, patches] = await Promise.all([
        get<RawInputs['itemsEn']>('/v1/assets/items'),
        get<RawInputs['itemsRu']>('/v1/assets/items?language=russian'),
        get<RawInputs['heroesEn']>('/v1/assets/heroes'),
        get<RawInputs['heroesRu']>('/v1/assets/heroes?language=russian'),
        get<RawInputs['generic']>('/v1/assets/generic-data'),
        get<RawInputs['patches']>('/v2/patches').catch(() => []),
      ]);
      const next = normalizeGameData({ itemsEn, itemsRu, heroesEn, heroesRu, generic, steamInfo, patches, fetchedAt: new Date().toISOString() });
      // New items have no bundled icon yet: point them at the CDN.
      const known = new Set(this.game.items().map((i) => i.key));
      for (const it of next.items) if (!known.has(it.key)) it.icon = it.iconRemote;
      for (const h of next.heroes) {
        if (!this.game.heroMap().has(h.key)) h.icon = h.iconRemote;
        for (const a of h.abilities) if (!this.game.abilityMap().has(a.key)) a.icon = a.iconRemote;
      }
      const prev: GameDataBundle | null = this.game.meta() ? { meta: this.game.meta()!, items: this.game.items(), heroes: this.game.heroes() } : null;
      this.diff.set(diffGameData(prev, next));
      this.pending = next;
      this.state.set('ready');
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
      this.state.set('error');
    }
  }

  async install(): Promise<number> {
    const next = this.pending;
    const diff = this.diff();
    if (!next || !diff) return 0;
    await kvSet(GAME_OVERRIDE_KEY, next);
    this.game.apply(next, 'live');
    const changed = diff.items.filter((c) => c.kind === 'changed').map((c) => ({ key: c.key, fields: c.fields }));
    const flagged = await this.knowledge.flagChanged(changed, next.meta.clientVersion);
    this.state.set('installed');
    this.pending = null;
    return flagged;
  }

  /** Drops the installed live snapshot and returns to the data bundled with the app. */
  async revert(): Promise<void> {
    const db = await getDb();
    await db.delete('kv', GAME_OVERRIDE_KEY);
    location.reload();
  }
}
