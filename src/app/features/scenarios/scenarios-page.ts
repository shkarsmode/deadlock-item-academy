import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import { Router, RouterLink } from '@angular/router';
import type { Scenario, ScenarioKind } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { PHASE_LABELS } from '../../content/labels';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { Toasts } from '../../core/ui/toast.service';
import { Knowledge } from '../../learning/knowledge.service';
import { Session } from '../../learning/session.service';
import { GenContext, fromScenario } from '../../learning/questions/generators';
import { makeRng, seedFrom } from '../../learning/questions/rng';
import { Icon } from '../../shared/ui/icon';
import { HeroAvatar } from '../../shared/ui/primitives';
import { encodeShare } from '../share/share-code';

const KIND_LABELS: Record<ScenarioKind, { ru: string; en: string }> = {
  buy: { ru: 'Покупка', en: 'Buy' },
  'diagnose-buy': { ru: 'Диагноз и покупка', en: 'Diagnose & buy' },
  'active-timing': { ru: 'Тайминг активки', en: 'Active timing' },
  imbue: { ru: 'Imbue', en: 'Imbue' },
  surgery: { ru: 'Хирургия билда', en: 'Build surgery' },
  sell: { ru: 'Продажа', en: 'Sell' },
};

@Component({
  selector: 'app-scenarios-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SyncSelectValue, RouterLink, Icon, HeroAvatar, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="grow">
          <h1>{{ 'Ситуационные решения' | l: 'Situational decisions' }}</h1>
          <p class="sub">{{ 'Ситуации из матчей: угроза, бюджет, купленные предметы. Несколько решений бывают разумными: оценка по критериям.' | l: 'Match situations: threat, budget, owned items. Several answers can be reasonable: graded by criteria.' }}</p>
        </div>
        <a class="btn" routerLink="/simulator"><app-icon name="store" /> {{ 'Симулятор магазина' | l: 'Shop simulator' }}</a>
        <button class="btn btn-primary" (click)="practiceSet()" [disabled]="!filtered().length"><app-icon name="play" /> {{ 'Решать подборку' | l: 'Solve this set' }} ({{ Math.min(filtered().length, 12) }})</button>
      </div>

      <div class="panel panel-pad filters">
        <div class="row-wrap">
          <select class="select sel" [syncValue]="hero()" (change)="hero.set($any($event.target).value)" [attr.aria-label]="'Герой' | l: 'Hero'">
            <option value="">{{ 'Все герои' | l: 'All heroes' }}</option>
            @for (h of heroesWithScenarios(); track h.key) {
              <option [value]="h.key">{{ h.name | gn }} ({{ h.count }})</option>
            }
          </select>
          <div class="seg swipe">
            <button [class.on]="kind() === ''" (click)="kind.set('')">{{ 'Все типы' | l: 'All kinds' }}</button>
            @for (k of kinds; track k) {
              <button [class.on]="kind() === k" (click)="kind.set(k)">{{ kindLabel(k) }}</button>
            }
          </div>
          <div class="seg">
            <button [class.on]="diff() === 0" (click)="diff.set(0)">{{ 'Любая' | l: 'Any' }}</button>
            @for (d of [1, 2, 3, 4, 5]; track d) {
              <button [class.on]="diff() === d" (click)="diff.set(d)">{{ d }}</button>
            }
          </div>
          <div class="seg">
            <button [class.on]="status() === 'all'" (click)="status.set('all')">{{ 'Все' | l: 'All' }}</button>
            <button [class.on]="status() === 'new'" (click)="status.set('new')">{{ 'Новые' | l: 'New' }}</button>
            <button [class.on]="status() === 'failed'" (click)="status.set('failed')">{{ 'С ошибкой' | l: 'Failed' }}</button>
          </div>
          <span class="spacer"></span>
          <button class="btn btn-sm" (click)="share()" [disabled]="!filtered().length"><app-icon name="share" [size]="14" /> {{ 'Поделиться' | l: 'Share' }}</button>
        </div>
        @if (tags().length) {
          <div class="row-wrap tags swipe">
            @for (t of tags(); track t) {
              <button class="tag tagbtn" [class.tag-accent]="tag() === t" (click)="tag.set(tag() === t ? '' : t)">{{ t }}</button>
            }
          </div>
        }
      </div>

      <div class="count small muted">{{ filtered().length }} {{ 'ситуаций' | l: 'situations' }}</div>
      <ul class="list panel">
        @for (s of filtered().slice(0, limit()); track s.id) {
          <li>
            <button class="srow" (click)="solveOne(s)">
              <app-hero-avatar [key]="s.hero" [size]="34" />
              <div class="grow">
                <div class="q">{{ s.situation | tx }}</div>
                <div class="row-wrap xsmall faint meta">
                  <span class="tag">{{ kindLabel(s.kind) }}</span>
                  <span>{{ phase(s) }}</span>
                  <span class="num">{{ s.souls }} {{ 'душ' | l: 'souls' }}</span>
                  <span class="diff" [attr.title]="'Сложность' | l: 'Difficulty'">@for (i of [1, 2, 3, 4, 5]; track i) {<i [class.on]="s.difficulty >= i"></i>}</span>
                  @if (stale().has(s.id)) {
                    <span class="c-warn">{{ 'нужна перепроверка после патча' | l: 'needs re-check after patch' }}</span>
                  }
                </div>
              </div>
              <span class="st xsmall" [class]="'st xsmall st-' + statusOf(s)">{{ statusLabel(s) }}</span>
            </button>
          </li>
        } @empty {
          <li class="empty">{{ content.status() === 'ready' ? ('Нет ситуаций под эти фильтры.' | l: 'No situations for these filters.') : ('Контент загружается или недоступен.' | l: 'Content is loading or unavailable.') }}</li>
        }
      </ul>
      @if (filtered().length > limit()) {
        <button class="btn btn-block more" (click)="limit.set(limit() + 40)">{{ 'Показать ещё' | l: 'Show more' }}</button>
      }
    </div>
  `,
  styles: [
    `
      .filters { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-bottom: 10px; }
      .sel { width: auto; min-width: 180px; }
      @media (max-width: 767px) {
        .sel { flex: 1 1 100%; }
        /* one swipeable line per filter group instead of a wall of chips; the fade hints at more */
        .swipe { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none; mask-image: linear-gradient(to right, #000 calc(100% - 28px), transparent); }
        .swipe::-webkit-scrollbar { display: none; }
        .swipe::after { content: ''; flex: none; width: 20px; }
        .swipe > * { flex: none; }
      }
      .tagbtn { cursor: pointer; }
      .count { margin: 6px 2px 8px; }
      .srow { display: flex; gap: 12px; align-items: flex-start; width: 100%; padding: 12px 16px; border: 0; background: transparent; color: var(--text); text-align: left; }
      .srow:hover { background: var(--bg-2); }
      .q { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .meta { margin-top: 6px; gap: 8px; }
      .diff { display: inline-flex; gap: 2px; }
      .diff i { width: 6px; height: 6px; border-radius: 1px; background: var(--bg-4); }
      .diff i.on { background: var(--warn); }
      .st { flex: none; padding: 2px 6px; border-radius: var(--r-sm); background: var(--bg-3); color: var(--text-3); }
      .st-ok { color: var(--good); background: var(--good-bg); }
      .st-fail { color: var(--bad); background: var(--bad-bg); }
      .more { margin-top: 10px; }
    `,
  ],
})
export class ScenariosPage {
  protected readonly content = inject(Content);
  private readonly game = inject(GameData);
  private readonly i18n = inject(I18n);
  private readonly knowledge = inject(Knowledge);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly profiles = inject(Profiles);
  private readonly toasts = inject(Toasts);

  protected readonly Math = Math;
  protected readonly kinds: ScenarioKind[] = ['buy', 'diagnose-buy', 'sell', 'active-timing', 'imbue', 'surgery'];
  protected readonly hero = signal<string>(this.profiles.settings().heroFocus);
  protected readonly kind = signal<ScenarioKind | ''>('');
  protected readonly diff = signal(0);
  protected readonly status = signal<'all' | 'new' | 'failed'>('all');
  protected readonly tag = signal('');
  protected readonly limit = signal(40);
  protected readonly stale = this.content.staleScenarios;

  protected readonly heroesWithScenarios = computed(() => {
    const counts = new Map<string, number>();
    for (const s of this.content.scenarios()) counts.set(s.hero, (counts.get(s.hero) ?? 0) + 1);
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count, name: this.game.hero(key)?.name ?? { en: key, ru: key } }))
      .sort((a, b) => b.count - a.count);
  });

  protected readonly tags = computed(() => {
    const counts = new Map<string, number>();
    for (const s of this.byHero()) for (const t of s.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([t]) => t);
  });

  private readonly byHero = computed(() => this.content.scenarios().filter((s) => !this.hero() || s.hero === this.hero()));

  protected readonly filtered = computed(() =>
    this.byHero().filter((s) => {
      if (this.kind() && s.kind !== this.kind()) return false;
      if (this.diff() && s.difficulty !== this.diff()) return false;
      if (this.tag() && !s.tags.includes(this.tag())) return false;
      const st = this.statusOf(s);
      if (this.status() === 'new' && st !== 'new') return false;
      if (this.status() === 'failed' && st !== 'fail') return false;
      return true;
    }),
  );

  kindLabel(k: ScenarioKind): string {
    return this.i18n.l(KIND_LABELS[k].ru, KIND_LABELS[k].en);
  }

  phase(s: Scenario): string {
    return this.i18n.l(PHASE_LABELS[s.phase].ru, PHASE_LABELS[s.phase].en);
  }

  statusOf(s: Scenario): 'new' | 'ok' | 'fail' {
    const e = this.knowledge.exposures().get(`scenario:${s.id}`);
    if (!e) return 'new';
    return e.lastResult === 'correct' ? 'ok' : 'fail';
  }

  statusLabel(s: Scenario): string {
    const st = this.statusOf(s);
    return st === 'new' ? this.i18n.l('новая', 'new') : st === 'ok' ? this.i18n.l('решена', 'solved') : this.i18n.l('ошибка', 'missed');
  }

  private ctx(): GenContext {
    return { items: this.game.standardItems(), itemMap: this.game.itemMap(), heroMap: this.game.heroMap(), content: this.content.items(), confusions: new Map(), heroKey: this.hero() || null };
  }

  solveOne(s: Scenario): void {
    const q = fromScenario(s, this.ctx(), makeRng(seedFrom(s.id + Date.now())), 'full');
    this.session.startWith([{ ...q, askConfidence: true }], { mode: 'scenarios', minutes: 2, heroKey: s.hero });
    void this.router.navigate(['/practice/run']);
  }

  practiceSet(): void {
    const ids = this.filtered()
      .slice()
      .sort(() => Math.random() - 0.5)
      .slice(0, 12)
      .map((s) => s.id);
    const n = this.session.start({ mode: 'scenarios', minutes: 12, heroKey: this.hero() || null, filters: { scenarioIds: ids } });
    if (n) void this.router.navigate(['/practice/run']);
  }

  async share(): Promise<void> {
    const ids = this.filtered().slice(0, 20).map((s) => s.id);
    const code = encodeShare({ v: 1, hero: this.hero() || null, scenarios: ids, title: this.i18n.l('Подборка ситуаций', 'Situation set') });
    const url = `${location.origin}${location.pathname.replace(/\/scenarios.*$/, '')}/share/${code}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toasts.show(this.i18n.l('Ссылка скопирована', 'Link copied'), 'good');
    } catch {
      prompt(this.i18n.l('Скопируй ссылку', 'Copy the link'), url);
    }
  }
}
