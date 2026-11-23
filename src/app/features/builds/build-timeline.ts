import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TimelinePoint } from '../../domain/builds/analyzer';
import { I18N_PIPES } from '../../core/i18n/i18n';
import { ItemIcon } from '../../shared/ui/item-icon';

/** Purchase timeline: when each item comes online in cumulative souls spent. */
@Component({
  selector: 'app-build-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ItemIcon, ...I18N_PIPES],
  template: `
    @if (points().length) {
      <div class="tl" [style.--max]="max()">
        <div class="axis">
          @for (t of ticks(); track t) {
            <span class="tick num xsmall faint" [style.left.%]="(t / max()) * 100">{{ t / 1000 }}k</span>
          }
        </div>
        <div class="track">
          @for (p of points(); track $index) {
            <div class="pt" [style.left.%]="(p.cumulative / max()) * 100" [style.top.px]="($index % 3) * 30" [attr.title]="p.item + ' · ' + p.cumulative">
              <app-item-icon [key]="p.item" [size]="26" [title]="true" />
            </div>
          }
        </div>
        @if (compare().length) {
          <div class="track cmp">
            @for (p of compare(); track $index) {
              <div class="pt" [style.left.%]="(p.cumulative / max()) * 100" [style.top.px]="($index % 3) * 30">
                <app-item-icon [key]="p.item" [size]="26" [title]="true" />
              </div>
            }
          </div>
        }
        <p class="xsmall faint note">{{ 'Ось: сколько душ потрачено к моменту покупки (по порядку в билде, с учётом компонентов).' | l: 'Axis: souls spent by the time of purchase (build order, components counted).' }}</p>
      </div>
    }
  `,
  styles: [
    `
      .tl { position: relative; padding: 4px 14px 0; }
      .axis { position: relative; height: 18px; border-bottom: 1px solid var(--border-2); }
      .tick { position: absolute; transform: translateX(-50%); }
      .track { position: relative; height: 96px; margin-top: 6px; }
      .track.cmp { border-top: 1px dashed var(--border-2); padding-top: 6px; }
      .pt { position: absolute; transform: translateX(-50%); }
      .note { margin-top: 4px; }
    `,
  ],
})
export class BuildTimeline {
  readonly points = input<TimelinePoint[]>([]);
  readonly compare = input<TimelinePoint[]>([]);
  protected readonly max = computed(() => Math.max(1000, ...this.points().map((p) => p.cumulative), ...this.compare().map((p) => p.cumulative)) * 1.04);
  protected readonly ticks = computed(() => {
    const step = this.max() > 40000 ? 10000 : 5000;
    const out: number[] = [];
    for (let t = 0; t < this.max(); t += step) out.push(t);
    return out;
  });
}
