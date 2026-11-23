import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { Dimension } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { ROLE_LABELS, SLOT_LABELS, THREAT_LABELS } from '../../content/labels';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { Builds } from '../../domain/builds/builds.service';
import { componentDiff, type ComponentDiff } from '../../domain/items/component-diff';
import { formatStat } from '../../domain/items/key-stats';
import type { GameItem, StatLine } from '../../core/game-data/game-data.model';
import { Knowledge } from '../../learning/knowledge.service';
import { DIM_NAMES, dimStrength } from '../../learning/mastery';
import { Session } from '../../learning/session.service';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { ItemType } from '../../shared/ui/item-type';
import { KeyStats } from '../../shared/ui/key-stats';
import { Term } from '../../shared/ui/term';
import { AbilityIcon, ClaimBadge, HeroAvatar, LevelPips, RichText, StatLines } from '../../shared/ui/primitives';
import { TermText } from '../../shared/ui/term-text';

@Component({
  selector: 'app-item-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TermText, RouterLink, Icon, ItemIcon, ItemType, KeyStats, Term, AbilityIcon, HeroAvatar, ClaimBadge, LevelPips, RichText, StatLines, ...I18N_PIPES],
  templateUrl: './item-detail.html',
  styleUrl: './item-detail.scss',
})
export class ItemDetailPage {
  readonly key = input.required<string>();
  protected readonly game = inject(GameData);
  protected readonly i18n = inject(I18n);
  private readonly content = inject(Content);
  private readonly knowledge = inject(Knowledge);
  private readonly profiles = inject(Profiles);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly builds = inject(Builds);

  protected readonly depth = signal<'simple' | 'detailed' | 'technical'>(this.profiles.settings().explain);
  protected readonly item = computed(() => this.game.item(this.key()));
  protected readonly c = computed(() => this.content.item(this.key()));
  protected readonly stale = computed(() => this.content.staleItems().has(this.key()));
  protected readonly k = computed(() => this.knowledge.get(this.key()));
  protected readonly level = computed(() => this.knowledge.levels().get(this.key()) ?? 0);
  protected readonly dims = computed(() => {
    this.knowledge.tick();
    const now = Date.now();
    const k = this.k();
    const list: Dimension[] = ['icon', 'effect', 'mechanics', 'situation', 'counter', 'synergy', 'active', 'build'];
    return list
      .filter((d) => d !== 'active' || this.item()?.isActive)
      .map((d) => ({ d, name: this.i18n.l(DIM_NAMES[d].ru, DIM_NAMES[d].en), v: dimStrength(k?.dims[d], now), n: k?.dims[d]?.attempts ?? 0 }));
  });
  protected readonly slotLabel = computed(() => {
    const s = this.item()?.slot;
    return s ? this.i18n.l(SLOT_LABELS[s].ru, SLOT_LABELS[s].en) : '';
  });
  /** Official description, used to say what the imbued ability gets. */
  protected readonly officialText = computed(() =>
    (this.item()?.sections ?? [])
      .map((s) => (s.text ? this.i18n.game(s.text) : ''))
      .filter(Boolean)
      .join('\n'),
  );
  /** Abilities this item is imbued on in saved and bundled builds (the build author's choice). */
  protected readonly imbueTargets = computed(() => {
    const key = this.key();
    const byAbility = new Map<string, string[]>();
    for (const b of this.builds.all()) {
      for (const c of b.categories) {
        for (const ref of c.items) {
          if (ref.key !== key || !ref.imbue) continue;
          const names = byAbility.get(ref.imbue) ?? [];
          if (!names.includes(b.name)) names.push(b.name);
          byAbility.set(ref.imbue, names);
        }
      }
    }
    return [...byAbility.entries()].map(([ability, builds]) => ({ ability, builds })).filter((t) => this.game.ability(t.ability));
  });
  protected readonly roles = computed(() => (this.c()?.roles ?? []).map((r) => this.i18n.l(ROLE_LABELS[r].ru, ROLE_LABELS[r].en)));
  protected readonly counters = computed(() => (this.c()?.counters ?? []).map((t) => this.i18n.l(THREAT_LABELS[t].ru, THREAT_LABELS[t].en)));
  protected readonly scenarios = computed(() => this.content.scenariosByItem().get(this.key()) ?? []);
  /** Hero popularity from the client stats (statistics, not advice). */
  protected readonly popularOn = computed(() => {
    const out: { hero: string; phase: string; pick: number; wr: number }[] = [];
    for (const h of this.game.selectableHeroes()) {
      for (const [phase, list] of [
        ['early', h.popular.early],
        ['mid', h.popular.mid],
        ['late', h.popular.late],
      ] as const) {
        const p = list.find((x) => x.itemKey === this.key());
        if (p && p.pickPct >= 15) out.push({ hero: h.key, phase, pick: p.pickPct, wr: p.winratePct });
      }
    }
    return out.sort((a, b) => b.pick - a.pick).slice(0, 8);
  });
  protected readonly synergyAbilities = computed(() => (this.c()?.synergies ?? []).filter((s) => s.kind === 'ability'));
  protected readonly synergyItems = computed(() => (this.c()?.synergies ?? []).filter((s) => s.kind === 'item'));
  protected readonly synergyHeroes = computed(() => (this.c()?.synergies ?? []).filter((s) => s.kind === 'hero'));

  /** What the upgrade lists compared with its component (client data). */
  protected diff(item: GameItem, component: GameItem): ComponentDiff {
    return componentDiff(item, component);
  }

  protected label(s: StatLine): string {
    return this.i18n.game(s.label);
  }

  protected fmt(s: StatLine): string {
    return formatStat(s);
  }

  practice(): void {
    const n = this.session.start({ mode: 'mixed', minutes: 5, filters: { itemKeys: [this.key()] } });
    if (n) void this.router.navigate(['/practice/run']);
  }

  phaseName(p: string): string {
    return p === 'early' ? this.i18n.l('рано', 'early') : p === 'mid' ? this.i18n.l('мид', 'mid') : this.i18n.l('поздно', 'late');
  }

  sectionName(kind: string): string {
    return kind === 'innate' ? this.i18n.l('Постоянные бонусы', 'Innate') : kind === 'passive' ? this.i18n.l('Пассивный эффект', 'Passive') : kind === 'active' ? this.i18n.l('Активный эффект', 'Active') : this.i18n.l('Эффект', 'Effect');
  }
}
