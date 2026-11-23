import { BUNDLE, HEROES, ITEMS } from '../testing/fixtures';
import metaJson from '../../../public/data/game/meta.json';
import type { GameMeta } from '../core/game-data/game-data.model';
import type { GlossaryTerm, Scenario } from './content.model';
import { RawContent, Vocab, validateContent } from './validate-content';
import {
  CLAIM_STATUSES,
  CONTENT_STATUSES,
  DIMENSIONS,
  FORBIDDEN_CHARS,
  GLOSSARY_CATEGORIES,
  ITEM_ROLES,
  OUTDATED_ITEM_NAMES,
  PHASES,
  SCENARIO_KINDS,
  THREATS,
  VERDICT_MIN_SCORE,
  VERDICTS,
} from './vocab';

const vocab: Vocab = {
  roles: ITEM_ROLES,
  threats: THREATS,
  dims: DIMENSIONS,
  phases: PHASES,
  claimStatuses: CLAIM_STATUSES,
  scenarioKinds: SCENARIO_KINDS,
  verdicts: VERDICTS,
  verdictMin: VERDICT_MIN_SCORE,
  contentStatuses: CONTENT_STATUSES,
  forbiddenChars: FORBIDDEN_CHARS,
  outdatedNames: OUTDATED_ITEM_NAMES,
  glossaryCategories: GLOSSARY_CATEGORIES,
};
const game = { meta: metaJson as unknown as GameMeta, items: ITEMS, heroes: HEROES };

function raw(scenarios: Scenario[]): RawContent {
  return { items: [], scenarios: [{ file: 't.json', data: scenarios }], courses: [], builds: [], problems: [] };
}

describe('shipped content', () => {
  const all: RawContent = {
    items: [{ file: 'items', data: Object.values(BUNDLE.items) }],
    scenarios: [{ file: 'scenarios', data: BUNDLE.scenarios.map(({ pinned: _p, ...s }) => s as Scenario) }],
    courses: BUNDLE.courses.map((c) => ({ file: c.hero, data: c })),
    builds: BUNDLE.builds.map((b) => ({ file: b.id, data: b })),
    problems: [{ file: 'problems', data: BUNDLE.problems }],
    glossary: [{ file: 'glossary', data: BUNDLE.glossary ?? [] }],
  };
  const report = validateContent(all, game, vocab);

  it('has no validation errors', () => {
    expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
  });
  it('covers every standard shop item', () => {
    expect(report.stats['itemCoverage']).toBe('156/156');
  });
  it('ships at least 150 situational scenarios with unique ids', () => {
    expect(BUNDLE.scenarios.length).toBeGreaterThanOrEqual(150);
    expect(new Set(BUNDLE.scenarios.map((s) => s.id)).size).toBe(BUNDLE.scenarios.length);
  });
  it('ships a glossary with the basic terms the item cards link to', () => {
    const ids = new Set((BUNDLE.glossary ?? []).map((t) => t.id));
    expect(ids.size).toBeGreaterThanOrEqual(50);
    for (const id of ['imbue', 'active-item', 'passive-item', 'spirit-power', 'scaling', 'carry', 'picker', 'tier', 'component']) expect(ids.has(id), id).toBe(true);
  });
  it('has deep courses for Vindicta and Graves', () => {
    expect(BUNDLE.courses.map((c) => c.hero).sort()).toEqual(['hero_hornet', 'hero_necro']);
  });
});

describe('validator rules', () => {
  const good = BUNDLE.scenarios.find((s) => s.kind === 'buy') as Scenario;
  const bestItem = good.options.find((o) => o.verdict === 'best')?.item as string;
  const bestName = ITEMS.find((i) => i.key === bestItem)?.name.en ?? '';

  it('accepts a valid scenario', () => {
    expect(validateContent(raw([good]), game, vocab).errors).toBe(0);
  });
  it('catches answer leaks, long dashes and verdict/score mismatches', () => {
    const bad: Scenario = {
      ...good,
      situation: { ru: `Купи ${bestName} \u2014 срочно` },
      options: good.options.map((o) => (o.verdict === 'best' ? o : { ...o, verdict: 'best' as const })),
    };
    const msgs = validateContent(raw([bad]), game, vocab).issues.map((i) => i.msg).join('\n');
    expect(msgs).toMatch(/answer leak/);
    expect(msgs).toMatch(/forbidden dash/);
    expect(msgs).toMatch(/does not match score/);
  });
  it('catches unknown items and outdated item names', () => {
    const bad: Scenario = { ...good, owned: ['upgrade_does_not_exist'], question: { ru: 'Брать Debuff Remover?' } };
    const msgs = validateContent(raw([bad]), game, vocab).issues.map((i) => i.msg).join('\n');
    expect(msgs).toMatch(/unknown item/);
    expect(msgs).toMatch(/outdated item name/);
  });
  it('rejects unaffordable "best" answers', () => {
    const bad: Scenario = { ...good, souls: 0 };
    const msgs = validateContent(raw([bad]), game, vocab).issues.map((i) => i.msg).join('\n');
    expect(msgs).toMatch(/souls available/);
  });
});

describe('glossary rules', () => {
  const base: GlossaryTerm = {
    id: 'imbue',
    category: 'items',
    en: 'Imbue',
    ru: ['Усиление'],
    short: { ru: 'Предмет усиливает одно выбранное умение.' },
    explain: { ru: 'При покупке игра просит выбрать умение.' },
    items: ['upgrade_magic_storm'],
    status: 'data',
  };
  const check = (terms: GlossaryTerm[]) => validateContent({ ...raw([]), glossary: [{ file: 'g.json', data: terms }] }, game, vocab);

  it('accepts a valid term and pins its items', () => {
    const r = check([base]);
    expect(r.errors).toBe(0);
    expect(r.references['glossary:imbue']).toEqual(['upgrade_magic_storm']);
  });
  it('catches duplicates, unknown links, bad categories and long dashes', () => {
    const msgs = check([
      base,
      { ...base, category: 'nope' as GlossaryTerm['category'], related: ['missing-term'], short: { ru: `Усиление \u2014 это` } },
      { ...base, id: 'Bad Id', items: ['upgrade_does_not_exist'] },
    ]).issues.map((i) => i.msg).join('\n');
    expect(msgs).toMatch(/duplicate term id/);
    expect(msgs).toMatch(/unknown term "missing-term"/);
    expect(msgs).toMatch(/unknown category/);
    expect(msgs).toMatch(/forbidden dash/);
    expect(msgs).toMatch(/kebab-case/);
    expect(msgs).toMatch(/unknown item/);
  });
});
