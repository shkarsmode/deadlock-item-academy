import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { SLOT_LABELS } from '../../content/labels';
import { ItemIcon } from './item-icon';
import { RichText, StatLines } from './primitives';

/** Compact explanation card of an item: what it is, its job, and (by depth) mechanics and stats. */
@Component({
  selector: 'app-item-brief',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemIcon, RichText, StatLines, RouterLink, ...I18N_PIPES],
  template: `
    @if (item(); as it) {
      <div class="head">
        <app-item-icon [item]="it" [size]="iconSize()" [badges]="true" [alt]="true" />
        <div class="grow">
          <div class="name">
            <a [routerLink]="['/items', it.key]">{{ it.name | gn }}</a>
            @if (i18n.altName(it.name); as alt) {
              <span class="alt">{{ alt }}</span>
            }
          </div>
          <div class="row-wrap meta">
            <span class="tag" [class]="'tag tag-' + it.slot">{{ slotLabel() }}</span>
            <span class="tag num">T{{ it.tier }} · {{ it.cost }}</span>
            @if (it.isActive) {
              <span class="tag tag-accent">{{ 'Активный' | l: 'Active' }}{{ it.cooldown ? ' · ' + it.cooldown + ' s' : '' }}</span>
            }
            @if (it.imbue) {
              <span class="tag tag-spirit">Imbue</span>
            }
            @if (label()) {
              <span class="who">{{ label() }}</span>
            }
          </div>
        </div>
      </div>
      @if (c(); as cc) {
        <p class="job">{{ cc.job | tx }}</p>
        @if (depth() === 'simple') {
          <p class="muted">{{ cc.simple | tx }}</p>
        } @else {
          <p class="muted">{{ cc.detail | tx }}</p>
        }
        @if (cc.iconCue && showCue()) {
          <p class="cue"><span class="faint">{{ 'Как запомнить иконку:' | l: 'Icon hook:' }}</span> {{ cc.iconCue | tx }}</p>
        }
      } @else {
        <p class="muted"><app-rt [text]="officialText()" /></p>
      }
      @if (depth() === 'technical' || !c()) {
        @for (s of it.sections; track $index) {
          @if (s.stats.length) {
            <div class="sec">
              <div class="upper faint">{{ sectionName(s.kind) }}</div>
              <app-stats [stats]="s.stats" />
            </div>
          }
        }
        @if (c()) {
          <p class="official small"><app-rt [text]="officialText()" /></p>
        }
      }
    }
  `,
  styles: [
    `
      :host { display: block; }
      .head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 8px; }
      .name { font-weight: 650; font-size: var(--fs-lg); display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: baseline; }
      .name a { color: var(--text); }
      .alt { font-size: var(--fs-sm); color: var(--text-3); font-weight: 500; }
      .meta { margin-top: 4px; gap: 6px; }
      .who { font-size: var(--fs-xs); color: var(--text-3); }
      .job { font-weight: 550; margin: 6px 0 4px; }
      .cue { margin-top: 6px; font-size: var(--fs-sm); }
      .sec { margin-top: 8px; }
      .official { margin-top: 8px; color: var(--text-3); }
      p + p { margin-top: 4px; }
    `,
  ],
})
export class ItemBrief {
  protected readonly i18n = inject(I18n);
  private readonly game = inject(GameData);
  private readonly content = inject(Content);
  private readonly profiles = inject(Profiles);

  readonly key = input.required<string>();
  readonly iconSize = input(56);
  readonly label = input<string | null>(null);
  readonly showCue = input(true);
  /** Override the profile explanation depth. */
  readonly depthOverride = input<'simple' | 'detailed' | 'technical' | null>(null);

  protected readonly item = computed(() => this.game.item(this.key()));
  protected readonly c = computed(() => this.content.item(this.key()));
  protected readonly depth = computed(() => this.depthOverride() ?? this.profiles.settings().explain);
  protected readonly slotLabel = computed(() => {
    const s = this.item()?.slot;
    return s ? this.i18n.l(SLOT_LABELS[s].ru, SLOT_LABELS[s].en) : '';
  });
  protected readonly officialText = computed(() => {
    const it = this.item();
    if (!it) return '';
    return it.sections
      .map((s) => (s.text ? this.i18n.game(s.text) : ''))
      .filter(Boolean)
      .join('\n');
  });

  sectionName(kind: string): string {
    switch (kind) {
      case 'innate':
        return this.i18n.l('Постоянные бонусы', 'Innate');
      case 'passive':
        return this.i18n.l('Пассивный эффект', 'Passive');
      case 'active':
        return this.i18n.l('Активный эффект', 'Active');
      default:
        return this.i18n.l('Эффект', 'Effect');
    }
  }
}
