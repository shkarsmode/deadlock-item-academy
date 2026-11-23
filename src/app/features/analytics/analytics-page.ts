import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Dimension } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import {
  Ratio,
  accuracyByDim,
  byDifficulty,
  calibration,
  confusedPairs,
  counterAccuracy,
  dailySeries,
  errorsBySlot,
  novelVsRepeated,
  problemItems,
  recognitionAccuracy,
  situationalAccuracy,
  staleItems,
  strengthByDim,
  within,
} from '../../learning/analytics';
import { Knowledge } from '../../learning/knowledge.service';
import { DIM_NAMES } from '../../learning/mastery';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { HeroAvatar, Meter } from '../../shared/ui/primitives';

@Component({
  selector: 'app-analytics-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ItemIcon, HeroAvatar, Meter, ...I18N_PIPES],
  templateUrl: './analytics-page.html',
  styleUrl: './analytics-page.scss',
})
export class AnalyticsPage {
  protected readonly game = inject(GameData);
  protected readonly i18n = inject(I18n);
  protected readonly knowledge = inject(Knowledge);
  private readonly content = inject(Content);

  protected readonly days = signal<7 | 30>(30);
  private readonly now = computed(() => {
    this.knowledge.tick();
    return Date.now();
  });
  protected readonly rev = computed(() => within(this.knowledge.reviews(), this.days(), this.now()));
  protected readonly total = computed(() => this.rev().length);
  protected readonly recognition = computed(() => recognitionAccuracy(this.rev()));
  protected readonly situational = computed(() => situationalAccuracy(this.rev()));
  protected readonly counter = computed(() => counterAccuracy(this.rev()));
  protected readonly transfer = computed(() => novelVsRepeated(this.rev()));
  protected readonly calib = computed(() => calibration(this.rev()));
  protected readonly diffs = computed(() => byDifficulty(this.rev()));
  protected readonly series = computed(() => dailySeries(this.knowledge.reviews(), this.days(), this.now()));
  protected readonly seriesMax = computed(() => Math.max(1, ...this.series().map((d) => d.answers)));
  protected readonly slots = computed(() => errorsBySlot(this.rev(), this.game.itemMap()));
  protected readonly dims = computed(() => {
    const acc = accuracyByDim(this.rev());
    const str = strengthByDim(this.knowledge.map(), this.now());
    return (Object.keys(DIM_NAMES) as Dimension[]).map((d) => ({ d, name: this.i18n.l(DIM_NAMES[d].ru, DIM_NAMES[d].en), acc: acc[d], str: str[d] }));
  });
  protected readonly pairs = computed(() => confusedPairs(this.knowledge.mistakes(), 10));
  protected readonly problems = computed(() => problemItems(this.knowledge.map(), this.now()));
  protected readonly stale = computed(() => staleItems(this.knowledge.map(), this.now(), 10));
  protected readonly heroes = computed(() => {
    const m = new Map<string, ReturnType<typeof this.rev>>();
    for (const r of this.rev()) if (r.heroKey) m.set(r.heroKey, [...(m.get(r.heroKey) ?? []), r]);
    return [...m.entries()]
      .map(([key, list]) => ({ key, n: list.length, acc: list.reduce((s, r) => s + r.score, 0) / list.length, sc: situationalAccuracy(list) }))
      .sort((a, b) => b.n - a.n)
      .slice(0, 6);
  });
  protected readonly confLabels = [
    { id: 'guess', ru: 'Угадал', en: 'Guessed' },
    { id: 'unsure', ru: 'Не уверен', en: 'Unsure' },
    { id: 'likely', ru: 'Почти уверен', en: 'Fairly sure' },
    { id: 'sure', ru: 'Точно знаю', en: 'Certain' },
  ] as const;

  pct(r: Ratio): string {
    return r.value === null ? '-' : this.i18n.pct(r.value);
  }

  heroName(k: string): string {
    return this.i18n.name(this.game.hero(k)?.name);
  }

  scenarioCount(): number {
    return this.content.scenarios().length;
  }
}
