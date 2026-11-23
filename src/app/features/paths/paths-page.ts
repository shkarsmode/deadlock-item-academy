import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES } from '../../core/i18n/i18n';
import { Icon } from '../../shared/ui/icon';
import { HeroAvatar } from '../../shared/ui/primitives';

@Component({
  selector: 'app-paths-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, HeroAvatar, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="grow">
          <h1>{{ 'Курсы героев' | l: 'Hero paths' }}</h1>
          <p class="sub">{{ 'Глубокие курсы для Vindicta и Graves, базовый курс для любого другого героя.' | l: 'Deep courses for Vindicta and Graves, a basic course for any other hero.' }}</p>
        </div>
      </div>
      <div class="grid grid-2 deep">
        @for (c of deep(); track c.hero) {
          <a class="panel course" [routerLink]="['/paths', c.hero]">
            <app-hero-avatar [key]="c.hero" [size]="64" />
            <div class="grow">
              <span class="tag tag-accent">{{ 'Полный курс' | l: 'Full course' }}</span>
              <h2>{{ game.hero(c.hero)?.name | gn }}</h2>
              <p class="small muted clamp">{{ c.summary | tx }}</p>
              <div class="xsmall faint">{{ c.modules.length }} {{ 'модулей' | l: 'modules' }}</div>
            </div>
            <app-icon name="right" />
          </a>
        }
      </div>
      <h3 class="others-title">{{ 'Базовый курс для других героев' | l: 'Basic course for other heroes' }}</h3>
      <div class="others">
        @for (h of others(); track h.key) {
          <a class="hero" [routerLink]="['/paths', h.key]">
            <app-hero-avatar [hero]="h" [size]="44" />
            <span class="small">{{ h.name | gn }}</span>
          </a>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .deep { margin-bottom: 20px; }
      .course { display: flex; gap: 14px; align-items: center; padding: 16px; color: var(--text); text-decoration: none !important; }
      .course:hover { border-color: var(--accent-line); }
      .course h2 { margin: 6px 0 4px; }
      .clamp { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 4px; }
      .others-title { margin-bottom: 10px; color: var(--text-2); font-size: var(--fs-md); }
      .others { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
      .hero { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 4px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-1); color: var(--text); text-decoration: none !important; text-align: center; }
      .hero:hover { border-color: var(--border-3); }
    `,
  ],
})
export class PathsPage {
  protected readonly game = inject(GameData);
  private readonly content = inject(Content);
  protected readonly deep = computed(() => this.content.courses());
  protected readonly others = computed(() => {
    const deepKeys = new Set(this.deep().map((c) => c.hero));
    return this.game.selectableHeroes().filter((h) => !deepKeys.has(h.key));
  });
}
