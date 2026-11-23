import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { SyncSelectValue } from '../../shared/ui/sync-select';
import { Router, RouterLink } from '@angular/router';
import type { BuildItemAnalysis, ItemRole } from '../../content/content.model';
import { Content } from '../../content/content.service';
import { ROLE_LABELS } from '../../content/labels';
import type { Slot } from '../../core/game-data/game-data.model';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Profiles } from '../../core/profile/profile.service';
import { Toasts } from '../../core/ui/toast.service';
import { analyzeBuild } from '../../domain/builds/analyzer';
import type { SavedBuild, SavedBuildCategory } from '../../domain/builds/build.model';
import { Builds } from '../../domain/builds/builds.service';
import { toPortable } from '../../domain/builds/import/importers';
import { MyBuild } from '../../learning/my-build.service';
import { Session } from '../../learning/session.service';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';
import { Term } from '../../shared/ui/term';
import { ItemPicker } from '../../shared/ui/item-picker';
import { AbilityIcon, ClaimBadge, HeroAvatar } from '../../shared/ui/primitives';
import { BuildTimeline } from './build-timeline';
import { ScreenshotAssist } from './screenshot-assist';

const ANALYSIS_FIELDS: { key: keyof BuildItemAnalysis; ru: string; en: string }[] = [
  { key: 'why', ru: '1. Зачем он в билде', en: '1. Why it is in the build' },
  { key: 'aspect', ru: '2. Что усиливает', en: '2. What it amplifies' },
  { key: 'abilityLink', ru: '3. Связь со способностями', en: '3. Link with abilities' },
  { key: 'timing', ru: '4. Когда покупать', en: '4. When to buy' },
  { key: 'lessUseful', ru: '6. Когда он хуже', en: '6. When it is weaker' },
  { key: 'ifSkipped', ru: '7. Если не купить', en: '7. If you skip it' },
  { key: 'replaceOrSell', ru: '9. Когда заменить или продать', en: '9. When to replace or sell' },
];

@Component({
  selector: 'app-build-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SyncSelectValue, RouterLink, Icon, ItemIcon, ItemPicker, AbilityIcon, ClaimBadge, HeroAvatar, BuildTimeline, ScreenshotAssist, Term, ...I18N_PIPES],
  templateUrl: './build-detail.html',
  styleUrl: './build-detail.scss',
})
export class BuildDetailPage {
  readonly id = input.required<string>();
  readonly shot = input<string | undefined>(undefined);
  protected readonly game = inject(GameData);
  protected readonly i18n = inject(I18n);
  protected readonly content = inject(Content);
  private readonly builds = inject(Builds);
  private readonly profiles = inject(Profiles);
  private readonly myBuild = inject(MyBuild);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);

  protected readonly fields = ANALYSIS_FIELDS;
  protected readonly expanded = signal<string | null>(null);
  protected readonly editing = signal(false);
  protected readonly draft = signal<SavedBuildCategory[] | null>(null);
  protected readonly draftName = signal('');
  protected readonly swapFrom = signal<string | null>(null);
  protected readonly swapTo = signal<string | null>(null);
  protected readonly compareId = signal<string>('');
  protected readonly addTarget = signal<number | null>(null);

  protected readonly build = computed(() => this.builds.get(this.id()));
  protected readonly isPreset = computed(() => this.build()?.source.type === 'preset');
  protected readonly analysis = computed(() => {
    const b = this.build();
    return b?.source.type === 'preset' && b.source.ref ? this.content.build(b.source.ref) ?? null : null;
  });
  protected readonly categories = computed<SavedBuildCategory[]>(() => this.draft() ?? this.build()?.categories ?? []);
  protected readonly hero = computed(() => this.game.hero(this.build()?.heroKey));
  protected readonly isMine = computed(() => this.myBuild.build()?.id === this.id());
  protected readonly course = computed(() => this.content.course(this.build()?.heroKey ?? ''));

  protected readonly report = computed(() => {
    const meta = this.game.meta();
    if (!meta) return null;
    return analyzeBuild(this.categories(), this.game.itemMap(), this.content.items(), meta.investment, this.heroTexts());
  });

  protected readonly heroTexts = computed(() => (this.hero()?.abilities ?? []).flatMap((a) => [a.description.en, ...a.upgrades.map((u) => u?.en ?? '')]));

  protected readonly swapped = computed(() => {
    const from = this.swapFrom();
    const to = this.swapTo();
    const meta = this.game.meta();
    if (!from || !to || !meta) return null;
    const cats = this.categories().map((c) => ({ ...c, items: c.items.map((i) => (i.key === from ? { ...i, key: to, imbue: null } : i)) }));
    const after = analyzeBuild(cats, this.game.itemMap(), this.content.items(), meta.investment, this.heroTexts());
    const before = this.report();
    if (!before) return null;
    const rolesBefore = new Set(Object.keys(before.roleCounts));
    const rolesAfter = new Set(Object.keys(after.roleCounts));
    return {
      cost: after.totalCost - before.totalCost,
      gained: [...rolesAfter].filter((r) => !rolesBefore.has(r)).map((r) => this.roleLabel(r as ItemRole)),
      lost: [...rolesBefore].filter((r) => !rolesAfter.has(r)).map((r) => this.roleLabel(r as ItemRole)),
      investment: after.investment.map((a, i) => ({ slot: a.slot, before: before.investment[i].bonus, after: a.bonus })),
    };
  });

  protected readonly compareBuild = computed(() => (this.compareId() ? this.builds.get(this.compareId()) : undefined));
  protected readonly compareReport = computed(() => {
    const b = this.compareBuild();
    const meta = this.game.meta();
    return b && meta ? analyzeBuild(b.categories, this.game.itemMap(), this.content.items(), meta.investment) : null;
  });
  protected readonly compareDiff = computed(() => {
    const a = new Set(this.report()?.finalItems ?? []);
    const b = new Set(this.compareReport()?.finalItems ?? []);
    return { onlyA: [...a].filter((k) => !b.has(k)), onlyB: [...b].filter((k) => !a.has(k)) };
  });
  protected readonly otherBuilds = computed(() => this.builds.all().filter((b) => b.id !== this.id() && b.heroKey === this.build()?.heroKey));
  protected readonly roleChips = computed(() =>
    Object.entries(this.report()?.roleCounts ?? {})
      .sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))
      .map(([r, n]) => ({ label: this.roleLabel(r as ItemRole), n })),
  );

  constructor() {
    effect(() => {
      if (this.shot() && this.build() && !this.isPreset()) this.startEdit();
    });
  }

  roleLabel(r: ItemRole): string {
    const l = ROLE_LABELS[r];
    return l ? this.i18n.l(l.ru, l.en) : r;
  }

  heroNote(key: string): string | null {
    const n = this.course()?.itemNotes?.find((x) => x.item === key);
    return n ? this.i18n.text(n.note) : null;
  }

  /** Item analysis of this build, or (for shared items) the analysis from another build of the same hero. */
  itemAnalysis(key: string): BuildItemAnalysis | null {
    const own = this.analysis()?.items[key];
    if (own) return own;
    const hero = this.build()?.heroKey;
    if (!hero) return null;
    for (const a of this.content.builds()) if (a.build.hero === hero && a.items[key]) return a.items[key];
    return null;
  }

  text(a: BuildItemAnalysis, k: keyof BuildItemAnalysis): string {
    const v = a[k] as { ru: string; en?: string } | undefined;
    return v && typeof v === 'object' && 'ru' in v ? this.i18n.text(v) : '';
  }

  abilityOptions(itemKey: string): { key: string; name: string; ult: boolean }[] {
    const it = this.game.item(itemKey);
    const h = this.hero();
    if (!it?.imbue || !h) return [];
    return h.abilities.filter((a) => !(it.imbue === 'imbue_active_non_ult' && a.isUltimate)).map((a) => ({ key: a.key, name: this.i18n.name(a.name), ult: a.isUltimate }));
  }

  slotSpentPct(slot: Slot, spent: number): number {
    const steps = this.game.meta()?.investment[slot] ?? [];
    const max = steps[steps.length - 1]?.threshold ?? 1;
    return Math.min(100, (spent / max) * 100);
  }

  thresholds(slot: Slot): { pct: number; t: number }[] {
    const steps = this.game.meta()?.investment[slot] ?? [];
    const max = steps[steps.length - 1]?.threshold ?? 1;
    return steps.filter((s) => s.threshold <= 16000).map((s) => ({ pct: (s.threshold / max) * 100, t: s.threshold }));
  }

  /* ---------------------------------------------------- editing */
  startEdit(): void {
    const b = this.build();
    if (!b || this.isPreset()) return;
    this.draft.set(structuredClone(b.categories));
    this.draftName.set(b.name);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.draft.set(null);
    this.editing.set(false);
  }

  async saveEdit(): Promise<void> {
    const b = this.build();
    const d = this.draft();
    if (!b || !d) return;
    await this.builds.save({ ...b, name: this.draftName().trim() || b.name, categories: d.filter((c) => c.name.trim()) });
    this.draft.set(null);
    this.editing.set(false);
    this.toasts.show(this.i18n.l('Билд сохранён', 'Build saved'), 'good');
  }

  private mutate(fn: (cats: SavedBuildCategory[]) => void): void {
    const d = structuredClone(this.draft() ?? []);
    fn(d);
    this.draft.set(d);
  }

  addItem(ci: number, key: string): void {
    this.mutate((d) => d[ci]?.items.push({ key, imbue: null, note: null }));
  }

  removeItem(ci: number, ii: number): void {
    this.mutate((d) => d[ci]?.items.splice(ii, 1));
  }

  moveItem(ci: number, ii: number, dir: -1 | 1): void {
    this.mutate((d) => {
      const list = d[ci]?.items;
      if (!list) return;
      const j = ii + dir;
      if (j < 0 || j >= list.length) return;
      [list[ii], list[j]] = [list[j], list[ii]];
    });
  }

  setImbue(ci: number, ii: number, ability: string): void {
    this.mutate((d) => {
      const it = d[ci]?.items[ii];
      if (it) it.imbue = ability || null;
    });
  }

  setNote(ci: number, ii: number, note: string): void {
    this.mutate((d) => {
      const it = d[ci]?.items[ii];
      if (it) it.note = note || null;
    });
  }

  addCategory(): void {
    this.mutate((d) => d.push({ name: this.i18n.l('Новая категория', 'New category'), items: [] }));
  }

  renameCategory(ci: number, name: string): void {
    this.mutate((d) => {
      if (d[ci]) d[ci].name = name;
    });
  }

  toggleOptional(ci: number): void {
    this.mutate((d) => {
      if (d[ci]) d[ci].optional = !d[ci].optional;
    });
  }

  removeCategory(ci: number): void {
    this.mutate((d) => d.splice(ci, 1));
  }

  /* ---------------------------------------------------- actions */
  async duplicate(): Promise<void> {
    const copy = await this.builds.duplicate(this.id());
    if (copy) void this.router.navigate(['/builds', copy.id]);
  }

  async makeMine(): Promise<void> {
    const b = this.build();
    if (!b) return;
    await this.profiles.update({ myBuildId: b.id });
    if (b.heroKey !== this.profiles.settings().heroFocus) await this.profiles.updateSettings({ heroFocus: b.heroKey });
    this.toasts.show(this.i18n.l('Теперь это твой билд', 'This is now your build'), 'good');
  }

  practice(): void {
    const b = this.build();
    if (!b) return;
    const keys = this.builds.itemKeys(b);
    const n = this.session.start({ mode: this.isMine() ? 'build' : 'mixed', minutes: 10, heroKey: b.heroKey, filters: { itemKeys: keys } });
    if (n) void this.router.navigate(['/practice/run']);
  }

  exportJson(): void {
    const b = this.build();
    if (!b) return;
    const blob = new Blob([JSON.stringify(toPortable(b.heroKey, b.name, b.categories, b.description), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${b.name.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40) || 'build'}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  onShot(key: string): void {
    const ci = this.addTarget() ?? 0;
    if (!this.editing()) this.startEdit();
    this.addItem(Math.min(ci, (this.draft()?.length ?? 1) - 1), key);
  }

  slotOf(key: string): Slot | undefined {
    return this.game.item(key)?.slot;
  }
}
