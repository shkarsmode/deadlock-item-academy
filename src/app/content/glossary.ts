import type { GlossaryCategory, GlossaryTerm } from './content.model';

export const GLOSSARY_CATEGORY_LABELS: Record<GlossaryCategory, { ru: string; en: string }> = {
  items: { ru: 'Предметы и магазин', en: 'Items and shop' },
  stats: { ru: 'Характеристики', en: 'Stats' },
  combat: { ru: 'Бой и контроль', en: 'Combat and control' },
  roles: { ru: 'Роли и стиль игры', en: 'Roles and playstyle' },
  economy: { ru: 'Души и фарм', en: 'Souls and farm' },
  map: { ru: 'Карта и объекты', en: 'Map and objectives' },
};

/** Lowercase, `ё` as `е`, punctuation as spaces: "Spirit-Power" and "spirit power" match. */
export function normTerm(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Terms matching the query, best first: exact name, name prefix, name substring, then text.
 * An empty query returns the list unchanged.
 */
export function searchTerms(terms: readonly GlossaryTerm[], query: string): GlossaryTerm[] {
  const q = normTerm(query);
  if (!q) return [...terms];
  const scored: { t: GlossaryTerm; score: number }[] = [];
  for (const t of terms) {
    const names = [t.en, ...t.ru, ...(t.aliases ?? [])].map(normTerm);
    let score = 0;
    if (names.some((n) => n === q)) score = 4;
    else if (names.some((n) => n.startsWith(q) || n.split(' ').some((w) => w.startsWith(q)))) score = 3;
    else if (names.some((n) => n.includes(q))) score = 2;
    else if ([t.short.ru, t.short.en ?? '', t.explain.ru, t.explain.en ?? ''].some((x) => normTerm(x).includes(q))) score = 1;
    if (score) scored.push({ t, score });
  }
  return scored.sort((a, b) => b.score - a.score).map((x) => x.t);
}
