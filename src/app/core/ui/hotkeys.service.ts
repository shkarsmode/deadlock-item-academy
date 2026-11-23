import { DestroyRef, Injectable, inject, signal } from '@angular/core';

export interface HotkeyBinding {
  /** Key names as in KeyboardEvent.key, lowercased ('1', 'enter', 'escape', '/', '?', 'arrowright'). */
  keys: string[];
  handler: (e: KeyboardEvent) => void;
  /** Fire even when focus is inside a text field. */
  inInputs?: boolean;
  /** Handle Enter/Space even when a button has focus (the handler then replaces the native click). */
  onButtons?: boolean;
  description?: { ru: string; en: string };
}

/**
 * Scoped keyboard shortcuts. The most recently registered scope wins, so a practice screen
 * can own 1-5 / Enter while it is open, and global navigation keys work elsewhere.
 */
@Injectable({ providedIn: 'root' })
export class Hotkeys {
  private readonly scopes: { id: number; bindings: HotkeyBinding[] }[] = [];
  private seq = 0;
  readonly helpOpen = signal(false);

  constructor() {
    if (typeof document !== 'undefined') document.addEventListener('keydown', (e) => this.onKey(e));
  }

  /** Registers bindings for the lifetime of the calling component. */
  register(bindings: HotkeyBinding[], destroyRef?: DestroyRef): () => void {
    const id = ++this.seq;
    this.scopes.push({ id, bindings });
    const off = () => {
      const i = this.scopes.findIndex((s) => s.id === id);
      if (i >= 0) this.scopes.splice(i, 1);
    };
    (destroyRef ?? inject(DestroyRef)).onDestroy(off);
    return off;
  }

  /** All active bindings with descriptions (for the help overlay). */
  active(): HotkeyBinding[] {
    return this.scopes.flatMap((s) => s.bindings).filter((b) => b.description);
  }

  private onKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.isComposing) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
    const key = e.key.toLowerCase();
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const b = this.scopes[i].bindings.find((x) => x.keys.includes(key) && (!typing || x.inInputs));
      if (b) {
        // Let buttons handle Enter/Space natively when focused.
        if ((key === 'enter' || key === ' ') && target?.tagName === 'BUTTON' && !b.inInputs && !b.onButtons) return;
        e.preventDefault();
        b.handler(e);
        return;
      }
    }
  }
}
