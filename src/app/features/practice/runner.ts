import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, OnDestroy, computed, effect, inject, signal, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Hotkeys } from '../../core/ui/hotkeys.service';
import type { Confidence } from '../../learning/knowledge.model';
import { Session } from '../../learning/session.service';
import type { QOption } from '../../learning/questions/question.model';
import { Icon } from '../../shared/ui/icon';
import { ItemBrief } from '../../shared/ui/item-brief';
import { ItemIcon } from '../../shared/ui/item-icon';
import { AbilityIcon, ClaimBadge, StatLines } from '../../shared/ui/primitives';
import { ScenarioContext } from './scenario-context';
import { SessionSummary } from './summary';

const VERDICT_LABEL: Record<string, { ru: string; en: string }> = {
  best: { ru: 'Лучший', en: 'Best' },
  good: { ru: 'Хороший', en: 'Good' },
  ok: { ru: 'Допустимый', en: 'Acceptable' },
  weak: { ru: 'Слабый', en: 'Weak' },
  bad: { ru: 'Плохой', en: 'Bad' },
};

@Component({
  selector: 'app-practice-runner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ItemIcon, ItemBrief, AbilityIcon, ClaimBadge, StatLines, ScenarioContext, SessionSummary, ...I18N_PIPES],
  templateUrl: './runner.html',
  styleUrl: './runner.scss',
})
export class PracticeRunner implements OnDestroy {
  protected readonly session = inject(Session);
  protected readonly game = inject(GameData);
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly hotkeys = inject(Hotkeys);

  protected readonly q = this.session.current;
  protected readonly phase = this.session.phase;
  protected readonly last = this.session.last;
  protected readonly typed = signal('');
  protected readonly showAllOptions = signal(false);
  protected readonly surgeryRemove = signal<string[]>([]);
  protected readonly surgeryAdd = signal<string[]>([]);
  protected readonly timeLeft = signal<number | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly recallInput = viewChild<ElementRef<HTMLInputElement>>('recall');
  private readonly nextBtn = viewChild<ElementRef<HTMLButtonElement>>('nextBtn');

  protected readonly verdicts = VERDICT_LABEL;
  protected readonly confidences: { id: Confidence; key: string; ru: string; en: string }[] = [
    { id: 'guess', key: 'Q', ru: 'Угадал', en: 'Guessed' },
    { id: 'unsure', key: 'W', ru: 'Не уверен', en: 'Unsure' },
    { id: 'likely', key: 'E', ru: 'Почти уверен', en: 'Fairly sure' },
    { id: 'sure', key: 'R', ru: 'Точно знаю', en: 'Certain' },
  ];

  protected readonly diagnosis = computed(() => this.q()?.scenario?.diagnosis ?? null);
  protected readonly diagnosisPicked = computed(() => {
    const id = this.session.diagnosisChoice();
    return this.diagnosis()?.options.find((o) => o.id === id) ?? null;
  });
  /** Options visible in the current step (diagnosis first for two-step questions). */
  protected readonly inDiagnosisStep = computed(() => this.q()?.format === 'two-step' && !this.session.diagnosisChoice());
  protected readonly sortedOptions = computed(() => [...(this.q()?.options ?? [])].sort((a, b) => (b.score ?? (b.correct ? 100 : 0)) - (a.score ?? (a.correct ? 100 : 0))));
  protected readonly chosenItemKey = computed(() => {
    const r = this.last();
    const k = r?.chosen?.itemKey ?? r?.chosen?.id;
    return k && this.game.item(k) && k !== this.q()?.explain.focusItem ? k : null;
  });
  protected readonly resultTone = computed(() => {
    const r = this.last()?.result;
    return r === 'correct' ? 'good' : r === 'partial' ? 'warn' : 'bad';
  });
  protected readonly counter = computed(() => `${Math.min(this.session.results().length + (this.phase() === 'feedback' ? 0 : 1), this.session.total())} / ${this.session.total()}`);

  constructor() {
    if (this.session.phase() === 'idle') void this.router.navigate(['/practice']);
    const destroyRef = inject(DestroyRef);
    const digit = (n: number) => () => this.pickIndex(n);
    this.hotkeys.register(
      [
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ keys: [String(n)], handler: digit(n - 1) })),
        { keys: ['0', 'd', 'в'], handler: () => this.dontKnow() },
        { keys: ['q', 'й'], handler: () => this.confidence('guess') },
        { keys: ['w', 'ц'], handler: () => this.confidence('unsure') },
        { keys: ['e', 'у'], handler: () => this.confidence('likely') },
        { keys: ['r', 'к'], handler: () => this.confidence('sure') },
        // Enter/Space always advance (even with "Next" focused) unless an option button is focused while answering.
        { keys: ['enter', ' '], handler: (e) => this.onEnter(e), onButtons: true },
        { keys: ['escape'], handler: () => this.exit() },
      ],
      destroyRef,
    );
    // Focus management: recall input when shown, the Next button after answering.
    effect(() => {
      const ph = this.phase();
      const q = this.q();
      queueMicrotask(() => {
        if (ph === 'answering' && q?.format === 'recall') this.recallInput()?.nativeElement.focus();
        if (ph === 'feedback') {
          this.nextBtn()?.nativeElement.focus({ preventScroll: true });
          // On phones bring the start of the explanation into view.
          if (window.innerWidth < 768) document.querySelector('.feedback')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
        if (ph === 'answering') window.scrollTo({ top: 0 });
      });
    });
    // Countdown for timed recall.
    effect(() => {
      const q = this.q();
      const ph = this.phase();
      this.clearTimer();
      if (q?.timeLimitMs && ph === 'answering') {
        const end = Date.now() + q.timeLimitMs;
        this.timeLeft.set(q.timeLimitMs);
        this.timer = setInterval(() => {
          const left = end - Date.now();
          this.timeLeft.set(Math.max(0, left));
          if (left <= 0) {
            this.clearTimer();
            this.session.submitRecall(this.typed());
          }
        }, 200);
      } else this.timeLeft.set(null);
    });
    // Reset per-question UI state.
    effect(() => {
      this.q();
      this.typed.set('');
      this.showAllOptions.set(false);
      this.surgeryAdd.set([]);
      this.surgeryRemove.set([]);
    });
  }

  ngOnDestroy(): void {
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  pickIndex(i: number): void {
    const q = this.q();
    if (!q) return;
    if (this.phase() === 'answering') {
      if (this.inDiagnosisStep()) {
        const d = this.diagnosis()?.options[i];
        if (d) this.session.chooseDiagnosis(d.id);
        return;
      }
      if (q.format === 'surgery' || q.format === 'recall') return;
      const o = q.options[i];
      if (o) this.session.select(o.id);
    } else if (this.phase() === 'confidence') {
      const c = this.confidences[i];
      if (c) this.session.setConfidence(c.id);
    }
  }

  choose(o: QOption): void {
    this.session.select(o.id);
  }

  dontKnow(): void {
    if (this.phase() === 'answering' || this.phase() === 'diagnosis-feedback') this.session.dontKnow();
  }

  confidence(c: Confidence): void {
    this.session.setConfidence(c);
  }

  submitRecall(): void {
    this.session.submitRecall(this.typed());
  }

  toggleRemove(key: string): void {
    const swaps = this.q()?.scenario?.swaps ?? 1;
    this.surgeryRemove.update((l) => (l.includes(key) ? l.filter((x) => x !== key) : l.length < swaps ? [...l, key] : l));
  }

  toggleAdd(key: string): void {
    const swaps = this.q()?.scenario?.swaps ?? 1;
    this.surgeryAdd.update((l) => (l.includes(key) ? l.filter((x) => x !== key) : l.length < swaps ? [...l, key] : l));
  }

  submitSurgery(): void {
    this.session.submitSurgery(this.surgeryAdd(), this.surgeryRemove());
  }

  private onEnter(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    // While answering, Enter on a focused option/confidence button means "press that button".
    if (t?.tagName === 'BUTTON' && (this.phase() === 'answering' || this.phase() === 'confidence')) {
      t.click();
      return;
    }
    this.advance();
  }

  advance(): void {
    if (this.phase() === 'feedback') this.session.next();
    else if (this.phase() === 'diagnosis-feedback') this.session.continueAfterDiagnosis();
  }

  exit(): void {
    if (this.phase() === 'done') {
      void this.router.navigate(['/']);
      return;
    }
    if (this.session.results().length) this.session.finish();
    else {
      this.session.reset();
      void this.router.navigate(['/practice']);
    }
  }

  optionState(o: QOption): 'correct' | 'wrong' | 'chosen' | 'none' {
    const ph = this.phase();
    const sel = this.session.selected();
    if (ph === 'confidence') return o.id === sel ? 'chosen' : 'none';
    if (ph !== 'feedback') return 'none';
    const isScored = o.score !== undefined;
    if (isScored) {
      if (o.verdict === 'best') return 'correct';
      return o.id === sel ? 'wrong' : 'none';
    }
    if (o.correct) return 'correct';
    return o.id === sel ? 'wrong' : 'none';
  }

  confLabel(c: Confidence | null): string {
    const x = this.confidences.find((y) => y.id === c);
    return x ? this.i18n.l(x.ru, x.en) : '';
  }

  abilityName(key: string | undefined): string {
    return this.i18n.name(this.game.ability(key)?.ability.name);
  }

  verdictLabel(v: string | undefined): string {
    const l = v ? VERDICT_LABEL[v] : undefined;
    return l ? this.i18n.l(l.ru, l.en) : '';
  }
}
