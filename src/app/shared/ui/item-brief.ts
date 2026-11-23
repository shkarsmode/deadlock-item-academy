import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { SLOT_LABELS } from '../../content/labels';
import { Icon } from './icon';
import { ItemIcon } from './item-icon';
import { ItemType } from './item-type';
import { KeyStats } from './key-stats';
import { RichText, StatLines } from './primitives';
import { TermText } from './term-text';

/**
 * Compact explanation of an item, built to be read in a few seconds: what it is for (one line),
 * how it works (type pills), its key numbers, and the icon hook. The longer text waits behind
 * "More" so the answer screen stays short.
 */
@Component({
  selector: 'app-item-brief',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TermText, Icon, ItemIcon, ItemType, KeyStats, RichText, StatLines, RouterLink, ...I18N_PIPES],
  template: `
    @if (item(); as it) {
      <div class="head">
        <app-item-icon [item]="it" [size]="iconSize()" [alt]="true" [peek]="false" />
        <div class="grow">
          <div class="name">
            <a [routerLink]="['/items', it.key]">{{ it.name | gn }}</a>
            @if (i18n.altName(it.name); as alt) {
              <span class="alt">{{ alt }}</span>
            }
            @if (label()) {
              <span class="who">{{ label() }}</span>
            }
          </div>
          <div class="meta">
            <span [class]="'tag tag-' + it.slot">{{ slotLabel() }}</span>
            <span class="tag num">T{{ it.tier }} · {{ it.cost }}</span>
            <app-item-type [item]="it" />
          </div>
        </div>
      </div>
      @if (c(); as cc) {
        <p class="job"><app-tt [text]="cc.job | tx" /></p>
      } @else {
        <p class="job official"><app-rt [text]="officialText()" /></p>
      }
      <app-key-stats [item]="it" [max]="4" />
      @if (c()?.iconCue && showCue()) {
        <div class="cue">
          <app-icon name="eye" [size]="15" />
          <span><b>{{ 'Запомни иконку:' | l: 'Icon hook:' }}</b> {{ c()!.iconCue | tx }}</span>
        </div>
      }
      <details class="more" [open]="depth() === 'technical'">
        <summary>{{ 'Подробнее' | l: 'More' }}</summary>
        <div class="more-body">
          @if (c(); as cc) {
            <p><app-tt [text]="(depth() === 'simple' ? cc.simple : cc.detail) | tx" /></p>
            <p class="official small"><app-rt [text]="officialText()" /></p>
          }
          @for (s of it.sections; track $index) {
            @if (s.stats.length) {
              <div class="sec">
                <div class="upper faint">{{ sectionName(s.kind) }}</div>
                <app-stats [stats]="s.stats" />
              </div>
            }
          }
        </div>
      </details>
    }
  `,
  styles: [
    `
      :host { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
      .head { display: flex; gap: 12px; align-items: flex-start; }
      .grow { min-width: 0; }
      .name { font-weight: 650; font-size: var(--fs-lg); display: flex; flex-wrap: wrap; gap: 2px 8px; align-items: baseline; }
      .name a { color: var(--text); }
      .alt { font-size: var(--fs-sm); color: var(--text-3); font-weight: 500; }
      .who { font-size: var(--fs-xs); color: var(--text-3); font-weight: 500; }
      .meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; align-items: center; }
      .job { margin: 0; font-weight: 600; font-size: var(--fs-md); line-height: 1.45; }
      .job.official { font-weight: 500; color: var(--text-2); }
      .cue {
        display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-radius: var(--r-md);
        background: var(--accent-bg); border-left: 3px solid var(--accent); font-size: var(--fs-sm); line-height: 1.45;
      }
      .cue app-icon { color: var(--accent); margin-top: 2px; }
      .cue b { font-weight: 650; }
      .more summary { cursor: pointer; width: max-content; font-size: var(--fs-sm); color: var(--text-2); list-style-position: inside; }
      .more summary:hover { color: var(--text); }
      .more-body { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; font-size: var(--fs-sm); color: var(--text-2); line-height: 1.5; }
      .more-body p { margin: 0; }
      .official { color: var(--text-3); }
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
