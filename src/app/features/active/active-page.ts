import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import { Router, RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { IMBUE_LABELS } from '../../content/labels';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { MyBuild } from '../../learning/my-build.service';
import { Session } from '../../learning/session.service';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { AbilityIcon, ClaimBadge, HeroAvatar, RichText } from '../../shared/ui/primitives';
import { TermText } from '../../shared/ui/term-text';

@Component({
  selector: 'app-active-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TermText, SyncSelectValue, RouterLink, Icon, ItemIcon, AbilityIcon, ClaimBadge, HeroAvatar, RichText, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="grow">
          <h1>{{ 'Активки и Imbue' | l: 'Actives & Imbue' }}</h1>
          <p class="sub">{{ 'Когда нажимать активные предметы, против чего их беречь и на какую способность назначать imbue.' | l: 'When to press actives, what to save them for and which ability to imbue.' }}</p>
        </div>
        <select class="select sel" [syncValue]="hero()" (change)="hero.set($any($event.target).value)" [attr.aria-label]="'Герой' | l: 'Hero'">
          @for (h of game.selectableHeroes(); track h.key) {
            <option [value]="h.key">{{ h.name | gn }}</option>
          }
        </select>
        <button class="btn btn-primary" (click)="train()"><app-icon name="play" /> {{ 'Тренажёр' | l: 'Trainer' }} ({{ drillCount() }})</button>
      </div>

      <section class="panel rules">
        <div class="panel-head"><app-icon name="info" /><h3>{{ 'Как работает imbue' | l: 'How imbue works' }}</h3><span class="spacer"></span><app-claim status="data" /></div>
        <div class="panel-body grid grid-3">
          @for (k of imbueKinds; track k.id) {
            <div class="kind">
              <b>{{ k.label }}</b>
              <div class="row-wrap mt">
                @for (it of itemsOfKind(k.id); track it.key) {
                  <a [routerLink]="['/items', it.key]"><app-item-icon [item]="it" [size]="36" [title]="true" /></a>
                }
              </div>
            </div>
          }
        </div>
        <p class="panel-body small muted note">
          {{ 'При покупке imbue-предмета игра просит выбрать способность. Сборка может хранить подсказку «Imbue Target», и при быстрой покупке она выберется сама. Часть способностей помечена «Cannot be imbued», полный список клиент не публикует. Superior Cooldown и Superior Duration, улучшенные версии imbue-предметов, действуют уже на все способности.' | l: 'When you buy an imbue item the game asks you to pick an ability. A build can store an "Imbue Target" suggestion that quick-buy picks automatically. Some abilities are marked "Cannot be imbued"; the client does not publish the list. Superior Cooldown and Superior Duration (the upgrades) affect all abilities.' }}
        </p>
      </section>

      @if (heroData(); as h) {
        <section class="panel">
          <div class="panel-head"><app-hero-avatar [hero]="h" [size]="28" /><h3>{{ 'Способности' | l: 'Abilities' }}: {{ h.name | gn }}</h3></div>
          <div class="abilities">
            @for (a of h.abilities; track a.key) {
              <div class="ab">
                <div class="ab-head">
                  <app-ability-icon [key]="a.key" [size]="44" [showSlot]="true" />
                  <div class="grow">
                    <b>{{ a.name | gn }}</b>
                    <div class="xsmall faint num">
                      @if (a.cooldown) { {{ 'перезарядка' | l: 'cooldown' }} {{ a.cooldown }} s }
                      @if (a.charges) { · {{ 'заряды' | l: 'charges' }} {{ a.charges }} }
                      @if (a.duration) { · {{ 'длительность' | l: 'duration' }} {{ a.duration }} s }
                      @if (a.isUltimate) { · <span class="c-warn">ult</span> }
                    </div>
                  </div>
                </div>
                <p class="small muted desc"><app-rt [text]="a.description | gt" /></p>
                @if (abilityNote(a.key); as n) {
                  @if (n.imbue) {
                    <div class="imb">
                      <div class="upper faint">{{ 'Imbue сюда' | l: 'Imbue here' }}</div>
                      <div class="row-wrap mt">
                        @for (k of n.imbue.goodItems; track k) {
                          <a [routerLink]="['/items', k]"><app-item-icon [key]="k" [size]="30" [title]="true" /></a>
                        }
                      </div>
                      <p class="small"><app-tt [text]="n.imbue.note | tx" /></p>
                    </div>
                  }
                }
                @if (myImbues().get(a.key); as list) {
                  <div class="mine xsmall">
                    <span class="faint">{{ 'В твоём билде:' | l: 'In your build:' }}</span>
                    @for (k of list; track k) {
                      <app-item-icon [key]="k" [size]="22" [title]="true" />
                    }
                  </div>
                }
              </div>
            }
          </div>
        </section>
      }

      <section class="panel">
        <div class="panel-head"><app-icon name="zap" class="c-accent" /><h3>{{ 'Активные предметы' | l: 'Active items' }}</h3><span class="spacer"></span>
          <div class="seg">
            <button [class.on]="scope() === 'hero'" (click)="scope.set('hero')">{{ 'Для героя' | l: 'For the hero' }}</button>
            <button [class.on]="scope() === 'all'" (click)="scope.set('all')">{{ 'Все' | l: 'All' }}</button>
          </div>
        </div>
        <ul class="list actives">
          @for (it of actives(); track it.key) {
            <li>
              <div class="act-head">
                <a [routerLink]="['/items', it.key]"><app-item-icon [item]="it" [size]="40" [alt]="true" /></a>
                <div class="grow">
                  <b>{{ it.name | gn }}</b> <span class="xsmall faint num">{{ it.cost }} · {{ it.cooldown ? it.cooldown + ' s' : '' }}</span>
                  <div class="small muted">{{ content.item(it.key)?.job | tx }}</div>
                </div>
              </div>
              @if (content.item(it.key)?.activeUse; as au) {
                <div class="grid grid-3 au small">
                  <div><span class="upper faint">{{ 'Нажимай' | l: 'Press' }}</span><p><app-tt [text]="au.when | tx" /></p></div>
                  <div><span class="upper faint">{{ 'Береги для' | l: 'Save for' }}</span><p><app-tt [text]="au.saveFor | tx" /></p></div>
                  <div><span class="upper faint">{{ 'Рано, если' | l: 'Too early' }}</span><p><app-tt [text]="au.tooEarly | tx" /></p></div>
                </div>
              }
            </li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [
    `
      .sel { width: auto; min-width: 160px; }
      .rules { margin-bottom: 16px; }
      .kind b { font-size: var(--fs-sm); }
      .mt { margin-top: 6px; }
      .note { padding-top: 0; }
      .abilities { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .ab { padding: 14px 16px; border-top: 1px solid var(--border); display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; align-content: start; }
      .ab:nth-child(odd) { border-right: 1px solid var(--border); }
      .ab-head { display: flex; gap: 10px; align-items: center; }
      .desc { line-height: 1.5; }
      .imb { padding: 8px 10px; border-radius: var(--r-md); background: var(--spirit-bg); border: 1px solid rgba(157, 126, 227, 0.3); }
      .mine { display: flex; align-items: center; gap: 4px; }
      .actives > li { padding: 12px 16px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
      .act-head { display: flex; gap: 12px; align-items: center; }
      .au p { margin-top: 2px; }
      section + section { margin-top: 16px; }
      @media (max-width: 767px) { .abilities { grid-template-columns: minmax(0, 1fr); } .ab:nth-child(odd) { border-right: 0; } }
    `,
  ],
})
export class ActivePage {
  protected readonly game = inject(GameData);
  protected readonly content = inject(Content);
  private readonly i18n = inject(I18n);
  private readonly profiles = inject(Profiles);
  private readonly myBuild = inject(MyBuild);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly hero = signal(this.profiles.settings().heroFocus);
  protected readonly scope = signal<'hero' | 'all'>('hero');
  protected readonly heroData = computed(() => this.game.hero(this.hero()));
  protected readonly imbueKinds = (['imbue_modifier_value', 'imbue_active', 'imbue_active_non_ult'] as const).map((id) => ({ id, label: this.i18n.l(IMBUE_LABELS[id].ru, IMBUE_LABELS[id].en) }));

  protected readonly drillCount = computed(() => this.content.scenarios().filter((s) => (s.kind === 'active-timing' || s.kind === 'imbue') && (s.hero === this.hero() || s.tags.includes('general'))).length);

  protected readonly myImbues = computed(() => {
    const m = new Map<string, string[]>();
    const b = this.myBuild.buildFor(this.hero());
    for (const c of b?.categories ?? []) for (const i of c.items) if (i.imbue) m.set(i.imbue, [...(m.get(i.imbue) ?? []), i.key]);
    return m;
  });

  protected readonly actives = computed(() => {
    const all = this.game.standardItems().filter((i) => i.isActive);
    if (this.scope() === 'all') return all;
    const h = this.heroData();
    const relevant = new Set<string>(this.myBuild.buildFor(this.hero())?.categories.flatMap((c) => c.items.map((i) => i.key)) ?? []);
    if (h) for (const p of [...h.popular.early, ...h.popular.mid, ...h.popular.late]) relevant.add(p.itemKey);
    for (const m of this.content.course(this.hero())?.modules ?? []) for (const k of m.items) relevant.add(k);
    const list = all.filter((i) => relevant.has(i.key));
    return list.length ? list : all;
  });

  itemsOfKind(kind: string) {
    return this.game.standardItems().filter((i) => i.imbue === kind);
  }

  abilityNote(key: string) {
    return this.content.course(this.hero())?.abilityNotes.find((n) => n.ability === key);
  }

  train(): void {
    const n = this.session.start({ mode: 'active', minutes: 10, heroKey: this.hero() });
    if (n) void this.router.navigate(['/practice/run']);
  }
}
