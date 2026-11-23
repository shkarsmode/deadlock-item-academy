import { KV3Value, readBinaryKV3 } from './kv3';

/**
 * CMsgHeroBuild as stored by the Deadlock client (protobuf) and as published by the
 * deadlock-api `/v1/builds` endpoint (JSON with the same field names).
 */
export interface HeroBuildMod {
  ability_id: number;
  annotation?: string;
  required_flex_slots?: number;
  sell_priority?: number;
  imbue_target_ability_id?: number;
}

export interface HeroBuildCategory {
  name?: string;
  description?: string;
  optional?: boolean;
  mods: HeroBuildMod[];
}

export interface HeroBuild {
  hero_build_id?: number;
  hero_id: number;
  author_account_id?: number;
  last_updated_timestamp?: number;
  name?: string;
  description?: string;
  origin_build_id?: number;
  version?: number;
  details?: { mod_categories: HeroBuildCategory[] };
}

interface PbField {
  f: number;
  wt: number;
  v: bigint | number | Uint8Array;
}

/** Generic protobuf wire-format reader. */
export function decodeProtobuf(bytes: Uint8Array): PbField[] {
  const out: PbField[] = [];
  let p = 0;
  const varint = (): bigint => {
    let r = 0n;
    let s = 0n;
    let b: number;
    do {
      if (p >= bytes.length) throw new Error('protobuf: unexpected end');
      b = bytes[p++];
      r |= BigInt(b & 0x7f) << s;
      s += 7n;
    } while (b & 0x80);
    return r;
  };
  while (p < bytes.length) {
    const key = Number(varint());
    const f = key >>> 3;
    const wt = key & 7;
    if (f === 0) throw new Error('protobuf: field 0');
    if (wt === 0) out.push({ f, wt, v: varint() });
    else if (wt === 1) {
      out.push({ f, wt, v: new DataView(bytes.buffer, bytes.byteOffset + p, 8).getFloat64(0, true) });
      p += 8;
    } else if (wt === 5) {
      out.push({ f, wt, v: new DataView(bytes.buffer, bytes.byteOffset + p, 4).getFloat32(0, true) });
      p += 4;
    } else if (wt === 2) {
      const len = Number(varint());
      if (p + len > bytes.length) throw new Error('protobuf: length overflow');
      out.push({ f, wt, v: bytes.subarray(p, p + len) });
      p += len;
    } else throw new Error(`protobuf: wire type ${wt}`);
  }
  return out;
}

const td = new TextDecoder();
const num = (x: PbField) => Number(x.v as bigint);
const str = (x: PbField) => td.decode(x.v as Uint8Array);

function parseMod(b: Uint8Array): HeroBuildMod {
  const m: HeroBuildMod = { ability_id: 0 };
  for (const x of decodeProtobuf(b)) {
    if (x.f === 1) m.ability_id = num(x);
    else if (x.f === 2) m.annotation = str(x);
    else if (x.f === 3) m.required_flex_slots = num(x);
    else if (x.f === 4) m.sell_priority = num(x);
    else if (x.f === 5) m.imbue_target_ability_id = num(x);
  }
  return m;
}

function parseCategory(b: Uint8Array): HeroBuildCategory {
  const c: HeroBuildCategory = { mods: [] };
  for (const x of decodeProtobuf(b)) {
    if (x.f === 1) c.mods.push(parseMod(x.v as Uint8Array));
    else if (x.f === 2) c.name = str(x);
    else if (x.f === 3) c.description = str(x);
    else if (x.f === 6) c.optional = num(x) !== 0;
  }
  return c;
}

export function parseHeroBuildProto(b: Uint8Array): HeroBuild {
  const h: HeroBuild = { hero_id: 0 };
  for (const x of decodeProtobuf(b)) {
    switch (x.f) {
      case 1:
        h.hero_build_id = num(x);
        break;
      case 2:
        h.hero_id = num(x);
        break;
      case 3:
        h.author_account_id = num(x);
        break;
      case 4:
        h.last_updated_timestamp = num(x);
        break;
      case 5:
        h.name = str(x);
        break;
      case 6:
        h.description = str(x);
        break;
      case 8:
        h.version = num(x);
        break;
      case 9:
        h.origin_build_id = num(x);
        break;
      case 10: {
        const cats: HeroBuildCategory[] = [];
        for (const y of decodeProtobuf(x.v as Uint8Array)) if (y.f === 1) cats.push(parseCategory(y.v as Uint8Array));
        h.details = { mod_categories: cats };
        break;
      }
    }
  }
  return h;
}

export interface CachedBuild {
  section: 'Unpublished' | 'SavedLastUsed' | 'Favorites';
  build: HeroBuild;
  /** True when this build id is the one the game marks as last used for its hero. */
  lastUsed: boolean;
}

/** Reads cached_hero_builds.kv3 and returns every build it contains. */
export function readCachedBuilds(file: Uint8Array, heroClassById: Map<number, string>): CachedBuild[] {
  const root = readBinaryKV3(file) as Record<string, KV3Value>;
  const lastUsed = (root['LastUsedBuilds'] ?? {}) as Record<string, KV3Value>;
  const out: CachedBuild[] = [];
  for (const section of ['Unpublished', 'SavedLastUsed', 'Favorites'] as const) {
    const list = root[section];
    if (!Array.isArray(list)) continue;
    for (const blob of list) {
      if (!(blob instanceof Uint8Array)) continue;
      try {
        const wrapper = decodeProtobuf(blob);
        const inner = wrapper.find((x) => x.f === 1 && x.wt === 2);
        if (!inner) continue;
        const build = parseHeroBuildProto(inner.v as Uint8Array);
        const heroClass = heroClassById.get(build.hero_id);
        const lu = heroClass ? lastUsed[heroClass] : undefined;
        out.push({ section, build, lastUsed: typeof lu === 'number' && lu === build.hero_build_id });
      } catch {
        // skip malformed entries
      }
    }
  }
  // The same build can appear in several sections; keep one copy (prefer last used).
  const seen = new Map<string, CachedBuild>();
  for (const c of out) {
    const k = `${c.build.hero_id}:${c.build.hero_build_id}:${c.build.version ?? 0}`;
    const prev = seen.get(k);
    if (!prev || (!prev.lastUsed && c.lastUsed)) seen.set(k, c);
  }
  return [...seen.values()];
}
