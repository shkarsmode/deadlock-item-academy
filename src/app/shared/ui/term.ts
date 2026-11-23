import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { I18N_PIPES } from '../../core/i18n/i18n';
import { ClaimBadge } from './primitives';

/**
 * A word with a glossary popover: `<app-term key="imbue">Imbue</app-term>`.
 * Click or Enter opens a short definition with a link to the glossary. Without a matching term
 * the content renders as plain text. Uses the native Popover API (top layer, light dismiss).
 */
@Component({
  selector: 'app-term',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ClaimBadge, ...I18N_PIPES],
  template: `<ng-content>{{ t()?.en }}</ng-content>
    @if (t(); as term) {
      <span #pop class="term-pop" popover="auto" role="dialog" [attr.aria-label]="term.en" (toggle)="onToggle($event)">
        <span class="t-head">
          <b>{{ term.en }}</b>
          <span class="t-ru">{{ term.ru.join(' · ') }}</span>
        </span>
        <span class="t-short">{{ term.short | tx }}</span>
        <span class="t-foot">
          <app-claim [status]="term.status" />
          <a [routerLink]="['/glossary']" [queryParams]="{ t: term.id }" (click)="close()">{{ 'Открыть в словаре' | l: 'Open in glossary' }}</a>
        </span>
      </span>
    }`,
  host: {
    '[class.has-term]': '!!t()',
    '[attr.role]': "t() ? 'button' : null",
    '[attr.tabindex]': 't() ? 0 : null',
    '[attr.aria-expanded]': 't() ? open() : null',
    '(pointerdown)': 'down($event)',
    '(click)': 'click($event)',
    '(keydown.enter)': 'keyToggle($event)',
    '(keydown.space)': 'keyToggle($event)',
  },
  styles: [
    `
      :host(.has-term) { cursor: pointer; text-decoration: underline dotted; text-decoration-color: var(--text-3); text-underline-offset: 3px; border-radius: 3px; }
      :host(.has-term:hover) { text-decoration-color: var(--accent); }
      :host(.has-term:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
      .term-pop {
        position: fixed; inset: auto; margin: 0; width: 300px; max-width: calc(100vw - 16px);
        padding: 12px 14px; border-radius: var(--r-lg); border: 1px solid var(--border-3);
        background: var(--bg-2); color: var(--text); box-shadow: 0 14px 36px rgba(0, 0, 0, 0.55);
        font: 400 var(--fs-sm) / 1.45 var(--font); text-transform: none; letter-spacing: normal; text-align: left; white-space: normal; cursor: default;
      }
      .term-pop:popover-open { display: flex; flex-direction: column; gap: 8px; }
      .t-head { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
      .t-head b { font-size: var(--fs-md); }
      .t-ru { color: var(--text-3); font-size: var(--fs-xs); }
      .t-short { color: var(--text); }
      .t-foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
      .t-foot a { font-size: var(--fs-xs); }
    `,
  ],
})
export class Term {
  private readonly content = inject(Content);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly key = input.required<string>();

  protected readonly t = computed(() => this.content.term(this.key()));
  protected readonly open = signal(false);
  private readonly pop = viewChild<ElementRef<HTMLElement>>('pop');
  /** Light dismiss closes the popover on pointerdown, so the click that follows must not reopen it. */
  private wasOpen = false;
  private readonly onScroll = () => this.close();

  constructor() {
    inject(DestroyRef).onDestroy(() => removeEventListener('scroll', this.onScroll, { capture: true }));
  }

  protected down(e: PointerEvent): void {
    if (this.inPopover(e)) return;
    this.wasOpen = this.open();
  }

  protected click(e: MouseEvent): void {
    if (!this.t() || this.inPopover(e)) return;
    // Terms can sit inside links and buttons: the click belongs to the term only.
    e.preventDefault();
    e.stopPropagation();
    if (this.wasOpen) {
      this.wasOpen = false;
      this.close();
      return;
    }
    this.show();
  }

  protected keyToggle(e: Event): void {
    if (!this.t() || this.inPopover(e)) return;
    e.preventDefault();
    if (this.open()) this.close();
    else this.show();
  }

  close(): void {
    const pop = this.pop()?.nativeElement;
    if (pop && this.open()) pop.hidePopover();
  }

  protected onToggle(e: Event): void {
    const isOpen = (e as Event & { newState?: string }).newState === 'open';
    this.open.set(isOpen);
    if (isOpen) addEventListener('scroll', this.onScroll, { capture: true, passive: true });
    else removeEventListener('scroll', this.onScroll, { capture: true });
  }

  private show(): void {
    const pop = this.pop()?.nativeElement;
    if (!pop) return;
    pop.showPopover();
    const r = this.host.nativeElement.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const left = Math.min(Math.max(8, r.left), innerWidth - w - 8);
    let top = r.bottom + 6;
    if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
    pop.style.left = `${Math.round(left)}px`;
    pop.style.top = `${Math.round(top)}px`;
  }

  private inPopover(e: Event): boolean {
    const pop = this.pop()?.nativeElement;
    return !!pop && pop.contains(e.target as Node);
  }
}
