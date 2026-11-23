import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import { Router } from '@angular/router';
import type { Threat } from '../../content/content.model';
import { THREAT_LABELS } from '../../content/labels';
import { THREATS } from '../../content/vocab';
import { Content } from '../../content/content.service';
import { getDb } from '../../core/db/db';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles, newId } from '../../core/profile/profile.service';
import { Toasts } from '../../core/ui/toast.service';
import { Session } from '../../learning/session.service';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { ItemPicker } from '../../shared/ui/item-picker';
import { HeroAvatar } from '../../shared/ui/primitives';
import type { Reflection } from './reflection.model';

/** Problems the learner can tick after a match (a subset of threats phrased from the player's side). */
const PICKABLE: Threat[] = [
  'you-die-fast',
  'you-get-caught',
  'enemy-dive',
  'enemy-spirit-burst',
  'enemy-gun-dps',
  'enemy-dot',
  'enemy-stun',
  'enemy-silence',
  'enemy-sleep',
  'enemy-immobilize',
  'enemy-healing',
  'enemy-tanky',
  'enemy-high-mobility',
  'enemy-stealth',
  'you-cant-catch',
  'you-lack-damage',
  'you-lose-lane',
  'you-behind',
  'you-out-of-ammo',
  'enemy-channel-ult',
  'team-lacks-frontline',
];

@Component({
  selector: 'app-reflect-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SyncSelectValue, Icon, ItemIcon, ItemPicker, HeroAvatar, ...I18N_PIPES],
  template: `
    <div class="page page-narrow">
      <div class="page-head">
        <div class="grow">
          <h1>{{ 'После матча' | l: 'After the match' }}</h1>
          <p class="sub">{{ 'Отметь, что было в игре. Приложение подберёт ситуации и предметы под твои реальные проблемы. История матчей не загружается: только то, что ты укажешь.' | l: 'Note what happened. The app picks situations and items for your real problems. No match history is fetched: only what you enter.' }}</p>
        </div>
      </div>

      <section class="panel panel-pad stack-4">
        <div class="field">
          <span class="label">{{ 'Твой герой' | l: 'Your hero' }}</span>
          <select class="select" [syncValue]="hero()" (change)="hero.set($any($event.target).value)">
            @for (h of game.selectableHeroes(); track h.key) {
              <option [value]="h.key">{{ h.name | gn }}</option>
            }
          </select>
        </div>
        <div class="field">
          <span class="label">{{ 'Против кого играл' | l: 'Enemy heroes' }} ({{ enemies().length }}/6)</span>
          <div class="heroes">
            @for (h of game.selectableHeroes(); track h.key) {
              <button class="hero" [class.on]="enemies().includes(h.key)" (click)="toggleEnemy(h.key)" [attr.aria-pressed]="enemies().includes(h.key)" [attr.title]="h.name.en">
                <app-hero-avatar [hero]="h" [size]="34" />
              </button>
            }
          </div>
        </div>
        <div class="field">
          <span class="label">{{ 'Какие были проблемы' | l: 'What went wrong' }}</span>
          <div class="row-wrap">
            @for (t of pickable; track t) {
              <button class="tag tbtn" [class.tag-accent]="problems().includes(t)" (click)="toggleProblem(t)" [attr.aria-pressed]="problems().includes(t)">{{ threat(t) }}</button>
            }
          </div>
        </div>
        <div class="field">
          <span class="label">{{ 'Что покупал' | l: 'What you bought' }}</span>
          <div class="row-wrap">
            @for (k of bought(); track k) {
              <button class="chip" (click)="bought.set(remove(bought(), k))" [attr.aria-label]="'Убрать' | l: 'Remove'"><app-item-icon [key]="k" [size]="28" [title]="true" /><app-icon name="x" [size]="12" /></button>
            }
          </div>
          <app-item-picker [exclude]="bought()" (picked)="bought.set([...bought(), $event])" />
        </div>
        <div class="field">
          <span class="label">{{ 'В каких покупках сомневался' | l: 'Purchases you doubted' }}</span>
          <div class="row-wrap">
            @for (k of doubts(); track k) {
              <button class="chip" (click)="doubts.set(remove(doubts(), k))"><app-item-icon [key]="k" [size]="28" [title]="true" /><app-icon name="x" [size]="12" /></button>
            }
          </div>
          <app-item-picker [exclude]="doubts()" (picked)="doubts.set([...doubts(), $event])" />
        </div>
        <div class="field">
          <span class="label">{{ 'Результат' | l: 'Result' }}</span>
          <div class="seg">
            <button [class.on]="result() === 'win'" (click)="result.set('win')">{{ 'Победа' | l: 'Win' }}</button>
            <button [class.on]="result() === 'loss'" (click)="result.set('loss')">{{ 'Поражение' | l: 'Loss' }}</button>
            <button [class.on]="result() === null" (click)="result.set(null)">{{ 'Не важно' | l: 'Skip' }}</button>
          </div>
        </div>
        <div class="field">
          <label for="rnote">{{ 'Заметка' | l: 'Note' }}</label>
          <textarea id="rnote" class="textarea" [value]="note()" (input)="note.set($any($event.target).value)" maxlength="600"></textarea>
        </div>
        <div class="row-wrap">
          <button class="btn btn-primary btn-lg" (click)="save(true)" [disabled]="!canSave()"><app-icon name="play" /> {{ 'Сохранить и тренировать' | l: 'Save and practice' }} ({{ matching() }})</button>
          <button class="btn btn-lg" (click)="save(false)" [disabled]="!canSave()">{{ 'Только сохранить' | l: 'Just save' }}</button>
        </div>
      </section>

      @if (history().length) {
        <section class="panel hist">
          <div class="panel-head"><h3>{{ 'Прошлые матчи' | l: 'Past matches' }}</h3></div>
          <ul class="list">
            @for (r of history(); track r.id) {
              <li class="hrow">
                <app-hero-avatar [key]="r.heroKey" [size]="28" />
                <span class="grow small">{{ i18n.date(r.createdAt) }} · {{ r.problems.map(threat).join(', ') || '-' }}</span>
                <span class="xsmall" [class.c-good]="r.result === 'win'" [class.c-bad]="r.result === 'loss'">{{ r.result === 'win' ? ('победа' | l: 'win') : r.result === 'loss' ? ('поражение' | l: 'loss') : '' }}</span>
                <button class="btn btn-ghost btn-sm" (click)="practiceFrom(r)">{{ 'Тренировать' | l: 'Practice' }}</button>
              </li>
            }
          </ul>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .heroes { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 4px; }
      .hero { padding: 3px; border-radius: var(--r-md); border: 1px solid transparent; background: transparent; }
      .hero.on { border-color: var(--bad); background: var(--bad-bg); }
      .tbtn { cursor: pointer; height: 28px; }
      .chip { display: inline-flex; align-items: center; gap: 2px; padding: 2px 6px 2px 2px; border-radius: var(--r-md); border: 1px solid var(--border-2); background: var(--bg-1); color: var(--text-2); }
      .hist { margin-top: 16px; }
      .hrow { display: flex; align-items: center; gap: 10px; padding: 8px 16px; }
    `,
  ],
})
export class ReflectPage {
  protected readonly game = inject(GameData);
  protected readonly i18n = inject(I18n);
  private readonly profiles = inject(Profiles);
  private readonly content = inject(Content);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);

  protected readonly pickable = PICKABLE.filter((t) => (THREATS as readonly string[]).includes(t));
  protected readonly hero = signal(this.profiles.settings().heroFocus);
  protected readonly enemies = signal<string[]>([]);
  protected readonly problems = signal<Threat[]>([]);
  protected readonly bought = signal<string[]>([]);
  protected readonly doubts = signal<string[]>([]);
  protected readonly result = signal<'win' | 'loss' | null>(null);
  protected readonly note = signal('');
  protected readonly history = signal<Reflection[]>([]);

  protected readonly canSave = computed(() => this.enemies().length > 0 || this.problems().length > 0 || this.doubts().length > 0);
  protected readonly matching = computed(() => {
    const ps = new Set<string>(this.problems());
    const es = new Set(this.enemies());
    return this.content.scenarios().filter((s) => s.problemTags.some((t) => ps.has(t)) || s.enemies.some((e) => es.has(e.hero))).length;
  });

  constructor() {
    void this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    try {
      const db = await getDb();
      const list = await db.getAllFromIndex('reflections', 'byProfile', this.profiles.profileId());
      this.history.set(list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10));
    } catch {
      this.history.set([]);
    }
  }

  threat = (t: string): string => {
    const l = THREAT_LABELS[t as Threat];
    return l ? this.i18n.l(l.ru, l.en) : t;
  };

  remove(list: string[], k: string): string[] {
    return list.filter((x) => x !== k);
  }

  toggleEnemy(k: string): void {
    this.enemies.update((l) => (l.includes(k) ? l.filter((x) => x !== k) : l.length < 6 ? [...l, k] : l));
  }

  toggleProblem(t: Threat): void {
    this.problems.update((l) => (l.includes(t) ? l.filter((x) => x !== t) : [...l, t]));
  }

  async save(train: boolean): Promise<void> {
    const r: Reflection = {
      id: newId('r'),
      profileId: this.profiles.profileId(),
      createdAt: Date.now(),
      heroKey: this.hero(),
      enemies: this.enemies(),
      problems: this.problems(),
      bought: this.bought(),
      doubts: this.doubts(),
      result: this.result(),
      note: this.note().trim(),
    };
    try {
      const db = await getDb();
      await db.put('reflections', r);
    } catch (e) {
      console.error(e);
    }
    this.toasts.show(this.i18n.l('Матч сохранён', 'Match saved'), 'good');
    if (train) this.practiceFrom(r);
    else void this.loadHistory();
  }

  practiceFrom(r: Reflection): void {
    const n = this.session.start({
      mode: 'reflection',
      minutes: 10,
      heroKey: r.heroKey,
      filters: { threats: r.problems, enemyHeroes: r.enemies, itemKeys: [...new Set([...r.doubts, ...r.bought])].length ? [...new Set([...r.doubts, ...r.bought])] : undefined },
    });
    if (n) void this.router.navigate(['/practice/run']);
    else this.toasts.show(this.i18n.l('Под этот матч пока нет подходящих заданий.', 'No matching tasks for this match yet.'));
  }
}
