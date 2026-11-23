/**
 * Syncs Deadlock game data from the public API into the app bundle.
 *
 *   npm run data:sync                      # fetch live data + icons
 *   npm run data:sync -- --skip-icons      # data only
 *   npm run data:sync -- --offline <dir>   # normalize previously saved raw files
 *   npm run data:sync -- --save-raw <dir>  # also keep the raw API payloads
 *
 * Writes:
 *   public/data/game/meta.json, items.json, heroes.json  - normalized snapshot
 *   public/data/game/changes.json                        - diff against the previous snapshot
 *   public/game/{items,heroes,abilities}/*.webp           - icons (only missing/changed ones)
 *
 * Runs on Node >= 22.18 with native TypeScript type stripping (no build step).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffGameData, normalizeGameData, parseValveLocalization } from '../src/app/core/game-data/normalize.ts';
import type { RawInputs } from '../src/app/core/game-data/normalize.ts';
import type { GameDataBundle } from '../src/app/core/game-data/game-data.model.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DATA = join(ROOT, 'public', 'data', 'game');
const OUT_ICONS = join(ROOT, 'public');
const API = 'https://api.deadlock-api.com';

const args = process.argv.slice(2);
const flag = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? '') : null;
};
const has = (name: string): boolean => args.includes(name);

async function getJson<T>(path: string): Promise<T> {
  const url = path.startsWith('http') ? path : `${API}${path}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': 'deadlock-item-academy-sync' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (e) {
      if (attempt === 3) throw new Error(`Failed to fetch ${url}: ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error('unreachable');
}

const RAW_FILES = {
  itemsEn: 'items.json',
  itemsRu: 'items_ru.json',
  heroesEn: 'heroes.json',
  heroesRu: 'heroes_ru.json',
  generic: 'generic.json',
  steamInfo: 'steaminfo.json',
  patches: 'patches_v2.json',
} as const;

/**
 * Optional: read ability texts from a local Deadlock install to fill gaps in the API.
 * Path from `--client <dir>`, env DEADLOCK_PATH, or common Steam library locations.
 */
function loadClientLoc(): RawInputs['clientLoc'] {
  const candidates = [
    flag('--client'),
    process.env['DEADLOCK_PATH'] ?? null,
    'C:/Program Files (x86)/Steam/steamapps/common/Deadlock',
    'C:/Program Files/Steam/steamapps/common/Deadlock',
    'D:/Games/Steam/steamapps/common/Deadlock',
    'D:/SteamLibrary/steamapps/common/Deadlock',
    'E:/SteamLibrary/steamapps/common/Deadlock',
  ].filter((x): x is string => !!x);
  for (const dir of candidates) {
    const base = join(dir, 'game', 'citadel', 'resource', 'localization', 'citadel_heroes');
    const en = join(base, 'citadel_heroes_english.txt');
    const ru = join(base, 'citadel_heroes_russian.txt');
    if (existsSync(en)) {
      console.log('Using local client localization from', dir);
      return {
        en: parseValveLocalization(readFileSync(en, 'utf8')),
        ru: existsSync(ru) ? parseValveLocalization(readFileSync(ru, 'utf8')) : {},
      };
    }
  }
  console.log('Local Deadlock install not found (optional) - ability texts come from the API only');
  return undefined;
}

async function loadRaw(): Promise<RawInputs> {
  const offline = flag('--offline');
  const fetchedAt = new Date().toISOString();
  if (offline) {
    const read = (f: string) => JSON.parse(readFileSync(join(offline, f), 'utf8'));
    return {
      itemsEn: read(RAW_FILES.itemsEn),
      itemsRu: read(RAW_FILES.itemsRu),
      heroesEn: read(RAW_FILES.heroesEn),
      heroesRu: read(RAW_FILES.heroesRu),
      generic: read(RAW_FILES.generic),
      steamInfo: read(RAW_FILES.steamInfo),
      patches: existsSync(join(offline, RAW_FILES.patches)) ? read(RAW_FILES.patches) : [],
      fetchedAt,
    };
  }
  console.log('Fetching game data from', API);
  const [itemsEn, itemsRu, heroesEn, heroesRu, generic, steamInfo, patches] = await Promise.all([
    getJson<RawInputs['itemsEn']>('/v1/assets/items'),
    getJson<RawInputs['itemsRu']>('/v1/assets/items?language=russian'),
    getJson<RawInputs['heroesEn']>('/v1/assets/heroes'),
    getJson<RawInputs['heroesRu']>('/v1/assets/heroes?language=russian'),
    getJson<RawInputs['generic']>('/v1/assets/generic-data'),
    getJson<RawInputs['steamInfo']>('/v1/assets/steam-info'),
    getJson<RawInputs['patches']>('/v2/patches').catch(() => []),
  ]);
  const raw: RawInputs = { itemsEn, itemsRu, heroesEn, heroesRu, generic, steamInfo, patches, fetchedAt };
  const saveDir = flag('--save-raw');
  if (saveDir) {
    mkdirSync(saveDir, { recursive: true });
    for (const [k, f] of Object.entries(RAW_FILES)) writeFileSync(join(saveDir, f), JSON.stringify(raw[k as keyof typeof RAW_FILES]));
    console.log('Raw payloads saved to', saveDir);
  }
  return raw;
}

function readPrevious(): GameDataBundle | null {
  try {
    const meta = JSON.parse(readFileSync(join(OUT_DATA, 'meta.json'), 'utf8'));
    const items = JSON.parse(readFileSync(join(OUT_DATA, 'items.json'), 'utf8'));
    const heroes = JSON.parse(readFileSync(join(OUT_DATA, 'heroes.json'), 'utf8'));
    return { meta, items, heroes };
  } catch {
    return null;
  }
}

/** One record per line: compact files that still produce readable git diffs. */
function writeLines(file: string, rows: unknown[]): void {
  writeFileSync(file, '[\n' + rows.map((r) => JSON.stringify(r)).join(',\n') + '\n]\n');
}

interface IconJob {
  local: string;
  remote: string;
}

async function syncIcons(bundle: GameDataBundle): Promise<void> {
  const manifestFile = join(OUT_ICONS, 'game', 'icons.manifest.json');
  let manifest: Record<string, string> = {};
  try {
    manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  } catch {
    manifest = {};
  }
  const jobs: IconJob[] = [];
  for (const it of bundle.items) jobs.push({ local: it.icon, remote: it.iconRemote });
  for (const h of bundle.heroes) {
    jobs.push({ local: h.icon, remote: h.iconRemote });
    for (const a of h.abilities) jobs.push({ local: a.icon, remote: a.iconRemote });
  }
  const todo = jobs.filter((j) => j.remote && (manifest[j.local] !== j.remote || !existsSync(join(OUT_ICONS, j.local))));
  console.log(`Icons: ${jobs.length} total, ${todo.length} to download`);
  let done = 0;
  let failed = 0;
  const worker = async () => {
    while (todo.length) {
      const job = todo.shift();
      if (!job) break;
      try {
        const res = await fetch(job.remote);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        const file = join(OUT_ICONS, job.local);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, buf);
        manifest[job.local] = job.remote;
        done++;
      } catch (e) {
        failed++;
        console.warn('  icon failed', job.remote, (e as Error).message);
      }
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  mkdirSync(dirname(manifestFile), { recursive: true });
  writeFileSync(manifestFile, JSON.stringify(manifest, null, 1) + '\n');
  console.log(`Icons: ${done} downloaded, ${failed} failed`);
}

async function main(): Promise<void> {
  const raw = await loadRaw();
  raw.clientLoc = loadClientLoc();
  const bundle = normalizeGameData(raw);
  const prev = readPrevious();
  const diff = diffGameData(prev, bundle);

  mkdirSync(OUT_DATA, { recursive: true });
  writeFileSync(join(OUT_DATA, 'meta.json'), JSON.stringify(bundle.meta, null, 1) + '\n');
  writeLines(join(OUT_DATA, 'items.json'), bundle.items);
  writeLines(join(OUT_DATA, 'heroes.json'), bundle.heroes);
  if (prev && (diff.items.length || diff.heroes.length || prev.meta.clientVersion !== bundle.meta.clientVersion)) {
    writeFileSync(join(OUT_DATA, 'changes.json'), JSON.stringify(diff, null, 1) + '\n');
  } else if (!existsSync(join(OUT_DATA, 'changes.json'))) {
    writeFileSync(join(OUT_DATA, 'changes.json'), JSON.stringify(diff, null, 1) + '\n');
  }

  const { counts, clientVersion } = bundle.meta;
  console.log(`Client version ${clientVersion}: ${counts.items} items (${counts.standardItems} standard), ${counts.heroes} heroes`);
  if (prev) {
    console.log(`Changes vs ${prev.meta.clientVersion}: ${diff.items.length} items, ${diff.heroes.length} heroes`);
    for (const c of diff.items.slice(0, 30)) console.log(`  ${c.kind.padEnd(7)} ${c.name} ${c.fields.join(',')}`);
  }
  if (!has('--skip-icons')) await syncIcons(bundle);
  console.log('Next: run `npm run content:validate` - content pinned to changed items is flagged for review.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
