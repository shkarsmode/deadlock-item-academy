import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Dimension } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { getDb } from '../../core/db/db';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import type { SessionRecord } from '../../learning/knowledge.model';
import {
  counterAccuracy,
  dailySeries,
  dueCount,
  novelVsRepeated,
  problemItems,
  recognizedShare,
  situationalAccuracy,
  strengthByDim,
  streakDays,
  wellKnownCount,
  within,
} from '../../learning/analytics';
import { Knowledge } from '../../learning/knowledge.service';
import { DIM_NAMES } from '../../learning/mastery';
import { MyBuild } from '../../learning/my-build.service';
import { Session } from '../../learning/session.service';
import type { SessionMode } from '../../learning/planner';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { HeroAvatar, Meter } from '../../shared/ui/primitives';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ItemIcon, HeroAvatar, Meter, ...I18N_PIPES],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  protected readonly game = inject(GameData);
  protected readonly profiles = inject(Profiles);
  protected readonly knowledge = inject(Knowledge);
  protected readonly i18n = inject(I18n);
  private readonly content = inject(Content);
  private readonly myBuild = inject(MyBuild);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly lastSession = signal<SessionRecord | null>(null);
  private readonly now = computed(() => {
    this.knowledge.tick();
    return Date.now();
  });

  protected readonly hero = computed(() => this.game.hero(this.profiles.settings().heroFocus));
  protected readonly reviews30 = computed(() => within(this.knowledge.reviews(), 30, this.now()));
  protected readonly due = computed(() => dueCount(this.knowledge.map(), this.now()));
  protected readonly problems = computed(() => problemItems(this.knowledge.map(), this.now()));
  protected readonly wellKnown = computed(() => wellKnownCount(this.knowledge.map(), this.now()));
  protected readonly totalItems = computed(() => this.game.standardItems().length);
  protected readonly buildItems = computed(() => this.myBuild.itemKeys());
  protected readonly buildRecognized = computed(() => recognizedShare(this.buildItems(), this.knowledge.map(), this.now()));
  protected readonly counter = computed(() => counterAccuracy(this.reviews30()));
  protected readonly situational = computed(() => situationalAccuracy(this.reviews30()));
  protected readonly transfer = computed(() => novelVsRepeated(this.reviews30()));
  protected readonly streak = computed(() => streakDays(this.knowledge.reviews(), this.now()));
  protected readonly week = computed(() => dailySeries(this.knowledge.reviews(), 7, this.now()));
  protected readonly weekMax = computed(() => Math.max(1, ...this.week().map((d) => d.answers)));
  protected readonly openMistakes = computed(() => this.knowledge.mistakes().filter((m) => !m.resolved).length);
  protected readonly misconceptions = computed(() => this.knowledge.mistakes().filter((m) => !m.resolved && m.kind === 'misconception').length);

  protected readonly levelDist = computed(() => {
    const counts = [0, 0, 0, 0, 0, 0];
    for (const l of this.knowledge.levels().values()) counts[l]++;
    return counts;
  });

  /** Progress on the hero paths: share of hero-relevant items at level 3+ and average level. */
  protected readonly heroProgress = computed(() =>
    ['hero_hornet', 'hero_necro'].map((key) => {
      const keys = this.heroItemKeys(key);
      const levels: number[] = keys.map((k) => this.knowledge.levels().get(k) ?? 0);
      const avg = levels.length ? levels.reduce((a, b) => a + b, 0) / levels.length : 0;
      return { key, hero: this.game.hero(key), count: keys.length, avg, applied: levels.filter((l) => l >= 3).length };
    }),
  );

  protected readonly weakDims = computed(() => {
    const s = strengthByDim(this.knowledge.map(), this.now());
    return (Object.entries(s) as [Dimension, { value: number | null; n: number }][])
      .filter(([, r]) => r.value !== null && r.n >= 2)
      .sort((a, b) => (a[1].value ?? 0) - (b[1].value ?? 0))
      .slice(0, 3)
      .map(([d, r]) => ({ dim: d, name: this.i18n.l(DIM_NAMES[d].ru, DIM_NAMES[d].en), value: r.value ?? 0, n: r.n }));
  });

  /** The headline insight, only when both numbers rest on enough answers. */
  protected readonly insight = computed(() => {
    const rec = this.buildRecognized();
    const ctr = this.counter();
    if (rec.value !== null && ctr.value !== null && ctr.n >= 5 && this.knowledge.reviews().length >= 20) {
      return this.i18n.l('Ты узнаёшь {a} предметов своего билда, а контрпредметы выбираешь верно в {b} ситуаций.', 'You recognize {a} of your build items and pick the right counter item in {b} of situations.', {
        a: this.i18n.pct(rec.value),
        b: this.i18n.pct(ctr.value),
      });
    }
    return null;
  });

  protected readonly todayPlan = computed(() => {
    const parts: string[] = [];
    if (this.misconceptions()) parts.push(this.i18n.plural(this.misconceptions(), ['уверенная ошибка', 'уверенные ошибки', 'уверенных ошибок'], ['confident mistake', 'confident mistakes']));
    if (this.due()) parts.push(this.i18n.plural(this.due(), ['повторение', 'повторения', 'повторений'], ['due review', 'due reviews']));
    const unseen = this.game.standardItems().filter((i) => !this.knowledge.get(i.key)?.introducedAt).length;
    if (unseen) parts.push(this.i18n.l('новые предметы ({n} ещё не изучено)', 'new items ({n} not studied yet)', { n: unseen }));
    return parts.join(' · ');
  });

  constructor() {
    void this.loadLastSession();
  }

  private heroItemKeys(heroKey: string): string[] {
    const set = new Set<string>();
    const h = this.game.hero(heroKey);
    if (h) for (const p of [...h.popular.early, ...h.popular.mid, ...h.popular.late]) set.add(p.itemKey);
    const course = this.content.course(heroKey);
    for (const m of course?.modules ?? []) for (const k of m.items) set.add(k);
    const b = this.myBuild.buildFor(heroKey);
    if (b) for (const c of b.categories) for (const i of c.items) set.add(i.key);
    return [...set].filter((k) => this.game.item(k)?.mode === 'standard');
  }

  private async loadLastSession(): Promise<void> {
    try {
      const db = await getDb();
      const list = await db.getAllFromIndex('sessions', 'byProfile', this.profiles.profileId());
      list.sort((a, b) => b.startedAt - a.startedAt);
      this.lastSession.set(list[0] ?? null);
    } catch {
      this.lastSession.set(null);
    }
  }

  start(minutes: number, mode: SessionMode = 'mixed'): void {
    const n = this.session.start({ mode, minutes, heroKey: this.profiles.settings().heroFocus });
    if (n) void this.router.navigate(['/practice/run']);
    else void this.router.navigate(['/practice']);
  }

  heroName(key: string): string {
    return this.i18n.name(this.game.hero(key)?.name);
  }
}
