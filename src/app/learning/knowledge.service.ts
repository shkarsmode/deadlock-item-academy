import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { Dimension } from '../content/content.model';
import { getDb } from '../core/db/db';
import { GameData } from '../core/game-data/game-data.service';
import { Profiles } from '../core/profile/profile.service';
import type {
  Confidence,
  DimState,
  ItemKnowledge,
  MasteryLevel,
  MistakeEntry,
  QuestionExposure,
  ResultKind,
  ReviewRecord,
  ReviewTarget,
} from './knowledge.model';
import { itemLevel } from './mastery';
import { AnswerSignal, applyAnswer, newDimState } from './srs';

export interface AnswerEvent {
  questionId: string;
  questionType: string;
  format: string;
  difficulty: number;
  heroKey: string | null;
  targets: ReviewTarget[];
  result: ResultKind;
  score: number;
  confidence: Confidence | null;
  latencyMs: number;
  recall: boolean;
  optionCount: number;
  fastMs: number;
  hints: 'full' | 'reduced' | 'none';
  /** Item the learner chose (for confusion tracking) and the expected one. */
  chosenItem: string | null;
  expectedItem: string | null;
  /** Scenario id or principle reference for principle mistakes. */
  principleRef: string | null;
  sessionId: string | null;
}

const REVIEW_WINDOW_DAYS = 120;

/**
 * Learner knowledge store for the current profile: per-item dimension states, review log,
 * question exposures and the mistake notebook. Write-through to IndexedDB.
 */
@Injectable({ providedIn: 'root' })
export class Knowledge {
  private readonly profiles = inject(Profiles);
  private readonly game = inject(GameData);

  readonly loaded = signal(false);
  readonly map = signal<Map<string, ItemKnowledge>>(new Map());
  readonly reviews = signal<ReviewRecord[]>([]);
  readonly exposures = signal<Map<string, QuestionExposure>>(new Map());
  readonly mistakes = signal<MistakeEntry[]>([]);
  /** Bumped on every answer so time-dependent computations refresh. */
  readonly tick = signal(0);

  readonly levels = computed(() => {
    this.tick();
    const now = Date.now();
    const out = new Map<string, MasteryLevel>();
    for (const it of this.game.standardItems()) out.set(it.key, itemLevel(this.map().get(it.key), it, now));
    return out;
  });

  private loadedFor: string | null = null;

  constructor() {
    effect(() => {
      const id = this.profiles.profileId();
      const ready = this.profiles.ready();
      if (!ready || id === 'none') return;
      untracked(() => void this.loadFor(id));
    });
  }

  async loadFor(profileId: string): Promise<void> {
    if (this.loadedFor === profileId && this.loaded()) return;
    this.loadedFor = profileId;
    this.loaded.set(false);
    try {
      const db = await getDb();
      const since = Date.now() - REVIEW_WINDOW_DAYS * 86_400_000;
      const [know, reviews, exposures, mistakes] = await Promise.all([
        db.getAllFromIndex('knowledge', 'byProfile', profileId),
        db.getAllFromIndex('reviews', 'byProfileTs', IDBKeyRange.bound([profileId, since], [profileId, Number.MAX_SAFE_INTEGER])),
        db.getAllFromIndex('exposures', 'byProfile', profileId),
        db.getAllFromIndex('mistakes', 'byProfile', profileId),
      ]);
      if (this.loadedFor !== profileId) return;
      this.map.set(new Map(know.map((k) => [k.itemKey, k])));
      this.reviews.set(reviews.sort((a, b) => a.ts - b.ts));
      this.exposures.set(new Map(exposures.map((e) => [e.questionId, e])));
      this.mistakes.set(mistakes);
    } catch (e) {
      console.error(e);
      this.map.set(new Map());
      this.reviews.set([]);
      this.exposures.set(new Map());
      this.mistakes.set([]);
    }
    this.loaded.set(true);
    this.tick.update((t) => t + 1);
  }

  get(itemKey: string): ItemKnowledge | undefined {
    return this.map().get(itemKey);
  }

  dim(itemKey: string, dim: Dimension): DimState | undefined {
    return this.map().get(itemKey)?.dims[dim];
  }

  isNovel(questionId: string): boolean {
    return !this.exposures().has(questionId);
  }

  /** Records an answer: updates FSRS cards, review log, exposures and mistakes. */
  async record(ev: AnswerEvent): Promise<ReviewRecord> {
    const profileId = this.profiles.profileId();
    const now = Date.now();
    const novel = this.isNovel(ev.questionId);
    const sig: AnswerSignal = {
      result: ev.result,
      score: ev.score,
      confidence: ev.confidence,
      recall: ev.recall,
      optionCount: ev.optionCount,
      latencyMs: ev.latencyMs,
      fastMs: ev.fastMs,
    };
    const changed: ItemKnowledge[] = [];
    const map = new Map(this.map());
    for (const t of ev.targets) {
      const prev = map.get(t.item) ?? { profileId, itemKey: t.item, dims: {}, introducedAt: now, flagged: null };
      const dimPrev = prev.dims[t.dim] ?? newDimState(now);
      // Secondary targets of a wrong scenario answer are not penalized as hard as the primary one.
      const tSig = t.weight < 0.5 && sig.result === 'wrong' ? { ...sig, result: 'partial' as ResultKind } : sig;
      const dims = { ...prev.dims, [t.dim]: applyAnswer(dimPrev, tSig, t.weight, now, { novel, difficulty: ev.difficulty, hints: ev.hints }) };
      const next: ItemKnowledge = { ...prev, dims, introducedAt: prev.introducedAt ?? now, flagged: prev.flagged };
      map.set(t.item, next);
      changed.push(next);
    }
    this.map.set(map);

    const review: ReviewRecord = {
      profileId,
      ts: now,
      sessionId: ev.sessionId,
      questionId: ev.questionId,
      questionType: ev.questionType,
      format: ev.format,
      difficulty: ev.difficulty,
      heroKey: ev.heroKey,
      targets: ev.targets,
      result: ev.result,
      score: ev.score,
      confidence: ev.confidence,
      latencyMs: ev.latencyMs,
      novel,
      chosenItem: ev.chosenItem,
      hints: ev.hints,
    };
    this.reviews.update((r) => [...r, review]);

    const prevExp = this.exposures().get(ev.questionId);
    const good = ev.result === 'correct';
    const exposure: QuestionExposure = {
      profileId,
      questionId: ev.questionId,
      seen: (prevExp?.seen ?? 0) + 1,
      correct: (prevExp?.correct ?? 0) + (good ? 1 : 0),
      lastAt: now,
      lastResult: ev.result,
    };
    this.exposures.update((m) => new Map(m).set(ev.questionId, exposure));

    const mistakeChanges = this.updateMistakes(ev, now, profileId);
    this.tick.update((t) => t + 1);

    try {
      const db = await getDb();
      const tx = db.transaction(['knowledge', 'reviews', 'exposures', 'mistakes'], 'readwrite');
      for (const k of changed) void tx.objectStore('knowledge').put(k);
      const id = await tx.objectStore('reviews').add(review);
      review.id = id;
      void tx.objectStore('exposures').put(exposure);
      for (const m of mistakeChanges) void tx.objectStore('mistakes').put(m);
      await tx.done;
    } catch (e) {
      console.error('persist failed', e);
    }
    return review;
  }

  private updateMistakes(ev: AnswerEvent, now: number, profileId: string): MistakeEntry[] {
    const list = [...this.mistakes()];
    const touched: MistakeEntry[] = [];
    const upsert = (id: string, make: () => MistakeEntry, bump: (m: MistakeEntry) => MistakeEntry) => {
      const i = list.findIndex((m) => m.id === id);
      const next = i >= 0 ? bump(list[i]) : make();
      if (i >= 0) list[i] = next;
      else list.push(next);
      touched.push(next);
    };
    const wrong = ev.result === 'wrong';
    const primary = ev.targets[0];
    if (wrong && ev.chosenItem && ev.expectedItem && ev.chosenItem !== ev.expectedItem) {
      const pair = [ev.expectedItem, ev.chosenItem].sort().join('|');
      upsert(
        `c:${pair}`,
        () => ({ id: `c:${pair}`, profileId, kind: 'confusion', items: [ev.expectedItem as string, ev.chosenItem as string], ref: ev.questionId, dim: primary?.dim ?? null, count: 1, firstAt: now, lastAt: now, fixedStreak: 0, resolved: false, note: null }),
        (m) => ({ ...m, items: [ev.expectedItem as string, ev.chosenItem as string], count: m.count + 1, lastAt: now, fixedStreak: 0, resolved: false }),
      );
    }
    if (wrong && primary && (ev.confidence === 'sure' || ev.confidence === 'likely')) {
      const id = `m:${primary.item}:${primary.dim}`;
      upsert(
        id,
        () => ({ id, profileId, kind: 'misconception', items: [primary.item], ref: ev.questionId, dim: primary.dim, count: 1, firstAt: now, lastAt: now, fixedStreak: 0, resolved: false, note: null }),
        (m) => ({ ...m, count: m.count + 1, lastAt: now, fixedStreak: 0, resolved: false }),
      );
    }
    if (ev.principleRef && (wrong || ev.score < 0.6)) {
      const id = `p:${ev.principleRef}`;
      upsert(
        id,
        () => ({ id, profileId, kind: 'principle', items: ev.targets.map((t) => t.item), ref: ev.principleRef, dim: primary?.dim ?? null, count: 1, firstAt: now, lastAt: now, fixedStreak: 0, resolved: false, note: null }),
        (m) => ({ ...m, count: m.count + 1, lastAt: now, fixedStreak: 0, resolved: false }),
      );
    }
    // Correct answers repair related open mistakes (two in a row resolve them).
    if (ev.result === 'correct' || (ev.result === 'partial' && ev.score >= 0.75)) {
      const items = new Set(ev.targets.map((t) => t.item));
      for (let i = 0; i < list.length; i++) {
        const m = list[i];
        if (m.resolved) continue;
        const related =
          (m.kind === 'principle' && m.ref === ev.principleRef) ||
          (m.kind === 'misconception' && items.has(m.items[0]) && ev.targets.some((t) => t.dim === m.dim)) ||
          (m.kind === 'confusion' && m.items.some((x) => items.has(x)) && ev.questionType !== 'scenario');
        if (!related) continue;
        const fixedStreak = m.fixedStreak + 1;
        const next = { ...m, fixedStreak, resolved: fixedStreak >= 2 };
        list[i] = next;
        touched.push(next);
      }
    }
    if (touched.length) this.mistakes.set(list);
    return touched;
  }

  /** After a game update: flag changed items and bring their mechanics knowledge back for review. */
  async flagChanged(changes: { key: string; fields: string[] }[], version: number): Promise<number> {
    const now = Date.now();
    const map = new Map(this.map());
    const changed: ItemKnowledge[] = [];
    for (const c of changes) {
      const k = map.get(c.key);
      if (!k) continue;
      const dims = { ...k.dims };
      for (const d of ['effect', 'mechanics', 'situation'] as Dimension[]) {
        const s = dims[d];
        if (s) dims[d] = { ...s, card: { ...s.card, due: now, stability: Math.min(s.card.stability, 1) } };
      }
      const next = { ...k, dims, flagged: { version, at: now, fields: c.fields } };
      map.set(c.key, next);
      changed.push(next);
    }
    this.map.set(map);
    this.tick.update((t) => t + 1);
    if (changed.length) {
      const db = await getDb();
      const tx = db.transaction('knowledge', 'readwrite');
      for (const k of changed) void tx.store.put(k);
      await tx.done;
    }
    return changed.length;
  }

  async clearFlag(itemKey: string): Promise<void> {
    const k = this.map().get(itemKey);
    if (!k?.flagged) return;
    const next = { ...k, flagged: null };
    this.map.update((m) => new Map(m).set(itemKey, next));
    const db = await getDb();
    await db.put('knowledge', next);
  }

  async setMistakeResolved(id: string, resolved: boolean): Promise<void> {
    const m = this.mistakes().find((x) => x.id === id);
    if (!m) return;
    const next = { ...m, resolved };
    this.mistakes.update((list) => list.map((x) => (x.id === id ? next : x)));
    const db = await getDb();
    await db.put('mistakes', next);
  }

  /** Reload after an import or reset. */
  async reload(): Promise<void> {
    this.loadedFor = null;
    await this.loadFor(this.profiles.profileId());
  }
}
