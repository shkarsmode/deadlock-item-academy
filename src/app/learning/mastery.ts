import type { Dimension } from '../content/content.model';
import type { GameItem } from '../core/game-data/game-data.model';
import type { DimState, ItemKnowledge, MasteryLevel } from './knowledge.model';
import { retrievability, stabilityDays } from './srs';

/**
 * Mastery levels are earned by results, never by question counts alone:
 * each level needs recent, spaced, correct evidence on specific knowledge dimensions.
 *
 * L1 Recognition   - icon: recalled correctly at least twice, memory stable for 1+ day.
 * L2 Understanding - L1 + effect and mechanics are known (stable).
 * L3 Application   - L2 + picked the item correctly in situations (situation or counter).
 * L4 Analysis      - L3 + build-level reasoning (build / synergy; active timing for actives).
 * L5 Mastery       - L4 + 2+ correct first-time answers to hard, hint-free scenarios, no open misconception.
 */
export const LEVEL_NAMES: Record<MasteryLevel, { ru: string; en: string }> = {
  0: { ru: 'Не начато', en: 'Not started' },
  1: { ru: 'Узнавание', en: 'Recognition' },
  2: { ru: 'Понимание', en: 'Understanding' },
  3: { ru: 'Применение', en: 'Application' },
  4: { ru: 'Анализ', en: 'Analysis' },
  5: { ru: 'Мастерство', en: 'Mastery' },
};

export const DIM_NAMES: Record<Dimension, { ru: string; en: string }> = {
  icon: { ru: 'Узнавание иконки', en: 'Icon recognition' },
  effect: { ru: 'Понимание эффекта', en: 'Effect understanding' },
  mechanics: { ru: 'Механика', en: 'Mechanics' },
  situation: { ru: 'Ситуации', en: 'Situation awareness' },
  counter: { ru: 'Контрпики', en: 'Counterpick knowledge' },
  synergy: { ru: 'Синергии', en: 'Hero synergy' },
  active: { ru: 'Активное использование', en: 'Active usage' },
  build: { ru: 'Решения по билду', en: 'Build decisions' },
};

/** A dimension counts as "known" when recall is likely now and memory has some stability. */
export function dimKnown(s: DimState | undefined, now: number, opts: { minR?: number; minCorrect?: number; minStability?: number } = {}): boolean {
  if (!s) return false;
  const { minR = 0.75, minCorrect = 2, minStability = 1 } = opts;
  return s.correct >= minCorrect && retrievability(s, now) >= minR && stabilityDays(s) >= minStability && !s.misconception;
}

/** 0..1 strength used for display (recall probability, damped by thin evidence). */
export function dimStrength(s: DimState | undefined, now: number): number {
  if (!s || s.attempts === 0) return 0;
  const evidence = Math.min(1, s.correct / 3);
  return retrievability(s, now) * (0.4 + 0.6 * evidence) * (s.misconception ? 0.5 : 1);
}

export function itemLevel(k: ItemKnowledge | undefined, item: GameItem | undefined, now: number): MasteryLevel {
  if (!k) return 0;
  const d = k.dims;
  if (!dimKnown(d.icon, now, { minR: 0.8 })) return 0;
  if (!(dimKnown(d.effect, now) && dimKnown(d.mechanics, now, { minCorrect: 1 }))) return 1;
  const applied = dimKnown(d.situation, now, { minR: 0.7, minStability: 0.5 }) || dimKnown(d.counter, now, { minR: 0.7, minStability: 0.5 });
  if (!applied) return 2;
  const buildOk = dimKnown(d.build, now, { minR: 0.7, minStability: 0.5 }) || dimKnown(d.synergy, now, { minR: 0.7, minStability: 0.5 });
  const activeOk = !item?.isActive || dimKnown(d.active, now, { minR: 0.7, minCorrect: 1, minStability: 0.5 });
  if (!(buildOk && activeOk)) return 3;
  const novel = (d.situation?.novelHardCorrect ?? 0) + (d.counter?.novelHardCorrect ?? 0) + (d.build?.novelHardCorrect ?? 0);
  const misconception = Object.values(d).some((x) => x?.misconception);
  if (novel < 2 || misconception) return 4;
  return 5;
}

export function hasMisconception(k: ItemKnowledge | undefined): boolean {
  return !!k && Object.values(k.dims).some((x) => x?.misconception);
}

/** "Problem item": studied, but weak or repeatedly failed. */
export function isProblemItem(k: ItemKnowledge | undefined, now: number): boolean {
  if (!k) return false;
  const dims = Object.values(k.dims).filter((x): x is DimState => !!x && x.attempts > 0);
  if (!dims.length) return false;
  const lapses = dims.reduce((n, s) => n + s.card.lapses, 0);
  const weak = dims.filter((s) => dimStrength(s, now) < 0.45).length;
  return hasMisconception(k) || lapses >= 3 || (weak >= 2 && dims.reduce((n, s) => n + s.attempts, 0) >= 4);
}
