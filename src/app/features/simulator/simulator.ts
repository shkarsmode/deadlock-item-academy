import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import type { Scenario, ScenarioOption, Text } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { THREAT_LABELS } from '../../content/labels';
import type { GameItem, Slot } from '../../core/game-data/game-data.model';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles, newId } from '../../core/profile/profile.service';
import { Knowledge } from '../../learning/knowledge.service';
import { scenarioItems } from '../../learning/questions/generators';
import { Icon } from '../../shared/ui/icon';
import { ItemBrief } from '../../shared/ui/item-brief';
import { ItemIcon } from '../../shared/ui/item-icon';
import { ClaimBadge } from '../../shared/ui/primitives';
import { ScenarioContext } from '../practice/scenario-context';

interface Evaluation {
  key: string;
  score: number;
  verdict: string;
  why: Text;
  betterWhen?: Text;
  fromScenario: boolean;
}

const VERDICT: Record<string, { ru: string; en: string }> = {
  best: { ru: 'Лучший', en: 'Best' },
  good: { ru: 'Хороший', en: 'Good' },
  ok: { ru: 'Допустимый', en: 'Acceptable' },
  weak: { ru: 'Слабый', en: 'Weak' },
  bad: { ru: 'Плохой', en: 'Bad' },
};

@Component({
  selector: 'app-simulator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SyncSelectValue, Icon, ItemIcon, ItemBrief, ClaimBadge, ScenarioContext, ...I18N_PIPES],
  templateUrl: './simulator.html',
  styleUrl: './simulator.scss',
})
export class SimulatorPage {
  protected readonly game = inject(GameData);
  protected readonly i18n = inject(I18n);
  private readonly content = inject(Content);
  private readonly knowledge = inject(Knowledge);
  private readonly profiles = inject(Profiles);

  protected readonly heroFilter = signal<string>(this.profiles.settings().heroFocus);
  protected readonly hints = signal<'full' | 'none'>('full');
  protected readonly scenario = signal<Scenario | null>(null);
  protected readonly tab = signal<Slot>('vitality');
  protected readonly bought = signal<string[]>([]);
  protected readonly sold = signal<string[]>([]);
  protected readonly inspect = signal<string | null>(null);
  protected readonly evaluated = signal<Evaluation[] | null>(null);
  protected readonly slots: Slot[] = ['weapon', 'vitality', 'spirit'];
  protected readonly verdicts = VERDICT;
  private readonly startedAt = signal(0);

  /** Buy and sell situations work in the shop; others live in practice. */
  protected readonly pool = computed(() =>
    this.content.scenarios().filter((s) => (s.kind === 'buy' || s.kind === 'diagnose-buy' || s.kind === 'sell') && (!this.heroFilter() || s.hero === this.heroFilter())),
  );
  protected readonly heroes = computed(() => {
    const set = new Set(this.content.scenarios().filter((s) => s.kind === 'buy' || s.kind === 'diagnose-buy' || s.kind === 'sell').map((s) => s.hero));
    return [...set].map((k) => this.game.hero(k)).filter((h) => !!h);
  });

  protected readonly owned = computed(() => {
    const s = this.scenario();
    if (!s) return [];
    return [...s.owned.filter((k) => !this.sold().includes(k)), ...this.bought()];
  });
  protected readonly spent = computed(() => this.bought().reduce((n, k) => n + this.priceOf(k, true), 0));
  protected readonly souls = computed(() => (this.scenario()?.souls ?? 0) - this.spent());
  protected readonly isSell = computed(() => this.scenario()?.kind === 'sell');

  protected readonly shop = computed(() => {
    const items = this.game.bySlot()[this.tab()];
    return [1, 2, 3, 4].map((t) => ({ tier: t, items: items.filter((i) => i.tier === t) }));
  });

  constructor() {
    this.next();
  }

  next(): void {
    const pool = this.pool();
    if (!pool.length) {
      this.scenario.set(null);
      return;
    }
    // Prefer situations the learner has not solved yet.
    const fresh = pool.filter((s) => this.knowledge.exposures().get(`sim:${s.id}`)?.lastResult !== 'correct');
    const list = fresh.length ? fresh : pool;
    const cur = this.scenario()?.id;
    const candidates = list.filter((s) => s.id !== cur);
    const pick = (candidates.length ? candidates : list)[Math.floor(Math.random() * (candidates.length || list.length))];
    this.load(pick);
  }

  load(s: Scenario): void {
    this.scenario.set(s);
    this.bought.set([]);
    this.sold.set([]);
    this.inspect.set(null);
    this.evaluated.set(null);
    this.startedAt.set(performance.now());
    const firstBest = scenarioItems(s, this.game.itemMap())[0];
    const slot = this.game.item(firstBest)?.slot;
    // Do not reveal the answer: open the tab of a random category.
    this.tab.set(this.slots[Math.floor(Math.random() * 3)] ?? slot ?? 'vitality');
  }

  /** Price for the player considering owned components; `forBought` uses the state before this purchase. */
  priceOf(key: string, forBought = false): number {
    const it = this.game.item(key);
    if (!it) return 0;
    const s = this.scenario();
    const before = forBought ? (s?.owned ?? []).filter((k) => !this.sold().includes(k)) : this.owned();
    return this.game.priceFor(it, before);
  }

  canBuy(it: GameItem): boolean {
    if (this.evaluated() || this.isSell()) return false;
    if (this.owned().includes(it.key)) return false;
    return this.priceOf(it.key) <= this.souls();
  }

  buy(key: string): void {
    const it = this.game.item(key);
    if (!it || !this.canBuy(it)) return;
    // Buying an upgrade consumes its owned component.
    const comps = it.components.filter((c) => this.owned().includes(c));
    if (comps.length) {
      this.bought.update((l) => l.filter((x) => !comps.includes(x)));
      this.sold.update((l) => [...l, ...comps.filter((c) => this.scenario()?.owned.includes(c))]);
    }
    this.bought.update((l) => [...l, key]);
    this.inspect.set(null);
  }

  undo(key: string): void {
    if (this.evaluated()) return;
    this.bought.update((l) => l.filter((x) => x !== key));
    const it = this.game.item(key);
    if (it) this.sold.update((l) => l.filter((x) => !it.components.includes(x)));
  }

  toggleSell(key: string): void {
    if (this.evaluated()) return;
    this.sold.update((l) => (l.includes(key) ? l.filter((x) => x !== key) : [key]));
  }

  decide(): void {
    const s = this.scenario();
    if (!s) return;
    const picks = this.isSell() ? this.sold() : this.bought();
    if (!picks.length) return;
    const evals = picks.map((k) => this.evaluate(s, k));
    this.evaluated.set(evals);
    const best = Math.max(...evals.map((e) => e.score));
    const targets = scenarioItems(s, this.game.itemMap()).flatMap((item, i) => s.dims.map((dim) => ({ item, dim, weight: i === 0 ? 1 : 0.6 })));
    void this.knowledge.record({
      questionId: `sim:${s.id}`,
      questionType: 'scenario',
      format: 'scenario',
      difficulty: s.difficulty,
      heroKey: s.hero,
      targets,
      result: best >= 80 ? 'correct' : best >= 50 ? 'partial' : 'wrong',
      score: best / 100,
      confidence: null,
      latencyMs: Math.round(performance.now() - this.startedAt()),
      recall: true,
      optionCount: 0,
      fastMs: 30000,
      hints: this.hints() === 'full' ? 'full' : 'none',
      chosenItem: best < 50 ? picks[0] : null,
      expectedItem: targets[0]?.item ?? null,
      principleRef: s.id,
      sessionId: newId('sim'),
    });
  }

  private evaluate(s: Scenario, key: string): Evaluation {
    const opt: ScenarioOption | undefined = s.options.find((o) => o.item === key);
    if (opt) return { key, score: opt.score, verdict: opt.verdict, why: opt.why, betterWhen: opt.betterWhen, fromScenario: true };
    // Not one of the authored options: judge by the item's authored roles and counters.
    const c = this.content.item(key);
    const hits = (c?.counters ?? []).filter((t) => (s.problemTags as string[]).includes(t));
    if (hits.length) {
      const labels = hits.map((t) => this.i18n.l(THREAT_LABELS[t].ru, THREAT_LABELS[t].en)).join(', ');
      return {
        key,
        score: 45,
        verdict: 'ok',
        why: { ru: `Этого варианта нет в разборе ситуации, но предмет отвечает на часть проблемы: ${labels}. Сравни с лучшим вариантом ниже: он решает главную причину точнее.`, en: `Not one of the analysed options, but it addresses part of the problem: ${labels}. Compare with the best option below.` },
        fromScenario: false,
      };
    }
    return {
      key,
      score: 15,
      verdict: 'bad',
      why: { ru: 'Этот предмет не отвечает на главную проблему ситуации: ни одна из его задач не совпадает с угрозой. Сначала определи, что тебя убивает или мешает, затем ищи предмет с этой задачей.', en: 'This item does not address the main problem. Identify what is killing you first, then look for an item with that job.' },
      fromScenario: false,
    };
  }

  bestOptions(): ScenarioOption[] {
    return [...(this.scenario()?.options ?? [])].sort((a, b) => b.score - a.score);
  }

  overall(): number {
    const e = this.evaluated();
    return e?.length ? Math.max(...e.map((x) => x.score)) : 0;
  }

  verdictLabel(v: string): string {
    const l = VERDICT[v];
    return l ? this.i18n.l(l.ru, l.en) : v;
  }

  threat(t: string): string {
    const l = THREAT_LABELS[t as keyof typeof THREAT_LABELS];
    return l ? this.i18n.l(l.ru, l.en) : t;
  }
}
