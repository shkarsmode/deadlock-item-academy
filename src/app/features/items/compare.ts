import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { ROLE_LABELS, SLOT_LABELS, THREAT_LABELS } from '../../content/labels';
import type { GameItem } from '../../core/game-data/game-data.model';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Session } from '../../learning/session.service';
import { GenContext, contrast } from '../../learning/questions/generators';
import { makeRng, seedFrom } from '../../learning/questions/rng';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { ItemPicker } from '../../shared/ui/item-picker';
import { ClaimBadge, StatLines } from '../../shared/ui/primitives';
import { keyStats } from '../../learning/questions/generators';

@Component({
  selector: 'app-compare',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ItemIcon, ItemPicker, ClaimBadge, StatLines, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="grow">
          <h1>{{ 'Сравнение предметов' | l: 'Compare items' }}</h1>
          <p class="sub">{{ 'Назначение, стоимость, сильные стороны и ограничения рядом.' | l: 'Purpose, cost, strengths and limits side by side.' }}</p>
        </div>
        @if (a() && b()) {
          <button class="btn btn-primary" (click)="drill()"><app-icon name="play" /> {{ 'Тренировать различие' | l: 'Drill the difference' }}</button>
        }
      </div>
      <div class="pickers grid grid-2">
        @for (side of ['a', 'b']; track side) {
          <div class="panel panel-pad">
            @if (side === 'a' ? a() : b(); as it) {
              <div class="row">
                <app-item-icon [item]="it" [size]="40" [alt]="true" />
                <b class="grow">{{ it.name | gn }}</b>
                <button class="btn btn-ghost btn-sm" (click)="side === 'a' ? aKey.set(null) : bKey.set(null)">{{ 'Сменить' | l: 'Change' }}</button>
              </div>
            } @else {
              <app-item-picker [exclude]="[aKey() ?? '', bKey() ?? '']" (picked)="side === 'a' ? aKey.set($event) : bKey.set($event)" [placeholder]="side === 'a' ? ('Первый предмет...' | l: 'First item...') : ('Второй предмет...' | l: 'Second item...')" />
            }
          </div>
        }
      </div>

      @if (a() && b()) {
        <div class="table-wrap panel cmp">
          <table class="table">
            <thead>
              <tr>
                <th></th>
                <th><a [routerLink]="['/items', a()!.key]">{{ a()!.name | gn }}</a></th>
                <th><a [routerLink]="['/items', b()!.key]">{{ b()!.name | gn }}</a></th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="rh">{{ 'Иконка' | l: 'Icon' }}</td>
                <td><app-item-icon [item]="a()" [size]="64" [badges]="true" /></td>
                <td><app-item-icon [item]="b()" [size]="64" [badges]="true" /></td>
              </tr>
              <tr>
                <td class="rh">{{ 'Категория и цена' | l: 'Category & price' }}</td>
                <td>{{ slot(a()!) }} · T{{ a()!.tier }} · {{ a()!.cost }}</td>
                <td>{{ slot(b()!) }} · T{{ b()!.tier }} · {{ b()!.cost }}</td>
              </tr>
              <tr>
                <td class="rh">{{ 'Тип' | l: 'Type' }}</td>
                <td>{{ kind(a()!) }}</td>
                <td>{{ kind(b()!) }}</td>
              </tr>
              <tr>
                <td class="rh">{{ 'Задача' | l: 'Job' }}</td>
                <td>{{ content.item(a()!.key)?.job | tx }}</td>
                <td>{{ content.item(b()!.key)?.job | tx }}</td>
              </tr>
              <tr>
                <td class="rh">{{ 'Назначение' | l: 'Purpose' }}</td>
                <td><div class="row-wrap">@for (r of roles(a()!); track r.id) {<span class="tag" [class.tag-accent]="r.unique">{{ r.label }}</span>}</div></td>
                <td><div class="row-wrap">@for (r of roles(b()!); track r.id) {<span class="tag" [class.tag-accent]="r.unique">{{ r.label }}</span>}</div></td>
              </tr>
              <tr>
                <td class="rh">{{ 'Против угроз' | l: 'Against' }}</td>
                <td><div class="row-wrap">@for (t of threats(a()!); track t) {<span class="tag">{{ t }}</span>}</div></td>
                <td><div class="row-wrap">@for (t of threats(b()!); track t) {<span class="tag">{{ t }}</span>}</div></td>
              </tr>
              <tr>
                <td class="rh">{{ 'Ключевые характеристики' | l: 'Key stats' }}</td>
                <td><app-stats [stats]="stats(a()!)" /></td>
                <td><app-stats [stats]="stats(b()!)" /></td>
              </tr>
              <tr>
                <td class="rh">{{ 'Когда покупать' | l: 'Buy when' }}</td>
                <td><ul>@for (x of content.item(a()!.key)?.buyWhen ?? []; track $index) {<li class="small">{{ x.text | tx }} <app-claim [status]="x.status" /></li>}</ul></td>
                <td><ul>@for (x of content.item(b()!.key)?.buyWhen ?? []; track $index) {<li class="small">{{ x.text | tx }} <app-claim [status]="x.status" /></li>}</ul></td>
              </tr>
              <tr>
                <td class="rh">{{ 'Ограничения' | l: 'Limits' }}</td>
                <td><ul>@for (x of limits(a()!); track $index) {<li class="small">{{ x.text | tx }}</li>}</ul></td>
                <td><ul>@for (x of limits(b()!); track $index) {<li class="small">{{ x.text | tx }}</li>}</ul></td>
              </tr>
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .pickers { margin-bottom: 16px; }
      .cmp td { vertical-align: top; min-width: 220px; }
      .rh { color: var(--text-3); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: 0.05em; min-width: 120px !important; }
      ul { padding-left: 1em; margin: 0; }
    `,
  ],
})
export class ComparePage {
  /** Query params ?a=&b= */
  readonly a_ = input<string | undefined>(undefined, { alias: 'a' });
  readonly b_ = input<string | undefined>(undefined, { alias: 'b' });
  protected readonly content = inject(Content);
  private readonly game = inject(GameData);
  private readonly i18n = inject(I18n);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly aKey = signal<string | null>(null);
  protected readonly bKey = signal<string | null>(null);
  protected readonly a = computed(() => this.game.item(this.aKey()));
  protected readonly b = computed(() => this.game.item(this.bKey()));

  constructor() {
    effect(() => {
      const a = this.a_();
      const b = this.b_();
      if (a) this.aKey.set(a);
      if (b) this.bKey.set(b);
    });
  }

  slot(it: GameItem): string {
    return this.i18n.l(SLOT_LABELS[it.slot].ru, SLOT_LABELS[it.slot].en);
  }

  kind(it: GameItem): string {
    const parts = [it.isActive ? this.i18n.l('активный', 'active') : this.i18n.l('пассивный', 'passive')];
    if (it.imbue) parts.push('imbue');
    if (it.cooldown) parts.push(`${it.cooldown} s`);
    return parts.join(' · ');
  }

  roles(it: GameItem): { id: string; label: string; unique: boolean }[] {
    const mine = this.content.item(it.key)?.roles ?? [];
    const other = it.key === this.aKey() ? this.content.item(this.bKey() ?? '')?.roles ?? [] : this.content.item(this.aKey() ?? '')?.roles ?? [];
    return mine.map((r) => ({ id: r, label: this.i18n.l(ROLE_LABELS[r].ru, ROLE_LABELS[r].en), unique: !other.includes(r) }));
  }

  threats(it: GameItem): string[] {
    return (this.content.item(it.key)?.counters ?? []).map((t) => this.i18n.l(THREAT_LABELS[t].ru, THREAT_LABELS[t].en));
  }

  stats(it: GameItem) {
    return keyStats(it, 6);
  }

  limits(it: GameItem) {
    const c = this.content.item(it.key);
    return [...(c?.skipWhen ?? []), ...(c?.doesNotSolve ?? [])];
  }

  drill(): void {
    const a = this.a();
    const b = this.b();
    if (!a || !b) return;
    const ctx: GenContext = { items: this.game.standardItems(), itemMap: this.game.itemMap(), heroMap: this.game.heroMap(), content: this.content.items(), confusions: new Map(), heroKey: null };
    const rng = makeRng(seedFrom(`${a.key}|${b.key}|${Date.now()}`));
    const qs = [contrast(a, b, ctx, rng, 'icon'), contrast(a, b, ctx, rng, 'effect'), contrast(b, a, ctx, rng, 'icon'), contrast(b, a, ctx, rng, 'effect')];
    const unique = qs.filter((q, i) => qs.findIndex((x) => x.id === q.id) === i);
    this.session.startWith(unique, { mode: 'custom', minutes: 2 });
    void this.router.navigate(['/practice/run']);
  }
}
