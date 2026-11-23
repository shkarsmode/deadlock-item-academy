import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import type { Slot } from '../../core/game-data/game-data.model';
import { normalizeAnswer } from '../../learning/questions/fuzzy';
import { ItemIcon } from './item-icon';

/** Searchable item picker (keyboard: up/down/enter). */
@Component({
  selector: 'app-item-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemIcon, ...I18N_PIPES],
  template: `
    <div class="picker">
      <input
        class="input"
        type="search"
        [value]="q()"
        (input)="q.set($any($event.target).value); active.set(0)"
        (keydown)="onKey($event)"
        [placeholder]="placeholder() || ('Найти предмет...' | l: 'Find an item...')"
        [attr.aria-label]="placeholder() || ('Найти предмет' | l: 'Find an item')"
        autocomplete="off"
      />
      @if (q().trim() || showAll()) {
        <ul class="results" role="listbox">
          @for (it of results(); track it.key; let i = $index) {
            <li role="option" [attr.aria-selected]="i === active()">
              <button type="button" [class.on]="i === active()" (mousedown)="$event.preventDefault()" (click)="pick(it.key)">
                <app-item-icon [item]="it" [size]="28" [alt]="true" />
                <span class="grow">{{ it.name | gn }}</span>
                <span class="faint xsmall num">{{ it.cost }}</span>
              </button>
            </li>
          } @empty {
            <li class="none small muted">{{ 'Ничего не найдено' | l: 'Nothing found' }}</li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      .picker { position: relative; }
      .results { list-style: none; margin: 4px 0 0; padding: 4px; max-height: 280px; overflow-y: auto; border: 1px solid var(--border-2); border-radius: var(--r-md); background: var(--bg-1); position: absolute; left: 0; right: 0; z-index: 30; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4); }
      .results button { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 8px; border: 0; border-radius: var(--r-sm); background: transparent; color: var(--text); text-align: left; }
      .results button:hover, .results button.on { background: var(--bg-3); }
      .none { padding: 8px; }
    `,
  ],
})
export class ItemPicker {
  private readonly game = inject(GameData);
  private readonly i18n = inject(I18n);
  readonly exclude = input<string[]>([]);
  readonly slot = input<Slot | null>(null);
  readonly placeholder = input<string>('');
  readonly showAll = input(false);
  readonly picked = output<string>();

  protected readonly q = signal('');
  protected readonly active = signal(0);
  protected readonly results = computed(() => {
    const query = normalizeAnswer(this.q());
    const ex = new Set(this.exclude());
    return this.game
      .standardItems()
      .filter((i) => !ex.has(i.key) && (!this.slot() || i.slot === this.slot()))
      .filter((i) => !query || normalizeAnswer(`${i.name.en} ${i.name.ru}`).includes(query))
      .sort((a, b) => {
        const an = normalizeAnswer(this.i18n.name(a.name)).startsWith(query) ? 0 : 1;
        const bn = normalizeAnswer(this.i18n.name(b.name)).startsWith(query) ? 0 : 1;
        return an - bn || a.tier - b.tier || a.name.en.localeCompare(b.name.en);
      })
      .slice(0, 30);
  });

  onKey(e: KeyboardEvent): void {
    const n = this.results().length;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.active.set(Math.min(n - 1, this.active() + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.active.set(Math.max(0, this.active() - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const it = this.results()[this.active()];
      if (it) this.pick(it.key);
    } else if (e.key === 'Escape') {
      this.q.set('');
    }
  }

  pick(key: string): void {
    this.picked.emit(key);
    this.q.set('');
    this.active.set(0);
  }
}
