import { BUNDLE, HEROES, ITEMS } from '../testing/fixtures';
import metaJson from '../../../public/data/game/meta.json';
import type { GameMeta } from '../core/game-data/game-data.model';
import type { Scenario } from './content.model';
import { RawContent, Vocab, validateContent } from './validate-content';
import {
  CLAIM_STATUSES,
  CONTENT_STATUSES,
  DIMENSIONS,
  FORBIDDEN_CHARS,
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
