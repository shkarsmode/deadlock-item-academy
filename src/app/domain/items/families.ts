import type { GameItem, Slot } from '../../core/game-data/game-data.model';

export interface FamilyNode {
  item: GameItem;
  /** Souls to pay when every component is already owned (the components' cost counts). */
  topUp: number | null;
  /** Other components of this item outside this chain (for items built from two items). */
  alsoFrom: string[];
  children: FamilyNode[];
}

export interface ItemFamily {
  /** Key of the item the chain starts from (it has no components). */
  root: string;
  tree: FamilyNode;
  /** Categories of all members: a chain can cross categories (Extra Stamina -> Arcane Surge). */
  slots: Slot[];
  /** All member keys, root first. */
  keys: string[];
  /** Number of levels (root alone is 1). */
  depth: number;
}

export interface UpgradeMap {
  families: ItemFamily[];
  /** Items that neither build from anything nor upgrade into anything. */
  standalone: GameItem[];
}

const bySortOrder = (a: GameItem, b: GameItem) => a.tier - b.tier || a.cost - b.cost || a.name.en.localeCompare(b.name.en);

/** Upgrade chains of the standard shop, built only from `components` / `upgradesInto` in client data. */
export function buildUpgradeMap(all: readonly GameItem[]): UpgradeMap {
  const items = all.filter((i) => i.mode === 'standard');
  const map = new Map(items.map((i) => [i.key, i]));

  const node = (item: GameItem, parent: GameItem | null, depth: number): FamilyNode => {
    const comps = item.components.map((k) => map.get(k)).filter((x): x is GameItem => !!x);
    const topUp = comps.length ? Math.max(0, item.cost - comps.reduce((n, c) => n + c.cost, 0)) : null;
    const children =
      depth >= 4
        ? []
        : item.upgradesInto
            .map((k) => map.get(k))
            .filter((x): x is GameItem => !!x)
            .sort(bySortOrder)
            .map((c) => node(c, item, depth + 1));
    return { item, topUp, alsoFrom: comps.filter((c) => c.key !== parent?.key).map((c) => c.key), children };
  };

  const families: ItemFamily[] = items
    .filter((i) => !i.components.some((k) => map.has(k)) && i.upgradesInto.some((k) => map.has(k)))
    .sort(bySortOrder)
    .map((root) => {
      const tree = node(root, null, 0);
      const keys: string[] = [];
      let depth = 0;
      const walk = (n: FamilyNode, level: number) => {
        if (!keys.includes(n.item.key)) keys.push(n.item.key);
        depth = Math.max(depth, level);
        n.children.forEach((c) => walk(c, level + 1));
      };
      walk(tree, 1);
      const slots = [...new Set(keys.map((k) => map.get(k)?.slot).filter((s): s is Slot => !!s))];
      return { root: root.key, tree, slots, keys, depth };
    });

  const inFamily = new Set(families.flatMap((f) => f.keys));
  const standalone = items.filter((i) => !inFamily.has(i.key)).sort(bySortOrder);
  return { families, standalone };
}
