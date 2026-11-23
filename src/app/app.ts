import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { GameData } from './core/game-data/game-data.service';
import { I18N_PIPES, I18n } from './core/i18n/i18n';
import { Profiles } from './core/profile/profile.service';
import { Hotkeys } from './core/ui/hotkeys.service';
import { Toasts } from './core/ui/toast.service';
import { Icon, IconName } from './shared/ui/icon';
import { HeroAvatar } from './shared/ui/primitives';

interface NavItem {
  path: string;
  icon: IconName;
  ru: string;
  en: string;
  exact?: boolean;
}

interface NavGroup {
  ru: string;
  en: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    ru: 'Обучение',
    en: 'Learn',
    items: [
      { path: '/', icon: 'home', ru: 'Главная', en: 'Dashboard', exact: true },
      { path: '/practice', icon: 'practice', ru: 'Тренировка', en: 'Practice' },
      { path: '/paths', icon: 'route', ru: 'Курсы героев', en: 'Hero paths' },
    ],
  },
  {
    ru: 'Решения',
    en: 'Decisions',
    items: [
      { path: '/scenarios', icon: 'crosshair', ru: 'Ситуации', en: 'Situations' },
      { path: '/simulator', icon: 'store', ru: 'Симулятор магазина', en: 'Shop simulator' },
      { path: '/active', icon: 'zap', ru: 'Активки и Imbue', en: 'Actives & Imbue' },
      { path: '/builds', icon: 'wrench', ru: 'Build Doctor', en: 'Build Doctor' },
    ],
  },
  {
    ru: 'Справочник',
    en: 'Reference',
    items: [
      { path: '/items', icon: 'book', ru: 'Предметы', en: 'Items' },
      { path: '/problems', icon: 'search', ru: 'Поиск по проблеме', en: 'Search by problem' },
      { path: '/compare', icon: 'compare', ru: 'Сравнение', en: 'Compare' },
    ],
  },
  {
    ru: 'Прогресс',
    en: 'Progress',
    items: [
      { path: '/analytics', icon: 'chart', ru: 'Аналитика', en: 'Analytics' },
      { path: '/mistakes', icon: 'notebook', ru: 'Тетрадь ошибок', en: 'Mistake notebook' },
      { path: '/reflect', icon: 'clipboard', ru: 'После матча', en: 'After match' },
    ],
  },
];

const TABS: NavItem[] = [
  { path: '/', icon: 'home', ru: 'Главная', en: 'Home', exact: true },
  { path: '/practice', icon: 'practice', ru: 'Учить', en: 'Practice' },
  { path: '/scenarios', icon: 'crosshair', ru: 'Ситуации', en: 'Situations' },
  { path: '/items', icon: 'book', ru: 'Предметы', en: 'Items' },
];

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, HeroAvatar, ...I18N_PIPES],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly game = inject(GameData);
  protected readonly profiles = inject(Profiles);
  protected readonly i18n = inject(I18n);
  protected readonly toasts = inject(Toasts);
  protected readonly hotkeys = inject(Hotkeys);
  private readonly router = inject(Router);

  protected readonly nav = NAV;
  protected readonly tabs = TABS;
  protected readonly moreOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );
  /** Practice and onboarding run full-screen so the learner focuses on the question. */
  protected readonly focusMode = computed(() => /^\/(practice\/run|onboarding)/.test(this.url()));
  protected readonly moreActive = computed(() => !TABS.some((t) => (t.exact ? this.url() === t.path : this.url().startsWith(t.path) && t.path !== '/')));

  /** Set when the service worker has downloaded a new deploy (new content after a patch, fixes). */
  protected readonly updateReady = signal(false);
  private readonly sw = inject(SwUpdate, { optional: true });

  constructor() {
    this.hotkeys.register([
      { keys: ['?'], handler: () => this.hotkeys.helpOpen.update((v) => !v), description: { ru: 'Показать горячие клавиши', en: 'Show shortcuts' } },
      { keys: ['escape'], handler: () => { this.hotkeys.helpOpen.set(false); this.moreOpen.set(false); } },
    ]);
    if (this.sw?.isEnabled) {
      this.sw.versionUpdates
        .pipe(filter((e): e is VersionReadyEvent => e.type === 'VERSION_READY'), takeUntilDestroyed())
        .subscribe(() => this.updateReady.set(true));
      // An installed PWA can stay open for days: look for a new deploy every 6 hours too.
      const timer = setInterval(() => void this.sw?.checkForUpdate().catch(() => undefined), 6 * 3600_000);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
  }

  retry(): void {
    location.reload();
  }
}
