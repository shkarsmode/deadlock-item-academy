import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { ProblemEntry } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { THREAT_LABELS } from '../../content/labels';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Session } from '../../learning/session.service';
import { normalizeAnswer } from '../../learning/questions/fuzzy';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { ClaimBadge } from '../../shared/ui/primitives';
import { TermText } from '../../shared/ui/term-text';

@Component({
  selector: 'app-problems-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TermText, RouterLink, Icon, ItemIcon, ClaimBadge, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="grow">
          <h1>{{ 'Поиск по проблеме' | l: 'Search by problem' }}</h1>
          <p class="sub">{{ 'Опиши, что идёт не так в матче, а не название предмета.' | l: 'Describe what goes wrong in the match, not the item name.' }}</p>
        </div>
      </div>
      <div class="search panel">
        <app-icon name="search" />
        <input class="input" type="search" [value]="q()" (input)="q.set($any($event.target).value)" [placeholder]="'Например: враги сильно лечатся, меня станят, не могу догнать...' | l: 'e.g. enemies heal a lot, I get stunned, I cannot catch...'" [attr.aria-label]="'Проблема' | l: 'Problem'" />
      </div>
      <div class="layout">
        <ul class="list panel results">
          @for (p of results(); track p.id) {
            <li>
              <button class="prow" [class.on]="selected()?.id === p.id" (click)="selectedId.set(p.id)">
                <span class="grow">{{ p.title | tx }}</span>
                <app-icon name="right" [size]="14" />
              </button>
            </li>
          } @empty {
            <li class="empty small">{{ 'Ничего не нашлось. Попробуй другие слова.' | l: 'Nothing found. Try other words.' }}</li>
          }
        </ul>
        @if (selected(); as p) {
          <article class="panel detail">
            <div class="panel-head"><h2>{{ p.title | tx }}</h2></div>
            <div class="panel-body stack-4">
              <p><app-tt [text]="p.explanation | tx" /></p>
              @if (p.threats.length) {
                <div class="row-wrap">
                  @for (t of p.threats; track t) {
                    <span class="tag">{{ threat(t) }}</span>
                  }
                </div>
              }
              @for (s of p.solutions; track $index) {
                <div class="sol">
                  <h3>{{ s.title | tx }}</h3>
                  <p class="small muted"><app-tt [text]="s.note | tx" /></p>
                  <div class="row-wrap">
                    @for (k of s.items; track k) {
                      <a class="it" [routerLink]="['/items', k]">
                        <app-item-icon [key]="k" [size]="34" [alt]="true" />
                        <span class="small">{{ game.item(k)?.name | gn }}</span>
                        <span class="xsmall faint num">{{ game.item(k)?.cost }}</span>
                      </a>
                    }
                  </div>
                </div>
              }
              @if (p.caveats.length) {
                <div class="callout warn">
                  <app-icon name="alert" />
                  <ul class="small">
                    @for (c of p.caveats; track $index) {
                      <li><app-tt [text]="c.text | tx" /> <app-claim [status]="c.status" /></li>
                    }
                  </ul>
                </div>
              }
              <button class="btn btn-primary" (click)="practice(p)"><app-icon name="play" /> {{ 'Тренировать эту проблему' | l: 'Practice this problem' }}</button>
            </div>
          </article>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .search { position: relative; padding: 8px; margin-bottom: 14px; }
      .search app-icon { position: absolute; left: 18px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
      .search .input { padding-left: 34px; height: 44px; font-size: var(--fs-lg); }
      .layout { display: grid; grid-template-columns: minmax(0, 340px) minmax(0, 1fr); gap: 16px; align-items: start; }
      .prow { display: flex; align-items: center; gap: 8px; width: 100%; padding: 10px 14px; border: 0; background: transparent; color: var(--text); text-align: left; }
      .prow:hover, .prow.on { background: var(--bg-2); }
      .prow.on { box-shadow: inset 2px 0 0 var(--accent); }
      .sol h3 { font-size: var(--fs-md); margin-bottom: 4px; }
      .sol .row-wrap { margin-top: 8px; }
      .it { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px 4px 4px; border-radius: var(--r-md); border: 1px solid var(--border); color: var(--text); text-decoration: none !important; }
      .it:hover { border-color: var(--border-3); }
      @media (max-width: 900px) { .layout { grid-template-columns: minmax(0, 1fr); } .results { max-height: 280px; overflow-y: auto; } }
    `,
  ],
})
export class ProblemsPage {
  protected readonly game = inject(GameData);
  private readonly content = inject(Content);
  private readonly i18n = inject(I18n);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly q = signal('');
  protected readonly selectedId = signal<string | null>(null);
  protected readonly results = computed(() => {
    const query = normalizeAnswer(this.q());
    const list = this.content.problems();
    if (!query) return list;
    const words = query.split(' ').filter((w) => w.length > 1);
    return list
      .map((p) => {
        const hay = normalizeAnswer([p.title.ru, p.title.en ?? '', ...p.aliases, p.explanation.ru].join(' '));
        const score = words.reduce((s, w) => s + (hay.includes(w) ? 1 : 0) + (normalizeAnswer(p.aliases.join(' ')).includes(w) ? 1 : 0), 0);
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.p);
  });
  protected readonly selected = computed<ProblemEntry | undefined>(() => this.results().find((p) => p.id === this.selectedId()) ?? this.results()[0]);

  threat(t: string): string {
    const l = THREAT_LABELS[t as keyof typeof THREAT_LABELS];
    return l ? this.i18n.l(l.ru, l.en) : t;
  }

  practice(p: ProblemEntry): void {
    const items = [...new Set(p.solutions.flatMap((s) => s.items))];
    const n = this.session.start({ mode: 'reflection', minutes: 8, filters: { threats: p.threats, itemKeys: items } });
    if (n) void this.router.navigate(['/practice/run']);
  }
}
