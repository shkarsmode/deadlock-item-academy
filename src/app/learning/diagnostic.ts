import type { GameItem } from '../core/game-data/game-data.model';
import type { PlanInput, PlannedSession } from './planner';
import { interleave } from './planner';
import { GenContext, fromScenario, iconActivation, iconName, scenarioItems } from './questions/generators';
import type { Question } from './questions/question.model';
import { SECONDS_PER_FORMAT } from './questions/question.model';

/**
 * Short onboarding diagnostic (about 4 minutes): recognition of the hero's key items,
 * how a few of them work, and 2-3 easy situations. Answers seed the knowledge model
 * through the normal review pipeline, so the first sessions start at the right level.
 */
export function planDiagnostic(input: PlanInput): PlannedSession {
  const { rng } = input;
  const ctx: GenContext = {
    items: input.items,
    itemMap: input.itemMap,
    heroMap: input.heroMap,
    content: input.content,
    confusions: new Map(),
    heroKey: input.heroKey,
  };
  const hero = input.heroKey ? input.heroMap.get(input.heroKey) : undefined;
  const important = new Set<string>([...input.myBuildItems, ...(hero ? [...hero.popular.early, ...hero.popular.mid, ...hero.popular.late].map((p) => p.itemKey) : [])]);
  const core = rng.shuffle(input.items.filter((i) => important.has(i.key)));
  const others = rng.shuffle(input.items.filter((i) => !important.has(i.key)));
  const byTier = (list: GameItem[], n: number) => {
    const out: GameItem[] = [];
    for (let t = 1; t <= 4 && out.length < n; t++) {
      const x = list.find((i) => i.tier === t && !out.includes(i));
      if (x) out.push(x);
    }
    for (const x of list) if (out.length < n && !out.includes(x)) out.push(x);
    return out;
  };
  const recogItems = [...byTier(core, 5), ...byTier(others, 3)];
  const qs: Question[] = recogItems.map((it) => ({ ...iconName(it, ctx, rng, 2), askConfidence: false }));
  const mech = rng.shuffle(core.filter((i) => i.isActive || i.imbue)).slice(0, 3);
  for (const it of mech) qs.push({ ...iconActivation(it, rng, 2), askConfidence: true });
  const scen = rng
    .shuffle(input.scenarios.filter((s) => s.hero === input.heroKey && s.difficulty <= 2 && (s.kind === 'buy' || s.kind === 'diagnose-buy')))
    .slice(0, 3);
  for (const s of scen) if (scenarioItems(s, input.itemMap).length) qs.push({ ...fromScenario(s, ctx, rng, 'full'), askConfidence: true });
  const ordered = interleave(qs, rng);
  return { questions: ordered, newItems: [], estimatedSeconds: ordered.reduce((n, q) => n + SECONDS_PER_FORMAT[q.format], 0) };
}
