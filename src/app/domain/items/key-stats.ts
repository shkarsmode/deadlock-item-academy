import type { GameItem, SectionKind, StatLine } from '../../core/game-data/game-data.model';

/**
 * A stat with the tooltip section it comes from. `innate` numbers always apply while you own the
 * item; `passive` and `other` numbers belong to the item's effect (its text says when they work);
 * `active` numbers work only after you press the item.
 */
export interface KeyStat extends StatLine {
  section: SectionKind;
}

/** How long a number applies, as shown on the chips. */
export type StatScope = 'always' | 'effect' | 'active';

export function statScope(section: SectionKind): StatScope {
  return section === 'innate' ? 'always' : section === 'active' ? 'active' : 'effect';
}

/** Every stat of the item once, with its section (first section wins for repeated props). */
export function itemStats(item: GameItem, skip: ReadonlySet<string> = new Set()): KeyStat[] {
  const seen = new Set<string>(skip);
  const out: KeyStat[] = [];
  for (const s of item.sections) {
    for (const st of s.stats) {
      if (seen.has(st.prop)) continue;
      seen.add(st.prop);
      out.push({ ...st, section: s.kind });
    }
  }
  return out;
}

/** Visual group of a stat, used to pick an icon. Derived from the client property name only. */
export type StatKind =
  | 'cooldown'
  | 'time'
  | 'range'
  | 'heal'
  | 'health'
  | 'barrier'
  | 'slow'
  | 'resist'
  | 'shred'
  | 'fire-rate'
  | 'ammo'
  | 'speed'
  | 'stamina'
  | 'charges'
  | 'spirit'
  | 'souls'
  | 'damage'
  | 'other';

const RULES: [RegExp, StatKind][] = [
  [/Gold|Souls/i, 'souls'],
  [/Cooldown/i, 'cooldown'],
  [/Duration|Delay|Time|ShootDurationForMax/i, 'time'],
  [/Range|Radius|Distance|Zoom/i, 'range'],
  [/Heal|Regen|Lifesteal|HealthSteal|Lifestrike/i, 'heal'],
  [/Health/i, 'health'],
  [/Barrier/i, 'barrier'],
  [/SlowResist/i, 'resist'],
  [/Slow/i, 'slow'],
  [/(Resist|Armor).*Reduction|Reduction.*(Resist|Armor)|TechPowerReduction/i, 'shred'],
  [/Resist|Armor|Deflection|Immunity/i, 'resist'],
  [/FireRate/i, 'fire-rate'],
  [/Clip|Ammo|Reload/i, 'ammo'],
  [/Speed|Sprint|Dash|Jump|AirMove|Slide/i, 'speed'],
  [/Stamina/i, 'stamina'],
  [/Charges/i, 'charges'],
  [/TechPower|SpiritPower|BonusSpirit/i, 'spirit'],
  [/Damage|DPS|WeaponPower|Amp|Proc/i, 'damage'],
];

export function statKind(prop: string): StatKind {
  for (const [re, kind] of RULES) if (re.test(prop)) return kind;
  return 'other';
}

/**
 * The few numbers that describe an item at a glance: the stats the client itself highlights in
 * the shop tooltip (`important`), then always-on bonuses, then the rest. Cooldown is left out
 * because the item type badge already shows it. Conditional stats come last.
 */
export function keyStats(item: GameItem, max = 4): KeyStat[] {
  const all = itemStats(item, new Set(['AbilityCooldown']));
  const picked = new Set<string>();
  const out: KeyStat[] = [];
  const take = (pred: (s: KeyStat) => boolean) => {
    for (const s of all) {
      if (out.length >= max) return;
      if (picked.has(s.prop) || !pred(s)) continue;
      picked.add(s.prop);
      out.push(s);
    }
  };
  take((s) => s.important && !s.conditional);
  take((s) => s.section === 'innate' && !s.conditional);
  take((s) => !s.conditional);
  take(() => true);
  return out;
}

/** `+28`, `60%`, `2m`: the value as the client shows it, with a sign for bonuses. */
export function formatStat(s: StatLine): string {
  const sign = s.signed && (s.value ?? 0) > 0 ? '+' : '';
  const unit = s.unit && !s.raw.endsWith(s.unit) ? s.unit : '';
  return `${sign}${s.raw}${unit}`;
}
