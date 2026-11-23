import { Injectable, inject } from '@angular/core';
import { DB_VERSION, PROFILE_STORES, ProfileStore, clearProfileData, getDb } from './db';
import { Profiles, newId } from '../profile/profile.service';
import type { ProfileRecord } from '../profile/profile.model';
import { Knowledge } from '../../learning/knowledge.service';

export interface ProgressExport {
  format: 'dia-progress';
  version: 1;
  dbVersion: number;
  exportedAt: string;
  profile: ProfileRecord;
  data: Record<ProfileStore, unknown[]>;
}

/** Export / import / reset of a learning profile (local-first, plain JSON). */
@Injectable({ providedIn: 'root' })
export class DataPort {
  private readonly profiles = inject(Profiles);
  private readonly knowledge = inject(Knowledge);

  async exportCurrent(): Promise<ProgressExport> {
    const profile = this.profiles.current();
    if (!profile) throw new Error('No profile');
    const db = await getDb();
    const data = {} as Record<ProfileStore, unknown[]>;
    for (const store of PROFILE_STORES) data[store] = await db.getAllFromIndex(store, 'byProfile', profile.id);
    return { format: 'dia-progress', version: 1, dbVersion: DB_VERSION, exportedAt: new Date().toISOString(), profile, data };
  }

  download(payload: ProgressExport): void {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `deadlock-academy-${payload.profile.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${payload.exportedAt.slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /**
   * Imports a progress file. `replace` overwrites the current profile's data;
   * `new` creates a separate profile (e.g. moving progress to another device).
   */
  async importFile(text: string, mode: 'replace' | 'new'): Promise<{ profileId: string; records: number }> {
    const parsed = JSON.parse(text) as Partial<ProgressExport>;
    if (parsed.format !== 'dia-progress' || parsed.version !== 1 || !parsed.profile || !parsed.data) throw new Error('Not a Deadlock Item Academy progress file');
    const db = await getDb();
    let target: ProfileRecord;
    if (mode === 'new') {
      target = await this.profiles.create(`${parsed.profile.name} (import)`, parsed.profile.settings);
      await this.profiles.update({ onboarded: true, myBuildId: parsed.profile.myBuildId });
      target = this.profiles.current() ?? target;
    } else {
      const cur = this.profiles.current();
      if (!cur) throw new Error('No profile');
      await clearProfileData(cur.id);
      await this.profiles.update({ settings: { ...cur.settings, ...parsed.profile.settings }, onboarded: true, myBuildId: parsed.profile.myBuildId });
      target = this.profiles.current() ?? cur;
    }
    let records = 0;
    for (const store of PROFILE_STORES) {
      const rows = (parsed.data[store] ?? []) as Record<string, unknown>[];
      const tx = db.transaction(store, 'readwrite');
      for (const row of rows) {
        if (!row || typeof row !== 'object') continue;
        const copy: Record<string, unknown> = { ...row, profileId: target.id };
        if (store === 'reviews') delete copy['id'];
        if ((store === 'sessions' || store === 'builds' || store === 'reflections') && mode === 'new') copy['id'] = newId(store[0]);
        if (store === 'mistakes') copy['id'] = String(row['id'] ?? newId('m'));
        await (tx.store as unknown as { put: (v: unknown) => Promise<unknown> }).put(copy);
        records++;
      }
      await tx.done;
    }
    await this.knowledge.reload();
    return { profileId: target.id, records };
  }

  async resetCurrent(): Promise<void> {
    const cur = this.profiles.current();
    if (!cur) return;
    await clearProfileData(cur.id);
    await this.knowledge.reload();
  }
}
