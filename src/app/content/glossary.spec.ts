import type { GlossaryTerm } from './content.model';
import { normTerm, searchTerms } from './glossary';

const term = (id: string, en: string, ru: string[], aliases: string[] = [], short = 'x'): GlossaryTerm => ({
  id,
  category: 'items',
  en,
  ru,
  aliases,
  short: { ru: short },
  explain: { ru: 'y' },
  status: 'expert',
});

const TERMS = [
  term('imbue', 'Imbue', ['Усиление', 'насыщение'], ['насичення']),
  term('carry', 'Carry', ['Керри', 'кэрри']),
  term('picker', 'Picker', ['Пикер'], [], 'Ловит одиночные цели до драки'),
  term('spirit-power', 'Spirit Power', ['Спиритическая мощь', 'духовная сила']),
];

describe('glossary search', () => {
  it('normalizes case, ё and punctuation', () => {
    expect(normTerm('Spirit-Power')).toBe('spirit power');
    expect(normTerm('Ёлка')).toBe('елка');
  });

  it('finds terms by English, Russian, slang and Ukrainian client words', () => {
    expect(searchTerms(TERMS, 'imbue')[0].id).toBe('imbue');
    expect(searchTerms(TERMS, 'насыщ')[0].id).toBe('imbue');
    expect(searchTerms(TERMS, 'насичення')[0].id).toBe('imbue');
    expect(searchTerms(TERMS, 'кэрри')[0].id).toBe('carry');
    expect(searchTerms(TERMS, 'power')[0].id).toBe('spirit-power');
    expect(searchTerms(TERMS, 'духовная')[0].id).toBe('spirit-power');
  });

  it('ranks names above definitions and returns everything for an empty query', () => {
    expect(searchTerms(TERMS, 'одиночные').map((t) => t.id)).toEqual(['picker']);
    expect(searchTerms(TERMS, '  ')).toHaveLength(TERMS.length);
    expect(searchTerms(TERMS, 'zzz')).toEqual([]);
  });
});
