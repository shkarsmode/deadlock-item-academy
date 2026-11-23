import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import { Router, RouterLink } from '@angular/router';
import type { ItemRole } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { ROLE_LABELS, SLOT_LABELS } from '../../content/labels';
import type { GameItem, Slot } from '../../core/game-data/game-data.model';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Hotkeys } from '../../core/ui/hotkeys.service';
import { Knowledge } from '../../learning/knowledge.service';
import { isProblemItem } from '../../learning/mastery';
import { MyBuild } from '../../learning/my-build.service';
import { Session } from '../../learning/session.service';
import { normalizeAnswer } from '../../learning/questions/fuzzy';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { LevelPips } from '../../shared/ui/primitives';

type GroupBy = 'tier' | 'purpose' | 'level';
type Kind = 'all' | 'active' | 'passive' | 'imbue';
type Scope = 'all' | 'my-build' | 'hero' | 'problem';

const PURPOSE_GROUPS: { id: string; ru: string; en: string; roles: ItemRole[] }[] = [
  { id: 'gun', ru: 'Урон оружием', en: 'Gun damage', roles: ['weapon-dps', 'weapon-burst', 'headshot', 'fire-rate', 'ammo', 'reload', 'bullet-velocity', 'long-range', 'close-range', 'proc-on-hit'] },
  { id: 'spirit', ru: 'Способности и спирит-урон', en: 'Abilities & spirit damage', roles: ['spirit-power', 'spirit-burst', 'spirit-dps', 'cooldown', 'charges', 'ability-range', 'ability-duration', 'imbue', 'ultimate'] },
  { id: 'debuff', ru: 'Дебаффы и контроль на врага', en: 'Debuffs & control', roles: ['anti-heal', 'bullet-resist-shred', 'spirit-resist-shred', 'damage-amp', 'slow', 'stun', 'silence', 'disarm', 'immobilize', 'curse', 'mobility-denial', 'reveal', 'fire-rate-slow'] },
  { id: 'defense', ru: 'Защита и выживание', en: 'Defense & survival', roles: ['bullet-resist', 'spirit-resist', 'melee-resist', 'max-health', 'regen', 'barrier', 'cleanse', 'cc-immunity', 'debuff-resist', 'invulnerability', 'anti-burst', 'escape', 'return-damage'] },
  { id: 'sustain', ru: 'Лечение и вампиризм', en: 'Sustain & lifesteal', roles: ['bullet-lifesteal', 'spirit-lifesteal', 'self-heal', 'ally-heal'] },
  { id: 'mobility', ru: 'Мобильность', en: 'Mobility', roles: ['move-speed', 'sprint', 'dash', 'stamina', 'jump', 'teleport', 'stealth'] },
  { id: 'team', ru: 'Экономика и команда', en: 'Economy & team', roles: ['farm', 'economy', 'team-buff', 'aura', 'objective', 'melee'] },
];

@Component({
  selector: 'app-items-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SyncSelectValue, RouterLink, Icon, ItemIcon, LevelPips, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="grow">
          <h1>{{ 'Предметы' | l: 'Items' }}</h1>
          <p class="sub">{{ 'Актуальный магазин клиента' | l: 'Current client shop' }} {{ game.meta()?.clientVersion }} · {{ filtered().length }} {{ 'из' | l: 'of' }} {{ pool().length }}</p>
        </div>
        <button class="btn" [class.btn-primary]="study()" (click)="study.set(!study())" [attr.aria-pressed]="study()">
          <app-icon [name]="study() ? 'eye-off' : 'eye'" /> {{ 'Режим изучения' | l: 'Study mode' }} <kbd class="kbd-hint">S</kbd>
        </button>
        <button class="btn" (click)="practiceFiltered()" [disabled]="!filtered().length"><app-icon name="play" /> {{ 'Тренировать эти' | l: 'Practice these' }}</button>
      </div>

      <div class="filters panel panel-pad">
        <div class="search">
          <app-icon name="search" [size]="16" />
          <input #search class="input" type="search" [value]="q()" (input)="q.set($any($event.target).value)" [placeholder]="'Название, задача или эффект... ( / )' | l: 'Name, job or effect... ( / )'" [attr.aria-label]="'Поиск' | l: 'Search'" />
        </div>
        <div class="row-wrap">
          <div class="seg" role="group" [attr.aria-label]="'Категория' | l: 'Category'">
            <button [class.on]="slot() === 'all'" (click)="slot.set('all')">{{ 'Все' | l: 'All' }}</button>
            @for (s of slots; track s) {
              <button [class.on]="slot() === s" (click)="slot.set(s)" [class]="slot() === s ? 'on c-' + s : ''">{{ slotLabel(s) }}</button>
            }
          </div>
          <div class="seg" role="group" [attr.aria-label]="'Тир' | l: 'Tier'">
            <button [class.on]="tier() === 0" (click)="tier.set(0)">T*</button>
            @for (t of [1, 2, 3, 4]; track t) {
              <button [class.on]="tier() === t" (click)="tier.set(t)">T{{ t }}</button>
            }
          </div>
          <div class="seg" role="group">
            @for (k of kinds; track k.id) {
              <button [class.on]="kind() === k.id" (click)="kind.set(k.id)">{{ k.ru | l: k.en }}</button>
            }
          </div>
          <div class="seg" role="group">
            @for (s of scopes; track s.id) {
              <button [class.on]="scope() === s.id" (click)="scope.set(s.id)">{{ s.ru | l: s.en }}</button>
            }
          </div>
          <span class="spacer"></span>
          <label class="small muted row">{{ 'Группировать' | l: 'Group by' }}
            <select class="select group-select" [syncValue]="groupBy()" (change)="groupBy.set($any($event.target).value)">
              <option value="tier">{{ 'по тиру (как в магазине)' | l: 'tier (as in shop)' }}</option>
              <option value="purpose">{{ 'по назначению' | l: 'purpose' }}</option>
              <option value="level">{{ 'по освоению' | l: 'mastery' }}</option>
            </select>
          </label>
        </div>
      </div>

      @if (study()) {
        <p class="callout info small study-hint"><app-icon name="eye-off" [size]="16" /> {{ 'Названия скрыты. Вспомни предмет, затем нажми на иконку, чтобы проверить себя.' | l: 'Names hidden. Recall the item, then click the icon to check.' }}</p>
      }

      @for (g of groups(); track g.id) {
        @if (g.items.length) {
          <section class="group">
            <h2 class="group-title">{{ g.title }} <span class="faint num">{{ g.items.length }}</span></h2>
            <div class="tiles">
              @for (it of g.items; track it.key) {
                @if (study()) {
                  <button class="tile" (click)="toggleReveal(it.key)" [attr.aria-label]="'Проверить себя' | l: 'Reveal'">
                    <app-item-icon [item]="it" [size]="64" [alt]="revealed().has(it.key)" />
                    <span class="name" [class.hidden]="!revealed().has(it.key)">{{ revealed().has(it.key) ? (it.name | gn) : '???' }}</span>
                  </button>
                } @else {
                  <a class="tile" [routerLink]="['/items', it.key]">
                    <app-item-icon [item]="it" [size]="64" [badges]="true" [alt]="true" />
                    <span class="name">{{ it.name | gn }}</span>
                    <span class="meta xsmall"><span class="num faint">{{ it.cost }}</span><app-level [level]="knowledge.levels().get(it.key) ?? 0" /></span>
                  </a>
                }
              }
            </div>
          </section>
        }
      }
      @if (!filtered().length) {
        <div class="empty">{{ 'Ничего не найдено. Измени фильтры.' | l: 'Nothing found. Adjust the filters.' }}</div>
      }
      <label class="check small muted sb"><input type="checkbox" [checked]="showSB()" (change)="showSB.set(!showSB())" /> {{ 'Показать легендарные предметы Street Brawl (T5, нет в обычных матчах)' | l: 'Show Street Brawl legendary items (T5, not in normal matches)' }}</label>
    </div>
  `,
  styles: [
    `
      .filters { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-bottom: 16px; }
      .filters label.row { min-width: 0; max-width: 100%; }
      .filters label.row .select { min-width: 0; }
      .search { position: relative; }
      .search app-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-3); }
      .search .input { padding-left: 32px; }
      .group-select { width: auto; height: 30px; margin-left: 6px; }
      .study-hint { margin-bottom: 12px; }
      .group { margin-bottom: 20px; }
      .group-title { font-size: var(--fs-md); font-weight: 600; margin-bottom: 8px; color: var(--text-2); }
      .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(108px, 1fr)); gap: 8px; }
      .tile { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 10px 6px 8px; border-radius: var(--r-md); border: 1px solid var(--border); background: var(--bg-1); color: var(--text); text-decoration: none !important; text-align: center; min-width: 0; }
      .tile:hover { border-color: var(--border-3); background: var(--bg-2); }
      .name { font-size: var(--fs-sm); font-weight: 550; line-height: 1.25; overflow-wrap: anywhere; }
      .name.hidden { color: var(--text-3); letter-spacing: 0.2em; }
      .meta { display: flex; align-items: center; gap: 8px; }
      .sb { margin-top: 8px; }
      @media (max-width: 767px) { .tiles { grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); } }
    `,
  ],
})
export class ItemsPage {
  protected readonly game = inject(GameData);
  protected readonly knowledge = inject(Knowledge);
  private readonly content = inject(Content);
  private readonly i18n = inject(I18n);
  private readonly myBuild = inject(MyBuild);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly searchEl = viewChild<ElementRef<HTMLInputElement>>('search');

  protected readonly slots: Slot[] = ['weapon', 'vitality', 'spirit'];
  protected readonly kinds: { id: Kind; ru: string; en: string }[] = [
    { id: 'all', ru: 'Любые', en: 'Any' },
    { id: 'active', ru: 'Активные', en: 'Active' },
    { id: 'passive', ru: 'Пассивные', en: 'Passive' },
    { id: 'imbue', ru: 'Imbue', en: 'Imbue' },
  ];
  protected readonly scopes: { id: Scope; ru: string; en: string }[] = [
    { id: 'all', ru: 'Все', en: 'All' },
    { id: 'my-build', ru: 'Мой билд', en: 'My build' },
    { id: 'hero', ru: 'Мой герой', en: 'My hero' },
    { id: 'problem', ru: 'Проблемные', en: 'Problem' },
  ];

  protected readonly q = signal('');
  protected readonly slot = signal<Slot | 'all'>('all');
  protected readonly tier = signal(0);
  protected readonly kind = signal<Kind>('all');
  protected readonly scope = signal<Scope>('all');
  protected readonly groupBy = signal<GroupBy>('tier');
  protected readonly study = signal(false);
  protected readonly showSB = signal(false);
  protected readonly revealed = signal(new Set<string>());

  protected readonly pool = computed(() => (this.showSB() ? this.game.items() : this.game.standardItems()));

  private readonly heroItems = computed(() => {
    const h = this.game.hero(this.myBuild.build()?.heroKey ?? null);
    const set = new Set<string>(this.myBuild.itemKeys());
    if (h) for (const p of [...h.popular.early, ...h.popular.mid, ...h.popular.late]) set.add(p.itemKey);
    return set;
  });

  protected readonly filtered = computed(() => {
    const query = normalizeAnswer(this.q());
    const now = Date.now();
    this.knowledge.tick();
    return this.pool().filter((it) => {
      if (this.slot() !== 'all' && it.slot !== this.slot()) return false;
      if (this.tier() && it.tier !== this.tier()) return false;
      const k = this.kind();
      if (k === 'active' && !it.isActive) return false;
      if (k === 'passive' && it.isActive) return false;
      if (k === 'imbue' && !it.imbue) return false;
      const sc = this.scope();
      if (sc === 'my-build' && !this.myBuild.itemKeys().includes(it.key)) return false;
      if (sc === 'hero' && !this.heroItems().has(it.key)) return false;
      if (sc === 'problem' && !isProblemItem(this.knowledge.get(it.key), now)) return false;
      if (query) {
        const c = this.content.item(it.key);
        const hay = normalizeAnswer([it.name.en, it.name.ru, c?.job.ru ?? '', c?.job.en ?? '', it.summary.en, ...(c?.roles ?? []).map((r) => ROLE_LABELS[r]?.ru ?? '')].join(' '));
        if (!query.split(' ').every((w) => hay.includes(w))) return false;
      }
      return true;
    });
  });

  protected readonly groups = computed(() => {
    const list = this.filtered();
    const by = this.groupBy();
    if (by === 'tier') {
      return [1, 2, 3, 4, 5].map((t) => ({ id: `t${t}`, title: t === 5 ? 'Street Brawl T5' : `Tier ${t} · ${this.game.meta()?.priceTiers[t] ?? ''}`, items: sortItems(list.filter((i) => i.tier === t)) }));
    }
    if (by === 'level') {
      return [5, 4, 3, 2, 1, 0].map((lv) => ({
        id: `l${lv}`,
        title: this.i18n.l(['Не начато', 'Узнавание', 'Понимание', 'Применение', 'Анализ', 'Мастерство'][lv], ['Not started', 'Recognition', 'Understanding', 'Application', 'Analysis', 'Mastery'][lv]),
        items: sortItems(list.filter((i) => (this.knowledge.levels().get(i.key) ?? 0) === lv)),
      }));
    }
    const used = new Set<string>();
    const out = PURPOSE_GROUPS.map((g) => {
      const items = list.filter((i) => {
        if (used.has(i.key)) return false;
        const roles = this.content.item(i.key)?.roles ?? [];
        // primary purpose = first role in the authored list
        const ok = roles.length > 0 && g.roles.includes(roles[0]);
        if (ok) used.add(i.key);
        return ok;
      });
      return { id: g.id, title: this.i18n.l(g.ru, g.en), items: sortItems(items) };
    });
    out.push({ id: 'other', title: this.i18n.l('Без описания назначения', 'No purpose tags yet'), items: sortItems(list.filter((i) => !used.has(i.key))) });
    return out;
  });

  constructor() {
    inject(Hotkeys).register(
      [
        { keys: ['/'], handler: () => this.searchEl()?.nativeElement.focus(), description: { ru: 'Поиск', en: 'Search' } },
        { keys: ['s', 'ы'], handler: () => this.study.update((v) => !v) },
      ],
      inject(DestroyRef),
    );
  }

  slotLabel(s: Slot): string {
    return this.i18n.l(SLOT_LABELS[s].ru.split(' ')[0], SLOT_LABELS[s].en);
  }

  toggleReveal(key: string): void {
    this.revealed.update((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  practiceFiltered(): void {
    const keys = this.filtered()
      .filter((i) => i.mode === 'standard')
      .map((i) => i.key);
    if (!keys.length) return;
    const n = this.session.start({ mode: 'mixed', minutes: 10, filters: { itemKeys: keys } });
    if (n) void this.router.navigate(['/practice/run']);
  }
}

function sortItems(list: GameItem[]): GameItem[] {
  const order: Record<Slot, number> = { weapon: 0, vitality: 1, spirit: 2 };
  return [...list].sort((a, b) => order[a.slot] - order[b.slot] || a.tier - b.tier || a.name.en.localeCompare(b.name.en));
}
