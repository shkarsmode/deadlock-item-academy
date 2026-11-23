import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import { Router, RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { Toasts } from '../../core/ui/toast.service';
import type { SavedBuild } from '../../domain/builds/build.model';
import { Builds } from '../../domain/builds/builds.service';
import { CachedBuild, readCachedBuilds } from '../../domain/builds/import/hero-build';
import { BuildDraft, ImportLookups, draftFromHeroBuild, draftsFromJson, fetchPublicBuild } from '../../domain/builds/import/importers';
import { MyBuild } from '../../learning/my-build.service';
import { Session } from '../../learning/session.service';
import { GenContext, fromScenario } from '../../learning/questions/generators';
import { makeRng, seedFrom } from '../../learning/questions/rng';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { HeroAvatar } from '../../shared/ui/primitives';

type Tab = 'mine' | 'import' | 'surgery';

@Component({
  selector: 'app-builds-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SyncSelectValue, RouterLink, Icon, ItemIcon, HeroAvatar, ...I18N_PIPES],
  templateUrl: './builds-page.html',
  styleUrl: './builds-page.scss',
})
export class BuildsPage {
  protected readonly game = inject(GameData);
  protected readonly builds = inject(Builds);
  protected readonly myBuild = inject(MyBuild);
  protected readonly i18n = inject(I18n);
  private readonly content = inject(Content);
  private readonly profiles = inject(Profiles);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly session = inject(Session);

  protected readonly tab = signal<Tab>('mine');
  protected readonly cacheResults = signal<(BuildDraft & { picked: boolean; lastUsed: boolean; section: string })[] | null>(null);
  protected readonly cacheError = signal<string | null>(null);
  protected readonly buildId = signal('');
  protected readonly busy = signal(false);
  protected readonly jsonText = signal('');
  protected readonly newHero = signal(this.profiles.settings().heroFocus);

  protected readonly surgeries = computed(() => this.content.scenarios().filter((s) => s.kind === 'surgery'));

  private lookups(): ImportLookups {
    return {
      itemById: this.game.itemById(),
      itemByKey: this.game.itemMap(),
      heroById: this.game.heroById(),
      heroByKey: this.game.heroMap(),
      abilityById: this.game.abilityById(),
    };
  }

  itemsOf(b: SavedBuild): string[] {
    return this.builds.itemKeys(b).slice(0, 14);
  }

  isMine(b: SavedBuild): boolean {
    return this.myBuild.build()?.id === b.id;
  }

  async onCacheFile(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.cacheError.set(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const heroClass = new Map(this.game.heroes().map((h) => [h.id, h.key.replace(/^hero_/, 'hero_')]));
      const found: CachedBuild[] = readCachedBuilds(bytes, heroClass);
      const lk = this.lookups();
      const drafts = found
        .map((c) => {
          const d = draftFromHeroBuild(c.build, lk);
          return d ? { ...d, ref: `cache:${c.build.hero_build_id}`, picked: c.lastUsed, lastUsed: c.lastUsed, section: c.section } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x)
        .sort((a, b) => Number(b.lastUsed) - Number(a.lastUsed) || (b.meta?.lastUpdated ?? 0) - (a.meta?.lastUpdated ?? 0));
      this.cacheResults.set(drafts);
      if (!drafts.length) this.cacheError.set(this.i18n.l('В файле не нашлось билдов.', 'No builds found in the file.'));
    } catch (e) {
      this.cacheError.set(this.i18n.l('Не удалось прочитать файл: ', 'Could not read the file: ') + (e instanceof Error ? e.message : String(e)));
    }
    (ev.target as HTMLInputElement).value = '';
  }

  togglePick(i: number): void {
    this.cacheResults.update((l) => (l ? l.map((d, j) => (j === i ? { ...d, picked: !d.picked } : d)) : l));
  }

  async importPicked(): Promise<void> {
    const picked = (this.cacheResults() ?? []).filter((d) => d.picked);
    for (const d of picked) await this.saveDraft(d, 'game-cache', d.lastUsed);
    this.toasts.show(this.i18n.l('Импортировано билдов: {n}', 'Builds imported: {n}', { n: picked.length }), 'good');
    this.cacheResults.set(null);
    this.tab.set('mine');
  }

  private async saveDraft(d: BuildDraft, type: SavedBuild['source']['type'], markMine = false): Promise<SavedBuild> {
    const saved = await this.builds.save({
      heroKey: d.heroKey,
      name: d.name,
      description: d.description,
      categories: d.categories,
      source: { type, ref: d.ref, note: d.meta?.originBuildId ? `origin ${d.meta.originBuildId}` : undefined, importedAt: Date.now() },
      isMine: markMine,
    });
    if (markMine && d.heroKey === this.profiles.settings().heroFocus) await this.profiles.update({ myBuildId: saved.id });
    return saved;
  }

  async importById(): Promise<void> {
    const id = Number(this.buildId().trim());
    if (!Number.isInteger(id) || id <= 0) {
      this.toasts.show(this.i18n.l('Введи числовой ID билда', 'Enter a numeric build id'), 'bad');
      return;
    }
    this.busy.set(true);
    try {
      const drafts = await fetchPublicBuild(id, this.lookups());
      if (!drafts.length) throw new Error(this.i18n.l('билд не найден', 'build not found'));
      const saved = await this.saveDraft(drafts[0], 'api');
      void this.router.navigate(['/builds', saved.id]);
    } catch (e) {
      this.toasts.show(this.i18n.l('Не удалось загрузить: ', 'Could not load: ') + (e instanceof Error ? e.message : String(e)), 'bad');
    } finally {
      this.busy.set(false);
    }
  }

  async importJson(text?: string): Promise<void> {
    try {
      const drafts = draftsFromJson(text ?? this.jsonText(), this.lookups());
      if (!drafts.length) throw new Error(this.i18n.l('в JSON нет билдов Deadlock', 'no Deadlock builds in the JSON'));
      let last: SavedBuild | null = null;
      for (const d of drafts) last = await this.saveDraft(d, 'json');
      this.toasts.show(this.i18n.l('Импортировано билдов: {n}', 'Builds imported: {n}', { n: drafts.length }), 'good');
      this.jsonText.set('');
      if (last) void this.router.navigate(['/builds', last.id]);
    } catch (e) {
      this.toasts.show(this.i18n.l('Ошибка JSON: ', 'JSON error: ') + (e instanceof Error ? e.message : String(e)), 'bad');
    }
  }

  async onJsonFile(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (file) await this.importJson(await file.text());
    (ev.target as HTMLInputElement).value = '';
  }

  async createManual(screenshot = false): Promise<void> {
    const saved = await this.builds.save({
      heroKey: this.newHero(),
      name: this.i18n.l('Новый билд', 'New build'),
      categories: [
        { name: 'Early Game', items: [] },
        { name: 'Mid Game', items: [] },
        { name: 'Late Game', items: [] },
      ],
      source: { type: screenshot ? 'screenshot' : 'manual', importedAt: Date.now() },
      isMine: false,
    });
    void this.router.navigate(['/builds', saved.id], { queryParams: screenshot ? { shot: 1 } : {} });
  }

  async makeMine(b: SavedBuild): Promise<void> {
    await this.profiles.update({ myBuildId: b.id });
    if (b.heroKey !== this.profiles.settings().heroFocus) await this.profiles.updateSettings({ heroFocus: b.heroKey });
    this.toasts.show(this.i18n.l('Это теперь твой билд для Master Your Build', 'This is now your build for Master Your Build'), 'good');
  }

  async remove(b: SavedBuild): Promise<void> {
    if (!confirm(this.i18n.l('Удалить билд «{n}»?', 'Delete build "{n}"?', { n: b.name }))) return;
    await this.builds.remove(b.id);
  }

  startSurgery(id: string): void {
    const s = this.content.scenarioById().get(id);
    if (!s) return;
    const ctx: GenContext = { items: this.game.standardItems(), itemMap: this.game.itemMap(), heroMap: this.game.heroMap(), content: this.content.items(), confusions: new Map(), heroKey: s.hero };
    this.session.startWith([fromScenario(s, ctx, makeRng(seedFrom(id + Date.now())), 'full')], { mode: 'scenarios', minutes: 3, heroKey: s.hero });
    void this.router.navigate(['/practice/run']);
  }

  date(ts: number | undefined): string {
    return ts ? this.i18n.date(ts * 1000, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }
}
