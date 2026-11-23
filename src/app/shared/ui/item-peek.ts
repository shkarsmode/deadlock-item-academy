import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, viewChild } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Content } from '../../content/content.service';
import { SLOT_LABELS } from '../../content/labels';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Icon } from './icon';
import { ItemIcon } from './item-icon';
import { ItemPeek } from './item-peek.service';
import { KeyStats } from './key-stats';

/** The card itself, rendered once in the app shell. Informational only: it never takes the pointer. */
@Component({
  selector: 'app-item-peek-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ItemIcon, KeyStats, ...I18N_PIPES],
  template: `
    @if (item(); as it) {
      <div #card class="peek" role="tooltip" [class.weapon]="it.slot === 'weapon'" [class.vitality]="it.slot === 'vitality'" [class.spirit]="it.slot === 'spirit'">
        <div class="p-head">
          <app-item-icon [item]="it" [size]="52" [alt]="true" [peek]="false" />
          <div class="grow">
            <div class="p-name">{{ it.name | gn }}</div>
            @if (i18n.altName(it.name); as alt) {
              <div class="p-alt">{{ alt }}</div>
            }
            <div class="p-meta">
              <span [class]="'tag tag-' + it.slot">{{ slotLabel() }}</span>
              <span class="tag num">T{{ it.tier }} · {{ it.cost }}</span>
            </div>
          </div>
        </div>
        <div class="p-type">
          @if (it.isActive) {
            <span class="t act"><app-icon name="click" [size]="13" /> {{ 'Активный: нажимаешь сам' | l: 'Active: you press it' }}@if (it.cooldown) {<span class="num"> · {{ it.cooldown }} {{ 'с' | l: 's' }}</span>}</span>
          } @else {
            <span class="t"><app-icon name="infinity" [size]="13" /> {{ 'Пассивный: работает сам' | l: 'Passive: works by itself' }}</span>
          }
          @if (it.imbue) {
            <span class="t imb"><app-icon name="link" [size]="13" /> {{ 'Imbue: при покупке выбираешь 1 умение' | l: 'Imbue: you pick 1 ability when buying' }}</span>
          }
        </div>
        @if (job(); as j) {
          <p class="p-job">{{ j }}</p>
        }
        <app-key-stats [item]="it" [max]="4" [compact]="true" />
        @if (from().length) {
          <div class="p-path"><span class="faint">{{ 'Собирается из:' | l: 'Builds from:' }}</span> {{ from().join(', ') }}</div>
        }
        @if (into().length) {
          <div class="p-path"><span class="faint">{{ 'Улучшается в:' | l: 'Upgrades into:' }}</span> {{ into().join(', ') }}</div>
        }
      </div>
    }
  `,
  styles: [
    `
      .peek {
        position: fixed; left: 0; top: 0; z-index: 1000; width: 310px; max-width: calc(100vw - 16px);
        display: flex; flex-direction: column; gap: 10px; padding: 14px;
        border-radius: var(--r-lg); border: 1px solid var(--border-3); background: var(--bg-2);
        box-shadow: 0 18px 44px rgba(0, 0, 0, 0.6); pointer-events: none; opacity: 0;
        transition: opacity var(--t-fast) var(--ease);
        --p-accent: var(--accent);
      }
      .peek.weapon { --p-accent: var(--weapon); }
      .peek.vitality { --p-accent: var(--vitality); }
      .peek.spirit { --p-accent: var(--spirit); }
      .peek::before { content: ''; position: absolute; left: 0; top: 12px; bottom: 12px; width: 3px; border-radius: 0 3px 3px 0; background: var(--p-accent); }
      .p-head { display: flex; gap: 12px; align-items: flex-start; }
      .p-name { font-weight: 700; font-size: var(--fs-lg); line-height: 1.25; }
      .p-alt { color: var(--text-3); font-size: var(--fs-xs); }
      .p-meta { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
      .p-type { display: flex; flex-direction: column; gap: 4px; font-size: var(--fs-sm); }
      .t { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); }
      .t.act { color: var(--accent); }
      .t.imb { color: var(--spirit); }
      .p-job { margin: 0; font-weight: 550; line-height: 1.45; }
      .p-path { font-size: var(--fs-xs); color: var(--text-2); }
    `,
  ],
})
export class ItemPeekHost {
  protected readonly i18n = inject(I18n);
  private readonly peek = inject(ItemPeek);
  private readonly game = inject(GameData);
  private readonly content = inject(Content);
  private readonly card = viewChild<ElementRef<HTMLElement>>('card');

  protected readonly item = computed(() => this.game.item(this.peek.state()?.key));
  protected readonly slotLabel = computed(() => {
    const s = this.item()?.slot;
    return s ? this.i18n.l(SLOT_LABELS[s].ru, SLOT_LABELS[s].en) : '';
  });
  /** The authored one-line job, or the start of the official description. */
  protected readonly job = computed(() => {
    const it = this.item();
    if (!it) return '';
    const c = this.content.item(it.key);
    if (c) return this.i18n.text(c.job);
    const official = it.sections.map((s) => (s.text ? this.i18n.game(s.text) : '')).find(Boolean) ?? '';
    const plain = official.replace(/\*\*/g, '');
    return plain.length > 170 ? `${plain.slice(0, 167).trimEnd()}...` : plain;
  });
  protected readonly from = computed(() => (this.item()?.components ?? []).map((k) => this.i18n.name(this.game.item(k)?.name)).filter(Boolean));
  protected readonly into = computed(() => (this.item()?.upgradesInto ?? []).map((k) => this.i18n.name(this.game.item(k)?.name)).filter(Boolean));

  constructor() {
    const hide = () => this.peek.hide();
    const tapAway = () => {
      if (this.peek.state()?.touch) this.peek.hide();
    };
    document.addEventListener('scroll', hide, { capture: true, passive: true });
    addEventListener('resize', hide, { passive: true });
    document.addEventListener('pointerdown', tapAway, { capture: true, passive: true });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('scroll', hide, { capture: true });
      removeEventListener('resize', hide);
      document.removeEventListener('pointerdown', tapAway, { capture: true });
    });
    inject(Router)
      .events.pipe(
        filter((e) => e instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe(hide);

    // Place the card next to the icon once its size is known: right, else left, else below or above.
    afterRenderEffect(() => {
      const s = this.peek.state();
      const el = this.card()?.nativeElement;
      if (!s || !el) return;
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const r = s.rect;
      const gap = 10;
      const m = 8;
      let left: number;
      let top: number;
      if (!s.touch && r.right + gap + w <= innerWidth - m) {
        left = r.right + gap;
        top = r.top;
      } else if (!s.touch && r.left - gap - w >= m) {
        left = r.left - gap - w;
        top = r.top;
      } else {
        left = r.left + r.width / 2 - w / 2;
        top = r.bottom + gap;
        if (top + h > innerHeight - m) top = r.top - gap - h;
      }
      left = Math.min(Math.max(m, left), innerWidth - w - m);
      top = Math.min(Math.max(m, top), innerHeight - h - m);
      el.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
      el.style.opacity = '1';
    });
  }
}
