import { Injectable, signal } from '@angular/core';

export interface PeekState {
  key: string;
  anchor: HTMLElement;
  rect: DOMRect;
  touch: boolean;
}

/**
 * Hover card for item icons (one shared card for the whole app). Mouse: show after a short delay,
 * hide on leave. Touch: long press shows it, the next tap anywhere hides it.
 */
@Injectable({ providedIn: 'root' })
export class ItemPeek {
  readonly state = signal<PeekState | null>(null);
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;

  enter(key: string, anchor: HTMLElement): void {
    this.clearTimers();
    // Moving from one icon to the next switches almost at once.
    const delay = this.state() ? 40 : 280;
    this.showTimer = setTimeout(() => this.state.set({ key, anchor, rect: anchor.getBoundingClientRect(), touch: false }), delay);
  }

  leave(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    this.showTimer = null;
    if (this.state()?.touch) return;
    this.hideTimer = setTimeout(() => this.state.set(null), 90);
  }

  touch(key: string, anchor: HTMLElement): void {
    this.clearTimers();
    this.state.set({ key, anchor, rect: anchor.getBoundingClientRect(), touch: true });
  }

  /** Called when an icon is destroyed: a removed element never fires pointerleave. */
  release(anchor: HTMLElement): void {
    if (this.state()?.anchor === anchor) this.hide();
  }

  hide(): void {
    this.clearTimers();
    if (this.state()) this.state.set(null);
  }

  private clearTimers(): void {
    if (this.showTimer) clearTimeout(this.showTimer);
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.showTimer = this.hideTimer = null;
  }
}
