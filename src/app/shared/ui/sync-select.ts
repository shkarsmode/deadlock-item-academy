import { AfterViewChecked, Directive, ElementRef, inject, input } from '@angular/core';

/**
 * Keeps a native <select> showing the bound value even when its <option>s render after the
 * value is set (a plain [value] binding is applied before @for renders the options).
 */
@Directive({ selector: 'select[syncValue]' })
export class SyncSelectValue implements AfterViewChecked {
  readonly syncValue = input<string | number | null | undefined>();
  private readonly el = inject<ElementRef<HTMLSelectElement>>(ElementRef);

  ngAfterViewChecked(): void {
    const v = String(this.syncValue() ?? '');
    const sel = this.el.nativeElement;
    if (sel.value !== v && [...sel.options].some((o) => o.value === v)) sel.value = v;
  }
}
