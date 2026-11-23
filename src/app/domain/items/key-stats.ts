import type { GameItem, StatLine } from '../../core/game-data/game-data.model';

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
export function keyStats(item: GameItem, max = 4): StatLine[] {
  const all = item.sections.flatMap((s) => s.stats.map((st) => ({ st, innate: s.kind === 'innate' })));
  const seen = new Set<string>(['AbilityCooldown']);
  const out: StatLine[] = [];
  const take = (pred: (x: { st: StatLine; innate: boolean }) => boolean) => {
    for (const x of all) {
      if (out.length >= max) return;
      if (seen.has(x.st.prop) || !pred(x)) continue;
      seen.add(x.st.prop);
      out.push(x.st);
    }
  };
  take((x) => x.st.important && !x.st.conditional);
  take((x) => x.innate && !x.st.conditional);
  take((x) => !x.st.conditional);
  take(() => true);
  return out;
}

/** `+28`, `60%`, `2m`: the value as the client shows it, with a sign for bonuses. */
export function formatStat(s: StatLine): string {
  const sign = s.signed && (s.value ?? 0) > 0 ? '+' : '';
  const unit = s.unit && !s.raw.endsWith(s.unit) ? s.unit : '';
  return `${sign}${s.raw}${unit}`;
}
