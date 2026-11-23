import { levenshtein, matchAnswer, normalizeAnswer } from './fuzzy';

describe('fuzzy answer matching', () => {
  it('normalizes case, punctuation and ё', () => {
    expect(normalizeAnswer("  Diviner's   Kevlar! ")).toBe('diviner s kevlar');
    expect(normalizeAnswer('Ёж')).toBe('еж');
  });
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('', 'abc')).toBe(3);
  });
  it('accepts exact answers in English and Russian', () => {
    expect(matchAnswer('metal skin', ['Metal Skin', 'Металлическая кожа'])).toBe('exact');
    expect(matchAnswer('металлическая кожа', ['Metal Skin', 'Металлическая кожа'])).toBe('exact');
  });
  it('accepts small typos but rejects other items', () => {
    expect(matchAnswer('Metall Skin', ['Metal Skin'])).toBe('typo');
    expect(matchAnswer('Counterspel', ['Counterspell'])).toBe('typo');
    expect(matchAnswer('Mystic Burst', ['Mystic Slow'])).toBe('none');
    expect(matchAnswer('', ['Decay'])).toBe('none');
  });
});
