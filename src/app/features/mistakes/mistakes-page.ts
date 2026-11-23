import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Content } from '../../content/content.service';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import type { MistakeEntry } from '../../learning/knowledge.model';
import { Knowledge } from '../../learning/knowledge.service';
import { DIM_NAMES } from '../../learning/mastery';
import { Session } from '../../learning/session.service';
import { GenContext, contrast, fromScenario, iconActivation, itemEffect, mechanicTF } from '../../learning/questions/generators';
import type { Question } from '../../learning/questions/question.model';
import { makeRng, seedFrom } from '../../learning/questions/rng';
import { Icon } from '../../shared/ui/icon';
import { ItemBrief } from '../../shared/ui/item-brief';
import { HeroAvatar } from '../../shared/ui/primitives';

@Component({
  selector: 'app-mistakes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, Icon, ItemBrief, HeroAvatar, ...I18N_PIPES],
  template: `
    <div class="page">
      <div class="page-head">
        <div class="grow">
          <h1>{{ 'Тетрадь ошибок' | l: 'Mistake notebook' }}</h1>
          <p class="sub">{{ 'Не список неправильных ответов, а знания, которые нужно закрепить: что ты путаешь, в чём уверенно ошибаешься и какие принципы не срабатывают.' | l: 'Not a list of wrong answers but knowledge to fix: what you mix up, what you are confidently wrong about, which principles fail.' }}</p>
        </div>
        <button class="btn btn-primary" (click)="practiceAll()" [disabled]="!open().length"><app-icon name="play" /> {{ 'Закрепить всё' | l: 'Fix them all' }}</button>
      </div>

      <div class="seg filter">
        <button [class.on]="kind() === 'all'" (click)="kind.set('all')">{{ 'Все' | l: 'All' }} ({{ open().length }})</button>
        <button [class.on]="kind() === 'confusion'" (click)="kind.set('confusion')">{{ 'Путаница' | l: 'Confusions' }} ({{ count('confusion') }})</button>
        <button [class.on]="kind() === 'misconception'" (click)="kind.set('misconception')">{{ 'Уверенные ошибки' | l: 'Confident mistakes' }} ({{ count('misconception') }})</button>
        <button [class.on]="kind() === 'principle'" (click)="kind.set('principle')">{{ 'Принципы' | l: 'Principles' }} ({{ count('principle') }})</button>
        <button [class.on]="kind() === 'resolved'" (click)="kind.set('resolved')">{{ 'Исправлено' | l: 'Fixed' }} ({{ resolved().length }})</button>
      </div>

      <div class="stack-3">
        @for (m of shown(); track m.id) {
          <article class="panel entry" [class.done]="m.resolved">
            <div class="e-head">
              <span class="tag" [class.tag-warn]="m.kind === 'misconception'" [class.tag-accent]="m.kind === 'confusion'">{{ kindLabel(m) }}</span>
              @if (m.dim) {
                <span class="xsmall faint">{{ dimLabel(m) }}</span>
              }
              <span class="spacer"></span>
              <span class="xsmall faint">×{{ m.count }} · {{ i18n.relative(m.lastAt) }}</span>
              @if (m.fixedStreak > 0 && !m.resolved) {
                <span class="xsmall c-good">{{ 'исправляется' | l: 'improving' }} {{ m.fixedStreak }}/2</span>
              }
            </div>
            @switch (m.kind) {
              @case ('confusion') {
                <div class="pair">
                  @for (k of m.items; track k) {
                    <app-item-brief [key]="k" [iconSize]="48" [depthOverride]="'simple'" />
                  }
                </div>
                <p class="small muted">{{ 'Ты принял один предмет за другой. Посмотри, чем отличаются их иконки и задачи.' | l: 'You took one item for the other. Look at how their icons and jobs differ.' }}</p>
              }
              @case ('misconception') {
                <app-item-brief [key]="m.items[0]" [iconSize]="48" />
                <p class="small c-warn">{{ 'Ты ответил уверенно, но неправильно. Такие ошибки возвращаются первыми, пока ты дважды не ответишь верно.' | l: 'You answered confidently but wrong. These come back first until you answer correctly twice.' }}</p>
              }
              @case ('principle') {
                @if (scenario(m.ref); as s) {
                  <div class="row">
                    <app-hero-avatar [key]="s.hero" [size]="28" />
                    <p class="small grow">{{ s.situation | tx }}</p>
                  </div>
                  <div class="principle"><app-icon name="bulb" [size]="16" /> <b>{{ s.principle | tx }}</b></div>
                }
              }
            }
            <div class="row actions">
              @if (m.kind === 'confusion') {
                <a class="btn btn-sm" routerLink="/compare" [queryParams]="{ a: m.items[0], b: m.items[1] }"><app-icon name="compare" [size]="14" /> {{ 'Сравнить' | l: 'Compare' }}</a>
              }
              <span class="spacer"></span>
              @if (!m.resolved) {
                <button class="btn btn-ghost btn-sm" (click)="knowledge.setMistakeResolved(m.id, true)">{{ 'Уже знаю' | l: 'I know it now' }}</button>
                <button class="btn btn-primary btn-sm" (click)="practiceOne(m)"><app-icon name="play" [size]="14" /> {{ 'Закрепить' | l: 'Fix it' }}</button>
              } @else {
                <button class="btn btn-ghost btn-sm" (click)="knowledge.setMistakeResolved(m.id, false)">{{ 'Вернуть в работу' | l: 'Reopen' }}</button>
              }
            </div>
          </article>
        } @empty {
          <div class="panel empty">{{ 'Здесь пусто. Ошибки из тренировок появятся автоматически.' | l: 'Nothing here. Mistakes from practice appear automatically.' }}</div>
        }
      </div>
    </div>
  `,
  styles: [
    `
      .filter { margin-bottom: 14px; }
      .entry { padding: 14px 16px; display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
      .entry.done { opacity: 0.7; }
      .e-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .pair { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .principle { display: flex; gap: 8px; padding: 8px 10px; border-radius: var(--r-md); background: var(--accent-bg); border: 1px solid var(--accent-line); }
      .actions { gap: 8px; flex-wrap: wrap; }
      @media (max-width: 767px) { .pair { grid-template-columns: minmax(0, 1fr); } }
    `,
  ],
})
export class MistakesPage {
  protected readonly knowledge = inject(Knowledge);
  protected readonly i18n = inject(I18n);
  private readonly game = inject(GameData);
  private readonly content = inject(Content);
  private readonly session = inject(Session);
  private readonly router = inject(Router);

  protected readonly kind = signal<'all' | 'confusion' | 'misconception' | 'principle' | 'resolved'>('all');
  protected readonly open = computed(() => this.knowledge.mistakes().filter((m) => !m.resolved).sort((a, b) => b.lastAt - a.lastAt));
  protected readonly resolved = computed(() => this.knowledge.mistakes().filter((m) => m.resolved).sort((a, b) => b.lastAt - a.lastAt));
  protected readonly shown = computed(() => {
    const k = this.kind();
    if (k === 'resolved') return this.resolved();
    return k === 'all' ? this.open() : this.open().filter((m) => m.kind === k);
  });

  count(kind: MistakeEntry['kind']): number {
    return this.open().filter((m) => m.kind === kind).length;
  }

  kindLabel(m: MistakeEntry): string {
    return m.kind === 'confusion' ? this.i18n.l('Путаница', 'Confusion') : m.kind === 'misconception' ? this.i18n.l('Уверенная ошибка', 'Confident mistake') : this.i18n.l('Принцип', 'Principle');
  }

  dimLabel(m: MistakeEntry): string {
    return m.dim ? this.i18n.l(DIM_NAMES[m.dim].ru, DIM_NAMES[m.dim].en) : '';
  }

  scenario(id: string | null) {
    return id ? this.content.scenarioById().get(id) : undefined;
  }

  private ctx(): GenContext {
    return { items: this.game.standardItems(), itemMap: this.game.itemMap(), heroMap: this.game.heroMap(), content: this.content.items(), confusions: new Map(), heroKey: null };
  }

  /** Questions that train the same principle without repeating the identical question. */
  private questionsFor(m: MistakeEntry): Question[] {
    const ctx = this.ctx();
    const rng = makeRng(seedFrom(m.id + Date.now()));
    const items = m.items.map((k) => this.game.item(k)).filter((x) => !!x);
    if (m.kind === 'confusion' && items.length === 2) return [contrast(items[0]!, items[1]!, ctx, rng, 'icon'), contrast(items[0]!, items[1]!, ctx, rng, 'effect')];
    if (m.kind === 'misconception' && items[0]) {
      const it = items[0];
      return [itemEffect(it, ctx, rng, 2) ?? mechanicTF(it, ctx, rng, 2), m.dim === 'mechanics' ? iconActivation(it, rng, 2) : mechanicTF(it, ctx, rng, 3)];
    }
    if (m.kind === 'principle') {
      const s = this.scenario(m.ref);
      if (!s) return [];
      const sibling = this.content.scenarios().find((x) => x.id !== s.id && x.kind === s.kind && x.problemTags.some((t) => s.problemTags.includes(t)));
      return [fromScenario(sibling ?? s, ctx, rng, 'reduced')];
    }
    return [];
  }

  practiceOne(m: MistakeEntry): void {
    const qs = this.questionsFor(m);
    if (!qs.length) return;
    this.session.startWith(qs, { mode: 'mistakes', minutes: 3 });
    void this.router.navigate(['/practice/run']);
  }

  practiceAll(): void {
    const n = this.session.start({ mode: 'mistakes', minutes: 10 });
    if (n) void this.router.navigate(['/practice/run']);
  }
}
