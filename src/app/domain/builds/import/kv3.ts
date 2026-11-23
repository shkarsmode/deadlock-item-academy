/**
 * Minimal reader for Valve binary KeyValues3 (versions 4 and 5, uncompressed or LZ4),
 * modeled on ValveResourceFormat's BinaryKV3. Used to read the game's local build cache
 * (Steam/userdata/<id>/1422450/remote/cfg/cached_hero_builds.kv3). Read-only, no network.
 */

export type KV3Value = null | boolean | number | string | KV3Value[] | { [key: string]: KV3Value } | Uint8Array;

/** Decodes one LZ4 block into `out` starting at `outStart`; matches may reference earlier output. */
export function lz4DecodeInto(input: Uint8Array, out: Uint8Array, outStart: number): number {
  let ip = 0;
  let op = outStart;
  const end = input.length;
  while (ip < end) {
    const token = input[ip++];
    let lit = token >> 4;
    if (lit === 15) {
      let b: number;
      do {
        b = input[ip++];
        lit += b;
      } while (b === 255);
    }
    if (op + lit > out.length) throw new Error('LZ4: output overflow');
    for (let i = 0; i < lit; i++) out[op++] = input[ip++];
    if (ip >= end) break;
    const offset = input[ip] | (input[ip + 1] << 8);
    ip += 2;
    if (offset === 0 || offset > op) throw new Error('LZ4: bad offset');
    let ml = token & 15;
    if (ml === 15) {
      let b: number;
      do {
        b = input[ip++];
        ml += b;
      } while (b === 255);
    }
    ml += 4;
    if (op + ml > out.length) throw new Error('LZ4: output overflow');
    let mp = op - offset;
    for (let i = 0; i < ml; i++) out[op++] = out[mp++];
  }
  return op;
}

interface Lane {
  b1: Uint8Array;
  b2: Uint8Array;
  b4: Uint8Array;
  b8: Uint8Array;
  i1: number;
  i2: number;
  i4: number;
  i8: number;
}

const align = (o: number, a: number) => (o + a - 1) & ~(a - 1);

export function readBinaryKV3(buf: Uint8Array): KV3Value {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let p = 0;
  const u32 = () => {
    const v = dv.getUint32(p, true);
    p += 4;
    return v;
  };
  const i32 = () => {
    const v = dv.getInt32(p, true);
    p += 4;
    return v;
  };
  const u16 = () => {
    const v = dv.getUint16(p, true);
    p += 2;
    return v;
  };
  const magic = u32();
  const version = magic & 0xff;
  if (magic >>> 8 !== 0x4b5633 || version < 4 || version > 5) throw new Error('Not a supported binary KV3 file (expected version 4 or 5)');
  p += 16; // format GUID
  const compression = u32();
  u16(); // dictionary id
  u16(); // frame size
  const countBytes1 = i32();
  const countBytes4 = i32();
  const countBytes8 = i32();
  const countTypes = i32();
  u16();
  u16();
  const sizeUncompressedTotal = i32();
  const sizeCompressedTotal = i32();
  const countBlocks = i32();
  i32(); // binary blobs total
  const countBytes2 = i32();
  i32(); // block compressed sizes bytes
  let sizeU1 = sizeUncompressedTotal;
  let sizeC1 = sizeCompressedTotal;
  let sizeU2 = 0;
  let sizeC2 = 0;
  let c1b2 = 0;
  let c2b2 = 0;
  let c4b2 = 0;
  let c8b2 = 0;
  let objects2 = 0;
  if (version >= 5) {
    sizeU1 = i32();
    sizeC1 = i32();
    sizeU2 = i32();
    sizeC2 = i32();
    c1b2 = i32();
    c2b2 = i32();
    c4b2 = i32();
    c8b2 = i32();
    i32();
    objects2 = i32();
    i32();
    i32();
  }
  if (compression > 1) throw new Error('Only uncompressed or LZ4 KV3 is supported');
  const readBuffer = (uncompressed: number, compressed: number): Uint8Array => {
    const out = new Uint8Array(uncompressed);
    if (compression === 0) {
      out.set(buf.subarray(p, p + uncompressed));
      p += uncompressed;
    } else {
      const n = lz4DecodeInto(buf.subarray(p, p + compressed), out, 0);
      if (n !== uncompressed) throw new Error('LZ4 size mismatch');
      p += compressed;
    }
    return out;
  };
  const lanes = (b: Uint8Array, c1: number, c2: number, c4: number, c8: number, start: number): { L: Lane; end: number } => {
    let o = start;
    const b1 = b.subarray(o, o + c1);
    o += c1;
    let b2: Uint8Array = new Uint8Array(0);
    let b4: Uint8Array = new Uint8Array(0);
    let b8: Uint8Array = new Uint8Array(0);
    if (c2 > 0) {
      o = align(o, 2);
      b2 = b.subarray(o, o + c2 * 2);
      o += c2 * 2;
    }
    if (c4 > 0) {
      o = align(o, 4);
      b4 = b.subarray(o, o + c4 * 4);
      o += c4 * 4;
    }
    if (c8 > 0) {
      o = align(o, 8);
      b8 = b.subarray(o, o + c8 * 8);
      o += c8 * 8;
    }
    return { L: { b1, b2, b4, b8, i1: 0, i2: 0, i4: 0, i8: 0 }, end: o };
  };
  const view = (a: Uint8Array) => new DataView(a.buffer, a.byteOffset, a.byteLength);
  const r1 = (L: Lane) => L.b1[L.i1++];
  const r1s = (L: Lane) => (L.b1[L.i1++] << 24) >> 24;
  const r2 = (L: Lane, signed: boolean) => {
    const v = signed ? view(L.b2).getInt16(L.i2, true) : view(L.b2).getUint16(L.i2, true);
    L.i2 += 2;
    return v;
  };
  const r4i = (L: Lane) => {
    const v = view(L.b4).getInt32(L.i4, true);
    L.i4 += 4;
    return v;
  };
  const r4u = (L: Lane) => {
    const v = view(L.b4).getUint32(L.i4, true);
    L.i4 += 4;
    return v;
  };
  const r4f = (L: Lane) => {
    const v = view(L.b4).getFloat32(L.i4, true);
    L.i4 += 4;
    return v;
  };
  const r8 = (L: Lane, kind: 'i' | 'u' | 'f') => {
    const d = view(L.b8);
    const v = kind === 'f' ? d.getFloat64(L.i8, true) : Number(kind === 'i' ? d.getBigInt64(L.i8, true) : d.getBigUint64(L.i8, true));
    L.i8 += 8;
    return v;
  };

  const b1 = readBuffer(sizeU1, sizeC1);
  const aux = lanes(b1, countBytes1, countBytes2, countBytes4, countBytes8, 0).L;
  const countStrings = r4i(aux);
  const strings: string[] = [];
  const td = new TextDecoder('utf-8');
  {
    let o = 0;
    for (let i = 0; i < countStrings; i++) {
      const z = aux.b1.indexOf(0, o);
      strings.push(td.decode(aux.b1.subarray(o, z)));
      o = z + 1;
    }
    aux.i1 = o;
  }
  if (version < 5) throw new Error('KV3 version 4 layout is not supported by this reader yet');
  const b2 = readBuffer(sizeU2, sizeC2);
  const objLenEnd = objects2 * 4;
  const objLens = new DataView(b2.buffer, b2.byteOffset, objLenEnd);
  let objIdx = 0;
  const { L: main, end: lanesEnd } = lanes(b2, c1b2, c2b2, c4b2, c8b2, objLenEnd);
  const types = b2.subarray(lanesEnd, lanesEnd + countTypes);
  let ti = 0;
  const tail = lanesEnd + countTypes;
  const blobs: Uint8Array[] = [];
  if (countBlocks > 0) {
    const tdv = new DataView(b2.buffer, b2.byteOffset + tail);
    const lens: number[] = [];
    for (let i = 0; i < countBlocks; i++) lens.push(tdv.getInt32(i * 4, true));
    let q = countBlocks * 4;
    if (tdv.getUint32(q, true) !== 0xffeedd00) throw new Error('KV3: bad blob trailer');
    q += 4;
    const total = lens.reduce((a, b) => a + b, 0);
    const hist = new Uint8Array(total);
    let hp = 0;
    for (const len of lens) {
      const start = hp;
      if (compression === 0) {
        hist.set(buf.subarray(p, p + len), hp);
        p += len;
        hp += len;
      } else {
        while (hp - start < len) {
          const cl = tdv.getUint16(q, true);
          q += 2;
          hp = lz4DecodeInto(buf.subarray(p, p + cl), hist, hp);
          p += cl;
        }
      }
      blobs.push(hist.slice(start, start + len));
    }
  }
  let blobIdx = 0;
  const readType = (): number => {
    const t = types[ti++];
    if (t & 0x80) ti++;
    if (t & 0x40) ti++;
    return t & 0x3f;
  };
  const val = (t: number, L: Lane): KV3Value => {
    switch (t) {
      case 1:
        return null;
      case 13:
        return true;
      case 14:
        return false;
      case 15:
      case 17:
      case 26:
        return 0;
      case 16:
      case 18:
      case 27:
        return 1;
      case 2:
        return r1(L) !== 0;
      case 22:
        return r1s(L);
      case 23:
        return r1(L);
      case 20:
        return r2(L, true);
      case 21:
        return r2(L, false);
      case 11:
        return r4i(L);
      case 12:
        return r4u(L);
      case 19:
        return r4f(L);
      case 3:
        return r8(L, 'i');
      case 4:
        return r8(L, 'u');
      case 5:
        return r8(L, 'f');
      case 6: {
        const id = r4i(main);
        return id >= 0 && id < strings.length ? strings[id] : '';
      }
      case 7:
        return blobs[blobIdx++] ?? new Uint8Array(0);
      case 8: {
        const n = r4i(main);
        const a: KV3Value[] = [];
        for (let i = 0; i < n; i++) a.push(val(readType(), main));
        return a;
      }
      case 10:
      case 24:
      case 25: {
        const n = t === 10 ? r4i(main) : r1(main);
        const st = readType();
        const lane = t === 25 ? aux : main;
        const a: KV3Value[] = [];
        for (let i = 0; i < n; i++) a.push(val(st, lane));
        return a;
      }
      case 9: {
        const n = objLens.getInt32(objIdx, true);
        objIdx += 4;
        const o: Record<string, KV3Value> = {};
        for (let i = 0; i < n; i++) {
          const st = readType();
          const key = strings[r4i(main)] ?? '';
          o[key] = val(st, main);
        }
        return o;
      }
      default:
        throw new Error(`KV3: unknown type ${t}`);
    }
  };
  return val(readType(), main);
}
