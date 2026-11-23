import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { GameItem } from '../../core/game-data/game-data.model';
import { I18n } from '../../core/i18n/i18n';
import { formatStat, keyStats, statKind, statScope, type KeyStat, type StatKind, type StatScope } from '../../domain/items/key-stats';
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

/** Short tag and hint for how long a number applies (from the tooltip section it is in). */
export const SCOPE_LABELS: Record<StatScope, { ru: string; en: string; hintRu: string; hintEn: string }> = {
  always: {
    ru: 'всегда',
    en: 'always',
    hintRu: 'Постоянный бонус: действует всё время, пока предмет у тебя (раздел Innate в подсказке игры).',
    hintEn: 'Always on while you own the item (the Innate part of the game tooltip).',
  },
  effect: {
    ru: 'эффект',
    en: 'effect',
    hintRu: 'Цифра из пассивного эффекта: когда она работает, сказано в описании предмета.',
    hintEn: 'Part of the passive effect: the item text says when it applies.',
  },
  active: {
    ru: 'активка',
    en: 'active',
    hintRu: 'Работает только после того, как нажмёшь предмет.',
    hintEn: 'Works only after you press the item.',
  },
};

/**
 * The item's key numbers as chips: icon, value, label, and a tag that says whether the number
 * always applies, belongs to the item's effect, or needs the item to be pressed.
 */
@Component({
  selector: 'app-key-stats',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon],
  template: `
    @for (s of shown(); track s.prop) {
      <div class="ks" [class.cond]="s.conditional" [attr.title]="hint(s)">
        <app-icon class="ic" [name]="icon(s)" [size]="compact() ? 13 : 15" />
        <b class="v num">{{ fmt(s) }}</b>
        @if (tags()) {
          <span [class]="'sc sc-' + scope(s)">{{ tag(s) }}</span>
        }
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
        display: inline-flex; flex-wrap: wrap; align-items: baseline; gap: 2px 6px; min-width: 0; max-width: 100%;
        padding: 6px 10px; border-radius: var(--r-md); background: var(--bg-3); border: 1px solid var(--border);
      }
      .ic { color: var(--ks-ic); align-self: center; }
      .v { font-size: var(--fs-lg); font-weight: 700; color: var(--text); white-space: nowrap; }
      /* The label moves to its own line rather than being squeezed letter by letter. */
      .l { flex: 1 1 8em; min-width: 0; font-size: var(--fs-sm); color: var(--text-2); overflow-wrap: break-word; }
      .cond { border-style: dashed; }
      .sc {
        align-self: center; flex: none; padding: 1px 6px; border-radius: 999px; white-space: nowrap;
        font-size: 10px; font-weight: 650; line-height: 1.5; letter-spacing: 0.02em;
        color: var(--text-3); background: var(--bg-2); border: 1px solid var(--border);
      }
      .sc-effect { color: var(--warn); background: var(--warn-bg); border-color: rgba(217, 164, 65, 0.35); }
      .sc-active { color: var(--accent); background: var(--accent-bg); border-color: var(--accent-line); }
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
  readonly stats = input<KeyStat[] | null>(null);
  /** Show the always / effect / active tag on every chip. */
  readonly tags = input(true);
  protected readonly shown = computed(() => {
    const given = this.stats();
    if (given) return given.slice(0, this.max());
    const it = this.item();
    return it ? keyStats(it, this.max()) : [];
  });

  protected icon(s: KeyStat): IconName {
    return KIND_ICON[statKind(s.prop)];
  }

  protected fmt(s: KeyStat): string {
    return formatStat(s);
  }

  protected scope(s: KeyStat): StatScope {
    return statScope(s.section);
  }

  protected tag(s: KeyStat): string {
    const l = SCOPE_LABELS[statScope(s.section)];
    return this.i18n.l(l.ru, l.en);
  }

  protected hint(s: KeyStat): string {
    const l = SCOPE_LABELS[statScope(s.section)];
    return this.i18n.l(l.hintRu, l.hintEn);
  }
}
