import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { GameData } from '../../core/game-data/game-data.service';
import type { GameItem } from '../../core/game-data/game-data.model';
import { I18n } from '../../core/i18n/i18n';

/** Item icon with the official illustrated shop art and a category-colored frame. */
@Component({
  selector: 'app-item-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (it(); as i) {
      <img
        [src]="src()"
        [width]="size()"
        [height]="size()"
        [alt]="alt() ? '' : i18n.name(i.name)"
        loading="lazy"
        decoding="async"
        draggable="false"
        (error)="fallback()"
      />
      @if (badges()) {
        <span class="badges">
          @if (i.isActive) {
            <span class="b act" [title]="i18n.l('Активный', 'Active')">A</span>
          }
          @if (i.imbue) {
            <span class="b imb" [title]="i18n.l('Imbue', 'Imbue')">I</span>
          }
        </span>
      }
      @if (tier()) {
        <span class="tier">{{ roman[i.tier] }}</span>
      }
    } @else {
      <span class="missing">?</span>
    }
  `,
  host: {
    class: 'item-icon',
    '[class.weapon]': "it()?.slot === 'weapon'",
    '[class.vitality]': "it()?.slot === 'vitality'",
    '[class.spirit]': "it()?.slot === 'spirit'",
    '[style.width.px]': 'size()',
    '[style.height.px]': 'size()',
    '[attr.title]': 'title() && it() ? i18n.name(it()!.name) : null',
  },
  styles: [
    `
      :host {
        position: relative;
        display: inline-block;
        flex: none;
        border-radius: var(--r-md);
        overflow: hidden;
        background: var(--bg-3);
        --frame: var(--border-2);
      }
      :host::after {
        content: '';
        position: absolute;
        inset: 0;
        border-radius: inherit;
        box-shadow: inset 0 0 0 1px var(--frame);
        pointer-events: none;
      }
      :host(.weapon) { --frame: rgba(220, 143, 60, 0.6); }
      :host(.vitality) { --frame: rgba(124, 174, 76, 0.6); }
      :host(.spirit) { --frame: rgba(157, 126, 227, 0.65); }
      img { width: 100%; height: 100%; object-fit: cover; display: block; }
      .badges { position: absolute; top: 3px; right: 3px; display: flex; gap: 2px; }
      .b { font: 700 9px/1 var(--mono); padding: 2px 3px; border-radius: 3px; background: rgba(11, 12, 14, 0.82); color: var(--text); }
      .b.act { color: var(--accent); }
      .b.imb { color: var(--spirit); }
      .tier { position: absolute; left: 3px; bottom: 3px; font: 700 9px/1 var(--mono); padding: 2px 3px; border-radius: 3px; background: rgba(11, 12, 14, 0.82); color: var(--text-2); }
      .missing { display: grid; place-items: center; width: 100%; height: 100%; color: var(--text-3); }
    `,
  ],
})
export class ItemIcon {
  protected readonly i18n = inject(I18n);
  private readonly game = inject(GameData);
  readonly item = input<GameItem | null | undefined>(null);
  readonly key = input<string | null | undefined>(null);
  readonly size = input(48);
  readonly badges = input(false);
  readonly tier = input(false);
  readonly title = input(false);
  /** Decorative (name shown next to it): empty alt. */
  readonly alt = input(false);

  protected readonly roman = ['', 'I', 'II', 'III', 'IV', 'V'];
  private readonly failed = signal(false);
  protected readonly it = computed(() => this.item() ?? this.game.item(this.key()));
  protected readonly src = computed(() => {
    const i = this.it();
    if (!i) return '';
    return this.failed() ? i.iconRemote : i.icon;
  });

  fallback(): void {
    if (!this.failed()) this.failed.set(true);
  }
}
