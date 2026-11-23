import { BUNDLE, ITEMS } from '../testing/fixtures';
import { TERM_PATTERNS, buildTermMatcher, splitByTerms } from './term-links';

const known = new Set((BUNDLE.glossary ?? []).map((t) => t.id));
const m = buildTermMatcher(known);
const links = (text: string) => splitByTerms(text, m, new Set()).filter((s) => s.term).map((s) => `${s.term}:${s.t}`);

describe('glossary links in texts', () => {
  it('only uses ids that exist in the glossary', () => {
    for (const id of Object.keys(TERM_PATTERNS)) expect(known.has(id), id).toBe(true);
  });

  it('links jargon in Russian with its endings and English game terms', () => {
    expect(links('Ставь imbue на ульту, а керри пусть фармит.')).toEqual(['imbue:imbue', 'ultimate:ульту', 'carry:керри', 'farm:фармит']);
    expect(links('Пикеры ловят цель до драки, под контролем она не уйдёт.')).toEqual(['picker:Пикеры', 'cc:контролем']);
    expect(links('Нужен Spirit Resist и барьер.')).toEqual(['spirit-resist:Spirit Resist', 'barrier:барьер']);
  });

  it('links each term once and keeps the rest of the text intact', () => {
    const text = 'Барьер спасает, второй барьер тоже.';
    const parts = splitByTerms(text, m, new Set());
    expect(parts.map((p) => p.t).join('')).toBe(text);
    expect(parts.filter((p) => p.term)).toHaveLength(1);
  });

  it('does not link parts of other words or item names', () => {
    expect(links('Результат станет ясен.')).toEqual([]);
    expect(links('Купи Guardian Ward, а потом дави Guardian.')).toEqual(['guardian:Guardian']);
    const names = ITEMS.filter((i) => i.mode === 'standard').map((i) => i.name.en).join('. ');
    // Item names stay plain except the few that are themselves glossary words.
    const linked = links(names).map((x) => x.split(':')[0]);
    expect(linked.filter((id) => !['unstoppable'].includes(id))).toEqual([]);
  });
});
