import { ChangeDetectionStrategy, Component, Injectable, computed, inject, input } from '@angular/core';
import { Content } from '../../content/content.service';
import { buildTermMatcher, splitByTerms, type TermSegment } from '../../content/term-links';
import { Term } from './term';

/** The glossary matcher, rebuilt only when the glossary changes. */
@Injectable({ providedIn: 'root' })
export class TermLinks {
  private readonly content = inject(Content);
  readonly matcher = computed(() => buildTermMatcher(new Set(this.content.termMap().keys())));
}

interface Piece extends TermSegment {
  b: boolean;
}

/**
 * Learning text with glossary links: words like imbue, керри, контроль open a short definition.
 * Supports `**bold**` and line breaks like `app-rt`. Each term links once per text.
 */
@Component({
  selector: 'app-tt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Term],
  // One line on purpose: whitespace between the pieces would show up as a space before punctuation.
  template: `@for (line of lines(); track $index; let last = $last) {@for (p of line; track $index) {@if (p.term) {<app-term [key]="p.term" [class.b]="p.b">{{ p.t }}</app-term>} @else if (p.b) {<strong>{{ p.t }}</strong>} @else {<ng-container>{{ p.t }}</ng-container>}}@if (!last) {<br />}}`,
  host: { class: 'tt' },
  styles: [':host(.tt) app-term.b { font-weight: 650; }'],
})
export class TermText {
  private readonly links = inject(TermLinks);
  readonly text = input<string | null | undefined>('');
  /** A term not to link, e.g. the one this text explains. */
  readonly skip = input<string | null>(null);

  protected readonly lines = computed<Piece[][]>(() => {
    const m = this.links.matcher();
    const seen = new Set<string>();
    const skip = this.skip();
    if (skip) seen.add(skip);
    return (this.text() ?? '').split('\n').map((line) =>
      line
        .split('**')
        .flatMap((t, i) => splitByTerms(t, m, seen).map((s) => ({ ...s, b: i % 2 === 1 })))
        .filter((p) => p.t),
    );
  });
}
