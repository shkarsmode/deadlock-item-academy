import type { GameItem } from '../../core/game-data/game-data.model';
import { formatStat, itemStats, type KeyStat } from './key-stats';

export interface StatCarry {
  stat: KeyStat;
  /** The component's value, as the client shows it. */
  from: string;
  /** The upgrade's value. */
  to: string;
  same: boolean;
}

/** What an upgrade lists compared with one of its components (both from client data). */
export interface ComponentDiff {
  /** Component stats the upgrade lists too (often with a bigger value). */
  kept: StatCarry[];
  /** Stats only the upgrade has, highlighted ones first. */
  added: KeyStat[];
  /** Component stats the upgrade does not list. */
  missing: KeyStat[];
}

const IGNORED = new Set(['AbilityCooldown']);

function statsOf(item: GameItem): KeyStat[] {
  return itemStats(item, IGNORED);
}

export function componentDiff(upgrade: GameItem, component: GameItem): ComponentDiff {
  const comp = statsOf(component);
  const up = statsOf(upgrade);
  const upByProp = new Map(up.map((s) => [s.prop, s]));
  const compProps = new Set(comp.map((s) => s.prop));
  const kept: StatCarry[] = [];
  const missing: KeyStat[] = [];
  for (const c of comp) {
    const u = upByProp.get(c.prop);
    if (!u) {
      missing.push(c);
      continue;
    }
    const from = formatStat(c);
    const to = formatStat(u);
    kept.push({ stat: u, from, to, same: from === to });
  }
  const added = up.filter((s) => !compProps.has(s.prop)).sort((a, b) => Number(b.important) - Number(a.important));
  return { kept, added, missing };
}

/** How many component -> upgrade pairs repeat every stat of the component (shown as evidence). */
export function carryStats(items: readonly GameItem[]): { full: number; total: number } {
  const map = new Map(items.map((i) => [i.key, i]));
  let full = 0;
  let total = 0;
  for (const it of items) {
    if (it.mode !== 'standard') continue;
    for (const k of it.components) {
      const c = map.get(k);
      if (!c || !statsOf(c).length) continue;
      total++;
      if (!componentDiff(it, c).missing.length) full++;
    }
  }
  return { full, total };
}
