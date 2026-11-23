import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Scenario } from '../../content/content.model';
import { PHASE_LABELS, THREAT_LABELS } from '../../content/labels';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { HeroAvatar } from '../../shared/ui/primitives';
import { TermText } from '../../shared/ui/term-text';

/** The match situation: your hero, souls, owned items, enemies, what is happening. */
@Component({
  selector: 'app-scenario-context',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TermText, HeroAvatar, ItemIcon, Icon, ...I18N_PIPES],
  template: `
    @if (s(); as sc) {
      <div class="ctx">
        <div class="me">
          <app-hero-avatar [key]="sc.hero" [size]="44" />
          <div class="grow">
            <div class="hero-name">{{ heroName() }}</div>
            <div class="row-wrap small muted">
              <span>{{ phase() }}</span>
              <span class="souls num"><app-icon name="coins" [size]="14" /> {{ sc.souls }}</span>
            </div>
          </div>
        </div>
        @if (sc.owned.length) {
          <div class="owned">
            <div class="upper faint">{{ 'Уже куплено' | l: 'Owned' }}</div>
            <div class="row-wrap">
              @for (k of sc.owned; track k) {
                <app-item-icon [key]="k" [size]="34" [title]="true" />
              }
            </div>
          </div>
        }
        <div class="enemies">
          <div class="upper faint">{{ 'Противники' | l: 'Enemies' }}</div>
          <ul class="list">
            @for (e of sc.enemies; track e.hero) {
              <li class="enemy">
                <app-hero-avatar [key]="e.hero" [size]="30" />
                <div class="grow">
                  <span class="en-name">{{ heroOf(e.hero) }}</span>
                  @if (e.note) {
                    <span class="small muted"> · <app-tt [text]="e.note | tx" /></span>
                  }
                </div>
                @if (e.items?.length) {
                  <div class="row-wrap">
                    @for (k of e.items; track k) {
                      <app-item-icon [key]="k" [size]="24" [title]="true" />
                    }
                  </div>
                }
              </li>
            }
          </ul>
        </div>
        @if (sc.allies?.length) {
          <div class="row-wrap small muted allies">
            <span class="upper faint">{{ 'Союзники' | l: 'Allies' }}</span>
            @for (a of sc.allies; track a.hero) {
              <span class="row"><app-hero-avatar [key]="a.hero" [size]="22" /> {{ heroOf(a.hero) }}</span>
            }
          </div>
        }
        <div class="story">
          @if (hints() === 'none' && sc.symptoms?.length) {
            <div class="upper faint">{{ 'Что ты замечаешь' | l: 'What you notice' }}</div>
            <ul>
              @for (x of sc.symptoms; track $index) {
                <li><app-tt [text]="x | tx" /></li>
              }
            </ul>
          } @else {
            <p><app-tt [text]="sc.situation | tx" /></p>
            @if (hints() === 'full' && sc.symptoms?.length) {
              <ul class="small muted">
                @for (x of sc.symptoms; track $index) {
                  <li><app-tt [text]="x | tx" /></li>
                }
              </ul>
            }
          }
          @if (hints() === 'full' && showProblem()) {
            <div class="row-wrap problems">
              @for (t of sc.problemTags; track t) {
                <span class="tag">{{ threat(t) }}</span>
              }
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      :host { display: block; }
      .ctx { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; }
      .me { display: flex; gap: 10px; align-items: center; }
      .hero-name { font-weight: 650; }
      .souls { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-weight: 600; }
      .upper { margin-bottom: 6px; }
      .enemy { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
      .en-name { font-weight: 550; }
      .story p { line-height: 1.55; }
      .story ul { margin-top: 6px; }
      .problems { margin-top: 8px; }
      .allies { gap: 8px; }
    `,
  ],
})
export class ScenarioContext {
  private readonly game = inject(GameData);
  private readonly i18n = inject(I18n);
  readonly s = input.required<Scenario>();
  readonly hints = input<'full' | 'reduced' | 'none'>('full');
  /** Problem tags reveal the diagnosis; hidden in diagnose questions. */
  readonly showProblem = input(true);

  protected readonly heroName = computed(() => this.i18n.name(this.game.hero(this.s().hero)?.name));
  protected readonly phase = computed(() => {
    const p = PHASE_LABELS[this.s().phase];
    return this.i18n.l(p.ru, p.en);
  });

  heroOf(key: string): string {
    return this.i18n.name(this.game.hero(key)?.name) || key;
  }

  threat(t: string): string {
    const l = THREAT_LABELS[t as keyof typeof THREAT_LABELS];
    return l ? this.i18n.l(l.ru, l.en) : t;
  }
}
