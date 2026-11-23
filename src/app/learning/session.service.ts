import { Injectable, computed, inject, signal } from '@angular/core';
import { Content } from '../content/content.service';
import { getDb } from '../core/db/db';
import { GameData } from '../core/game-data/game-data.service';
import { Profiles, newId } from '../core/profile/profile.service';
import type { Confidence, ResultKind, SessionRecord } from './knowledge.model';
import { Knowledge } from './knowledge.service';
import { PlanFilters, PlanInput, SessionMode, followUpQuestion, planSession } from './planner';
import { matchAnswer } from './questions/fuzzy';
import type { QOption, Question } from './questions/question.model';
import { makeRng, seedFrom } from './questions/rng';
import { MyBuild } from './my-build.service';
import { planDiagnostic } from './diagnostic';

export type Phase = 'idle' | 'answering' | 'diagnosis-feedback' | 'confidence' | 'feedback' | 'done';

export interface AnswerResult {
  question: Question;
  result: ResultKind;
  score: number;
  chosen: QOption | null;
  typed: string | null;
  typo: boolean;
  confidence: Confidence | null;
  latencyMs: number;
  diagnosisCorrect: boolean | null;
}

export interface SessionConfig {
  mode: SessionMode;
  minutes: number;
  heroKey?: string | null;
  filters?: PlanFilters;
  title?: string;
  seed?: number;
}

/**
 * Practice session runner: answer -> (confidence) -> explanation -> next.
 * Wrong answers schedule a different follow-up question on the same knowledge a few steps later.
 */
@Injectable({ providedIn: 'root' })
export class Session {
  private readonly game = inject(GameData);
  private readonly content = inject(Content);
  private readonly knowledge = inject(Knowledge);
  private readonly profiles = inject(Profiles);
  private readonly myBuild = inject(MyBuild);

  readonly phase = signal<Phase>('idle');
  readonly queue = signal<Question[]>([]);
  readonly index = signal(0);
  readonly results = signal<AnswerResult[]>([]);
  readonly config = signal<SessionConfig | null>(null);
  readonly newItems = signal<string[]>([]);
  readonly startedAt = signal(0);
  readonly sessionId = signal<string | null>(null);

  /** Current interaction state. */
  readonly selected = signal<string | null>(null);
  readonly diagnosisChoice = signal<string | null>(null);
  readonly last = signal<AnswerResult | null>(null);
  private shownAt = 0;
  private pendingTyped: string | null = null;
  private relearnAdded = 0;

  readonly current = computed(() => this.queue()[this.index()] ?? null);
  readonly total = computed(() => this.queue().length);
  readonly progress = computed(() => (this.total() ? Math.min(1, this.results().length / this.total()) : 0));
  readonly correctCount = computed(() => this.results().filter((r) => r.result === 'correct').length);

  private planInput(cfg: SessionConfig): PlanInput {
    const s = this.profiles.settings();
    const recent = this.knowledge.reviews().slice(-30);
    const acc = recent.length >= 8 ? recent.reduce((n, r) => n + r.score, 0) / recent.length : null;
    const seed = cfg.seed ?? seedFrom(`${Date.now()}:${Math.random()}`);
    return {
      now: Date.now(),
      minutes: cfg.minutes,
      mode: cfg.mode,
      heroKey: cfg.heroKey === undefined ? s.heroFocus : cfg.heroKey,
      myBuildItems: this.myBuild.itemKeys(),
      myBuild: this.myBuild.analysis(),
      newPerSession: s.newPerSession,
      confidence: s.confidence,
      timedRecall: s.timedRecall,
      filters: cfg.filters ?? {},
      items: this.game.standardItems(),
      itemMap: this.game.itemMap(),
      heroMap: this.game.heroMap(),
      content: this.content.items(),
      scenarios: this.content.scenarios(),
      knowledge: this.knowledge.map(),
      exposures: this.knowledge.exposures(),
      mistakes: this.knowledge.mistakes(),
      recentAccuracy: acc,
      rng: makeRng(seed),
    };
  }

  /** Builds a plan; returns the number of questions (0 = nothing to practice). */
  start(cfg: SessionConfig): number {
    const input = this.planInput(cfg);
    const plan = cfg.mode === 'diagnostic' ? planDiagnostic(input) : planSession(input);
    this.config.set(cfg);
    this.queue.set(plan.questions);
    this.newItems.set(plan.newItems);
    this.index.set(0);
    this.results.set([]);
    this.relearnAdded = 0;
    this.startedAt.set(Date.now());
    this.sessionId.set(newId('s'));
    this.resetInteraction();
    this.phase.set(plan.questions.length ? 'answering' : 'done');
    return plan.questions.length;
  }

  /** Starts a session from an explicit list of questions (shared training, previews). */
  startWith(questions: Question[], cfg: SessionConfig): void {
    this.config.set(cfg);
    this.queue.set(questions);
    this.newItems.set([]);
    this.index.set(0);
    this.results.set([]);
    this.startedAt.set(Date.now());
    this.sessionId.set(newId('s'));
    this.resetInteraction();
    this.phase.set(questions.length ? 'answering' : 'done');
  }

  private resetInteraction(): void {
    this.selected.set(null);
    this.diagnosisChoice.set(null);
    this.last.set(null);
    this.pendingTyped = null;
    this.shownAt = performance.now();
  }

  /** Step 1 of a two-step question: choose the diagnosis. */
  chooseDiagnosis(id: string): void {
    const q = this.current();
    if (!q || q.format !== 'two-step' || this.phase() !== 'answering' || this.diagnosisChoice()) return;
    this.diagnosisChoice.set(id);
    this.phase.set('diagnosis-feedback');
  }

  continueAfterDiagnosis(): void {
    if (this.phase() === 'diagnosis-feedback') this.phase.set('answering');
  }

  select(optionId: string): void {
    const q = this.current();
    if (!q || this.phase() !== 'answering') return;
    if (q.format === 'two-step' && !this.diagnosisChoice()) return;
    this.selected.set(optionId);
    if (q.askConfidence) this.phase.set('confidence');
    else this.finalize(null);
  }

  submitRecall(text: string): void {
    const q = this.current();
    if (!q || this.phase() !== 'answering' || q.format !== 'recall') return;
    this.pendingTyped = text;
    this.selected.set('__typed');
    if (q.askConfidence && text.trim()) this.phase.set('confidence');
    else this.finalize(null);
  }

  dontKnow(): void {
    const q = this.current();
    if (!q || (this.phase() !== 'answering' && this.phase() !== 'diagnosis-feedback')) return;
    this.selected.set('__dontknow');
    this.finalize(null);
  }

  setConfidence(c: Confidence): void {
    if (this.phase() !== 'confidence') return;
    this.finalize(c);
  }

  /** Surgery answers: chosen additions (item keys). */
  submitSurgery(additions: string[], removals: string[]): void {
    const q = this.current();
    if (!q || q.format !== 'surgery' || this.phase() !== 'answering') return;
    this.selected.set(JSON.stringify({ additions, removals }));
    if (q.askConfidence) this.phase.set('confidence');
    else this.finalize(null);
  }

  private evaluate(q: Question, confidence: Confidence | null): AnswerResult {
    const latencyMs = Math.round(performance.now() - this.shownAt);
    const sel = this.selected();
    const base = { question: q, confidence, latencyMs, typed: null as string | null, typo: false, chosen: null as QOption | null, diagnosisCorrect: null as boolean | null };
    if (sel === '__dontknow') return { ...base, result: 'dontknow', score: 0 };
    if (q.format === 'recall') {
      const typed = this.pendingTyped ?? '';
      const m = matchAnswer(typed, q.accept ?? []);
      return { ...base, typed, typo: m === 'typo', result: m === 'none' ? 'wrong' : 'correct', score: m === 'none' ? 0 : 1 };
    }
    if (q.format === 'surgery') {
      const { additions } = JSON.parse(sel ?? '{"additions":[]}') as { additions: string[] };
      const swaps = q.scenario?.swaps ?? 1;
      const scores = additions.map((a) => q.options.find((o) => o.id === a)?.score ?? 0).sort((a, b) => b - a).slice(0, swaps);
      while (scores.length < swaps) scores.push(0);
      const score = scores.reduce((s, x) => s + x, 0) / swaps / 100;
      return { ...base, result: score >= 0.8 ? 'correct' : score >= 0.5 ? 'partial' : 'wrong', score };
    }
    const chosen = q.options.find((o) => o.id === sel) ?? null;
    let diagnosisCorrect: boolean | null = null;
    if (q.format === 'two-step') {
      const d = q.scenario?.diagnosis?.options.find((o) => o.id === this.diagnosisChoice());
      diagnosisCorrect = !!d?.correct;
    }
    if (chosen && chosen.score !== undefined) {
      let score = chosen.score / 100;
      if (diagnosisCorrect !== null) score = 0.3 * (diagnosisCorrect ? 1 : 0) + 0.7 * score;
      const result: ResultKind = score >= 0.8 ? 'correct' : score >= 0.5 ? 'partial' : 'wrong';
      return { ...base, chosen, diagnosisCorrect, result, score };
    }
    const ok = !!chosen?.correct;
    return { ...base, chosen, diagnosisCorrect, result: ok ? 'correct' : 'wrong', score: ok ? 1 : 0 };
  }

  private finalize(confidence: Confidence | null): void {
    const q = this.current();
    if (!q) return;
    const res = this.evaluate(q, confidence);
    this.last.set(res);
    this.results.update((r) => [...r, res]);
    this.phase.set('feedback');
    const chosenItem = res.chosen ? (res.chosen.itemKey ?? (this.game.itemMap().has(res.chosen.id) ? res.chosen.id : null)) : null;
    void this.knowledge.record({
      questionId: q.id,
      questionType: q.type,
      format: q.format,
      difficulty: q.difficulty,
      heroKey: q.heroKey,
      targets: q.targets,
      result: res.result,
      score: res.score,
      confidence,
      latencyMs: res.latencyMs,
      recall: q.format === 'recall',
      optionCount: q.options.length,
      fastMs: q.fastMs,
      hints: q.hints,
      chosenItem: res.result === 'wrong' ? chosenItem : null,
      expectedItem: q.expectedItem ?? null,
      principleRef: q.scenario?.id ?? null,
      sessionId: this.sessionId(),
    });
    if ((res.result === 'wrong' || res.result === 'dontknow' || (res.result === 'partial' && res.score < 0.65)) && !q.relearn) this.scheduleFollowUp(q, chosenItem);
  }

  private scheduleFollowUp(q: Question, chosenItem: string | null): void {
    const cfg = this.config();
    if (!cfg || this.relearnAdded >= Math.max(3, Math.ceil(this.total() * 0.3))) return;
    const follow = followUpQuestion(q, this.planInput(cfg), chosenItem);
    if (!follow) return;
    const queue = [...this.queue()];
    const at = Math.min(queue.length, this.index() + 3 + Math.floor(Math.random() * 2));
    if (queue.some((x) => x.id === follow.id)) return;
    queue.splice(at, 0, follow);
    this.queue.set(queue);
    this.relearnAdded++;
  }

  next(): void {
    if (this.phase() !== 'feedback') return;
    const i = this.index() + 1;
    if (i >= this.queue().length) {
      this.finish();
      return;
    }
    this.index.set(i);
    this.resetInteraction();
    this.phase.set('answering');
  }

  finish(): void {
    if (this.phase() === 'done') return;
    this.phase.set('done');
    const cfg = this.config();
    const res = this.results();
    const rec: SessionRecord = {
      id: this.sessionId() ?? newId('s'),
      profileId: this.profiles.profileId(),
      startedAt: this.startedAt(),
      endedAt: Date.now(),
      mode: cfg?.mode ?? 'mixed',
      heroKey: cfg?.heroKey ?? this.profiles.settings().heroFocus,
      planned: this.queue().length,
      answered: res.length,
      correct: res.filter((r) => r.result === 'correct').length,
      partial: res.filter((r) => r.result === 'partial').length,
      newItems: this.newItems(),
      durationMs: Date.now() - this.startedAt(),
    };
    if (res.length) void getDb().then((db) => db.put('sessions', rec)).catch((e) => console.error(e));
  }

  reset(): void {
    this.phase.set('idle');
    this.queue.set([]);
    this.results.set([]);
    this.index.set(0);
  }
}
