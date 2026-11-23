import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import type { LearningGoal, StartLevel, UiLang } from '../../core/profile/profile.model';
import { Profiles } from '../../core/profile/profile.service';
import { MyBuild } from '../../learning/my-build.service';
import { Session } from '../../learning/session.service';
import { Icon } from '../../shared/ui/icon';
import { HeroAvatar } from '../../shared/ui/primitives';

const PINNED = ['hero_hornet', 'hero_necro'];

@Component({
  selector: 'app-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, HeroAvatar, ...I18N_PIPES],
  template: `
    <div class="ob">
      <div class="steps small faint">
        @for (s of [1, 2, 3]; track s) {
          <span [class.on]="step() >= s">{{ s }}</span>
        }
      </div>

      @if (step() === 1) {
        <section class="stack-4">
          <div class="row lang">
            <span class="logo-mark"></span>
            <span class="spacer"></span>
            <div class="seg">
              <button [class.on]="lang() === 'ru'" (click)="setLang('ru')">RU</button>
              <button [class.on]="lang() === 'en'" (click)="setLang('en')">EN</button>
            </div>
          </div>
          <h1>{{ 'Понимай решения, а не заучивай билды' | l: "Don't memorize builds. Understand decisions." }}</h1>
          <p class="muted">
            {{ 'Каждый день 5-20 минут: узнавание иконок, механики, ситуации из матчей и разбор твоего билда. Система сама решает, что повторить.' | l: 'Every day for 5-20 minutes: icons, mechanics, match situations and your own build. The system decides what to review.' }}
          </p>
          <h3>{{ 'Твой герой' | l: 'Your hero' }}</h3>
          <div class="heroes">
            @for (h of heroes(); track h.key) {
              <button class="hero" [class.on]="hero() === h.key" (click)="hero.set(h.key)" [attr.aria-pressed]="hero() === h.key">
                <app-hero-avatar [hero]="h" [size]="48" />
                <span class="small">{{ h.name | gn }}</span>
              </button>
            }
          </div>
          <div class="row end">
            <button class="btn btn-primary btn-lg" (click)="step.set(2)">{{ 'Дальше' | l: 'Next' }} <app-icon name="forward" /></button>
          </div>
        </section>
      }

      @if (step() === 2) {
        <section class="stack-4">
          <h1>{{ 'Немного о тебе' | l: 'A bit about you' }}</h1>
          <div class="field">
            <span class="label">{{ 'Как ты сейчас разбираешься в предметах?' | l: 'How well do you know items now?' }}</span>
            <div class="choices">
              @for (o of levels; track o.id) {
                <button class="choice" [class.on]="level() === o.id" (click)="level.set(o.id)">
                  <b>{{ o.ru | l: o.en }}</b><span class="small muted">{{ o.dRu | l: o.dEn }}</span>
                </button>
              }
            </div>
          </div>
          <div class="field">
            <span class="label">{{ 'Главная цель' | l: 'Main goal' }}</span>
            <div class="choices">
              @for (o of goals; track o.id) {
                <button class="choice" [class.on]="goal() === o.id" (click)="goal.set(o.id)">
                  <b>{{ o.ru | l: o.en }}</b>
                </button>
              }
            </div>
          </div>
          <div class="field">
            <span class="label">{{ 'Обычная длительность занятия' | l: 'Usual session length' }}</span>
            <div class="seg">
              @for (m of [3, 5, 10, 20]; track m) {
                <button [class.on]="minutes() === m" (click)="minutes.set(m)">{{ m }} {{ 'мин' | l: 'min' }}</button>
              }
            </div>
          </div>
          <div class="field name-field">
            <label for="pname">{{ 'Имя профиля (необязательно)' | l: 'Profile name (optional)' }}</label>
            <input id="pname" class="input" [value]="name()" (input)="name.set($any($event.target).value)" maxlength="40" />
          </div>
          <div class="row end">
            <button class="btn btn-ghost" (click)="step.set(1)"><app-icon name="back" /> {{ 'Назад' | l: 'Back' }}</button>
            <button class="btn btn-primary btn-lg" (click)="step.set(3)">{{ 'Дальше' | l: 'Next' }} <app-icon name="forward" /></button>
          </div>
        </section>
      }

      @if (step() === 3) {
        <section class="stack-4">
          <h1>{{ 'Твоя программа' | l: 'Your program' }}</h1>
          <ol class="program">
            @if (buildCount()) {
              <li>
                <b>{{ 'Master Your Build' | l: 'Master Your Build' }}</b>
                <span class="muted small">{{ 'Найден твой текущий билд ({n} предметов). Его предметы изучаются первыми, с разбором, зачем каждый из них нужен.' | l: 'Your current build was found ({n} items). Its items come first, with why each one is there.' : { n: buildCount() } }}</span>
              </li>
            }
            <li>
              <b>{{ 'Узнавание и механики' | l: 'Recognition and mechanics' }}</b>
              <span class="muted small">{{ 'Иконка, категория, активный или пассивный, imbue. Не больше нескольких новых предметов за занятие.' | l: 'Icon, category, active or passive, imbue. Only a few new items per session.' }}</span>
            </li>
            <li>
              <b>{{ 'Ситуации и контрпики' | l: 'Situations and counters' }}</b>
              <span class="muted small">{{ 'Что купить против конкретной угрозы, когда отклониться от билда, что продать.' | l: 'What to buy against a threat, when to deviate, what to sell.' }}</span>
            </li>
            <li>
              <b>{{ 'Перенос в игру' | l: 'Transfer to the game' }}</b>
              <span class="muted small">{{ 'Новые ситуации без подсказок: сначала определи проблему, потом выбери покупку.' | l: 'New situations without hints: diagnose first, then buy.' }}</span>
            </li>
          </ol>
          <div class="callout info small">
            <app-icon name="info" />
            <span>{{ 'Сейчас короткая диагностика, около 4 минут. Отвечай честно и нажимай «Не знаю», если не знаешь: угадывание только запутает программу.' | l: 'Next: a short diagnostic, about 4 minutes. Answer honestly and press "I don\\'t know" instead of guessing.' }}</span>
          </div>
          <div class="row end">
            <button class="btn btn-ghost" (click)="step.set(2)"><app-icon name="back" /> {{ 'Назад' | l: 'Back' }}</button>
            <button class="btn" (click)="finish(false)">{{ 'Пропустить' | l: 'Skip' }}</button>
            <button class="btn btn-primary btn-lg" (click)="finish(true)"><app-icon name="play" /> {{ 'Начать диагностику' | l: 'Start diagnostic' }}</button>
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .ob { max-width: 760px; margin: 0 auto; padding: calc(24px + var(--safe-top)) 16px calc(40px + var(--safe-bottom)); }
      .steps { display: flex; gap: 6px; margin-bottom: 18px; }
      .steps span { width: 26px; height: 4px; border-radius: 2px; background: var(--bg-3); font-size: 0; }
      .steps span.on { background: var(--accent); }
      .lang { margin-bottom: 8px; }
      .logo-mark { width: 30px; height: 30px; border-radius: 6px; background: conic-gradient(from 210deg, var(--weapon), var(--spirit), var(--vitality), var(--weapon)); }
      h1 { font-size: 26px; }
      .heroes { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; max-height: 340px; overflow-y: auto; padding: 2px; }
      .hero { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-1); color: var(--text); }
      .hero.on { border-color: var(--accent); background: var(--accent-bg); }
      .choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; }
      .choice { display: flex; flex-direction: column; gap: 2px; text-align: left; padding: 10px 12px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-1); color: var(--text); }
      .choice.on { border-color: var(--accent); background: var(--accent-bg); }
      .name-field { max-width: 320px; }
      .end { justify-content: flex-end; flex-wrap: wrap; }
      .program { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; padding-left: 1.2em; }
      .program li b { display: block; }
      @media (max-width: 767px) { h1 { font-size: 21px; } .end .btn-lg { width: 100%; } }
    `,
  ],
})
export class OnboardingPage {
  protected readonly game = inject(GameData);
  private readonly profiles = inject(Profiles);
  private readonly session = inject(Session);
  private readonly myBuild = inject(MyBuild);
  private readonly router = inject(Router);
  private readonly i18n = inject(I18n);

  protected readonly step = signal(1);
  protected readonly hero = signal(this.profiles.settings().heroFocus);
  protected readonly level = signal<StartLevel>(this.profiles.settings().startLevel);
  protected readonly goal = signal<LearningGoal>(this.profiles.settings().goal);
  protected readonly minutes = signal(this.profiles.settings().sessionMinutes);
  protected readonly name = signal(this.profiles.current()?.name ?? '');
  protected readonly lang = computed(() => this.i18n.lang());

  protected readonly heroes = computed(() => {
    const list = [...this.game.selectableHeroes()];
    list.sort((a, b) => (PINNED.indexOf(b.key) >= 0 ? 1 : 0) - (PINNED.indexOf(a.key) >= 0 ? 1 : 0) || PINNED.indexOf(a.key) - PINNED.indexOf(b.key) || a.name.en.localeCompare(b.name.en));
    return list;
  });
  protected readonly buildCount = computed(() => (this.myBuild.buildFor(this.hero()) ? this.myBuild.buildFor(this.hero())!.categories.reduce((n, c) => n + c.items.length, 0) : 0));

  protected readonly levels: { id: StartLevel; ru: string; en: string; dRu: string; dEn: string }[] = [
    { id: 'new', ru: 'Почти не знаю', en: 'Barely', dRu: 'Покупаю по рекомендациям', dEn: 'I buy what builds suggest' },
    { id: 'basic', ru: 'Знаю основное', en: 'The basics', dRu: 'Узнаю популярные предметы', dEn: 'I know the popular items' },
    { id: 'experienced', ru: 'Неплохо', en: 'Fairly well', dRu: 'Хочу глубже и про ситуации', dEn: 'I want depth and situations' },
  ];
  protected readonly goals: { id: LearningGoal; ru: string; en: string }[] = [
    { id: 'my-build', ru: 'Понять свой билд', en: 'Understand my build' },
    { id: 'counters', ru: 'Контрпики и ситуации', en: 'Counters and situations' },
    { id: 'recognize', ru: 'Узнавать все предметы', en: 'Recognize all items' },
    { id: 'all', ru: 'Всё понемногу', en: 'A bit of everything' },
  ];

  setLang(l: UiLang): void {
    void this.profiles.updateSettings({ lang: l });
  }

  async finish(diagnostic: boolean): Promise<void> {
    const newPerSession = this.level() === 'new' ? 4 : this.level() === 'basic' ? 5 : 7;
    await this.profiles.update({
      name: this.name().trim() || this.profiles.current()?.name || 'Main',
      onboarded: true,
      settings: {
        ...this.profiles.settings(),
        heroFocus: this.hero(),
        startLevel: this.level(),
        goal: this.goal(),
        sessionMinutes: this.minutes(),
        newPerSession,
      },
    });
    void this.profiles.requestPersistence();
    if (diagnostic && this.session.start({ mode: 'diagnostic', minutes: 4, heroKey: this.hero() })) {
      void this.router.navigate(['/practice/run']);
    } else {
      void this.router.navigate(['/']);
    }
  }
}
