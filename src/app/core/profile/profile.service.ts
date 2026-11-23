import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { DEFAULT_SETTINGS, PROFILE_SCHEMA, ProfileRecord, ProfileSettings } from './profile.model';
import { clearProfileData, getDb } from '../db/db';
import { I18n } from '../i18n/i18n';

const CURRENT_KEY = 'dia.currentProfile';

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: the profile choice just will not be remembered
  }
}

export function newId(prefix = ''): string {
  const rnd =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}${Date.now().toString(36)}${rnd}`;
}

/** Learning profiles: no accounts, everything local. A friend can create their own profile. */
@Injectable({ providedIn: 'root' })
export class Profiles {
  private readonly i18n = inject(I18n);

  readonly profiles = signal<ProfileRecord[]>([]);
  readonly current = signal<ProfileRecord | null>(null);
  readonly ready = signal(false);
  readonly storageError = signal<string | null>(null);
  readonly settings = computed<ProfileSettings>(() => ({ ...DEFAULT_SETTINGS, ...(this.current()?.settings ?? {}) }));
  readonly profileId = computed(() => this.current()?.id ?? 'none');

  constructor() {
    effect(() => {
      const s = this.settings();
      this.i18n.lang.set(s.lang);
      this.i18n.nameLang.set(s.nameLang);
      this.i18n.showAlt.set(s.showAltNames);
      if (typeof document !== 'undefined') document.documentElement.lang = s.lang;
    });
  }

  async init(): Promise<void> {
    try {
      const db = await getDb();
      let all = await db.getAll('profiles');
      if (all.length === 0) {
        const p = this.make(this.i18n.l('Основной', 'Main'));
        await db.put('profiles', p);
        all = [p];
      }
      all.sort((a, b) => a.createdAt - b.createdAt);
      this.profiles.set(all);
      const wanted = readLocal(CURRENT_KEY);
      this.current.set(all.find((p) => p.id === wanted) ?? all[0]);
    } catch (e) {
      console.error(e);
      this.storageError.set(e instanceof Error ? e.message : String(e));
      const p = this.make('Local');
      this.profiles.set([p]);
      this.current.set(p);
    }
    this.ready.set(true);
  }

  private make(name: string, settings: Partial<ProfileSettings> = {}): ProfileRecord {
    return {
      id: newId('p'),
      name,
      createdAt: Date.now(),
      onboarded: false,
      myBuildId: null,
      settings: { ...DEFAULT_SETTINGS, lang: this.i18n.lang(), ...settings },
      schema: PROFILE_SCHEMA,
    };
  }

  async create(name: string, settings: Partial<ProfileSettings> = {}): Promise<ProfileRecord> {
    const p = this.make(name, settings);
    const db = await getDb();
    await db.put('profiles', p);
    this.profiles.update((list) => [...list, p]);
    await this.switch(p.id);
    return p;
  }

  async switch(id: string): Promise<void> {
    const p = this.profiles().find((x) => x.id === id);
    if (!p) return;
    writeLocal(CURRENT_KEY, id);
    this.current.set(p);
  }

  async update(patch: Partial<Omit<ProfileRecord, 'id'>>): Promise<void> {
    const cur = this.current();
    if (!cur) return;
    const next: ProfileRecord = { ...cur, ...patch, settings: { ...cur.settings, ...(patch.settings ?? {}) } };
    await this.save(next);
  }

  async updateSettings(patch: Partial<ProfileSettings>): Promise<void> {
    const cur = this.current();
    if (!cur) return;
    await this.save({ ...cur, settings: { ...cur.settings, ...patch } });
  }

  private async save(next: ProfileRecord): Promise<void> {
    this.current.set(next);
    this.profiles.update((list) => list.map((p) => (p.id === next.id ? next : p)));
    try {
      const db = await getDb();
      await db.put('profiles', next);
    } catch (e) {
      console.error(e);
    }
  }

  async remove(id: string): Promise<void> {
    const db = await getDb();
    await clearProfileData(id);
    await db.delete('profiles', id);
    const rest = this.profiles().filter((p) => p.id !== id);
    if (rest.length === 0) {
      const p = this.make(this.i18n.l('Основной', 'Main'));
      await db.put('profiles', p);
      rest.push(p);
    }
    this.profiles.set(rest);
    if (this.current()?.id === id) await this.switch(rest[0].id);
  }

  /** Ask the browser not to evict local data (best effort). */
  async requestPersistence(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  }
}
