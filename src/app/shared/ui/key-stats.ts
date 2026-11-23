import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { GameItem, StatLine } from '../../core/game-data/game-data.model';
import { I18n } from '../../core/i18n/i18n';
import { formatStat, keyStats, statKind, type StatKind } from '../../domain/items/key-stats';
import { Icon, type IconName } from './icon';

const KIND_ICON: Record<StatKind, IconName> = {
  cooldown: 'hourglass',
  time: 'timer',
  range: 'ruler',
  heal: 'heart-pulse',
  health: 'heart',
  barrier: 'shield',
  slow: 'snail',
  resist: 'shield',
  shred: 'shield-off',
  'fire-rate': 'zap',
  ammo: 'layers',
  speed: 'footprints',
  stamina: 'wind',
  charges: 'battery',
  spirit: 'sparkles',
  souls: 'coins',
  damage: 'flame',
  other: 'gem',
};

/** The item's key numbers as chips: icon, value, label. Values and labels come from client data. */
@Component({
  selector: 'app-key-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @for (s of shown(); track s.prop) {
      <div class="ks" [class.cond]="s.conditional">
        <app-icon class="ic" [name]="icon(s)" [size]="compact() ? 13 : 15" />
        <b class="v num">{{ fmt(s) }}</b>
        <span class="l">{{ i18n.game(s.label) }}</span>
      </div>
    }
  `,
  host: {
    class: 'key-stats',
    '[class.compact]': 'compact()',
    '[class.weapon]': "item()?.slot === 'weapon'",
    '[class.vitality]': "item()?.slot === 'vitality'",
    '[class.spirit]': "item()?.slot === 'spirit'",
  },
  styles: [
    `
      :host { display: flex; flex-wrap: wrap; gap: 6px; --ks-ic: var(--accent); }
      :host(.weapon) { --ks-ic: var(--weapon); }
      :host(.vitality) { --ks-ic: var(--vitality); }
      :host(.spirit) { --ks-ic: var(--spirit); }
      :host:empty { display: none; }
      .ks {
        display: inline-flex; align-items: baseline; gap: 6px; min-width: 0; max-width: 100%;
        padding: 6px 10px; border-radius: var(--r-md); background: var(--bg-3); border: 1px solid var(--border);
      }
      .ic { color: var(--ks-ic); align-self: center; }
      .v { font-size: var(--fs-lg); font-weight: 700; color: var(--text); white-space: nowrap; }
      .l { font-size: var(--fs-sm); color: var(--text-2); overflow-wrap: anywhere; }
      .cond { border-style: dashed; }
      :host(.compact) { gap: 4px; }
      :host(.compact) .ks { padding: 4px 8px; gap: 5px; }
      :host(.compact) .v { font-size: var(--fs-md); }
      :host(.compact) .l { font-size: var(--fs-xs); }
    `,
  ],
})
export class KeyStats {
  protected readonly i18n = inject(I18n);
  readonly item = input<GameItem | null | undefined>(null);
  readonly max = input(4);
  readonly compact = input(false);
  /** Show these stats instead of the item's key numbers (the item still sets the color). */
  readonly stats = input<StatLine[] | null>(null);
  protected readonly shown = computed(() => {
    const given = this.stats();
    if (given) return given.slice(0, this.max());
    const it = this.item();
    return it ? keyStats(it, this.max()) : [];
  });

  protected icon(s: StatLine): IconName {
    return KIND_ICON[statKind(s.prop)];
  }

  protected fmt(s: StatLine): string {
    return formatStat(s);
  }
}
