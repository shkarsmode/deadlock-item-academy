import { decodeShare, encodeShare } from './share-code';

describe('share codes', () => {
  it('round-trips a training set with Cyrillic titles', () => {
    const code = encodeShare({ v: 1, hero: 'hero_hornet', scenarios: ['vin-def-001', 'gen-002'], title: 'Защита Vindicta' });
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeShare(code)).toEqual({ v: 1, hero: 'hero_hornet', scenarios: ['vin-def-001', 'gen-002'], title: 'Защита Vindicta', items: undefined, minutes: undefined });
  });
  it('rejects garbage and wrong versions', () => {
    expect(decodeShare('not-a-code')).toBeNull();
    expect(decodeShare(encodeShare({ v: 2 as 1, hero: null }))).toBeNull();
  });
});
