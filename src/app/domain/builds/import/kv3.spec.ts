import { ITEMS, HEROES } from '../../../testing/fixtures';
import { decodeProtobuf, parseHeroBuildProto } from './hero-build';
import { draftFromHeroBuild, draftsFromJson, ImportLookups, toPortable } from './importers';
import { lz4DecodeInto } from './kv3';

/** Minimal protobuf writer for tests. */
function varint(n: number): number[] {
  const out: number[] = [];
  let v = n >>> 0;
  while (v > 0x7f) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
  return out;
}
const field = (f: number, wt: number) => varint((f << 3) | wt);
const vInt = (f: number, n: number) => [...field(f, 0), ...varint(n)];
const vBytes = (f: number, b: number[]) => [...field(f, 2), ...varint(b.length), ...b];
const vStr = (f: number, s: string) => vBytes(f, [...new TextEncoder().encode(s)]);

const lookups: ImportLookups = {
  itemById: new Map(ITEMS.map((i) => [i.id, i])),
  itemByKey: new Map(ITEMS.map((i) => [i.key, i])),
  heroById: new Map(HEROES.map((h) => [h.id, h])),
  heroByKey: new Map(HEROES.map((h) => [h.key, h])),
  abilityById: new Map(HEROES.flatMap((h) => h.abilities.map((a) => [a.id, { ability: a, hero: h }] as const))),
};

describe('lz4', () => {
  it('decodes literals and overlapping matches', () => {
    // token: 3 literals + match length 6 (stored as 6-4=2), offset 3
    const input = new Uint8Array([0x32, 97, 98, 99, 3, 0]);
    const out = new Uint8Array(9);
    expect(lz4DecodeInto(input, out, 0)).toBe(9);
    expect(new TextDecoder().decode(out)).toBe('abcabcabc');
  });
  it('rejects a bad offset', () => {
    expect(() => lz4DecodeInto(new Uint8Array([0x10, 97, 9, 0]), new Uint8Array(10), 0)).toThrow();
  });
});

describe('hero build protobuf', () => {
  const qsr = ITEMS.find((i) => i.key === 'upgrade_quick_silver')!;
  const hvr = ITEMS.find((i) => i.key === 'upgrade_high_velocity_mag')!;
  const vindicta = HEROES.find((h) => h.key === 'hero_hornet')!;
  const crow = vindicta.abilities.find((a) => a.key === 'citadel_ability_hornet_sting')!;
  const mod1 = [...vInt(1, hvr.id)];
  const mod2 = [...vInt(1, qsr.id), ...vStr(2, 'imbue crow'), ...vInt(5, crow.id)];
  const cat = [...vBytes(1, mod1), ...vBytes(1, mod2), ...vStr(2, '#Citadel_HeroBuilds_EarlyGame')];
  const details = vBytes(1, cat);
  const build = new Uint8Array([...vInt(1, 24), ...vInt(2, vindicta.id), ...vStr(5, 'My build'), ...vBytes(10, details)]);

  it('decodes wire format', () => {
    const fields = decodeProtobuf(build);
    expect(fields.map((f) => f.f)).toEqual([1, 2, 5, 10]);
  });

  it('parses a CMsgHeroBuild and maps ids to current items and abilities', () => {
    const hb = parseHeroBuildProto(build);
    expect(hb.hero_id).toBe(3);
    expect(hb.details?.mod_categories[0].mods[1].imbue_target_ability_id).toBe(crow.id);
    const d = draftFromHeroBuild(hb, lookups);
    expect(d?.heroKey).toBe('hero_hornet');
    expect(d?.categories[0].name).toBe('Early Game');
    expect(d?.categories[0].items.map((i) => i.key)).toEqual(['upgrade_high_velocity_mag', 'upgrade_quick_silver']);
    expect(d?.categories[0].items[1].imbue).toBe('citadel_ability_hornet_sting');
    expect(d?.categories[0].items[1].note).toBe('imbue crow');
  });
});

describe('JSON import', () => {
  it('reads the deadlock-api build format and the app export format', () => {
    const vindicta = HEROES.find((h) => h.key === 'hero_hornet')!;
    const api = JSON.stringify([{ hero_build: { hero_id: vindicta.id, name: 'X', details: { mod_categories: [{ name: 'A', mods: [{ ability_id: ITEMS[0].id }] }] } } }]);
    expect(draftsFromJson(api, lookups)[0].heroKey).toBe('hero_hornet');
    const portable = JSON.stringify(toPortable('hero_necro', 'Y', [{ name: 'Core', items: [{ key: 'upgrade_toxic_bullets' }] }]));
    const d = draftsFromJson(portable, lookups)[0];
    expect(d.heroKey).toBe('hero_necro');
    expect(d.categories[0].items[0].key).toBe('upgrade_toxic_bullets');
  });
});
