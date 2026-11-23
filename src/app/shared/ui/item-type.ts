import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { GameItem } from '../../core/game-data/game-data.model';
import { I18N_PIPES } from '../../core/i18n/i18n';
import { Icon } from './icon';
import { Term } from './term';

/**
 * How the item works, in one glance: active (you press it) or passive (works by itself), and
 * whether it imbues one ability. Each pill opens the glossary definition.
 */
@Component({
  selector: 'app-item-type',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, Term, ...I18N_PIPES],
  template: `
    @if (item(); as it) {
      @if (it.isActive) {
        <app-term key="active-item" class="pill act">
          <app-icon name="click" [size]="13" />
          {{ (long() ? 'Активный: нажимаешь сам' : 'Активный') | l: (long() ? 'Active: you press it' : 'Active') }}
          @if (it.cooldown) {
            <span class="num cd">· {{ it.cooldown }} {{ 'с' | l: 's' }}</span>
          }
        </app-term>
      } @else {
        <app-term key="passive-item" class="pill pas">
          <app-icon name="infinity" [size]="13" />
          {{ (long() ? 'Пассивный: работает сам' : 'Пассивный') | l: (long() ? 'Passive: works by itself' : 'Passive') }}
        </app-term>
      }
      @if (it.imbue) {
        <app-term key="imbue" class="pill imb">
          <app-icon name="link" [size]="13" />
          {{ 'Imbue: усиливает 1 умение' | l: 'Imbue: boosts 1 ability' }}
        </app-term>
      }
    }
  `,
  host: { class: 'item-type' },
  styles: [
    `
      :host { display: contents; }
      :host .pill {
        display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
        font-size: var(--fs-xs); font-weight: 600; line-height: 1.4; white-space: nowrap;
        border: 1px solid var(--border-2); background: var(--bg-3); color: var(--text-2); text-decoration: none;
      }
      :host .pill:hover { border-color: var(--border-3); }
      :host .pill.act { color: var(--accent); border-color: var(--accent-line); background: var(--accent-bg); }
      :host .pill.imb { color: var(--spirit); border-color: rgba(157, 126, 227, 0.45); background: var(--spirit-bg); }
      .cd { opacity: 0.85; }
    `,
  ],
})
export class ItemType {
  readonly item = input<GameItem | null | undefined>(null);
  /** Longer labels that say what the type means (item page). */
  readonly long = input(false);
}
