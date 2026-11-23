import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Knowledge } from '../../learning/knowledge.service';
import { Session } from '../../learning/session.service';
import { DIM_NAMES } from '../../learning/mastery';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { LevelPips } from '../../shared/ui/primitives';

@Component({
  selector: 'app-session-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ItemIcon, LevelPips, ...I18N_PIPES],
  template: `
    <section class="sum">
      <h1>{{ 'Сессия завершена' | l: 'Session complete' }}</h1>
      <div class="grid grid-4 kpis">
        <div class="panel panel-pad stat"><span class="v">{{ answered() }}</span><span class="l">{{ 'ответов' | l: 'answers' }}</span></div>
        <div class="panel panel-pad stat"><span class="v c-good">{{ correct() }}</span><span class="l">{{ 'верно' | l: 'correct' }}</span></div>
        <div class="panel panel-pad stat"><span class="v c-warn">{{ partial() }}</span><span class="l">{{ 'частично' | l: 'partly' }}</span></div>
        <div class="panel panel-pad stat"><span class="v">{{ minutes() }}</span><span class="l">{{ 'минут' | l: 'minutes' }}</span></div>
      </div>

      @if (byDim().length) {
        <div class="panel">
          <div class="panel-head"><h3>{{ 'Что тренировали' | l: 'What you trained' }}</h3></div>
          <div class="panel-body dims">
            @for (d of byDim(); track d.dim) {
              <div class="dim-row">
                <span class="grow">{{ d.name }}</span>
                <span class="num small muted">{{ d.ok }}/{{ d.n }}</span>
                <div class="bar mini" [class.good]="d.ok / d.n >= 0.8" [class.warn]="d.ok / d.n < 0.5"><i [style.width.%]="(d.ok / d.n) * 100"></i></div>
              </div>
            }
          </div>
        </div>
      }

      @if (newItems().length) {
        <div class="panel">
          <div class="panel-head"><h3>{{ 'Новые предметы' | l: 'New items' }}</h3></div>
          <div class="panel-body row-wrap">
            @for (k of newItems(); track k) {
              <a class="new-item" [routerLink]="['/items', k]">
                <app-item-icon [key]="k" [size]="40" [alt]="true" />
                <span class="small">{{ game.item(k)?.name | gn }}</span>
                <app-level [level]="knowledge.levels().get(k) ?? 0" />
              </a>
            }
          </div>
        </div>
      }

      @if (wrong().length) {
        <div class="panel">
          <div class="panel-head"><h3>{{ 'Ошибки этой сессии' | l: 'Mistakes in this session' }}</h3><span class="spacer"></span><span class="small faint">{{ 'вернутся в ближайших повторениях' | l: 'they come back in upcoming reviews' }}</span></div>
          <ul class="list">
            @for (w of wrong(); track $index) {
              <li class="wrong">
                @if (w.item) {
                  <app-item-icon [key]="w.item" [size]="32" [alt]="true" />
                }
                <span class="grow">{{ w.text }}</span>
                @if (w.item) {
                  <a class="btn btn-ghost btn-sm" [routerLink]="['/items', w.item]">{{ 'Открыть' | l: 'Open' }}</a>
                }
              </li>
            }
          </ul>
        </div>
      }

      <div class="row-wrap actions">
        <button class="btn btn-primary btn-lg" (click)="again()"><app-icon name="repeat" /> {{ 'Ещё сессия' | l: 'Another session' }}</button>
        <a class="btn btn-lg" routerLink="/">{{ 'На главную' | l: 'Dashboard' }}</a>
        @if (wrong().length) {
          <a class="btn btn-lg btn-ghost" routerLink="/mistakes">{{ 'Тетрадь ошибок' | l: 'Mistake notebook' }}</a>
        }
      </div>
    </section>
  `,
  styles: [
    `
      .sum { max-width: 820px; margin: 0 auto; padding: 24px 16px 48px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; }
      .kpis .stat { align-items: flex-start; }
      .dims { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
      .dim-row { display: flex; align-items: center; gap: 10px; }
      .bar.mini { width: 120px; }
      .new-item { display: inline-flex; align-items: center; gap: 8px; padding: 6px 10px 6px 6px; border: 1px solid var(--border); border-radius: var(--r-md); color: var(--text); text-decoration: none; }
      .wrong { display: flex; align-items: center; gap: 10px; padding: 8px 16px; }
      .actions { margin-top: 4px; }
    `,
  ],
})
export class SessionSummary {
  protected readonly session = inject(Session);
  protected readonly game = inject(GameData);
  protected readonly knowledge = inject(Knowledge);
  private readonly i18n = inject(I18n);
  private readonly router = inject(Router);

  protected readonly answered = computed(() => this.session.results().length);
  protected readonly correct = computed(() => this.session.results().filter((r) => r.result === 'correct').length);
  protected readonly partial = computed(() => this.session.results().filter((r) => r.result === 'partial').length);
  protected readonly minutes = computed(() => Math.max(1, Math.round((Date.now() - this.session.startedAt()) / 60000)));
  protected readonly newItems = computed(() => this.session.newItems());
  protected readonly byDim = computed(() => {
    const m = new Map<string, { n: number; ok: number }>();
    for (const r of this.session.results()) {
      const d = r.question.dim;
      const cur = m.get(d) ?? { n: 0, ok: 0 };
      cur.n++;
      cur.ok += r.result === 'correct' ? 1 : r.result === 'partial' ? 0.5 : 0;
      m.set(d, cur);
    }
    return [...m.entries()].map(([dim, v]) => ({ dim, name: this.i18n.l(DIM_NAMES[dim as keyof typeof DIM_NAMES].ru, DIM_NAMES[dim as keyof typeof DIM_NAMES].en), ...v }));
  });
  protected readonly wrong = computed(() =>
    this.session
      .results()
      .filter((r) => r.result === 'wrong' || r.result === 'dontknow')
      .map((r) => ({
        item: r.question.expectedItem ?? r.question.explain.focusItem ?? null,
        text: r.question.scenario ? this.i18n.text(r.question.scenario.principle) : this.i18n.text(r.question.prompt.text),
      })),
  );

  again(): void {
    const cfg = this.session.config();
    if (!cfg) {
      void this.router.navigate(['/practice']);
      return;
    }
    const n = this.session.start({ ...cfg, seed: undefined });
    if (!n) void this.router.navigate(['/practice']);
  }
}
