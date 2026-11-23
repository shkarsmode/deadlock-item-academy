import type { ItemContent, ItemRole, Text } from '../../content/content.model';
import type { GameItem, InvestmentStep, Slot } from '../../core/game-data/game-data.model';
import type { SavedBuildCategory } from './build.model';

export interface InvestmentState {
  slot: Slot;
  spent: number;
  bonus: number;
  /** Next threshold and its bonus, if any. */
  next: InvestmentStep | null;
}

export interface BuildIssue {
  level: 'info' | 'warn';
  text: Text;
  items?: string[];
}

export interface TimelinePoint {
  item: string;
  cumulative: number;
  /** Category bonus reached after this purchase. */
  investment: Record<Slot, number>;
}

export interface BuildReport {
  finalItems: string[];
  consumed: string[];
  totalCost: number;
  investment: InvestmentState[];
  actives: string[];
  imbues: { item: string; target: string | null }[];
  roleCounts: Partial<Record<ItemRole, number>>;
  issues: BuildIssue[];
  timeline: TimelinePoint[];
}

const DEFENSE_ROLES: ItemRole[] = ['bullet-resist', 'spirit-resist', 'barrier', 'max-health', 'cleanse', 'cc-immunity', 'invulnerability', 'anti-burst', 'escape'];

export function bonusAt(steps: InvestmentStep[], spent: number): { bonus: number; next: InvestmentStep | null } {
  let bonus = 0;
  let next: InvestmentStep | null = null;
  for (const s of steps) {
    if (spent >= s.threshold) bonus = s.bonus;
    else {
      next = s;
      break;
    }
  }
  return { bonus, next };
}

/**
 * Analyses a build plan. Purchase order = category order, then item order.
 * Component items are consumed by their upgrades: an upgrade's full price is what the player
 * has spent on that line, so the investment total counts each final item once (approximation,
 * see docs). Optional categories are treated as alternatives and excluded from totals.
 */
export function analyzeBuild(
  categories: SavedBuildCategory[],
  items: Map<string, GameItem>,
  content: Record<string, ItemContent>,
  investment: Record<Slot, InvestmentStep[]>,
  /** Hero ability texts (en): used to recognize built-in effects such as anti-heal. */
  heroAbilityTexts: string[] = [],
): BuildReport {
  const core = categories.filter((c) => !c.optional).flatMap((c) => c.items);
  const all = categories.flatMap((c) => c.items);
  const keys = [...new Set(core.map((i) => i.key))].filter((k) => items.has(k));
  const consumed = keys.filter((k) => keys.some((o) => items.get(o)?.components.includes(k)));
  const finalItems = keys.filter((k) => !consumed.includes(k));
  const spent: Record<Slot, number> = { weapon: 0, vitality: 0, spirit: 0 };
  const owned: string[] = [];
  const timeline: TimelinePoint[] = [];
  let cumulative = 0;
  for (const k of keys) {
    const it = items.get(k);
    if (!it) continue;
    let price = it.cost;
    for (const c of it.components) if (owned.includes(c)) price -= items.get(c)?.cost ?? 0;
    cumulative += price;
    spent[it.slot] += price;
    owned.push(k);
    timeline.push({
      item: k,
      cumulative,
      investment: {
        weapon: bonusAt(investment.weapon, spent.weapon).bonus,
        vitality: bonusAt(investment.vitality, spent.vitality).bonus,
        spirit: bonusAt(investment.spirit, spent.spirit).bonus,
      },
    });
  }
  const inv: InvestmentState[] = (['weapon', 'vitality', 'spirit'] as Slot[]).map((slot) => ({ slot, spent: spent[slot], ...bonusAt(investment[slot], spent[slot]) }));

  const roleCounts: Partial<Record<ItemRole, number>> = {};
  for (const k of finalItems) for (const r of content[k]?.roles ?? []) roleCounts[r] = (roleCounts[r] ?? 0) + 1;
  const actives = finalItems.filter((k) => items.get(k)?.isActive);
  const imbues = all.filter((i) => items.get(i.key)?.imbue).map((i) => ({ item: i.key, target: i.imbue ?? null }));

  const issues: BuildIssue[] = [];
  const sb = all.filter((i) => items.get(i.key)?.mode === 'street_brawl').map((i) => i.key);
  if (sb.length) issues.push({ level: 'warn', text: { ru: 'В билде есть предметы Street Brawl: в обычном матче их нет.', en: 'The build has Street Brawl items: they do not exist in normal matches.' }, items: sb });
  const noTarget = imbues.filter((x) => !x.target).map((x) => x.item);
  if (noTarget.length) issues.push({ level: 'warn', text: { ru: 'Для imbue-предмета не указана способность. В игре ты выберешь её при покупке: реши заранее.', en: 'No imbue target set. You will pick it on purchase: decide in advance.' }, items: noTarget });
  const defense = finalItems.filter((k) => (content[k]?.roles ?? []).some((r) => DEFENSE_ROLES.includes(r)));
  if (finalItems.length >= 6 && defense.length === 0)
    issues.push({ level: 'warn', text: { ru: 'В основной части билда нет защитных предметов. Против бурста или контроля понадобится ситуативная замена.', en: 'No defensive items in the core build. Plan situational swaps against burst or control.' } });
  const heroAntiHeal = heroAbilityTexts.some((t) => /incoming heal/i.test(t));
  if (!finalItems.some((k) => content[k]?.roles.includes('anti-heal')) && !all.some((i) => content[i.key]?.roles.includes('anti-heal')))
    issues.push(
      heroAntiHeal
        ? { level: 'info', text: { ru: 'Предмета с anti-heal нет, но у героя есть своё снижение лечения в улучшениях способностей. Как оно складывается с предметами, в данных не указано.', en: 'No anti-heal item, but the hero has built-in healing reduction in ability upgrades. Stacking with items is not stated in the data.' } }
        : { level: 'info', text: { ru: 'Нет варианта против сильного лечения врагов. Держи в голове предмет с anti-heal на такой случай.', en: 'No anti-heal option. Keep one in mind for healing-heavy enemies.' } },
    );
  if (actives.length >= 4) issues.push({ level: 'info', text: { ru: `Активных предметов: ${actives.length}. Каждый требует внимания в бою, проверь, что успеваешь их нажимать.`, en: `${actives.length} active items: make sure you can actually press them in fights.` }, items: actives });
  const antiHeal = finalItems.filter((k) => content[k]?.roles.includes('anti-heal'));
  if (antiHeal.length >= 2) issues.push({ level: 'info', text: { ru: 'Несколько источников снижения лечения. Как они складываются, в данных клиента не указано.', en: 'Several anti-heal sources. How they stack is not stated in the client data.' }, items: antiHeal });
  for (const slot of ['weapon', 'vitality', 'spirit'] as Slot[]) {
    const s = inv.find((x) => x.slot === slot);
    if (s?.next && s.next.threshold - s.spent > 0 && s.next.threshold - s.spent <= 800)
      issues.push({
        level: 'info',
        text: {
          ru: `${slot}: до следующего порога вложений ${s.next.threshold} не хватает ${s.next.threshold - s.spent} душ (бонус ${s.bonus} -> ${s.next.bonus}).`,
          en: `${slot}: ${s.next.threshold - s.spent} souls short of the ${s.next.threshold} investment threshold (bonus ${s.bonus} -> ${s.next.bonus}).`,
        },
      });
  }
  return { finalItems, consumed, totalCost: cumulative, investment: inv, actives, imbues, roleCounts, issues, timeline };
}
