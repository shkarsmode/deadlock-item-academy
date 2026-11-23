/** Normalization and typo-tolerant matching for typed (free recall) answers. */
export function normalizeAnswer(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ё/g, 'е')
    .replace(/[«»"'’`´.,!?:;()[\]{}\-_/\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

export type MatchKind = 'exact' | 'typo' | 'none';

/** Accepts small typos: 1 edit for short names, ~15% of length for long ones. */
export function matchAnswer(input: string, accepted: readonly string[]): MatchKind {
  const a = normalizeAnswer(input);
  if (!a) return 'none';
  let best: MatchKind = 'none';
  for (const raw of accepted) {
    const b = normalizeAnswer(raw);
    if (!b) continue;
    if (a === b) return 'exact';
    const tolerance = b.length <= 6 ? 1 : Math.max(1, Math.floor(b.length * 0.15));
    if (levenshtein(a, b) <= tolerance) best = 'typo';
  }
  return best;
}
