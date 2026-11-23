import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { GlossaryCategory, GlossaryTerm } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { GLOSSARY_CATEGORY_LABELS, searchTerms } from '../../content/glossary';
import { GLOSSARY_CATEGORIES } from '../../content/vocab';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { ClaimBadge } from '../../shared/ui/primitives';
import { TermText } from '../../shared/ui/term-text';

type Filter = 'core' | 'all' | GlossaryCategory;

/** Basic Deadlock vocabulary: imbue, carry, picker, spirit power... with search and a self-check mode. */
@Component({
  selector: 'app-glossary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TermText, RouterLink, Icon, ItemIcon, ClaimBadge, ...I18N_PIPES],
  template: `
    <div class="page">
      <header class="page-head">
        <h1>{{ 'Словарь' | l: 'Glossary' }}</h1>
        <p class="sub">
          {{ 'Базовые слова Deadlock: что такое imbue, кто такие керри и пикеры, чем Spirit Power отличается от скейлинга. Подчёркнутые слова в приложении открывают короткое определение.' | l: 'Basic Deadlock words: what imbue is, who carries and pickers are, how Spirit Power differs from scaling. Underlined words across the app open a short definition.' }}
        </p>
      </header>

      <div class="toolbar">
        <input class="input search" type="search" [value]="query()" (input)="query.set($any($event.target).value)" [placeholder]="'Найти слово: imbue, керри, пикер...' | l: 'Find a word: imbue, carry, picker...'" [attr.aria-label]="'Поиск по словарю' | l: 'Search the glossary'" />
        <label class="row small check">
          <input type="checkbox" [checked]="quiz()" (change)="quiz.set($any($event.target).checked); revealed.set([])" />
          {{ 'Проверь себя: прятать объяснения' | l: 'Self-check: hide explanations' }}
        </label>
      </div>

      <div class="chips" role="tablist">
        @for (f of filters(); track f.id) {
          <button class="chip" role="tab" [class.on]="filter() === f.id" [attr.aria-selected]="filter() === f.id" (click)="filter.set(f.id)">
            {{ f.label }} <span class="num faint">{{ f.n }}</span>
          </button>
        }
      </div>

      @if (!terms().length) {
        <div class="empty">{{ 'Словарь ещё не загружен.' | l: 'The glossary is not loaded yet.' }}</div>
      } @else if (!groups().length) {
        <div class="empty">{{ 'Такого слова нет. Попробуй по-английски или короче.' | l: 'No such word. Try English or a shorter query.' }}</div>
      }

      @for (g of groups(); track g.id) {
        <section class="group">
          @if (g.title) {
            <h2 class="g-title">{{ g.title }}</h2>
          }
          <div class="cards">
            @for (t of g.terms; track t.id) {
              <article class="term panel" [id]="'term-' + t.id" [class.hl]="t.id === focus()">
                <header class="t-head">
                  <h3>{{ t.en }}</h3>
                  <span class="t-ru">{{ t.ru.join(' · ') }}</span>
                  <span class="spacer"></span>
                  @if (t.core) {
                    <span class="tag tag-accent">{{ 'главное' | l: 'core' }}</span>
                  }
                </header>
                @if (quiz() && !revealed().includes(t.id)) {
                  <button class="btn btn-sm reveal" (click)="reveal(t.id)"><app-icon name="eye" [size]="14" /> {{ 'Вспомни и открой' | l: 'Recall, then reveal' }}</button>
                } @else {
                  <p class="t-short">{{ t.short | tx }}</p>
                  <details class="t-more" [open]="t.id === focus()">
                    <summary>{{ 'Подробнее и пример' | l: 'Details and example' }}</summary>
                    <p class="t-explain"><app-tt [text]="t.explain | tx" [skip]="t.id" /></p>
                    @if (t.example) {
                      <div class="t-example"><app-icon name="crosshair" [size]="14" /> <span><app-tt [text]="t.example | tx" [skip]="t.id" /></span></div>
                    }
                  </details>
                  @if (t.items?.length) {
                    <div class="t-items">
                      @for (k of t.items; track k) {
                        <a [routerLink]="['/items', k]" class="t-item"><app-item-icon [key]="k" [size]="32" [title]="true" /></a>
                      }
                    </div>
                  }
                  <footer class="t-foot">
                    <app-claim [status]="t.status" />
                    @if (t.related?.length) {
                      <span class="spacer"></span>
                      <span class="xsmall faint">{{ 'Связано:' | l: 'Related:' }}</span>
                      @for (r of t.related; track r) {
                        @if (content.term(r); as rt) {
                          <button class="rel" (click)="jump(r)">{{ rt.en }}</button>
                        }
                      }
                    }
                  </footer>
                }
              </article>
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [
    `
      .toolbar { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; margin-bottom: 12px; }
      .search { flex: 1 1 260px; min-width: 0; max-width: 420px; }
      .check { gap: 8px; cursor: pointer; }
      .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
      .chip { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--bg-2); color: var(--text-2); font-size: var(--fs-sm); cursor: pointer; }
      .chip:hover { color: var(--text); border-color: var(--border-3); }
      .chip.on { color: var(--accent); border-color: var(--accent-line); background: var(--accent-bg); }
      .empty { padding: 32px 16px; text-align: center; color: var(--text-3); }
      .group + .group { margin-top: 22px; }
      .g-title { font-size: var(--fs-lg); margin-bottom: 10px; }
      .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 12px; }
      .term { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; scroll-margin-top: 80px; }
      .term.hl { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
      .t-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 10px; }
      .t-head h3 { font-size: var(--fs-lg); }
      .t-ru { color: var(--text-3); font-size: var(--fs-sm); }
      .t-short { margin: 0; font-weight: 600; line-height: 1.45; }
      .t-more summary { cursor: pointer; width: max-content; font-size: var(--fs-sm); color: var(--text-2); }
      .t-more summary:hover { color: var(--text); }
      .t-more[open] { display: flex; flex-direction: column; gap: 8px; }
      .t-explain { margin: 0; color: var(--text-2); font-size: var(--fs-sm); line-height: 1.5; }
      .t-example { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: var(--r-md); background: var(--bg-2); font-size: var(--fs-sm); color: var(--text-2); }
      .t-example app-icon { color: var(--accent); margin-top: 2px; }
      .t-items { display: flex; flex-wrap: wrap; gap: 6px; }
      .t-item { line-height: 0; }
      .t-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 2px; }
      .rel { font-size: var(--fs-xs); padding: 2px 8px; border-radius: 999px; border: 1px solid var(--border-2); background: var(--bg-3); color: var(--text-2); cursor: pointer; }
      .rel:hover { color: var(--text); border-color: var(--border-3); }
      .reveal { width: max-content; }
    `,
  ],
})
export class GlossaryPage {
  protected readonly content = inject(Content);
  private readonly i18n = inject(I18n);

  /** `?t=imbue` highlights a term (links from popovers). */
  readonly termParam = input<string | undefined>(undefined, { alias: 't' });

  protected readonly query = signal('');
  protected readonly quiz = signal(false);
  protected readonly revealed = signal<string[]>([]);
  protected readonly focus = linkedSignal(() => this.termParam() ?? null);
  protected readonly filter = linkedSignal<Filter>(() => (this.termParam() ? 'all' : 'core'));

  protected readonly terms = this.content.glossary;
  protected readonly filters = computed(() => {
    const t = this.terms();
    const list: { id: Filter; label: string; n: number }[] = [
      { id: 'core', label: this.i18n.l('Главное', 'Core'), n: t.filter((x) => x.core).length },
      { id: 'all', label: this.i18n.l('Все', 'All'), n: t.length },
    ];
    for (const c of GLOSSARY_CATEGORIES) {
      const n = t.filter((x) => x.category === c).length;
      if (n) list.push({ id: c, label: this.i18n.l(GLOSSARY_CATEGORY_LABELS[c].ru, GLOSSARY_CATEGORY_LABELS[c].en), n });
    }
    return list;
  });

  /** Search shows one ranked list; otherwise terms are grouped by category. */
  protected readonly groups = computed<{ id: string; title: string | null; terms: GlossaryTerm[] }[]>(() => {
    const q = this.query();
    if (q.trim()) {
      const found = searchTerms(this.terms(), q);
      return found.length ? [{ id: 'search', title: null, terms: found }] : [];
    }
    const f = this.filter();
    const pick = this.terms().filter((t) => (f === 'all' ? true : f === 'core' ? t.core : t.category === f));
    if (f === 'core') return pick.length ? [{ id: 'core', title: null, terms: pick }] : [];
    return GLOSSARY_CATEGORIES.map((c) => ({
      id: c,
      title: f === 'all' ? this.i18n.l(GLOSSARY_CATEGORY_LABELS[c].ru, GLOSSARY_CATEGORY_LABELS[c].en) : null,
      terms: pick.filter((t) => t.category === c),
    })).filter((g) => g.terms.length);
  });

  private lastScrolled: string | null = null;

  constructor() {
    afterRenderEffect(() => {
      const id = this.focus();
      if (!id || id === this.lastScrolled || !this.groups().length) return;
      const el = document.getElementById(`term-${id}`);
      if (el) {
        this.lastScrolled = id;
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
    });
  }

  protected reveal(id: string): void {
    this.revealed.update((r) => [...r, id]);
  }

  /** Related chip: show the whole list and bring that term into view. */
  protected jump(id: string): void {
    this.query.set('');
    this.filter.set('all');
    this.lastScrolled = null;
    this.focus.set(id);
  }
}
