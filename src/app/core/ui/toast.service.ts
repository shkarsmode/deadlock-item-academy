import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'good' | 'bad';
}

@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly list = signal<Toast[]>([]);
  private seq = 0;

  show(text: string, tone: Toast['tone'] = 'info', ms = 3500): void {
    const t = { id: ++this.seq, text, tone };
    this.list.update((l) => [...l, t]);
    setTimeout(() => this.list.update((l) => l.filter((x) => x.id !== t.id)), ms);
  }
}
