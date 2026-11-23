import { DBSchema, IDBPDatabase, openDB } from 'idb';
import type { ItemKnowledge, ReviewRecord, QuestionExposure, MistakeEntry, SessionRecord } from '../../learning/knowledge.model';
import type { ProfileRecord } from '../profile/profile.model';
import type { SavedBuild } from '../../domain/builds/build.model';
import type { Reflection } from '../../features/reflect/reflection.model';

/**
 * Local-first persistence (IndexedDB). Every record carries `profileId` so several people
 * (or a friend on the same device) can learn independently.
 *
 * Bump DB_VERSION and add a step in `upgrade` for every schema change; never drop user data.
 */
export const DB_NAME = 'deadlock-item-academy';
export const DB_VERSION = 1;

export interface KvRecord {
  key: string;
  value: unknown;
}

export interface AcademyDB extends DBSchema {
  profiles: { key: string; value: ProfileRecord };
  knowledge: { key: [string, string]; value: ItemKnowledge; indexes: { byProfile: string } };
  reviews: { key: number; value: ReviewRecord; indexes: { byProfile: string; byProfileTs: [string, number] } };
  exposures: { key: [string, string]; value: QuestionExposure; indexes: { byProfile: string } };
  mistakes: { key: string; value: MistakeEntry; indexes: { byProfile: string } };
  sessions: { key: string; value: SessionRecord; indexes: { byProfile: string } };
  builds: { key: string; value: SavedBuild; indexes: { byProfile: string } };
  reflections: { key: string; value: Reflection; indexes: { byProfile: string } };
  kv: { key: string; value: KvRecord };
}

export type StoreName = 'profiles' | 'knowledge' | 'reviews' | 'exposures' | 'mistakes' | 'sessions' | 'builds' | 'reflections' | 'kv';
export const PROFILE_STORES = ['knowledge', 'reviews', 'exposures', 'mistakes', 'sessions', 'builds', 'reflections'] as const;
export type ProfileStore = (typeof PROFILE_STORES)[number];

let dbPromise: Promise<IDBPDatabase<AcademyDB>> | null = null;

export function getDb(): Promise<IDBPDatabase<AcademyDB>> {
  if (!dbPromise) {
    dbPromise = openDB<AcademyDB>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('profiles', { keyPath: 'id' });
          const k = db.createObjectStore('knowledge', { keyPath: ['profileId', 'itemKey'] });
          k.createIndex('byProfile', 'profileId');
          const r = db.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
          r.createIndex('byProfile', 'profileId');
          r.createIndex('byProfileTs', ['profileId', 'ts']);
          const e = db.createObjectStore('exposures', { keyPath: ['profileId', 'questionId'] });
          e.createIndex('byProfile', 'profileId');
          db.createObjectStore('mistakes', { keyPath: 'id' }).createIndex('byProfile', 'profileId');
          db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('byProfile', 'profileId');
          db.createObjectStore('builds', { keyPath: 'id' }).createIndex('byProfile', 'profileId');
          db.createObjectStore('reflections', { keyPath: 'id' }).createIndex('byProfile', 'profileId');
          db.createObjectStore('kv', { keyPath: 'key' });
        }
        // Future migrations: `if (oldVersion < 2) { ... }`
      },
      blocked() {
        console.warn('IndexedDB upgrade blocked by another tab');
      },
    }).catch((e) => {
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** Deletes every record that belongs to a profile (used by reset and profile removal). */
export async function clearProfileData(profileId: string): Promise<void> {
  const db = await getDb();
  for (const store of PROFILE_STORES) {
    const tx = db.transaction(store, 'readwrite');
    const index = tx.store.index('byProfile');
    let cursor = await index.openCursor(IDBKeyRange.only(profileId));
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
    await tx.done;
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  const rec = await db.get('kv', key);
  return rec?.value as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await getDb();
  await db.put('kv', { key, value });
}
