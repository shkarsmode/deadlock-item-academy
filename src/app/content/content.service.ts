import { Injectable, computed, inject, signal } from '@angular/core';
import type { BuildAnalysis, ContentBundle, HeroCourse, ItemContent, ProblemEntry, Scenario } from './content.model';
import { GameData } from '../core/game-data/game-data.service';

/** Hand-authored learning content (validated at build time by scripts/validate-content.ts). */
@Injectable({ providedIn: 'root' })
export class Content {
  private readonly game = inject(GameData);

  readonly status = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  readonly bundle = signal<ContentBundle | null>(null);

  readonly items = computed<Record<string, ItemContent>>(() => this.bundle()?.items ?? {});
  readonly scenarios = computed<Scenario[]>(() => this.bundle()?.scenarios ?? []);
  readonly courses = computed<HeroCourse[]>(() => this.bundle()?.courses ?? []);
  readonly builds = computed<BuildAnalysis[]>(() => this.bundle()?.builds ?? []);
  readonly problems = computed<ProblemEntry[]>(() => this.bundle()?.problems ?? []);
  readonly needsReview = computed(() => new Set(this.bundle()?.needsReview ?? []));

  /** Content whose pinned item data no longer matches the live game data (runtime check). */
  readonly staleItems = computed(() => {
    const out = new Set<string>();
    const game = this.game.itemMap();
    for (const [key, c] of Object.entries(this.items())) {
      const it = game.get(key);
      if (it && c.basedOnHash && c.basedOnHash !== it.hash) out.add(key);
    }
    return out;
  });
  readonly staleScenarios = computed(() => {
    const out = new Set<string>();
    const game = this.game.itemMap();
    for (const s of this.scenarios()) {
      for (const [k, h] of Object.entries(s.pinned ?? {})) {
        const it = game.get(k);
        if (it && it.hash !== h) {
          out.add(s.id);
          break;
        }
      }
    }
    return out;
  });

  readonly scenarioById = computed(() => new Map(this.scenarios().map((s) => [s.id, s])));
  /** item key -> scenarios where it is an option or owned. */
  readonly scenariosByItem = computed(() => {
    const m = new Map<string, Scenario[]>();
    for (const s of this.scenarios()) {
      const keys = new Set<string>([...s.options.map((o) => o.item).filter((x): x is string => !!x), ...(s.startBuild ?? [])]);
      for (const k of keys) {
        if (!m.has(k)) m.set(k, []);
        m.get(k)?.push(s);
      }
    }
    return m;
  });

  private loading: Promise<void> | null = null;

  load(): Promise<void> {
    if (!this.loading) {
      this.status.set('loading');
      this.loading = fetch('data/content/bundle.json', { cache: 'no-cache' })
        .then((r) => {
          if (!r.ok) throw new Error(`content bundle: HTTP ${r.status}`);
          return r.json() as Promise<ContentBundle>;
        })
        .then((b) => {
          this.bundle.set(b);
          this.status.set('ready');
        })
        .catch((e: unknown) => {
          console.error(e);
          // The app still works with data-only questions when content is missing.
          this.bundle.set(null);
          this.status.set('error');
          this.loading = null;
        });
    }
    return this.loading;
  }

  item(key: string): ItemContent | undefined {
    return this.items()[key];
  }

  course(heroKey: string): HeroCourse | undefined {
    return this.courses().find((c) => c.hero === heroKey);
  }

  build(id: string): BuildAnalysis | undefined {
    return this.builds().find((b) => b.id === id);
  }
}
