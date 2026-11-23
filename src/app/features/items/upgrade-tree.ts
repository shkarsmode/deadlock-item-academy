import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, afterRenderEffect, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SLOT_LABELS } from '../../content/labels';
import type { GameItem, Slot } from '../../core/game-data/game-data.model';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { carryStats, componentDiff, type ComponentDiff } from '../../domain/items/component-diff';
import { buildUpgradeMap, type ItemFamily } from '../../domain/items/families';
import { formatStat } from '../../domain/items/key-stats';
import type { StatLine } from '../../core/game-data/game-data.model';
import { ClaimBadge } from '../../shared/ui/primitives';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { KeyStats } from '../../shared/ui/key-stats';
import { Term } from '../../shared/ui/term';

const SLOTS: Slot[] = ['weapon', 'vitality', 'spirit'];

/** Which items upgrade into which, per shop category, with what every step gives (client data only). */
@Component({
  selector: 'app-upgrade-tree',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, RouterLink, Icon, ItemIcon, KeyStats, Term, ClaimBadge, ...I18N_PIPES],
  template: `
    <div class="page">
      <header class="page-head">
        <h1>{{ 'Дерево улучшений' | l: 'Upgrade tree' }}</h1>
        <p class="sub">{{ 'Какой предмет во что улучшается и что даёт каждый шаг. Все цифры из данных клиента.' | l: 'Which item upgrades into which and what every step gives. All numbers come from client data.' }}</p>
      </header>

      <div class="tiers">
        @for (t of tierPrices(); track t.tier; let last = $last) {
          <app-term key="tier" class="tier-chip"><b>T{{ t.tier }}</b> <span class="num">{{ t.cost }}</span></app-term>
          @if (!last) {
            <app-icon name="right" [size]="14" class="faint" />
          }
        }
      </div>

      <div class="legend panel">
        <div class="lg"><span class="topup num">{{ 'доплата +800' | l: 'top-up +800' }}</span><span class="small muted">{{ 'столько доплатить, если компонент уже куплен: его цена засчитывается' | l: 'what you pay when you own the component: its cost counts' }}</span></div>
        <div class="lg"><span class="lbl-kept xsmall">{{ 'От компонента' | l: 'From the component' }}</span><span class="small muted">{{ 'бонусы компонента, которые улучшение указывает у себя' | l: 'component bonuses the upgrade lists as its own' }}</span></div>
        <div class="lg"><span class="lbl-missing xsmall"><s>{{ 'Нет в улучшении' | l: 'Not in the upgrade' }}</s></span><span class="small muted">{{ 'бонус компонента, которого у улучшения нет' | l: 'a component bonus the upgrade does not have' }}</span></div>
        <details class="why small">
          <summary>{{ 'Складывается ли бонус компонента с улучшением?' | l: 'Does the component bonus stack with the upgrade?' }}</summary>
          <p class="muted">
            {{ 'Похоже, что нет: улучшение заменяет компонент, и его цифры уже итоговые. В данных в {full} из {total} пар улучшение повторяет все бонусы компонента, например Arcane Surge сам даёт +1 к выносливости, как Extra Stamina. Прямо клиент это правило не пишет: проверить можно по числу делений выносливости до и после улучшения.' | l: 'Most likely not: the upgrade replaces the component and its numbers are the total. In the data {full} of {total} pairs repeat every component bonus, for example Arcane Surge itself gives +1 Stamina like Extra Stamina. The client does not state the rule: you can check it by counting stamina pips before and after the upgrade.' : carry() }}
            <app-claim status="unverified" />
          </p>
        </details>
      </div>

      <div class="toolbar">
        <div class="seg slots" role="tablist">
          @for (s of slots; track s) {
            <button role="tab" [class]="'on-' + s" [class.on]="slot() === s" [attr.aria-selected]="slot() === s" (click)="slot.set(s)">
              {{ slotName(s) }} <span class="num faint">{{ counts()[s] }}</span>
            </button>
          }
        </div>
        <input class="input search" type="search" [value]="query()" (input)="query.set($any($event.target).value)" [placeholder]="'Найти предмет' | l: 'Find an item'" [attr.aria-label]="'Найти предмет' | l: 'Find an item'" />
      </div>

      @if (!families().length && !standalone().length) {
        <div class="empty">{{ 'Ничего не нашлось.' | l: 'Nothing found.' }}</div>
      }

      <section class="families">
        @for (f of families(); track f.root) {
          <div [class]="'fam panel d' + f.depth">
            <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: f.tree }" />
          </div>
        }
      </section>

      @if (standalone().length) {
        <section class="panel solo">
          <div class="panel-head">
            <h2>{{ 'Без цепочки: не собираются и не улучшаются' | l: 'No chain: neither built from nor upgraded' }}</h2>
            <span class="spacer"></span>
            <span class="faint small num">{{ standalone().length }}</span>
          </div>
          <div class="panel-body solo-body">
            @for (row of standaloneByTier(); track row.tier) {
              <div class="solo-row">
                <span class="solo-tier">T{{ row.tier }}</span>
                <div class="solo-items">
                  @for (it of row.items; track it.key) {
                    <a class="solo-item" [routerLink]="['/items', it.key]" [class.hl]="isMatch(it)">
                      <app-item-icon [item]="it" [size]="36" [alt]="true" />
                      <span class="small">{{ it.name | gn }}</span>
                    </a>
                  }
                </div>
              </div>
            }
          </div>
        </section>
      }
    </div>

    <ng-template #nodeTpl let-n let-parent="parent">
      <div class="branch">
        <a class="node" [routerLink]="['/items', n.item.key]" [class.hl]="isMatch(n.item)" [attr.data-key]="n.item.key">
          <app-item-icon [item]="n.item" [size]="44" [alt]="true" />
          <div class="n-body">
            <div class="n-name">{{ n.item.name | gn }}</div>
            <div class="n-meta">
              <span class="num">T{{ n.item.tier }} · {{ n.item.cost }}</span>
              @if (n.topUp !== null) {
                <span class="topup num">{{ 'доплата' | l: 'top-up' }} +{{ n.topUp }}</span>
              }
              @if (n.item.slot !== slot()) {
                <span [class]="'tag tag-' + n.item.slot">{{ slotName(n.item.slot) }}</span>
              }
              @if (n.item.isActive) {
                <span class="flag act">{{ 'активный' | l: 'active' }}</span>
              }
              @if (n.item.imbue) {
                <span class="flag imb">imbue</span>
              }
            </div>
            @if (parent) {
              @let d = diff(n.item, parent);
              @if (d.added.length) {
                <app-key-stats [item]="n.item" [stats]="d.added" [max]="3" [compact]="true" />
              }
              @if (d.kept.length) {
                <div class="carry xsmall">
                  <span class="lbl-kept">{{ 'От' | l: 'From' }} {{ parent.name | gn }}</span>
                  @for (k of d.kept; track k.stat.prop; let last = $last) {
                    <span><b class="num">{{ k.to }}</b> {{ label(k.stat) }}@if (!k.same) {<span class="faint"> ({{ 'было' | l: 'was' }} {{ k.from }})</span>}@if (!last) {,}</span>
                  }
                </div>
              }
              @if (d.missing.length) {
                <div class="carry missing xsmall">
                  <span class="lbl-missing">{{ 'Нет в улучшении' | l: 'Not in the upgrade' }}</span>
                  @for (m of d.missing; track m.prop; let last = $last) {
                    <s><b class="num">{{ fmt(m) }}</b> {{ label(m) }}</s>@if (!last) {<span>,</span>}
                  }
                </div>
              }
            } @else {
              <app-key-stats [item]="n.item" [max]="3" [compact]="true" />
            }
            @if (n.alsoFrom.length) {
              <div class="also xsmall muted">{{ 'Собирается также из:' | l: 'Also builds from:' }} {{ names(n.alsoFrom) }}</div>
            }
          </div>
        </a>
        @if (n.children.length) {
          <div class="kids">
            @for (k of n.children; track k.item.key) {
              <ng-container *ngTemplateOutlet="nodeTpl; context: { $implicit: k, parent: n.item }" />
            }
          </div>
        }
      </div>
    </ng-template>
  `,
  styles: [
    `
      .empty { padding: 32px 16px; text-align: center; color: var(--text-3); }
      .tiers { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 8px; margin-bottom: 14px; }
      :host .tier-chip { text-decoration: none; }
      .tier-chip { display: inline-flex; gap: 6px; padding: 3px 9px; border-radius: 999px; background: var(--bg-3); border: 1px solid var(--border); font-size: var(--fs-sm); }
      .legend { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; padding: 12px 14px; margin-bottom: 14px; }
      .lg { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; min-width: 0; }
      .lg > span:first-child { flex: none; min-width: 130px; }
      .lg > span:last-child { min-width: 0; flex: 1 1 200px; }
      .why summary { cursor: pointer; color: var(--text-2); }
      .why p { margin: 6px 0 0; line-height: 1.5; }
      .lbl-kept { color: var(--good); font-weight: 600; }
      .lbl-missing { color: var(--bad); font-weight: 600; }
      .carry { display: flex; flex-wrap: wrap; gap: 2px 6px; align-items: baseline; color: var(--text-2); line-height: 1.45; }
      .carry .lbl-kept, .carry .lbl-missing { margin-right: 2px; }
      .carry.missing s { color: var(--text-3); }
      .toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
      .slots button.on.on-weapon { color: var(--weapon); }
      .slots button.on.on-vitality { color: var(--vitality); }
      .slots button.on.on-spirit { color: var(--spirit); }
      .search { flex: 1 1 220px; min-width: 0; max-width: 360px; }
      .families { display: grid; grid-template-columns: minmax(0, 1fr); gap: 12px; margin-bottom: 16px; }
      .fam { padding: 14px; overflow-x: auto; container-type: inline-size; }

      .branch { display: flex; align-items: flex-start; }
      .node {
        position: relative; flex: none; width: 260px; display: flex; gap: 10px; padding: 10px;
        border-radius: var(--r-lg); background: var(--bg-2); border: 1px solid var(--border); color: inherit; text-decoration: none;
        transition: border-color var(--t-fast) var(--ease);
      }
      .node:hover { border-color: var(--border-3); }
      .node.hl { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent) inset; }
      .n-body { min-width: 0; display: flex; flex-direction: column; gap: 6px; }
      .n-name { font-weight: 650; line-height: 1.25; }
      .n-meta { display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; font-size: var(--fs-xs); color: var(--text-3); }
      .topup { color: var(--good); }
      .flag { font-weight: 600; }
      .flag.act { color: var(--accent); }
      .flag.imb { color: var(--spirit); }

      /* connectors: parent -> spine -> each child */
      .kids { position: relative; display: flex; flex-direction: column; gap: 10px; padding-left: 40px; }
      .kids::before { content: ''; position: absolute; left: 0; top: 32px; width: 20px; border-top: 2px solid var(--border-3); }
      .kids > .branch { position: relative; }
      .kids > .branch::before { content: ''; position: absolute; left: -20px; top: 32px; width: 20px; border-top: 2px solid var(--border-3); }
      .kids > .branch::after { content: ''; position: absolute; left: -20px; top: 0; bottom: -10px; border-left: 2px solid var(--border-3); }
      .kids > .branch:first-child::after { top: 32px; }
      .kids > .branch:last-child::after { bottom: auto; height: 34px; }
      .kids > .branch:first-child:last-child::after { display: none; }

      .solo-body { display: grid; gap: 12px; }
      .solo-row { display: flex; gap: 12px; align-items: flex-start; }
      .solo-tier { flex: none; width: 28px; padding-top: 8px; font: 700 var(--fs-sm) / 1 var(--mono); color: var(--text-3); }
      .solo-items { display: flex; flex-wrap: wrap; gap: 8px; min-width: 0; }
      .solo-item { display: inline-flex; align-items: center; gap: 8px; padding: 4px 10px 4px 4px; border-radius: var(--r-md); background: var(--bg-2); border: 1px solid var(--border); color: inherit; }
      .solo-item.hl { border-color: var(--accent); }

      /* Not enough width for side-by-side columns: stack the chain (depends on the chain's length). */
      @container (max-width: 560px) {
        .d2 .branch { flex-direction: column; align-items: stretch; }
        .d2 .node { width: auto; }
        .d2 .kids { padding-left: 24px; margin-top: 10px; }
        .d2 .kids::before { left: 10px; top: -10px; width: 0; height: 10px; border-top: 0; border-left: 2px solid var(--border-3); }
        .d2 .kids > .branch::before { left: -14px; width: 14px; }
        .d2 .kids > .branch::after { left: -14px; }
        .d2 .kids > .branch:first-child::after { top: 0; }
        .d2 .kids > .branch:first-child:last-child::after { display: block; bottom: auto; height: 34px; }
      }
      @container (max-width: 840px) {
        .d3 .branch { flex-direction: column; align-items: stretch; }
        .d3 .node { width: auto; }
        .d3 .kids { padding-left: 24px; margin-top: 10px; }
        .d3 .kids::before { left: 10px; top: -10px; width: 0; height: 10px; border-top: 0; border-left: 2px solid var(--border-3); }
        .d3 .kids > .branch::before { left: -14px; width: 14px; }
        .d3 .kids > .branch::after { left: -14px; }
        .d3 .kids > .branch:first-child::after { top: 0; }
        .d3 .kids > .branch:first-child:last-child::after { display: block; bottom: auto; height: 34px; }
      }
    `,
  ],
})
export class UpgradeTreePage {
  private readonly game = inject(GameData);
  private readonly i18n = inject(I18n);

  /** Query params: `?slot=spirit&item=upgrade_magic_storm` opens the right tab and highlights the item. */
  readonly slotParam = input<string | undefined>(undefined, { alias: 'slot' });
  readonly itemParam = input<string | undefined>(undefined, { alias: 'item' });

  protected readonly slots = SLOTS;
  protected readonly slot = linkedSignal<Slot>(() => {
    const p = this.slotParam();
    if (p && (SLOTS as string[]).includes(p)) return p as Slot;
    return this.game.item(this.itemParam())?.slot ?? 'weapon';
  });
  protected readonly query = signal('');

  private readonly map = computed(() => buildUpgradeMap(this.game.items()));
  protected readonly tierPrices = computed(() => {
    const tiers = this.game.meta()?.priceTiers ?? [];
    return [1, 2, 3, 4].filter((t) => tiers[t]).map((t) => ({ tier: t, cost: tiers[t] }));
  });
  protected readonly counts = computed(() => {
    const m = this.map();
    const out = { weapon: 0, vitality: 0, spirit: 0 } as Record<Slot, number>;
    for (const s of SLOTS) {
      const inFamilies = new Set(m.families.flatMap((f) => f.keys.filter((k) => this.game.item(k)?.slot === s)));
      out[s] = inFamilies.size + m.standalone.filter((i) => i.slot === s).length;
    }
    return out;
  });

  private readonly q = computed(() => this.query().trim().toLowerCase());
  protected readonly families = computed<ItemFamily[]>(() => {
    const s = this.slot();
    const q = this.q();
    return this.map().families.filter((f) => f.slots.includes(s) && (!q || f.keys.some((k) => this.matches(this.game.item(k), q))));
  });
  protected readonly standalone = computed(() => {
    const q = this.q();
    return this.map().standalone.filter((i) => i.slot === this.slot() && (!q || this.matches(i, q)));
  });
  protected readonly standaloneByTier = computed(() => {
    const rows = new Map<number, GameItem[]>();
    for (const it of this.standalone()) rows.set(it.tier, [...(rows.get(it.tier) ?? []), it]);
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([tier, items]) => ({ tier, items }));
  });

  constructor() {
    // Bring the highlighted item into view once (deep link from an item page).
    let scrolled = false;
    afterRenderEffect(() => {
      const key = this.itemParam();
      if (!key || scrolled || !this.families().length) return;
      const el = document.querySelector(`[data-key="${CSS.escape(key)}"]`);
      if (el) {
        scrolled = true;
        // After the router's own scroll-to-top on navigation.
        setTimeout(() => el.scrollIntoView({ block: 'center' }), 80);
      }
    });
  }

  protected isMatch(it: GameItem): boolean {
    const q = this.q();
    return q ? this.matches(it, q) : it.key === this.itemParam();
  }

  protected readonly carry = computed(() => carryStats(this.game.items()));
  private readonly diffs = new Map<string, ComponentDiff>();

  /** Cached: the template asks for it on every render. */
  protected diff(item: GameItem, parent: GameItem): ComponentDiff {
    const id = `${parent.key}>${item.key}:${item.hash}`;
    let d = this.diffs.get(id);
    if (!d) {
      d = componentDiff(item, parent);
      this.diffs.set(id, d);
    }
    return d;
  }

  protected label(s: StatLine): string {
    return this.i18n.game(s.label);
  }

  protected fmt(s: StatLine): string {
    return formatStat(s);
  }

  protected slotName(s: Slot): string {
    return this.i18n.l(SLOT_LABELS[s].ru, SLOT_LABELS[s].en);
  }

  protected names(keys: string[]): string {
    return keys.map((k) => this.i18n.name(this.game.item(k)?.name)).join(', ');
  }

  private matches(it: GameItem | undefined, q: string): boolean {
    return !!it && (it.name.en.toLowerCase().includes(q) || it.name.ru.toLowerCase().includes(q));
  }
}
