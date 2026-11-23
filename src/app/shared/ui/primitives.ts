import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { GameData } from '../../core/game-data/game-data.service';
import type { HeroData, StatLine } from '../../core/game-data/game-data.model';
import { I18n } from '../../core/i18n/i18n';
import type { ClaimStatus } from '../../content/content.model';
import { CLAIM_LABELS } from '../../content/labels';
import type { MasteryLevel } from '../../learning/knowledge.model';
import { LEVEL_NAMES } from '../../learning/mastery';

/** Renders text with `**emphasis**` markers and line breaks, without innerHTML. */
@Component({
  selector: 'app-rt',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // One line on purpose: whitespace between the pieces would show up as a space before punctuation.
  template: `@for (line of lines(); track $index; let last = $last) {@for (part of line; track $index) {@if (part.b) {<strong>{{ part.t }}</strong>} @else {<ng-container>{{ part.t }}</ng-container>}}@if (!last) {<br />}}`,
  host: { class: 'rt' },
})
export class RichText {
  readonly text = input<string | null | undefined>('');
  protected readonly lines = computed(() =>
    (this.text() ?? '').split('\n').map((line) => line.split('**').map((t, i) => ({ t, b: i % 2 === 1 })).filter((p) => p.t)),
  );
}

@Component({
  selector: 'app-claim',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="dot"></span>{{ label() }}`,
  host: { class: 'claim', '[class]': "'claim st-' + (status() ?? 'expert')", '[attr.title]': 'label()' },
  styles: [
    `
      :host { display: inline-flex; align-items: center; gap: 5px; font-size: var(--fs-xs); color: var(--text-3); white-space: nowrap; }
      .dot { width: 6px; height: 6px; border-radius: 50%; background: var(--st-expert); }
      :host(.st-data) .dot { background: var(--st-data); }
      :host(.st-stat) .dot { background: var(--st-stat); }
      :host(.st-unverified) { color: var(--bad); }
      :host(.st-unverified) .dot { background: var(--st-unverified); }
    `,
  ],
})
export class ClaimBadge {
  private readonly i18n = inject(I18n);
  readonly status = input<ClaimStatus | undefined>('expert');
  protected readonly label = computed(() => {
    const l = CLAIM_LABELS[this.status() ?? 'expert'];
    return this.i18n.l(l.ru, l.en);
  });
}

@Component({
  selector: 'app-hero-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (h(); as hero) {
    <img [src]="failed() ? hero.iconRemote : hero.icon" [alt]="hero.name.en" loading="lazy" decoding="async" (error)="failed.set(true)" />
  }`,
  host: { class: 'hero-avatar', '[style.width.px]': 'size()', '[style.height.px]': 'size()', '[attr.title]': 'h()?.name?.en' },
  styles: [
    `
      :host { display: inline-block; flex: none; border-radius: var(--r-md); overflow: hidden; background: var(--bg-3); box-shadow: inset 0 0 0 1px var(--border-2); }
      img { width: 100%; height: 100%; object-fit: cover; object-position: 50% 18%; display: block; }
    `,
  ],
})
export class HeroAvatar {
  private readonly game = inject(GameData);
  readonly hero = input<HeroData | null | undefined>(null);
  readonly key = input<string | null | undefined>(null);
  readonly size = input(36);
  protected readonly failed = signal(false);
  protected readonly h = computed(() => this.hero() ?? this.game.hero(this.key()));
}

@Component({
  selector: 'app-ability-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (a(); as ab) {
    <img [src]="failed() ? ab.ability.iconRemote : ab.ability.icon" [alt]="ab.ability.name.en" loading="lazy" (error)="failed.set(true)" />
    @if (showSlot()) {
      <span class="slot">{{ ab.ability.isUltimate ? '4' : ab.ability.slot }}</span>
    }
  }`,
  host: { class: 'ability-icon', '[style.width.px]': 'size()', '[style.height.px]': 'size()', '[class.ult]': 'a()?.ability?.isUltimate', '[attr.title]': 'a()?.ability?.name?.en' },
  styles: [
    `
      :host { position: relative; display: inline-grid; place-items: center; flex: none; border-radius: 50%; background: #1d2127; box-shadow: inset 0 0 0 1px var(--border-3); }
      :host(.ult) { box-shadow: inset 0 0 0 1px var(--warn); }
      img { width: 72%; height: 72%; object-fit: contain; }
      .slot { position: absolute; right: -2px; bottom: -2px; font: 700 9px/1 var(--mono); padding: 2px 4px; border-radius: 3px; background: var(--bg-4); color: var(--text-2); }
    `,
  ],
})
export class AbilityIcon {
  private readonly game = inject(GameData);
  readonly key = input<string | null | undefined>(null);
  readonly size = input(36);
  readonly showSlot = input(false);
  protected readonly failed = signal(false);
  protected readonly a = computed(() => this.game.ability(this.key()));
}

@Component({
  selector: 'app-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<ul class="stats">
    @for (s of stats(); track s.prop) {
      <li [class.neg]="s.negative" [class.imp]="s.important">
        <span class="v num">{{ fmt(s) }}</span>
        <span class="l">{{ i18n.game(s.label) }}</span>
        @if (s.conditional) {
          <span class="c">{{ i18n.l('условно', 'conditional') }}</span>
        }
      </li>
    }
  </ul>`,
  styles: [
    `
      .stats { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 2px; font-size: var(--fs-sm); }
      li { display: flex; gap: 8px; align-items: baseline; }
      .v { color: var(--text); font-weight: 600; min-width: 52px; }
      .l { color: var(--text-2); }
      .imp .v { color: var(--accent); }
      .neg .v, .neg .l { color: var(--bad); }
      .c { font-size: var(--fs-xs); color: var(--text-3); }
    `,
  ],
})
export class StatLines {
  protected readonly i18n = inject(I18n);
  readonly stats = input<StatLine[]>([]);
  fmt(s: StatLine): string {
    const sign = s.signed && (s.value ?? 0) > 0 ? '+' : '';
    const unit = s.unit && !s.raw.endsWith(s.unit) ? s.unit : '';
    return `${sign}${s.raw}${unit}`;
  }
}

@Component({
  selector: 'app-level',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="pips" aria-hidden="true">
      @for (i of [1, 2, 3, 4, 5]; track i) {
        <i [class.on]="level() >= i"></i>
      }
    </span>
    @if (label()) {
      <span class="txt">{{ name() }}</span>
    }`,
  host: { class: 'level', '[attr.title]': 'name()', role: 'img', '[attr.aria-label]': 'name()' },
  styles: [
    `
      :host { display: inline-flex; align-items: center; gap: 6px; }
      .pips { display: inline-flex; gap: 2px; }
      i { width: 7px; height: 7px; border-radius: 2px; background: var(--bg-4); }
      i.on { background: var(--accent); }
      .txt { font-size: var(--fs-xs); color: var(--text-2); }
    `,
  ],
})
export class LevelPips {
  private readonly i18n = inject(I18n);
  readonly level = input<MasteryLevel>(0);
  readonly label = input(false);
  protected readonly name = computed(() => {
    const n = LEVEL_NAMES[this.level()];
    return this.i18n.l(`Уровень ${this.level()}: ${n.ru}`, `Level ${this.level()}: ${n.en}`);
  });
}

/** Meter for a ratio with sample size; renders "-" when there is no data yet. */
@Component({
  selector: 'app-meter',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="top">
      <span class="lbl">{{ label() }}</span>
      <span class="val num">{{ value() === null ? '-' : i18n.pct(value()!) }}</span>
    </div>
    <div class="bar" [class.good]="tone() === 'good'" [class.warn]="tone() === 'warn'" [class.bad]="tone() === 'bad'">
      <i [style.width.%]="(value() ?? 0) * 100"></i>
    </div>
    @if (n() !== null) {
      <div class="n">{{ n() === 0 ? i18n.l('пока нет ответов', 'no answers yet') : i18n.plural(n()!, ['ответ', 'ответа', 'ответов'], ['answer', 'answers']) }}</div>
    }`,
  styles: [
    `
      :host { display: block; }
      .top { display: flex; justify-content: space-between; gap: 8px; font-size: var(--fs-sm); margin-bottom: 6px; }
      .lbl { color: var(--text-2); }
      .val { font-weight: 650; }
      .n { margin-top: 4px; font-size: var(--fs-xs); color: var(--text-3); }
    `,
  ],
})
export class Meter {
  protected readonly i18n = inject(I18n);
  readonly label = input('');
  readonly value = input<number | null>(null);
  readonly n = input<number | null>(null);
  protected readonly tone = computed(() => {
    const v = this.value();
    if (v === null) return 'none';
    return v >= 0.8 ? 'good' : v >= 0.55 ? 'none' : v >= 0.35 ? 'warn' : 'bad';
  });
}
