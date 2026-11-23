/**
 * Pure normalizer: raw Deadlock API payloads -> GameDataBundle.
 *
 * Shared by the Node sync script (scripts/sync-game-data.ts, run with native type stripping)
 * and by the in-app "check for game data updates" flow. It must stay dependency free and
 * only use `import type` (erased at runtime by Node).
 */
import type {
  AbilityData,
  Activation,
  GameDataBundle,
  GameDataDiff,
  GameItem,
  GameMeta,
  HeroData,
  ImbueKind,
  InvestmentStep,
  ItemChange,
  L10n,
  PatchNote,
  PopularItemStat,
  SectionKind,
  ShopGroup,
  Slot,
  StatLine,
  TooltipSection,
  WeaponData,
} from './game-data.model';

export const GAME_DATA_SCHEMA = 1;
export const SOURCE_URLS = [
  'https://api.deadlock-api.com/v1/assets/items',
  'https://api.deadlock-api.com/v1/assets/items?language=russian',
  'https://api.deadlock-api.com/v1/assets/heroes',
  'https://api.deadlock-api.com/v1/assets/heroes?language=russian',
  'https://api.deadlock-api.com/v1/assets/generic-data',
  'https://api.deadlock-api.com/v1/assets/steam-info',
  'https://api.deadlock-api.com/v2/patches',
];

/* ------------------------------------------------------------------ raw shapes */

interface RawProperty {
  value?: string | number;
  label?: string;
  postfix?: string;
  prefix?: string;
  css_class?: string;
  disable_value?: string | number;
  negative_attribute?: boolean;
  conditional?: boolean | string;
  tooltip_is_elevated?: boolean;
  tooltip_is_important?: boolean;
}

interface RawSectionAttr {
  loc_string?: string;
  properties?: string[];
  elevated_properties?: string[];
  important_properties?: string[];
  important_properties_with_icon?: string[];
}

interface RawSection {
  section_type?: string;
  section_attributes?: RawSectionAttr[];
}

export interface RawItem {
  type: string;
  id: number;
  class_name: string;
  name?: string;
  shopable?: boolean;
  disabled?: boolean;
  image?: string;
  image_webp?: string;
  shop_image?: string;
  shop_image_webp?: string;
  item_slot_type?: string;
  item_tier?: number;
  cost?: number;
  activation?: string;
  is_active_item?: boolean;
  imbue?: string;
  component_items?: string[];
  shop_filters?: string[];
  corrupted_info?: unknown;
  properties?: Record<string, RawProperty | null>;
  description?: Record<string, string | null | undefined>;
  tooltip_sections?: RawSection[];
  ability_type?: string;
  behaviours?: string[];
  weapon_info?: Record<string, unknown>;
  upgrades?: { property_upgrades?: { name: string; bonus: string | number; upgrade_type?: string }[] }[];
}

interface RawPopularEntry {
  class_name?: string;
  item_id?: number;
  pick_pct?: number;
  winrate_pct?: number;
}

export interface RawHero {
  id: number;
  class_name: string;
  name: string;
  player_selectable?: boolean;
  disabled?: boolean;
  in_development?: boolean;
  tags?: string[];
  hero_type?: string | null;
  complexity?: number | null;
  description?: { role?: string | null; playstyle?: string | null };
  images?: Record<string, string | undefined>;
  items?: Record<string, string>;
  cost_bonuses?: Record<string, { gold_threshold: number; bonus: number }[]>;
  shop_stat_display?: { weapon_stats_display?: { weapon_attributes?: string[] } };
  popular_items?: {
    timestamp?: number;
    early_game?: RawPopularEntry[];
    mid_game?: RawPopularEntry[];
    late_game?: RawPopularEntry[];
  };
}

export interface RawGeneric {
  item_price_per_tier?: number[];
  weapon_groups?: { shop_group: string; upgrades: string[] }[];
  armor_groups?: { shop_group: string; upgrades: string[] }[];
  spirit_groups?: { shop_group: string; upgrades: string[] }[];
}

export interface RawSteamInfo {
  client_version?: number;
  version_datetime?: string;
}

export interface RawPatch {
  title?: string;
  pub_date?: string;
  link?: string;
}

export interface RawInputs {
  itemsEn: RawItem[];
  itemsRu: RawItem[];
  heroesEn: RawHero[];
  heroesRu: RawHero[];
  generic: RawGeneric;
  steamInfo: RawSteamInfo;
  patches: RawPatch[];
  /** ISO timestamp to stamp into meta (injected for deterministic tests). */
  fetchedAt: string;
  /**
   * Optional localization tokens read from a local game install
   * (game/citadel/resource/localization/citadel_heroes/*.txt). Used to fill ability
   * descriptions the API omits (the client splits some of them into desc_1/desc_2).
   */
  clientLoc?: { en: Record<string, string>; ru: Record<string, string> };
}

/** Parses a Valve localization file (`"key" "value"` pairs) into a map. */
export function parseValveLocalization(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const unescape = (v: string) => v.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line)) continue;
    // Line-based: `"key"<ws>"value..."` where the value runs to the last quote on the line.
    const m = line.match(/^\s*"([^"]+)"\s*"(.*)$/);
    if (!m) continue;
    const key = m[1];
    let rest = m[2];
    // Multi-line values: accumulate until a line ends with an unescaped quote.
    while (!/(^|[^\\])"\s*(\/\/.*)?$/.test(rest) && i + 1 < lines.length) {
      i++;
      rest += '\n' + lines[i];
    }
    const end = rest.search(/(?<!\\)"\s*(\/\/.*)?$/);
    const value = end >= 0 ? rest.slice(0, end) : rest;
    if (key === 'Language') continue;
    out[key] = unescape(value);
  }
  return out;
}

/** Replaces client `{g:citadel_inline_attribute:'X'}` / `{s:X}` tokens with property labels / values. */
function resolveLocTokens(s: string, props: Record<string, RawProperty | null> | undefined): string {
  return s
    .replace(/\{g:citadel_inline_attribute:'([^']+)'\}/g, (_m, name: string) => {
      const label = props?.[name]?.label;
      return `<span class="highlight">${label ?? name.replace(/([a-z])([A-Z])/g, '$1 $2')}</span>`;
    })
    .replace(/\{s:([A-Za-z0-9_]+)\}/g, (_m, name: string) => {
      const v = props?.[name]?.value;
      return v === undefined || v === null ? '' : String(v).replace(/m$/, '');
    })
    .replace(/\{[a-z]:[^}]*\}/g, '');
}

function clientDescription(
  loc: Record<string, string> | undefined,
  cls: string,
  props: Record<string, RawProperty | null> | undefined,
): string {
  if (!loc) return '';
  const direct = loc[`${cls}_desc`];
  const variants = [
    '_desc_1',
    '_desc_2',
    '_desc_3',
    '_desc_4',
    '_passive_desc',
    '_desc_passive',
    '_active_desc',
    '_desc_active',
    '_desc_active_alt',
    '_passive_desc_footer',
  ];
  const parts = direct ? [direct] : variants.map((v) => loc[`${cls}${v}`]).filter((x): x is string => !!x);
  return parts.map((p) => cleanGameText(resolveLocTokens(p, props))).filter(Boolean).join('\n');
}

/* ------------------------------------------------------------------ helpers */

/** cyrb53: small, fast, deterministic string hash (53-bit), identical in Node and browsers. */
export function hashString(input: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&#039;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

/**
 * Converts client tooltip markup into plain text with `**highlight**` markers.
 * Inline SVG icons are dropped, attribute labels and highlights become emphasis.
 */
export function cleanGameText(html: string | null | undefined, keepEmphasis = true): string {
  if (!html) return '';
  const src = String(html).replace(/<svg[\s\S]*?<\/svg>/gi, '');
  // Tokenize into tags and text, track emphasis depth with a tag stack so nested
  // highlight / inline-attribute spans produce exactly one `**...**` run.
  const tokens = src.match(/<[^>]*>|[^<]+/g) ?? [];
  const stack: { tag: string; emph: boolean }[] = [];
  let depth = 0;
  // Collect runs of text with an emphasis flag; '\n' runs come from <br>.
  const runs: { text: string; emph: boolean }[] = [];
  for (const tok of tokens) {
    if (tok.startsWith('<')) {
      const m = tok.match(/^<\s*(\/)?\s*([a-zA-Z0-9]+)([^>]*)>$/);
      if (!m) continue;
      const closing = !!m[1];
      const tag = m[2].toLowerCase();
      const attrs = m[3] ?? '';
      if (tag === 'br') {
        runs.push({ text: '\n', emph: false });
        continue;
      }
      if (attrs.trim().endsWith('/')) continue; // self-closing, e.g. <img/>
      if (!closing) {
        const emph = tag === 'span' && /highlight|inline-attribute|InlineAttribute/i.test(attrs);
        stack.push({ tag, emph });
        if (emph) depth++;
      } else {
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].tag === tag) {
            const [removed] = stack.splice(i, 1);
            if (removed.emph) depth--;
            break;
          }
        }
      }
      continue;
    }
    const text = tok.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e.toLowerCase()] ?? e);
    // Text nodes may carry raw newlines; treat them as plain whitespace (the client uses <br> for breaks).
    runs.push({ text: text.replace(/[\r\n\t]+/g, ' '), emph: depth > 0 && keepEmphasis });
  }
  // Merge adjacent runs with the same flag.
  const merged: { text: string; emph: boolean }[] = [];
  for (const r of runs) {
    const last = merged[merged.length - 1];
    if (last && last.emph === r.emph && r.text !== '\n' && last.text !== '\n') last.text += r.text;
    else merged.push({ ...r });
  }
  let s = '';
  for (const r of merged) {
    if (!r.emph || !r.text.trim()) {
      s += r.text;
      continue;
    }
    const lead = r.text.match(/^\s*/)?.[0] ?? '';
    const trail = r.text.match(/\s*$/)?.[0] ?? '';
    s += `${lead}**${r.text.trim()}**${trail}`;
  }
  s = s.replace(/[ \t\r\f\v]+/g, ' ');
  s = s.replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  s = s.replace(/ ([,.;:!?])/g, '$1');
  return s.trim();
}

export function stripEmphasis(text: string): string {
  return text.replace(/\*\*/g, '');
}

function l10n(en: string | null | undefined, ru: string | null | undefined): L10n {
  const e = en ?? '';
  return { en: e, ru: ru && ru.trim() ? ru : e };
}

function parseNumber(raw: string | number | undefined | null): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const m = String(raw).trim().match(/^[-+]?\d*\.?\d+/);
  if (!m) return null;
  const v = Number(m[0]);
  return Number.isFinite(v) ? v : null;
}

function positive(raw: string | number | undefined | null): number | null {
  const v = parseNumber(raw);
  return v !== null && v > 0 ? v : null;
}

function normSlot(s: string | undefined): Slot | null {
  return s === 'weapon' || s === 'vitality' || s === 'spirit' ? s : null;
}

function normActivation(a: string | undefined): Activation {
  return a === 'press' || a === 'instant_cast' || a === 'instant_cast_toggle' ? a : 'passive';
}

function normImbue(i: string | undefined): ImbueKind | null {
  return i === 'imbue_modifier_value' || i === 'imbue_active' || i === 'imbue_active_non_ult' ? i : null;
}

function normSectionKind(k: string | undefined): SectionKind {
  return k === 'innate' || k === 'passive' || k === 'active' ? k : 'other';
}

function isHidden(p: RawProperty): boolean {
  const raw = p.value;
  if (raw === undefined || raw === null || String(raw).trim() === '') return true;
  if (p.disable_value !== undefined && String(p.disable_value) === String(raw)) return true;
  const v = parseNumber(raw);
  return v === 0;
}

function statLine(
  prop: string,
  en: RawProperty,
  ru: RawProperty | null | undefined,
  important: boolean,
): StatLine | null {
  if (!en.label || isHidden(en)) return null;
  const raw = String(en.value);
  const unit = (en.postfix ?? '').trim();
  return {
    prop,
    label: l10n(en.label, ru?.label),
    value: parseNumber(raw),
    raw,
    unit: unit === '%' || unit === 's' || unit === 'm' ? unit : '',
    signed: (en.prefix ?? '').includes('sign'),
    negative: en.negative_attribute === true,
    conditional: en.conditional === true || en.conditional === 'true',
    important: important || en.tooltip_is_elevated === true || en.tooltip_is_important === true,
  };
}

function buildSections(en: RawItem, ru: RawItem | undefined): TooltipSection[] {
  const sections: TooltipSection[] = [];
  const enProps = en.properties ?? {};
  const ruProps = ru?.properties ?? {};
  const ruSections = ru?.tooltip_sections ?? [];
  (en.tooltip_sections ?? []).forEach((sec, si) => {
    const ruSec = ruSections[si];
    const texts: string[] = [];
    const ruTexts: string[] = [];
    const seen = new Set<string>();
    const stats: StatLine[] = [];
    (sec.section_attributes ?? []).forEach((attr, ai) => {
      const ruAttr = ruSec?.section_attributes?.[ai];
      if (attr.loc_string) {
        texts.push(cleanGameText(attr.loc_string));
        ruTexts.push(cleanGameText(ruAttr?.loc_string ?? attr.loc_string));
      }
      const importantSet = new Set([
        ...(attr.elevated_properties ?? []),
        ...(attr.important_properties ?? []),
        ...(attr.important_properties_with_icon ?? []),
      ]);
      const order = [
        ...(attr.properties ?? []),
        ...(attr.elevated_properties ?? []),
        ...(attr.important_properties ?? []),
        ...(attr.important_properties_with_icon ?? []),
      ];
      for (const prop of order) {
        if (seen.has(prop)) continue;
        seen.add(prop);
        const p = enProps[prop];
        if (!p) continue;
        const line = statLine(prop, p, ruProps[prop], importantSet.has(prop));
        if (line) stats.push(line);
      }
    });
    const text = texts.filter(Boolean).join('\n');
    const ruText = ruTexts.filter(Boolean).join('\n');
    if (!text && stats.length === 0) return;
    sections.push({
      kind: normSectionKind(sec.section_type),
      text: text ? l10n(text, ruText) : null,
      stats,
    });
  });
  // Some items keep part of their text only in `description` (active/passive keys).
  const hasText = sections.some((s) => s.text);
  if (!hasText) {
    const d = en.description ?? {};
    const rd = ru?.description ?? {};
    for (const k of ['passive', 'active', 'desc', 'desc2'] as const) {
      const t = cleanGameText(d[k]);
      if (t) {
        sections.push({
          kind: k === 'active' ? 'active' : k === 'passive' ? 'passive' : 'other',
          text: l10n(t, cleanGameText(rd[k] ?? d[k])),
          stats: [],
        });
      }
    }
  }
  return sections;
}

function summaryOf(en: RawItem, ru: RawItem | undefined): L10n {
  const pick = (it: RawItem | undefined): string => {
    const d = it?.description ?? {};
    const parts = [d['desc'], d['desc2'], d['passive'], d['active']].map((x) => stripEmphasis(cleanGameText(x)));
    const uniq: string[] = [];
    for (const p of parts) if (p && !uniq.includes(p)) uniq.push(p);
    return uniq.join('\n');
  };
  return l10n(pick(en), pick(ru));
}

function propValue(it: RawItem, name: string): number | null {
  const p = it.properties?.[name];
  return p ? positive(p.value) : null;
}

const EFFECT_PATTERNS: [RegExp, string][] = [
  [/slow/i, 'slow'],
  [/stun/i, 'stun'],
  [/immobil|root|tether|chain(duration|length)/i, 'immobilize'],
  [/silence/i, 'silence'],
  [/sleep/i, 'sleep'],
  [/disarm/i, 'disarm'],
  [/healamp.*penalty|healreduction|antiheal/i, 'anti-heal'],
  [/bulletresistreduction|bulletarmorreduction/i, 'bullet-resist-shred'],
  [/techarmordamagereduction|techresistreduction|spiritresistreduction/i, 'spirit-resist-shred'],
  [/lifesteal|^heal(?!th)|[a-z]heal(?!th|amp)/i, 'heal'],
  [/barrier|shield/i, 'barrier'],
  [/invis|stealth/i, 'stealth'],
  [/knockup|knockback|pull/i, 'displace'],
];

/** Ability point upgrades that the client only defines as property bonuses (no text). */
function upgradeTextFromProps(a: RawItem, aRu: RawItem | undefined, tier: number): L10n | null {
  const ups = a.upgrades?.[tier - 1]?.property_upgrades ?? [];
  if (!ups.length) return null;
  const fmt = (props: Record<string, RawProperty | null> | undefined, lang: 'en' | 'ru'): string =>
    ups
      .map((u) => {
        const p = props?.[u.name] ?? a.properties?.[u.name] ?? null;
        const label = p?.label ?? u.name.replace(/([a-z])([A-Z])/g, '$1 $2');
        const raw = String(u.bonus);
        const num = parseNumber(raw);
        const unit = (p?.postfix ?? '').trim();
        const sign = num !== null && num > 0 ? '+' : '';
        const value = `${sign}${raw.replace(/[a-z]+$/i, '')}${unit === '%' || unit === 's' || unit === 'm' ? unit : ''}`;
        const scale = u.upgrade_type === 'EAddToScale' ? (lang === 'ru' ? ' (к масштабированию)' : ' (scaling)') : '';
        return `**${value}** ${label}${scale}`;
      })
      .join('\n');
  return l10n(fmt(a.properties, 'en'), fmt(aRu?.properties, 'ru'));
}

function abilityEffects(a: RawItem): string[] {
  const found = new Set<string>();
  for (const [name, p] of Object.entries(a.properties ?? {})) {
    if (!p || isHidden(p)) continue;
    for (const [re, tag] of EFFECT_PATTERNS) if (re.test(name)) found.add(tag);
  }
  return [...found].sort();
}

function abilityDamageTypes(a: RawItem): ('spirit' | 'weapon')[] {
  const types = new Set<'spirit' | 'weapon'>();
  for (const p of Object.values(a.properties ?? {})) {
    if (!p || isHidden(p)) continue;
    if (p.css_class === 'tech_damage') types.add('spirit');
    if (p.css_class === 'bullet_damage') types.add('weapon');
  }
  return [...types].sort();
}

const UNITS_PER_METER = 39.37;

function weaponOf(w: RawItem | undefined, wRu: RawItem | undefined, attrs: string[]): WeaponData | null {
  if (!w) return null;
  const info = (w.weapon_info ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null => {
    const v = info[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const fs = num('damage_falloff_start_range');
  const fe = num('damage_falloff_end_range');
  return {
    name: l10n(w.name, wRu?.name),
    bulletDamage: num('bullet_damage'),
    clipSize: num('clip_size'),
    reloadSeconds: num('reload_duration'),
    falloffMeters:
      fs !== null && fe !== null
        ? [Math.round((fs / UNITS_PER_METER) * 10) / 10, Math.round((fe / UNITS_PER_METER) * 10) / 10]
        : null,
    bulletsPerShot: num('bullets'),
    attributes: attrs.map((a) => a.replace(/^EWeaponAttribute_/, '')),
  };
}

/* ------------------------------------------------------------------ main */

export function normalizeGameData(input: RawInputs): GameDataBundle {
  const ruItems = new Map(input.itemsRu.map((i) => [i.class_name, i]));
  const allEn = new Map(input.itemsEn.map((i) => [i.class_name, i]));

  const groupOf = new Map<string, string>();
  const shopGroups: ShopGroup[] = [];
  const groupSources: [Slot, { shop_group: string; upgrades: string[] }[] | undefined][] = [
    ['weapon', input.generic.weapon_groups],
    ['vitality', input.generic.armor_groups],
    ['spirit', input.generic.spirit_groups],
  ];
  for (const [slot, groups] of groupSources) {
    for (const g of groups ?? []) {
      shopGroups.push({ key: g.shop_group, slot, items: [...g.upgrades] });
      for (const u of g.upgrades) if (!groupOf.has(u)) groupOf.set(u, g.shop_group);
    }
  }

  const items: GameItem[] = [];
  for (const raw of input.itemsEn) {
    if (raw.type !== 'upgrade' || !raw.shopable || raw.disabled) continue;
    const slot = normSlot(raw.item_slot_type);
    if (!slot) continue;
    const ru = ruItems.get(raw.class_name);
    const tier = raw.item_tier ?? 0;
    const isActive = raw.is_active_item === true;
    const sections = buildSections(raw, ru);
    const item: GameItem = {
      key: raw.class_name,
      id: raw.id,
      name: l10n(raw.name, ru?.name),
      slot,
      tier,
      cost: raw.cost ?? 0,
      mode: tier >= 5 ? 'street_brawl' : 'standard',
      activation: normActivation(raw.activation),
      isActive,
      imbue: normImbue(raw.imbue),
      cooldown: isActive ? propValue(raw, 'AbilityCooldown') : null,
      duration: propValue(raw, 'AbilityDuration'),
      castRange: propValue(raw, 'AbilityCastRange'),
      charges: propValue(raw, 'AbilityCharges'),
      components: [...(raw.component_items ?? [])],
      upgradesInto: [],
      shopGroup: groupOf.get(raw.class_name) ?? null,
      filters: [...(raw.shop_filters ?? [])],
      corruptible: raw.corrupted_info !== undefined && raw.corrupted_info !== null,
      sections,
      summary: summaryOf(raw, ru),
      icon: `game/items/${raw.class_name}.webp`,
      iconRemote: raw.shop_image_webp ?? raw.shop_image ?? raw.image_webp ?? raw.image ?? '',
      hash: '',
    };
    item.hash = hashString(
      JSON.stringify({
        n: item.name.en,
        c: item.cost,
        t: item.tier,
        s: item.slot,
        a: item.activation,
        i: item.imbue,
        cp: item.components,
        sec: item.sections.map((x) => ({
          k: x.kind,
          t: x.text?.en ?? '',
          st: x.stats.map((l) => [l.prop, l.raw, l.unit, l.negative, l.conditional]),
        })),
      }),
    );
    items.push(item);
  }
  const keySet = new Set(items.map((i) => i.key));
  for (const it of items) {
    it.components = it.components.filter((c) => keySet.has(c));
    for (const c of it.components) {
      const parent = items.find((x) => x.key === c);
      if (parent && !parent.upgradesInto.includes(it.key)) parent.upgradesInto.push(it.key);
    }
  }
  items.sort((a, b) => (a.slot === b.slot ? a.tier - b.tier || a.name.en.localeCompare(b.name.en) : a.slot.localeCompare(b.slot)));

  const ruHeroes = new Map(input.heroesRu.map((h) => [h.id, h]));
  const heroes: HeroData[] = [];
  for (const h of input.heroesEn) {
    if (h.player_selectable === false || h.disabled) continue;
    const hr = ruHeroes.get(h.id);
    const abilities: AbilityData[] = [];
    for (let slot = 1; slot <= 4; slot++) {
      const cls = h.items?.[`signature${slot}`];
      const a = cls ? allEn.get(cls) : undefined;
      if (!a || !cls) continue;
      const ar = ruItems.get(cls);
      const d = a.description ?? {};
      const dr = ar?.description ?? {};
      const ability: AbilityData = {
        key: cls,
        id: a.id,
        slot,
        isUltimate: a.ability_type === 'ultimate' || slot === 4,
        name: l10n(a.name, ar?.name),
        quip: d['quip'] ? l10n(cleanGameText(d['quip']), cleanGameText(dr['quip'])) : null,
        description: (() => {
          const en = cleanGameText(d['desc']) || clientDescription(input.clientLoc?.en, cls, a.properties);
          const ru = cleanGameText(dr['desc']) || clientDescription(input.clientLoc?.ru, cls, ar?.properties ?? a.properties);
          return l10n(en, ru || en);
        })(),
        upgrades: [1, 2, 3].map((t) => {
          const en = cleanGameText(d[`t${t}_desc`]);
          return en ? l10n(en, cleanGameText(dr[`t${t}_desc`] ?? d[`t${t}_desc`])) : upgradeTextFromProps(a, ar, t);
        }),
        cooldown: propValue(a, 'AbilityCooldown'),
        charges: propValue(a, 'AbilityCharges'),
        duration: propValue(a, 'AbilityDuration'),
        castRange: propValue(a, 'AbilityCastRange'),
        behaviours: (a.behaviours ?? []).map((b) => b.replace(/^CITADEL_ABILITY_BEHAVIOR_/, '').toLowerCase()),
        damageTypes: abilityDamageTypes(a),
        effects: abilityEffects(a),
        icon: `game/abilities/${cls}.webp`,
        iconRemote: a.image_webp ?? a.image ?? '',
        hash: '',
      };
      ability.hash = hashString(
        JSON.stringify([ability.name.en, ability.description.en, ability.upgrades.map((u) => u?.en ?? ''), ability.cooldown, ability.charges]),
      );
      abilities.push(ability);
    }
    const weaponKey = h.items?.['weapon_primary'];
    const popularOf = (list: RawPopularEntry[] | undefined): PopularItemStat[] =>
      (list ?? [])
        .filter((e) => e.class_name && keySet.has(e.class_name))
        .map((e) => ({
          itemKey: e.class_name as string,
          pickPct: Math.round((e.pick_pct ?? 0) * 10) / 10,
          winratePct: Math.round((e.winrate_pct ?? 0) * 10) / 10,
        }));
    const images = h.images ?? {};
    const hero: HeroData = {
      key: h.class_name,
      id: h.id,
      name: l10n(h.name, hr?.name),
      heroType: h.hero_type ?? null,
      tags: [...(h.tags ?? [])],
      role: h.description?.role ? l10n(cleanGameText(h.description.role, false), cleanGameText(hr?.description?.role, false)) : null,
      playstyle: h.description?.playstyle
        ? l10n(cleanGameText(h.description.playstyle, false), cleanGameText(hr?.description?.playstyle, false))
        : null,
      complexity: h.complexity ?? null,
      isLabs: h.in_development === true,
      icon: `game/heroes/${h.class_name}.webp`,
      iconRemote:
        images['icon_hero_card_webp'] ?? images['icon_image_small_webp'] ?? images['icon_hero_card'] ?? images['icon_image_small'] ?? '',
      weapon: weaponOf(
        weaponKey ? allEn.get(weaponKey) : undefined,
        weaponKey ? ruItems.get(weaponKey) : undefined,
        h.shop_stat_display?.weapon_stats_display?.weapon_attributes ?? [],
      ),
      abilities,
      popular: {
        timestamp: h.popular_items?.timestamp ?? null,
        early: popularOf(h.popular_items?.early_game),
        mid: popularOf(h.popular_items?.mid_game),
        late: popularOf(h.popular_items?.late_game),
      },
      hash: '',
    };
    hero.hash = hashString(JSON.stringify([hero.name.en, abilities.map((a) => a.hash), hero.weapon]));
    heroes.push(hero);
  }
  heroes.sort((a, b) => a.name.en.localeCompare(b.name.en));

  const investmentFrom = (h: RawHero | undefined): Record<Slot, InvestmentStep[]> => {
    const cb = h?.cost_bonuses ?? {};
    const conv = (k: string): InvestmentStep[] => (cb[k] ?? []).map((s) => ({ threshold: s.gold_threshold, bonus: s.bonus }));
    return { weapon: conv('weapon'), vitality: conv('vitality'), spirit: conv('spirit') };
  };
  const firstPlayable = input.heroesEn.find((h) => h.player_selectable !== false && !h.disabled && h.cost_bonuses);

  const patches: PatchNote[] = (input.patches ?? [])
    .filter((p) => p.title && p.pub_date && p.link)
    .filter((p) => /update|patch|gameplay|\d{2}-\d{2}-\d{4}/i.test(p.title ?? ''))
    .slice(0, 15)
    .map((p) => ({ title: (p.title ?? '').trim(), date: p.pub_date ?? '', url: p.link ?? '' }));

  const meta: GameMeta = {
    schema: GAME_DATA_SCHEMA,
    clientVersion: input.steamInfo.client_version ?? 0,
    versionDate: input.steamInfo.version_datetime ?? null,
    fetchedAt: input.fetchedAt,
    sources: SOURCE_URLS,
    counts: {
      items: items.length,
      standardItems: items.filter((i) => i.mode === 'standard').length,
      heroes: heroes.length,
    },
    priceTiers: input.generic.item_price_per_tier ?? [],
    investment: investmentFrom(firstPlayable),
    shopGroups,
    itemHashes: Object.fromEntries(items.map((i) => [i.key, i.hash])),
    heroHashes: Object.fromEntries(heroes.map((h) => [h.key, h.hash])),
    patches,
  };

  return { meta, items, heroes };
}

/** Field-level comparison between two snapshots, used to flag learning content for re-verification. */
export function diffGameData(prev: GameDataBundle | null, next: GameDataBundle): GameDataDiff {
  const diff: GameDataDiff = {
    fromVersion: prev?.meta.clientVersion ?? null,
    toVersion: next.meta.clientVersion,
    items: [],
    heroes: [],
  };
  if (!prev) return diff;
  const prevItems = new Map(prev.items.map((i) => [i.key, i]));
  const nextItems = new Map(next.items.map((i) => [i.key, i]));
  for (const [key, it] of nextItems) {
    const old = prevItems.get(key);
    if (!old) {
      diff.items.push({ key, name: it.name.en, kind: 'added', fields: [] });
      continue;
    }
    if (old.hash === it.hash) continue;
    const fields: string[] = [];
    if (old.name.en !== it.name.en) fields.push('name');
    if (old.cost !== it.cost || old.tier !== it.tier) fields.push('cost');
    if (old.activation !== it.activation || old.imbue !== it.imbue) fields.push('activation');
    if (JSON.stringify(old.components) !== JSON.stringify(it.components)) fields.push('components');
    const statsOf = (x: GameItem) => JSON.stringify(x.sections.map((s) => s.stats.map((l) => [l.prop, l.raw])));
    const textOf = (x: GameItem) => JSON.stringify(x.sections.map((s) => s.text?.en ?? ''));
    if (statsOf(old) !== statsOf(it)) fields.push('stats');
    if (textOf(old) !== textOf(it)) fields.push('text');
    const change: ItemChange = { key, name: it.name.en, kind: 'changed', fields: fields.length ? fields : ['other'] };
    diff.items.push(change);
  }
  for (const [key, it] of prevItems) {
    if (!nextItems.has(key)) diff.items.push({ key, name: it.name.en, kind: 'removed', fields: [] });
  }
  const prevHeroes = new Map(prev.heroes.map((h) => [h.key, h]));
  for (const h of next.heroes) {
    const old = prevHeroes.get(h.key);
    if (!old) diff.heroes.push({ key: h.key, name: h.name.en, kind: 'added' });
    else if (old.hash !== h.hash) diff.heroes.push({ key: h.key, name: h.name.en, kind: 'changed' });
  }
  for (const h of prev.heroes) if (!next.heroes.some((x) => x.key === h.key)) diff.heroes.push({ key: h.key, name: h.name.en, kind: 'removed' });
  return diff;
}
