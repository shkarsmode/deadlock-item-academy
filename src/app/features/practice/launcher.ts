import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import { Router } from '@angular/router';
import type { Dimension } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { Toasts } from '../../core/ui/toast.service';
import { dueCount } from '../../learning/analytics';
import { Knowledge } from '../../learning/knowledge.service';
import { DIM_NAMES } from '../../learning/mastery';
import type { SessionMode } from '../../learning/planner';
import { Session } from '../../learning/session.service';
import { Icon, IconName } from '../../shared/ui/icon';
import { HeroAvatar } from '../../shared/ui/primitives';

interface ModeCard {
  mode: SessionMode;
  icon: IconName;
  ru: string;
  en: string;
  dRu: string;
  dEn: string;
}

const MODES: ModeCard[] = [
  { mode: 'mixed', icon: 'sparkles', ru: 'Смешанная', en: 'Mixed', dRu: 'Повторения по сроку, ошибки, новые предметы и ситуации вперемешку. Лучший выбор на каждый день.', dEn: 'Due reviews, mistakes, new items and situations, interleaved. Best daily choice.' },
  { mode: 'before-match', icon: 'timer', ru: 'Перед матчем', en: 'Before match', dRu: 'Быстро освежить предметы своего героя и билда. Без новых предметов.', dEn: 'Refresh your hero and build items. No new items.' },
  { mode: 'recognition', icon: 'eye', ru: 'Узнавание иконок', en: 'Icon recognition', dRu: 'Иконка: что это. От выбора из вариантов к вводу названия.', dEn: 'Icon to item, from multiple choice to typed recall.' },
  { mode: 'scenarios', icon: 'crosshair', ru: 'Ситуации', en: 'Situations', dRu: 'Решения в матче: что купить, что продать, сначала диагноз.', dEn: 'Match decisions: buy, sell, diagnose first.' },
  { mode: 'build', icon: 'wrench', ru: 'Мой билд', en: 'My build', dRu: 'Зачем каждый предмет в твоём билде и когда отклоняться.', dEn: 'Why each item is in your build and when to deviate.' },
  { mode: 'active', icon: 'zap', ru: 'Активки и Imbue', en: 'Actives & Imbue', dRu: 'Когда нажимать активные предметы и на что назначать imbue.', dEn: 'When to press actives and where to imbue.' },
  { mode: 'mistakes', icon: 'notebook', ru: 'Работа над ошибками', en: 'Fix mistakes', dRu: 'Путаемые пары, уверенные ошибки и проваленные принципы.', dEn: 'Confused pairs, confident mistakes, failed principles.' },
];

@Component({
  selector: 'app-practice-launcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SyncSelectValue, Icon, HeroAvatar, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>{{ 'Тренировка' | l: 'Practice' }}</h1>
          <p class="sub">{{ 'Ответ, объяснение, следующий вопрос. Система сама решает, что тебе сейчас полезнее.' | l: 'Answer, explanation, next. The system decides what helps you most right now.' }}</p>
        </div>
      </div>

      <div class="grid launch">
        <div class="panel">
          <div class="panel-head"><h3>{{ 'Длительность' | l: 'Length' }}</h3></div>
          <div class="panel-body stack-3">
            <div class="seg" role="group">
              @for (m of lengths; track m) {
                <button [class.on]="minutes() === m" [attr.aria-pressed]="minutes() === m" (click)="minutes.set(m)">{{ m }} {{ 'мин' | l: 'min' }}</button>
              }
            </div>
            <p class="small muted">{{ lengthHint() }}</p>
            <div class="row small muted hero-row">
              <app-hero-avatar [key]="hero()" [size]="24" />
              <span>{{ 'Герой:' | l: 'Hero:' }} <b class="c-accent">{{ heroName() }}</b></span>
              <select class="select hero-select" [syncValue]="hero()" (change)="hero.set($any($event.target).value)" [attr.aria-label]="'Герой' | l: 'Hero'">
                @for (h of game.selectableHeroes(); track h.key) {
                  <option [value]="h.key">{{ h.name | gn }}</option>
                }
              </select>
            </div>
            <div class="row small muted">
              <app-icon name="clock" [size]="14" />
              <span>{{ 'К повторению сейчас:' | l: 'Due now:' }} <b>{{ due() }}</b></span>
            </div>
          </div>
        </div>

        <div class="modes">
          @for (m of modes; track m.mode) {
            <button class="mode panel" [class.on]="mode() === m.mode" (click)="mode.set(m.mode)" [attr.aria-pressed]="mode() === m.mode">
              <app-icon [name]="m.icon" [size]="20" />
              <span class="grow">
                <b>{{ m.ru | l: m.en }}</b>
                <span class="small muted">{{ m.dRu | l: m.dEn }}</span>
              </span>
            </button>
          }
          <details class="panel custom" [open]="customOpen()" (toggle)="customOpen.set($any($event.target).open)">
            <summary class="panel-head"><app-icon name="filter" /> <h3>{{ 'Своя сессия' | l: 'Custom session' }}</h3></summary>
            <div class="panel-body stack-3">
              <div class="field">
                <span class="label">{{ 'Знания' | l: 'Knowledge' }}</span>
                <div class="row-wrap">
                  @for (d of dims; track d) {
                    <label class="check small"><input type="checkbox" [checked]="customDims().includes(d)" (change)="toggleDim(d)" /> {{ dimName(d) }}</label>
                  }
                </div>
              </div>
              <div class="field">
                <span class="label">{{ 'Категории' | l: 'Categories' }}</span>
                <div class="row-wrap">
                  @for (s of slots; track s) {
                    <label class="check small"><input type="checkbox" [checked]="customSlots().includes(s)" (change)="toggleSlot(s)" /> {{ s }}</label>
                  }
                </div>
              </div>
              <button class="btn" (click)="start('custom')">{{ 'Начать свою сессию' | l: 'Start custom session' }}</button>
            </div>
          </details>
        </div>
      </div>

      <div class="start-bar">
        <button class="btn btn-primary btn-lg" (click)="start(mode())">
          <app-icon name="play" /> {{ 'Начать' | l: 'Start' }} · {{ minutes() }} {{ 'мин' | l: 'min' }}
        </button>
      </div>
    </div>
  `,
  styles: [
    `
      .launch { grid-template-columns: minmax(0, 320px) minmax(0, 1fr); align-items: start; }
      .modes { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
      .mode { display: flex; gap: 12px; align-items: flex-start; padding: 12px 14px; text-align: left; color: var(--text); cursor: pointer; }
      .mode:hover { border-color: var(--border-3); }
      .mode.on { border-color: var(--accent); background: var(--accent-bg); }
      .mode.on app-icon { color: var(--accent); }
      .mode b { display: block; margin-bottom: 2px; }
      .custom summary { cursor: pointer; list-style: none; }
      .custom summary::-webkit-details-marker { display: none; }
      .hero-row { flex-wrap: wrap; }
      .hero-select { width: auto; height: 30px; flex: 1; min-width: 140px; }
      .start-bar { position: sticky; bottom: 0; padding: 16px 0 0; display: flex; justify-content: flex-end; }
      @media (max-width: 767px) {
        .launch { grid-template-columns: minmax(0, 1fr); }
        .start-bar { position: fixed; left: 0; right: 0; bottom: calc(var(--tabbar-h) + var(--safe-bottom)); padding: 10px 16px; background: rgba(11, 12, 14, 0.94); border-top: 1px solid var(--border); z-index: 20; }
        .start-bar .btn { width: 100%; }
      }
    `,
  ],
})
export class PracticeLauncher {
  protected readonly game = inject(GameData);
  private readonly profiles = inject(Profiles);
  private readonly session = inject(Session);
  private readonly knowledge = inject(Knowledge);
  private readonly content = inject(Content);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly i18n = inject(I18n);

  protected readonly modes = MODES;
  protected readonly lengths = [3, 5, 10, 20];
  protected readonly dims: Dimension[] = ['icon', 'effect', 'mechanics', 'situation', 'counter', 'synergy', 'active', 'build'];
  protected readonly slots: ('weapon' | 'vitality' | 'spirit')[] = ['weapon', 'vitality', 'spirit'];
  protected readonly minutes = signal(this.profiles.settings().sessionMinutes);
  protected readonly mode = signal<SessionMode>('mixed');
  protected readonly hero = signal(this.profiles.settings().heroFocus);
  protected readonly customOpen = signal(false);
  protected readonly customDims = signal<Dimension[]>([]);
  protected readonly customSlots = signal<('weapon' | 'vitality' | 'spirit')[]>([]);
  protected readonly due = computed(() => {
    this.knowledge.tick();
    return dueCount(this.knowledge.map(), Date.now());
  });
  protected readonly heroName = computed(() => this.i18n.name(this.game.hero(this.hero())?.name));
  protected readonly lengthHint = computed(() => {
    switch (this.minutes()) {
      case 3:
        return this.i18n.l('Быстрое повторение: самое срочное.', 'Quick review: the most urgent items.');
      case 5:
        return this.i18n.l('Разминка перед матчем.', 'Pre-match warm-up.');
      case 10:
        return this.i18n.l('Стандартная тренировка: повторения, новые предметы и ситуации.', 'Standard session: reviews, new items and situations.');
      default:
        return this.i18n.l('Глубокое обучение: больше ситуаций и новых предметов.', 'Deep session: more situations and new items.');
    }
  });

  dimName(d: Dimension): string {
    return this.i18n.l(DIM_NAMES[d].ru, DIM_NAMES[d].en);
  }

  toggleDim(d: Dimension): void {
    this.customDims.update((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]));
  }

  toggleSlot(s: 'weapon' | 'vitality' | 'spirit'): void {
    this.customSlots.update((l) => (l.includes(s) ? l.filter((x) => x !== s) : [...l, s]));
  }

  start(mode: SessionMode): void {
    if (this.hero() !== this.profiles.settings().heroFocus) void this.profiles.updateSettings({ heroFocus: this.hero() });
    const filters =
      mode === 'custom'
        ? { dims: this.customDims().length ? this.customDims() : undefined, slots: this.customSlots().length ? this.customSlots() : undefined }
        : {};
    const n = this.session.start({ mode: mode === 'custom' ? 'mixed' : mode, minutes: this.minutes(), heroKey: this.hero(), filters });
    if (!n) {
      this.toasts.show(
        mode === 'mistakes'
          ? this.i18n.l('Открытых ошибок нет. Отличная работа!', 'No open mistakes. Nice work!')
          : this.i18n.l('Для этого режима пока нечего повторять. Попробуй смешанную тренировку.', 'Nothing to practice in this mode yet. Try a mixed session.'),
      );
      return;
    }
    void this.router.navigate(['/practice/run']);
  }
}
