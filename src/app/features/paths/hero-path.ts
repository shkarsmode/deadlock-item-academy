import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { CourseModule } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { Knowledge } from '../../learning/knowledge.service';
import { MyBuild } from '../../learning/my-build.service';
import { Session } from '../../learning/session.service';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { AbilityIcon, ClaimBadge, HeroAvatar, LevelPips, RichText } from '../../shared/ui/primitives';
import { TermText } from '../../shared/ui/term-text';

@Component({
  selector: 'app-hero-path',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TermText, RouterLink, Icon, ItemIcon, AbilityIcon, ClaimBadge, HeroAvatar, LevelPips, RichText, ...I18N_PIPES],
  templateUrl: './hero-path.html',
  styleUrl: './hero-path.scss',
})
export class HeroPathPage {
  readonly hero = input.required<string>();
  protected readonly game = inject(GameData);
  protected readonly i18n = inject(I18n);
  protected readonly knowledge = inject(Knowledge);
  private readonly content = inject(Content);
  private readonly profiles = inject(Profiles);
  private readonly session = inject(Session);
  private readonly myBuild = inject(MyBuild);
  private readonly router = inject(Router);

  protected readonly open = signal<string | null>(null);
  protected readonly h = computed(() => this.game.hero(this.hero()));
  protected readonly course = computed(() => this.content.course(this.hero()));
  protected readonly build = computed(() => this.myBuild.buildFor(this.hero()));
  protected readonly isFocus = computed(() => this.profiles.settings().heroFocus === this.hero());
  protected readonly scenarioCount = computed(() => this.content.scenarios().filter((s) => s.hero === this.hero()).length);

  /** Basic course for heroes without a deep course: popular items by phase (client statistics). */
  protected readonly popular = computed(() => {
    const h = this.h();
    if (!h) return [];
    return [
      { id: 'early', ru: 'Ранняя игра', en: 'Early game', items: h.popular.early },
      { id: 'mid', ru: 'Середина', en: 'Mid game', items: h.popular.mid },
      { id: 'late', ru: 'Поздняя игра', en: 'Late game', items: h.popular.late },
    ].map((p) => ({ ...p, items: p.items.filter((x) => this.game.item(x.itemKey)?.mode === 'standard').slice(0, 10) }));
  });

  moduleProgress(m: CourseModule): { level: number; known: number; total: number } {
    const levels = m.items.map((k) => this.knowledge.levels().get(k) ?? 0);
    const total = levels.length;
    const known = levels.filter((l) => l >= 3).length;
    const level = total ? levels.reduce((a: number, b: number) => a + b, 0) / total : 0;
    return { level, known, total };
  }

  heroName(): string {
    return this.i18n.name(this.h()?.name);
  }

  trainModule(m: CourseModule): void {
    const n = this.session.start({
      mode: 'module',
      minutes: 10,
      heroKey: this.hero(),
      filters: { itemKeys: m.items.length ? m.items : undefined, scenarioTags: m.scenarioTags.length ? m.scenarioTags : undefined },
    });
    if (n) void this.router.navigate(['/practice/run']);
  }

  trainHero(): void {
    const keys = this.popular().flatMap((p) => p.items.map((x) => x.itemKey));
    const n = this.session.start({ mode: 'hero', minutes: 10, heroKey: this.hero(), filters: this.course() ? {} : { itemKeys: [...new Set(keys)] } });
    if (n) void this.router.navigate(['/practice/run']);
  }

  async focus(): Promise<void> {
    await this.profiles.updateSettings({ heroFocus: this.hero() });
  }
}
