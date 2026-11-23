import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES } from '../../core/i18n/i18n';
import { Session } from '../../learning/session.service';
import { Icon } from '../../shared/ui/icon';
import { HeroAvatar } from '../../shared/ui/primitives';
import { decodeShare } from './share-code';

@Component({
  selector: 'app-share-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, HeroAvatar, ...I18N_PIPES],
  template: `
    <div class="page page-narrow">
      @if (payload(); as p) {
        <div class="panel panel-pad stack-4">
          <div class="row">
            <app-hero-avatar [key]="p.hero" [size]="48" />
            <div class="grow">
              <div class="upper faint">{{ 'Тренировка от друга' | l: 'Training from a friend' }}</div>
              <h1>{{ p.title || ('Подборка' | l: 'Training set') }}</h1>
            </div>
          </div>
          <p class="muted">
            {{ 'Ситуаций:' | l: 'Situations:' }} <b>{{ validScenarios().length }}</b>
            @if (p.items?.length) {
              · {{ 'Предметов:' | l: 'Items:' }} <b>{{ p.items!.length }}</b>
            }
          </p>
          <p class="small faint">{{ 'Ссылка содержит только список заданий. Твой прогресс сохраняется в твоём браузере и никому не передаётся.' | l: 'The link only lists tasks. Your progress stays in your browser.' }}</p>
          <div class="row-wrap">
            <button class="btn btn-primary btn-lg" (click)="start()" [disabled]="!validScenarios().length && !p.items?.length"><app-icon name="play" /> {{ 'Начать' | l: 'Start' }}</button>
            <a class="btn btn-lg" routerLink="/">{{ 'На главную' | l: 'Home' }}</a>
          </div>
        </div>
      } @else {
        <div class="empty">{{ 'Ссылка повреждена или устарела.' | l: 'The link is broken or outdated.' }} <a routerLink="/">{{ 'На главную' | l: 'Home' }}</a></div>
      }
    </div>
  `,
})
export class SharePage {
  readonly code = input.required<string>();
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly content = inject(Content);
  private readonly game = inject(GameData);

  protected readonly payload = computed(() => decodeShare(this.code()));
  protected readonly validScenarios = computed(() => {
    const ids = new Set(this.payload()?.scenarios ?? []);
    return this.content.scenarios().filter((s) => ids.has(s.id));
  });

  start(): void {
    const p = this.payload();
    if (!p) return;
    const items = (p.items ?? []).filter((k) => this.game.item(k));
    const n = this.session.start({
      mode: 'shared',
      minutes: p.minutes ?? Math.max(5, Math.ceil(this.validScenarios().length * 1)),
      heroKey: p.hero,
      filters: { scenarioIds: this.validScenarios().map((s) => s.id), itemKeys: items.length ? items : undefined },
    });
    if (n) void this.router.navigate(['/practice/run']);
  }
}
