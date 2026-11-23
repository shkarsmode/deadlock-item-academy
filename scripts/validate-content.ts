/**
 * Validates hand-authored learning content against current game data and bundles it.
 *
 *   npm run content:validate                  # validate + write public/data/content/bundle.json
 *   npm run content:validate -- --only <file> # report issues for files whose path contains <file>
 *   npm run content:validate -- --repin all   # accept current game data for all content (after review)
 *   npm run content:validate -- --repin <id>  # accept for one content id (e.g. scenario:vin-def-001)
 *
 * Pinning: the first time a piece of content is validated, the hashes of every item it
 * references are stored in content/pins.json. When a later game update changes one of
 * those items, the content is listed in `needsReview` (shown in the app and here).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from '../src/app/content/validate-content.ts';
import type { RawContent, Vocab } from '../src/app/content/validate-content.ts';
import {
  CLAIM_STATUSES,
  CONTENT_STATUSES,
  DIMENSIONS,
  FORBIDDEN_CHARS,
  ITEM_ROLES,
  OUTDATED_ITEM_NAMES,
  PHASES,
  SCENARIO_KINDS,
  THREATS,
  VERDICT_MIN_SCORE,
  VERDICTS,
} from '../src/app/content/vocab.ts';
import type { ContentBundle } from '../src/app/content/content.model.ts';
import type { GameDataBundle } from '../src/app/core/game-data/game-data.model.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'content');
const PINS_FILE = join(CONTENT, 'pins.json');
const OUT = join(ROOT, 'public', 'data', 'content', 'bundle.json');

const args = process.argv.slice(2);
const argOf = (name: string): string | null => {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? '') : null;
};

const vocab: Vocab = {
  roles: ITEM_ROLES,
  threats: THREATS,
  dims: DIMENSIONS,
  phases: PHASES,
  claimStatuses: CLAIM_STATUSES,
  scenarioKinds: SCENARIO_KINDS,
  verdicts: VERDICTS,
  verdictMin: VERDICT_MIN_SCORE,
  contentStatuses: CONTENT_STATUSES,
  forbiddenChars: FORBIDDEN_CHARS,
  outdatedNames: OUTDATED_ITEM_NAMES,
};

function loadGame(): GameDataBundle {
  const dir = join(ROOT, 'public', 'data', 'game');
  return {
    meta: JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')),
    items: JSON.parse(readFileSync(join(dir, 'items.json'), 'utf8')),
    heroes: JSON.parse(readFileSync(join(dir, 'heroes.json'), 'utf8')),
  };
}

const parseErrors: string[] = [];
/** `--only <substr>` restricts loading to matching files (lets parallel authors validate their own file). */
const ONLY = argOf('--only');
/** `--check` validates without writing pins.json or the bundle. */
const CHECK = args.includes('--check') || ONLY !== null;
function readDir<T>(sub: string): { file: string; data: T }[] {
  const dir = join(CONTENT, sub);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !ONLY || relative(ROOT, join(dir, f)).replace(/\\/g, '/').includes(ONLY))
    .sort()
    .flatMap((f) => {
      const file = relative(ROOT, join(dir, f)).replace(/\\/g, '/');
      try {
        return [{ file, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) as T }];
      } catch (e) {
        parseErrors.push(`${file}: invalid JSON - ${(e as Error).message}`);
        return [];
      }
    });
}

function main(): void {
  const game = loadGame();
  const raw: RawContent = {
    items: readDir('items'),
    scenarios: readDir('scenarios'),
    courses: readDir('heroes'),
    builds: readDir('builds'),
    problems: readDir('problems'),
  };
  if (parseErrors.length) {
    for (const e of parseErrors) console.error('ERROR', e);
    process.exit(1);
  }
  const report = validateContent(raw, game, vocab);

  // ---- pins / needs-review
  const hashes = new Map<string, string>();
  for (const it of game.items) hashes.set(it.key, it.hash);
  for (const h of game.heroes) for (const a of h.abilities) hashes.set(a.key, a.hash);
  const pins: Record<string, Record<string, string>> = existsSync(PINS_FILE) ? JSON.parse(readFileSync(PINS_FILE, 'utf8')) : {};
  const repin = argOf('--repin');
  const needsReview: string[] = [];
  for (const [id, keys] of Object.entries(report.references)) {
    const current = Object.fromEntries(keys.filter((k) => hashes.has(k)).map((k) => [k, hashes.get(k) as string]));
    if (!pins[id] || repin === 'all' || repin === id) {
      pins[id] = current;
      continue;
    }
    const changed = keys.filter((k) => pins[id][k] && pins[id][k] !== current[k]);
    const added = keys.filter((k) => !pins[id][k]);
    for (const k of added) pins[id][k] = current[k];
    if (changed.length) needsReview.push(id);
  }
  if (!CHECK) {
    mkdirSync(CONTENT, { recursive: true });
    writeFileSync(PINS_FILE, JSON.stringify(sortKeys(pins), null, 1) + '\n');
  }

  // ---- report
  const shown = report.issues;
  const byFile = new Map<string, typeof shown>();
  for (const i of shown) {
    const f = i.where.split(':')[0];
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f)?.push(i);
  }
  for (const [f, list] of byFile) {
    console.log(`\n${f}`);
    for (const i of list.slice(0, 60)) console.log(`  ${i.level === 'error' ? 'ERROR' : 'warn '} ${i.where.slice(f.length + 1)}: ${i.msg}`);
    if (list.length > 60) console.log(`  ... ${list.length - 60} more`);
  }
  console.log('\nStats:', JSON.stringify(report.stats));
  if (needsReview.length) console.log(`Needs review after game update (${needsReview.length}): ${needsReview.slice(0, 20).join(', ')}`);
  console.log(`${report.errors} errors, ${report.warnings} warnings`);

  if (report.errors > 0) process.exit(1);
  if (CHECK) {
    console.log('Check mode: nothing written.');
    return;
  }

  // ---- bundle
  const itemsMap: ContentBundle['items'] = {};
  for (const f of raw.items) for (const c of f.data) itemsMap[c.key] = { ...c, basedOnHash: pins[`item:${c.key}`]?.[c.key] ?? c.basedOnHash };
  const bundle: ContentBundle = {
    schema: 1,
    builtAt: new Date().toISOString(),
    gameVersion: game.meta.clientVersion,
    items: itemsMap,
    scenarios: raw.scenarios.flatMap((f) => f.data.map((s) => ({ ...s, pinned: pins[`scenario:${s.id}`] ?? {} }))),
    courses: raw.courses.map((f) => f.data),
    builds: raw.builds.map((f) => f.data),
    problems: raw.problems.flatMap((f) => f.data),
    needsReview,
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(bundle));
  console.log(`Bundle written: ${relative(ROOT, OUT)} (${Math.round(JSON.stringify(bundle).length / 1024)} KB)`);
}

function sortKeys<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b))) as T;
}

main();
