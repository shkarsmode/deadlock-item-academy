/**
 * Normalized game data model.
 *
 * Produced by `normalize.ts` from the public Deadlock API (api.deadlock-api.com),
 * both at build time (scripts/sync-game-data.ts) and at runtime (in-app update check).
 * Everything here is derived from official client data - no hand-written mechanics.
 *
 * Keep this file "erasable TypeScript" (no enums, namespaces or parameter properties):
 * Node runs the sync script with native type stripping.
 */

export type Slot = 'weapon' | 'vitality' | 'spirit';
export type Activation = 'passive' | 'press' | 'instant_cast' | 'instant_cast_toggle';
export type ImbueKind = 'imbue_modifier_value' | 'imbue_active' | 'imbue_active_non_ult';
export type ItemMode = 'standard' | 'street_brawl';
export type SectionKind = 'innate' | 'passive' | 'active' | 'other';

/** Text in both supported languages. `ru` falls back to `en` when the client has no translation. */
export interface L10n {
  en: string;
  ru: string;
}

export interface StatLine {
  /** Property id from the client, e.g. `BonusFireRate`. Stable across languages. */
  prop: string;
  label: L10n;
  /** Parsed numeric value (null when the raw value is not numeric). */
  value: number | null;
  /** Raw value string as published by the client. */
  raw: string;
  /** Display unit: '%', 's', 'm' or ''. */
  unit: string;
  /** Show an explicit +/- sign (client `{s:sign}` prefix). */
  signed: boolean;
  /** Client marks this as a downside (shown in red in game). */
  negative: boolean;
  /** Bonus that only applies under a condition. */
  conditional: boolean;
  /** Client highlights this stat (elevated / important). */
  important: boolean;
}

export interface TooltipSection {
  kind: SectionKind;
  /** Effect description. Highlighted fragments are wrapped in `**`. */
  text: L10n | null;
  stats: StatLine[];
}

export interface GameItem {
  /** Stable id: client class name, e.g. `upgrade_magic_tempo`. Never changes when the item is renamed. */
  key: string;
  /** Numeric client id (hash). Used by builds and match data. */
  id: number;
  name: L10n;
  slot: Slot;
  tier: number;
  cost: number;
  /** `street_brawl` = Tier 5 legendary items that only exist in the Street Brawl mode. */
  mode: ItemMode;
  activation: Activation;
  isActive: boolean;
  imbue: ImbueKind | null;
  cooldown: number | null;
  duration: number | null;
  castRange: number | null;
  charges: number | null;
  /** Item keys this item is built from (component is consumed, its cost counts). */
  components: string[];
  /** Item keys that use this item as a component (computed). */
  upgradesInto: string[];
  /** Official shop grouping (e.g. `EMagazines`), null if the client does not group it. */
  shopGroup: string | null;
  /** Official shop filter tags (e.g. `anti_cc`). */
  filters: string[];
  /** Tier 3+ items can be corrupted at The Broker (randomized bonus + downside per match). */
  corruptible: boolean;
  sections: TooltipSection[];
  /** Plain-text summary of the effect (passive + active text, no stats). */
  summary: L10n;
  /** Local icon path (relative to the app root) - illustrated shop art. */
  icon: string;
  /** Original CDN icon URL (fallback when the local file is missing). */
  iconRemote: string;
  /** Hash of all mechanical data. Changes when the client changes the item. */
  hash: string;
}

export interface AbilityData {
  key: string;
  id: number;
  /** 1-3 = regular abilities, 4 = ultimate. */
  slot: number;
  isUltimate: boolean;
  name: L10n;
  quip: L10n | null;
  description: L10n;
  /** Ability point upgrades T1..T3 (index 0..2). */
  upgrades: (L10n | null)[];
  cooldown: number | null;
  charges: number | null;
  duration: number | null;
  castRange: number | null;
  behaviours: string[];
  /** Damage types found in the ability properties. */
  damageTypes: ('spirit' | 'weapon')[];
  /** Status effects found in the ability properties (derived from property ids). */
  effects: string[];
  icon: string;
  iconRemote: string;
  hash: string;
}

export interface WeaponData {
  name: L10n;
  bulletDamage: number | null;
  clipSize: number | null;
  reloadSeconds: number | null;
  /** Damage falloff range in meters [start, end]. */
  falloffMeters: [number, number] | null;
  bulletsPerShot: number | null;
  attributes: string[];
}

export interface PopularItemStat {
  itemKey: string;
  pickPct: number;
  winratePct: number;
}

export interface HeroData {
  key: string;
  id: number;
  name: L10n;
  heroType: string | null;
  tags: string[];
  role: L10n | null;
  playstyle: L10n | null;
  complexity: number | null;
  /** In development / Hero Labs hero. */
  isLabs: boolean;
  icon: string;
  iconRemote: string;
  weapon: WeaponData | null;
  abilities: AbilityData[];
  /** Client-published popularity stats (statistics, not recommendations). */
  popular: {
    timestamp: number | null;
    early: PopularItemStat[];
    mid: PopularItemStat[];
    late: PopularItemStat[];
  };
  hash: string;
}

export interface InvestmentStep {
  /** Souls spent in the category. */
  threshold: number;
  /** Weapon: +% weapon damage, Vitality: +% health, Spirit: +spirit power. */
  bonus: number;
}

export interface ShopGroup {
  key: string;
  slot: Slot;
  items: string[];
}

export interface PatchNote {
  title: string;
  date: string;
  url: string;
}

export interface GameMeta {
  schema: number;
  clientVersion: number;
  versionDate: string | null;
  fetchedAt: string;
  sources: string[];
  counts: { items: number; standardItems: number; heroes: number };
  priceTiers: number[];
  investment: Record<Slot, InvestmentStep[]>;
  shopGroups: ShopGroup[];
  itemHashes: Record<string, string>;
  heroHashes: Record<string, string>;
  patches: PatchNote[];
}

export interface GameDataBundle {
  meta: GameMeta;
  items: GameItem[];
  heroes: HeroData[];
}

export interface ItemChange {
  key: string;
  name: string;
  kind: 'added' | 'removed' | 'changed';
  fields: string[];
}

export interface GameDataDiff {
  fromVersion: number | null;
  toVersion: number;
  items: ItemChange[];
  heroes: { key: string; name: string; kind: 'added' | 'removed' | 'changed' }[];
}
