import { BUNDLE, ITEM_MAP } from '../../testing/fixtures';
import metaJson from '../../../../public/data/game/meta.json';
import type { GameMeta } from '../../core/game-data/game-data.model';
import { analyzeBuild, bonusAt } from './analyzer';

const meta = metaJson as unknown as GameMeta;

describe('bonusAt', () => {
  it('uses the highest reached investment threshold', () => {
    const steps = meta.investment.weapon;
    expect(bonusAt(steps, 0).bonus).toBe(0);
    expect(bonusAt(steps, 4799).bonus).toBe(bonusAt(steps, 3200).bonus);
    expect(bonusAt(steps, 4800).bonus).toBeGreaterThan(bonusAt(steps, 4799).bonus);
    expect(bonusAt(steps, 4799).next?.threshold).toBe(4800);
  });
});

describe('analyzeBuild', () => {
  it('counts components once (consumed by upgrades) and orders the timeline', () => {
    const cats = [
      { name: 'a', items: [{ key: 'upgrade_clip_size' }, { key: 'upgrade_titan_round' }] },
      { name: 'b', optional: true, items: [{ key: 'upgrade_metal_skin' }] },
    ];
    const r = analyzeBuild(cats, ITEM_MAP, BUNDLE.items, meta.investment);
    expect(r.consumed).toContain('upgrade_clip_size');
    expect(r.finalItems).toEqual(['upgrade_titan_round']);
    expect(r.totalCost).toBe(ITEM_MAP.get('upgrade_titan_round')!.cost);
    expect(r.timeline.map((p) => p.cumulative)).toEqual([800, ITEM_MAP.get('upgrade_titan_round')!.cost]);
    expect(r.finalItems).not.toContain('upgrade_metal_skin');
  });

  it('reaches the 4800 spirit threshold on the learner\'s current Vindicta build', () => {
    const b = BUNDLE.builds.find((x) => x.id === 'vindicta-current');
    expect(b).toBeTruthy();
    const r = analyzeBuild(b!.build.categories, ITEM_MAP, BUNDLE.items, meta.investment);
    expect(r.investment.find((i) => i.slot === 'spirit')!.spent).toBeGreaterThanOrEqual(4800);
    expect(r.imbues.some((x) => x.item === 'upgrade_quick_silver' && x.target === 'citadel_ability_hornet_sting')).toBe(true);
  });

  it('warns about missing imbue targets and recognizes hero anti-heal', () => {
    const cats = [{ name: 'a', items: [{ key: 'upgrade_magic_tempo' }] }];
    const plain = analyzeBuild(cats, ITEM_MAP, BUNDLE.items, meta.investment);
    expect(plain.issues.some((i) => i.items?.includes('upgrade_magic_tempo'))).toBe(true);
    const withHero = analyzeBuild(cats, ITEM_MAP, BUNDLE.items, meta.investment, ['Reduces Incoming Healing by -35%']);
    expect(withHero.issues.some((i) => /своё снижение лечения/.test(i.text.ru))).toBe(true);
  });
});
