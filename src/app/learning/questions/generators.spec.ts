import { BUNDLE, HERO_MAP, ITEM_MAP, STANDARD, item } from '../../testing/fixtures';
import {
  GenContext,
  activationKind,
  componentQ,
  contrast,
  effectItem,
  fromScenario,
  iconActivation,
  iconName,
  iconRecall,
  iconTier,
  itemEffect,
  mechanicTF,
  nameIcon,
  problemItem,
  scrubNames,
} from './generators';
import type { Question } from './question.model';
import { makeRng } from './rng';

const ctx: GenContext = { items: STANDARD, itemMap: ITEM_MAP, heroMap: HERO_MAP, content: BUNDLE.items, confusions: new Map(), heroKey: 'hero_hornet' };

function checkOptions(q: Question): void {
  const ids = q.options.map((o) => o.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(q.options.filter((o) => o.correct).length).toBe(1);
}

describe('data question generators (all standard items)', () => {
  it('icon/name questions have unique options and exactly one correct answer for every item', () => {
    const rng = makeRng(1);
    for (const it of STANDARD) {
      for (const d of [1, 2, 4]) {
        const q = iconName(it, ctx, rng, d);
        checkOptions(q);
        expect(q.options.find((o) => o.correct)?.itemKey).toBe(it.key);
        // no duplicate display names either
        const names = q.options.map((o) => ITEM_MAP.get(o.itemKey ?? '')?.name.en);
        expect(new Set(names).size).toBe(names.length);
      }
      checkOptions(nameIcon(it, ctx, rng, 2));
    }
  });

  it('shuffles the position of the correct answer', () => {
    const positions = new Set<number>();
    const rng = makeRng(7);
    for (let i = 0; i < 40; i++) positions.add(iconName(item('upgrade_metal_skin'), ctx, rng, 2).options.findIndex((o) => o.correct));
    expect(positions.size).toBeGreaterThan(1);
  });

  it('activation and tier answers match the client data', () => {
    const rng = makeRng(3);
    for (const it of STANDARD) {
      const a = iconActivation(it, rng, 2);
      expect(a.options.find((o) => o.correct)?.id).toBe(activationKind(it));
      const t = iconTier(it, rng, 2);
      expect(t.options.find((o) => o.correct)?.id).toBe(String(it.cost));
    }
  });

  it('true/false mechanics facts are consistent with the data', () => {
    const rng = makeRng(11);
    for (const it of STANDARD) {
      for (let i = 0; i < 4; i++) {
        const q = mechanicTF(it, ctx, rng, 2);
        checkOptions(q);
        const truth = q.options.find((o) => o.id === 'true')?.correct;
        const fact = q.id.split(':').slice(2).join(':');
        if (fact === 'active') expect(truth).toBe(it.isActive);
        if (fact === 'imbue') expect(truth).toBe(!!it.imbue);
        if (fact.startsWith('cost-')) expect(truth).toBe(Number(fact.slice(5)) === it.cost);
        if (fact.startsWith('comp-')) expect(truth).toBe(it.components.includes(fact.slice(5)));
        if (fact.startsWith('stat-')) expect(truth).toBe(it.sections.some((s) => s.stats.some((l) => l.prop === fact.slice(5))));
      }
    }
  });

  it('component questions point to real components / upgrades', () => {
    const rng = makeRng(5);
    for (const it of STANDARD.filter((i) => i.components.length || i.upgradesInto.length)) {
      const q = componentQ(it, ctx, rng, 2);
      if (!q) continue;
      checkOptions(q);
      const ans = q.options.find((o) => o.correct)?.itemKey ?? '';
      expect([...it.components, ...it.upgradesInto]).toContain(ans);
    }
  });

  it('effect questions never show the answer name in the prompt', () => {
    const rng = makeRng(9);
    for (const it of STANDARD) {
      const q = effectItem(it, ctx, rng, 3);
      if (!q?.prompt.quote) continue;
      const text = `${q.prompt.quote.ru} ${q.prompt.quote.en ?? ''}`.toLowerCase();
      expect(text.includes(it.name.en.toLowerCase())).toBe(false);
    }
  });

  it('item-effect options are distinct jobs', () => {
    const rng = makeRng(13);
    for (const it of STANDARD.slice(0, 60)) {
      const q = itemEffect(it, ctx, rng, 2);
      if (!q) continue;
      checkOptions(q);
      expect(q.options.find((o) => o.correct)?.id).toBe(it.key);
    }
  });

  it('problem questions use authored counters and exclude items that also counter the threat', () => {
    const rng = makeRng(17);
    for (const it of STANDARD) {
      const q = problemItem(it, ctx, rng, 2);
      if (!q) continue;
      const threat = q.id.split(':')[2];
      for (const o of q.options.filter((x) => !x.correct)) expect(BUNDLE.items[o.itemKey ?? '']?.counters ?? []).not.toContain(threat);
    }
  });

  it('recall accepts both official names', () => {
    const q = iconRecall(item('upgrade_reduce_debuff_duration'), 3, false);
    expect(q.accept).toEqual(['Dispel Magic', item('upgrade_reduce_debuff_duration').name.ru]);
  });

  it('contrast questions show both items', () => {
    const q = contrast(item('upgrade_metal_skin'), item('upgrade_tech_purge'), ctx, makeRng(2), 'effect');
    expect(q.options.map((o) => o.itemKey).sort()).toEqual(['upgrade_metal_skin', 'upgrade_tech_purge']);
    checkOptions(q);
  });

  it('scrubs names in Russian and English', () => {
    const it = item('upgrade_rupture');
    expect(scrubNames(`Урон от «${it.name.ru}» не может убить. Decay's damage`, it)).not.toMatch(/Decay|Разложени/);
  });
});

describe('scenario questions', () => {
  it('every authored scenario converts into a question with a best option and targets', () => {
    const rng = makeRng(21);
    for (const s of BUNDLE.scenarios) {
      const q = fromScenario(s, ctx, rng, 'full');
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.options.some((o) => o.verdict === 'best')).toBe(true);
      expect(q.targets.length).toBeGreaterThan(0);
      if (s.kind === 'diagnose-buy') expect(q.format).toBe('two-step');
    }
  });
});
