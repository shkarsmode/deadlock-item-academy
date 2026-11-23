import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { getDb } from '../../core/db/db';
import { Profiles, newId } from '../../core/profile/profile.service';
import { Content } from '../../content/content.service';
import { I18n } from '../../core/i18n/i18n';
import type { SavedBuild, SavedBuildCategory } from './build.model';

/** Saved builds of the current profile, plus read-only presets from the content bundle. */
@Injectable({ providedIn: 'root' })
export class Builds {
  private readonly profiles = inject(Profiles);
  private readonly content = inject(Content);
  private readonly i18n = inject(I18n);

  readonly saved = signal<SavedBuild[]>([]);
  readonly loaded = signal(false);

  /** Content build analyses exposed as builds (the learner's decoded builds and presets). */
  readonly presets = computed<SavedBuild[]>(() =>
    this.content.builds().map((b) => ({
      id: `preset:${b.id}`,
      profileId: 'preset',
      heroKey: b.build.hero,
      name: b.build.name,
      categories: b.build.categories.map((c) => ({ name: this.categoryName(c.name), optional: c.optional, items: c.items.map((i) => ({ key: i.key, imbue: i.imbue ?? null, note: i.note ?? null })) })),
      source: { type: 'preset', ref: b.id, note: b.build.source.note, importedAt: 0 },
      createdAt: 0,
      updatedAt: 0,
      isMine: false,
    })),
  );

  readonly all = computed(() => [...this.saved(), ...this.presets()]);

  constructor() {
    effect(() => {
      const id = this.profiles.profileId();
      if (!this.profiles.ready() || id === 'none') return;
      untracked(() => void this.load(id));
    });
  }

  private async load(profileId: string): Promise<void> {
    try {
      const db = await getDb();
      const list = await db.getAllFromIndex('builds', 'byProfile', profileId);
      this.saved.set(list.sort((a, b) => b.updatedAt - a.updatedAt));
    } catch (e) {
      console.error(e);
      this.saved.set([]);
    }
    this.loaded.set(true);
  }

  /** The game cache stores default categories as localization tokens. */
  categoryName(raw: string): string {
    const map: Record<string, [string, string]> = {
      '#Citadel_HeroBuilds_EarlyGame': ['Ранняя игра', 'Early game'],
      '#Citadel_HeroBuilds_MidGame': ['Середина игры', 'Mid game'],
      '#Citadel_HeroBuilds_LateGame': ['Поздняя игра', 'Late game'],
      '#Citadel_HeroBuilds_DefaultHeroBuild': ['Билд по умолчанию', 'Default build'],
    };
    const m = map[raw];
    return m ? this.i18n.l(m[0], m[1]) : raw;
  }

  get(id: string): SavedBuild | undefined {
    return this.all().find((b) => b.id === id);
  }

  async save(build: Omit<SavedBuild, 'id' | 'profileId' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<SavedBuild> {
    const now = Date.now();
    const existing = build.id ? this.saved().find((b) => b.id === build.id) : undefined;
    const rec: SavedBuild = {
      ...build,
      id: existing?.id ?? newId('b'),
      profileId: this.profiles.profileId(),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const db = await getDb();
    await db.put('builds', rec);
    this.saved.update((list) => [rec, ...list.filter((b) => b.id !== rec.id)]);
    return rec;
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await db.delete('builds', id);
    this.saved.update((list) => list.filter((b) => b.id !== id));
  }

  /** Copies a preset (or any build) into an editable saved build. */
  async duplicate(id: string, name?: string): Promise<SavedBuild | null> {
    const b = this.get(id);
    if (!b) return null;
    return this.save({
      heroKey: b.heroKey,
      name: name ?? `${b.name} (копия)`,
      description: b.description,
      categories: structuredClone(b.categories) as SavedBuildCategory[],
      source: { type: 'manual', ref: b.id, note: b.source.note, importedAt: Date.now() },
      isMine: false,
    });
  }

  itemKeys(b: SavedBuild): string[] {
    return [...new Set(b.categories.flatMap((c) => c.items.map((i) => i.key)))];
  }
}
