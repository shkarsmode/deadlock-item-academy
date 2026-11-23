import { ChangeDetectionStrategy, Component, ElementRef, inject, output, signal, viewChild } from '@angular/core';
import { GameData } from '../../core/game-data/game-data.service';
import { I18N_PIPES, I18n } from '../../core/i18n/i18n';
import { Icon } from '../../shared/ui/icon';
import { ItemIcon } from '../../shared/ui/item-icon';

const SIG = 12;

/**
 * Screenshot-assisted build entry. The learner draws a box around one item icon in a
 * screenshot; the app compares that patch with every item icon (downscaled color layout)
 * and suggests the closest matches. Approximate by design: the learner confirms each one.
 * Everything happens locally in a canvas, nothing is uploaded.
 */
@Component({
  selector: 'app-screenshot-assist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Icon, ItemIcon, ...I18N_PIPES],
  template: `
    <div class="sa">
      @if (!img()) {
        <label class="btn"><app-icon name="image-up" /> {{ 'Загрузить скриншот билда или магазина' | l: 'Upload a screenshot of the build or shop' }}
          <input type="file" accept="image/*" class="sr-only" (change)="onFile($event)" />
        </label>
        <p class="xsmall faint">{{ 'Скриншот не покидает браузер.' | l: 'The screenshot never leaves your browser.' }}</p>
      } @else {
        <p class="small muted">{{ 'Обведи рамкой одну иконку предмета. Затем выбери совпадение из подсказок.' | l: 'Draw a box around one item icon, then pick the match.' }}</p>
        <div class="canvas-wrap">
          <canvas
            #cv
            (pointerdown)="down($event)"
            (pointermove)="move($event)"
            (pointerup)="up()"
            (pointerleave)="up()"
          ></canvas>
        </div>
        @if (matches().length) {
          <div class="matches">
            <span class="small muted">{{ 'Похоже на:' | l: 'Looks like:' }}</span>
            @for (m of matches(); track m.key) {
              <button class="match" (click)="pick(m.key)">
                <app-item-icon [key]="m.key" [size]="36" [alt]="true" />
                <span class="small">{{ game.item(m.key)?.name | gn }}</span>
                <span class="xsmall faint num">{{ (m.score * 100).toFixed(0) }}%</span>
              </button>
            }
          </div>
        }
        <button class="btn btn-ghost btn-sm" (click)="clear()">{{ 'Другой скриншот' | l: 'Another screenshot' }}</button>
      }
      @if (loadingIcons()) {
        <p class="xsmall faint">{{ 'Готовлю иконки для сравнения...' | l: 'Preparing icons...' }}</p>
      }
    </div>
  `,
  styles: [
    `
      .sa { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; }
      .canvas-wrap { max-width: 100%; overflow: auto; border: 1px solid var(--border-2); border-radius: var(--r-md); }
      canvas { display: block; max-width: 100%; cursor: crosshair; touch-action: none; }
      .matches { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
      .match { display: inline-flex; align-items: center; gap: 6px; padding: 4px 8px 4px 4px; border-radius: var(--r-md); border: 1px solid var(--border-2); background: var(--bg-1); color: var(--text); }
      .match:hover { border-color: var(--accent); }
    `,
  ],
})
export class ScreenshotAssist {
  protected readonly game = inject(GameData);
  private readonly i18n = inject(I18n);
  readonly picked = output<string>();
  private readonly cv = viewChild<ElementRef<HTMLCanvasElement>>('cv');

  protected readonly img = signal<HTMLImageElement | null>(null);
  protected readonly matches = signal<{ key: string; score: number }[]>([]);
  protected readonly loadingIcons = signal(false);
  private sigs: Map<string, Float32Array> | null = null;
  private start: { x: number; y: number } | null = null;
  private rect: { x: number; y: number; w: number; h: number } | null = null;
  private scale = 1;

  async onFile(ev: Event): Promise<void> {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      this.img.set(image);
      queueMicrotask(() => this.draw());
    };
    image.src = url;
    void this.prepareIcons();
  }

  clear(): void {
    this.img.set(null);
    this.matches.set([]);
  }

  private draw(): void {
    const c = this.cv()?.nativeElement;
    const image = this.img();
    if (!c || !image) return;
    const maxW = Math.min(1100, c.parentElement?.clientWidth ?? 900);
    this.scale = Math.min(1, maxW / image.naturalWidth);
    c.width = Math.round(image.naturalWidth * this.scale);
    c.height = Math.round(image.naturalHeight * this.scale);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, c.width, c.height);
    if (this.rect) {
      ctx.strokeStyle = '#4cc8d4';
      ctx.lineWidth = 2;
      ctx.strokeRect(this.rect.x, this.rect.y, this.rect.w, this.rect.h);
    }
  }

  private pos(e: PointerEvent): { x: number; y: number } {
    const c = this.cv()?.nativeElement;
    const r = c?.getBoundingClientRect();
    if (!c || !r) return { x: 0, y: 0 };
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  }

  down(e: PointerEvent): void {
    this.start = this.pos(e);
    this.rect = null;
  }

  move(e: PointerEvent): void {
    if (!this.start) return;
    const p = this.pos(e);
    this.rect = { x: Math.min(p.x, this.start.x), y: Math.min(p.y, this.start.y), w: Math.abs(p.x - this.start.x), h: Math.abs(p.y - this.start.y) };
    this.draw();
  }

  up(): void {
    if (!this.start) return;
    this.start = null;
    if (this.rect && this.rect.w > 6 && this.rect.h > 6) void this.match();
  }

  private signature(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): Float32Array {
    const c = document.createElement('canvas');
    c.width = SIG;
    c.height = SIG;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) return new Float32Array(SIG * SIG * 3);
    // Crop the center (icons sit inside frames) and downscale.
    const inset = 0.12;
    ctx.drawImage(source, sx + sw * inset, sy + sh * inset, sw * (1 - 2 * inset), sh * (1 - 2 * inset), 0, 0, SIG, SIG);
    const d = ctx.getImageData(0, 0, SIG, SIG).data;
    const out = new Float32Array(SIG * SIG * 3);
    let mean = 0;
    for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
      out[j] = d[i] / 255;
      out[j + 1] = d[i + 1] / 255;
      out[j + 2] = d[i + 2] / 255;
      mean += out[j] + out[j + 1] + out[j + 2];
    }
    mean /= out.length;
    let norm = 0;
    for (let i = 0; i < out.length; i++) {
      out[i] -= mean;
      norm += out[i] * out[i];
    }
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < out.length; i++) out[i] /= norm;
    return out;
  }

  private async prepareIcons(): Promise<void> {
    if (this.sigs) return;
    this.loadingIcons.set(true);
    const map = new Map<string, Float32Array>();
    await Promise.all(
      this.game.standardItems().map(
        (it) =>
          new Promise<void>((resolve) => {
            const im = new Image();
            im.onload = () => {
              map.set(it.key, this.signature(im, 0, 0, im.naturalWidth, im.naturalHeight));
              resolve();
            };
            im.onerror = () => resolve();
            im.src = it.icon;
          }),
      ),
    );
    this.sigs = map;
    this.loadingIcons.set(false);
  }

  private async match(): Promise<void> {
    await this.prepareIcons();
    const image = this.img();
    if (!image || !this.rect || !this.sigs) return;
    const s = this.scale;
    const patch = this.signature(image, this.rect.x / s, this.rect.y / s, this.rect.w / s, this.rect.h / s);
    const scored: { key: string; score: number }[] = [];
    for (const [key, sig] of this.sigs) {
      let dot = 0;
      for (let i = 0; i < sig.length; i++) dot += sig[i] * patch[i];
      scored.push({ key, score: (dot + 1) / 2 });
    }
    scored.sort((a, b) => b.score - a.score);
    this.matches.set(scored.slice(0, 6));
  }

  pick(key: string): void {
    this.picked.emit(key);
    this.matches.set([]);
    this.rect = null;
    this.draw();
  }
}
