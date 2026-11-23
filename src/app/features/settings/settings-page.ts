import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import { RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { DataPort } from '../../core/db/data-port';
import { GameData } from '../../core/game-data/game-data.service';
import { GameUpdate } from '../../core/game-data/update.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import type { ConfidenceMode, ExplainDepth, NameLang, ProfileSettings, UiLang } from '../../core/profile/profile.model';
import { Profiles } from '../../core/profile/profile.service';
import { Toasts } from '../../core/ui/toast.service';
import { Builds } from '../../domain/builds/builds.service';
import { Icon } from '../../shared/ui/icon';
import { HeroAvatar } from '../../shared/ui/primitives';

@Component({
  selector: 'app-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SyncSelectValue, RouterLink, Icon, HeroAvatar, ...I18N_PIPES],
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly profiles = inject(Profiles);
  protected readonly game = inject(GameData);
  protected readonly update = inject(GameUpdate);
  protected readonly content = inject(Content);
  protected readonly i18n = inject(I18n);
  private readonly builds = inject(Builds);
  private readonly port = inject(DataPort);
  private readonly toasts = inject(Toasts);

  protected readonly s = this.profiles.settings;
  protected readonly newName = signal('');
  protected readonly importMode = signal<'replace' | 'new'>('new');
  protected readonly persisted = signal<boolean | null>(null);
  protected readonly heroBuilds = computed(() => this.builds.all().filter((b) => b.heroKey === this.s().heroFocus));
  protected readonly stats = computed(() => {
    const items = Object.keys(this.content.items()).length;
    return {
      items,
      scenarios: this.content.scenarios().length,
      courses: this.content.courses().length,
      builds: this.content.builds().length,
      problems: this.content.problems().length,
      stale: this.content.staleItems().size + this.content.staleScenarios().size,
    };
  });

  /** True when a service worker controls the page (production build), so fetched icons land in its cache. */
  protected readonly offlineReady = signal(typeof navigator !== 'undefined' && !!navigator.serviceWorker?.controller);
  protected readonly iconsProgress = signal<{ done: number; total: number } | null>(null);

  constructor() {
    void navigator.storage?.persisted?.().then((v) => this.persisted.set(v)).catch(() => this.persisted.set(null));
  }

  /** Requests every local game icon once; the service worker's lazy "game-art" group stores each response. */
  async cacheIcons(): Promise<void> {
    try {
      const manifest = (await (await fetch('game/icons.manifest.json')).json()) as Record<string, string>;
      const paths = Object.keys(manifest);
      let done = 0;
      let failed = 0;
      this.iconsProgress.set({ done, total: paths.length });
      for (let i = 0; i < paths.length; i += 8) {
        await Promise.all(
          paths.slice(i, i + 8).map(async (p) => {
            const ok = await fetch(p).then((r) => r.ok).catch(() => false);
            if (!ok) failed++;
            done++;
          }),
        );
        this.iconsProgress.set({ done, total: paths.length });
      }
      this.toasts.show(
        failed
          ? this.i18n.l(`Сохранено ${paths.length - failed} из ${paths.length} иконок`, `Saved ${paths.length - failed} of ${paths.length} icons`)
          : this.i18n.l('Все иконки сохранены для офлайна', 'All icons saved for offline use'),
        failed ? 'info' : 'good',
      );
    } catch {
      this.toasts.show(this.i18n.l('Не удалось скачать иконки: нет сети?', 'Could not download icons: offline?'), 'bad');
    } finally {
      this.iconsProgress.set(null);
    }
  }

  set<K extends keyof ProfileSettings>(key: K, value: ProfileSettings[K]): void {
    void this.profiles.updateSettings({ [key]: value } as Partial<ProfileSettings>);
  }

  setLang(v: UiLang): void {
    this.set('lang', v);
  }
  setNameLang(v: NameLang): void {
    this.set('nameLang', v);
  }
  setExplain(v: ExplainDepth): void {
    this.set('explain', v);
  }
  setConfidence(v: ConfidenceMode): void {
    this.set('confidence', v);
  }

  async rename(name: string): Promise<void> {
    if (name.trim()) await this.profiles.update({ name: name.trim() });
  }

  async createProfile(): Promise<void> {
    const name = this.newName().trim() || this.i18n.l('Друг', 'Friend');
    await this.profiles.create(name);
    this.newName.set('');
    this.toasts.show(this.i18n.l('Создан профиль «{n}». Пройди короткий старт.', 'Profile "{n}" created. Go through the short start.', { n: name }), 'good');
  }

  async removeProfile(id: string, name: string): Promise<void> {
    if (!confirm(this.i18n.l('Удалить профиль «{n}» и весь его прогресс? Это нельзя отменить.', 'Delete profile "{n}" and all its progress? This cannot be undone.', { n: name }))) return;
    await this.profiles.remove(id);
  }

  async setMyBuild(id: string): Promise<void> {
    await this.profiles.update({ myBuildId: id || null });
  }

  async exportProgress(): Promise<void> {
    try {
      this.port.download(await this.port.exportCurrent());
    } catch (e) {
      this.toasts.show(String(e), 'bad');
    }
  }

  async importProgress(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    (ev.target as HTMLInputElement).value = '';
    if (!file) return;
    if (this.importMode() === 'replace' && !confirm(this.i18n.l('Заменить прогресс текущего профиля данными из файла?', 'Replace the current profile progress with the file?'))) return;
    try {
      const r = await this.port.importFile(await file.text(), this.importMode());
      this.toasts.show(this.i18n.l('Импортировано записей: {n}', 'Imported records: {n}', { n: r.records }), 'good');
    } catch (e) {
      this.toasts.show(this.i18n.l('Не удалось импортировать: ', 'Import failed: ') + (e instanceof Error ? e.message : String(e)), 'bad');
    }
  }

  async reset(): Promise<void> {
    if (!confirm(this.i18n.l('Сбросить весь прогресс текущего профиля? Это нельзя отменить. Сначала можно сделать экспорт.', 'Reset all progress of this profile? This cannot be undone. You can export first.'))) return;
    await this.port.resetCurrent();
    this.toasts.show(this.i18n.l('Прогресс сброшен', 'Progress reset'));
  }

  toTs(iso: string): number {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : Date.now();
  }

  async persist(): Promise<void> {
    this.persisted.set(await this.profiles.requestPersistence());
  }

  async install(): Promise<void> {
    const n = await this.update.install();
    this.toasts.show(this.i18n.l('Данные обновлены. Знаний на перепроверку: {n}', 'Data updated. Knowledge flagged for review: {n}', { n }), 'good');
  }
}
