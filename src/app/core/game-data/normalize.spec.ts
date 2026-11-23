import { cleanGameText, hashString, parseValveLocalization, stripEmphasis } from './normalize';
import { ITEMS } from '../../testing/fixtures';

describe('cleanGameText', () => {
  it('turns nested highlight / attribute spans into a single emphasis run', () => {
    const html = 'Your <span class="highlight"><span class="inline-attribute-label X">bullets deal</span> bonus</span> damage.<br>Next line';
    expect(cleanGameText(html)).toBe('Your **bullets deal bonus** damage.\nNext line');
  });
  it('drops inline SVG icons and decodes entities', () => {
    expect(cleanGameText('A <svg width="1"><path d="M0"/></svg>B &amp; C')).toBe('A B & C');
  });
  it('can strip emphasis', () => {
    expect(stripEmphasis('**a** b')).toBe('a b');
  });
});

describe('parseValveLocalization', () => {
  it('reads key/value pairs, escaped quotes, missing whitespace and comments', () => {
    const text = '"lang"\n{\n "Tokens"\n {\n  "a_desc" "Say \\"hi\\""\n  "b_desc""<b>x</b>"\n  //"c_desc" "ignored"\n }\n}';
    const m = parseValveLocalization(text);
    expect(m['a_desc']).toBe('Say "hi"');
    expect(m['b_desc']).toBe('<b>x</b>');
    expect(m['c_desc']).toBeUndefined();
  });
});

describe('normalized game data', () => {
  it('has stable unique keys and hashes', () => {
    const keys = ITEMS.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(ITEMS.every((i) => !!i.hash)).toBe(true);
    expect(hashString('x')).toBe(hashString('x'));
    expect(hashString('x')).not.toBe(hashString('y'));
  });
  it('separates Street Brawl (tier 5) items from the standard shop', () => {
    expect(ITEMS.filter((i) => i.tier === 5).every((i) => i.mode === 'street_brawl')).toBe(true);
    expect(ITEMS.filter((i) => i.mode === 'standard').length).toBe(156);
  });
  it('links components both ways', () => {
    for (const it of ITEMS) for (const c of it.components) expect(ITEMS.find((x) => x.key === c)?.upgradesInto).toContain(it.key);
  });
});
