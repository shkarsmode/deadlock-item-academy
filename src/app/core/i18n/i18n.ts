import { Injectable, Pipe, PipeTransform, computed, inject, signal } from '@angular/core';
import type { L10n } from '../game-data/game-data.model';
import type { Text } from '../../content/content.model';
import type { NameLang, UiLang } from '../profile/profile.model';

/**
 * Runtime language switching (RU default, EN optional).
 * UI strings are written inline in both languages (`'Главная' | l: 'Dashboard'`) so a string and
 * its translation never drift apart. Content text uses `Text { ru, en? }` and falls back to Russian.
 * Game names (items, abilities) follow `nameLang` (English by default: the player's client is English).
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<UiLang>('ru');
  readonly nameLang = signal<NameLang>('en');
  readonly showAlt = signal(true);
  readonly locale = computed(() => (this.lang() === 'ru' ? 'ru-RU' : 'en-US'));

  l(ru: string, en: string, params?: Record<string, string | number>): string {
    const s = this.lang() === 'en' ? en : ru;
    return params ? interpolate(s, params) : s;
  }

  text(t: Text | null | undefined, params?: Record<string, string | number>): string {
    if (!t) return '';
    const s = this.lang() === 'en' && t.en ? t.en : t.ru;
    return params ? interpolate(s, params) : s;
  }

  name(n: L10n | null | undefined): string {
    if (!n) return '';
    return this.nameLang() === 'ru' ? n.ru || n.en : n.en;
  }

  /** The name in the other language, when it differs and hints are enabled. */
  altName(n: L10n | null | undefined): string | null {
    if (!n || !this.showAlt()) return null;
    const alt = this.nameLang() === 'ru' ? n.en : n.ru;
    return alt && alt !== this.name(n) ? alt : null;
  }

  /** Game text (official descriptions) in the UI language. */
  game(n: L10n | null | undefined): string {
    if (!n) return '';
    return this.lang() === 'ru' ? n.ru || n.en : n.en;
  }

  plural(n: number, ru: [string, string, string], en: [string, string]): string {
    if (this.lang() === 'en') return `${n} ${n === 1 ? en[0] : en[1]}`;
    const m10 = n % 10;
    const m100 = n % 100;
    const form = m10 === 1 && m100 !== 11 ? ru[0] : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? ru[1] : ru[2];
    return `${n} ${form}`;
  }

  num(n: number, digits = 0): string {
    return new Intl.NumberFormat(this.locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(n);
  }

  pct(fraction: number, digits = 0): string {
    return `${this.num(fraction * 100, digits)}%`;
  }

  date(ts: number, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
    return new Intl.DateTimeFormat(this.locale(), opts).format(new Date(ts));
  }

  relative(ts: number, now = Date.now()): string {
    const diff = ts - now;
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(this.locale(), { numeric: 'auto' });
    const min = 60_000;
    const hour = 60 * min;
    const day = 24 * hour;
    if (abs < hour) return rtf.format(Math.round(diff / min), 'minute');
    if (abs < day) return rtf.format(Math.round(diff / hour), 'hour');
    return rtf.format(Math.round(diff / day), 'day');
  }
}

export function interpolate(s: string, params: Record<string, string | number>): string {
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** `{{ 'Главная' | l: 'Dashboard' }}` */
@Pipe({ name: 'l', pure: false })
export class LPipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(ru: string, en: string, params?: Record<string, string | number>): string {
    return this.i18n.l(ru, en, params);
  }
}

/** `{{ content.job | tx }}` */
@Pipe({ name: 'tx', pure: false })
export class TxPipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(t: Text | null | undefined): string {
    return this.i18n.text(t);
  }
}

/** `{{ item.name | gn }}` - game name in the chosen name language. */
@Pipe({ name: 'gn', pure: false })
export class GnPipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(n: L10n | null | undefined): string {
    return this.i18n.name(n);
  }
}

/** `{{ section.text | gt }}` - official game text in the UI language. */
@Pipe({ name: 'gt', pure: false })
export class GtPipe implements PipeTransform {
  private readonly i18n = inject(I18n);
  transform(n: L10n | null | undefined): string {
    return this.i18n.game(n);
  }
}

export const I18N_PIPES = [LPipe, TxPipe, GnPipe, GtPipe] as const;
