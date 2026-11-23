/** Small seedable PRNG (mulberry32) so generated sessions are reproducible in tests and share links. */
export interface Rng {
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(list: readonly T[]): T;
  shuffle<T>(list: readonly T[]): T[];
  weighted<T>(list: readonly T[], weight: (x: T) => number): T | undefined;
}

export function makeRng(seed: number): Rng {
  let a = seed >>> 0 || 0x9e3779b9;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    pick: (list) => list[Math.floor(next() * list.length)],
    shuffle: (list) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted: (list, weight) => {
      const ws = list.map((x) => Math.max(0, weight(x)));
      const total = ws.reduce((s, w) => s + w, 0);
      if (total <= 0) return list[Math.floor(next() * list.length)];
      let r = next() * total;
      for (let i = 0; i < list.length; i++) {
        r -= ws[i];
        if (r <= 0) return list[i];
      }
      return list[list.length - 1];
    },
  };
}

export function seedFrom(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
