/**
 * Controlled vocabularies for learning content.
 * The content validator rejects any tag that is not listed here, so authors cannot invent
 * ad-hoc categories. No imports: Node loads this file directly in scripts.
 */

/** What job an item does for its owner. */
export const ITEM_ROLES = [
  // weapon damage
  'weapon-dps',
  'weapon-burst',
  'headshot',
  'fire-rate',
  'ammo',
  'reload',
  'bullet-velocity',
  'long-range',
  'close-range',
  'melee',
  'proc-on-hit',
  // spirit / abilities
  'spirit-power',
  'spirit-burst',
  'spirit-dps',
  'cooldown',
  'charges',
  'ability-range',
  'ability-duration',
  'imbue',
  'ultimate',
  // enemy debuffs
  'anti-heal',
  'bullet-resist-shred',
  'spirit-resist-shred',
  'damage-amp',
  'slow',
  'stun',
  'silence',
  'disarm',
  'immobilize',
  'curse',
  'mobility-denial',
  'reveal',
  'fire-rate-slow',
  // defense
  'bullet-resist',
  'spirit-resist',
  'melee-resist',
  'max-health',
  'regen',
  'barrier',
  'bullet-lifesteal',
  'spirit-lifesteal',
  'self-heal',
  'ally-heal',
  'cleanse',
  'cc-immunity',
  'debuff-resist',
  'invulnerability',
  'anti-burst',
  'escape',
  'return-damage',
  // mobility
  'move-speed',
  'sprint',
  'dash',
  'stamina',
  'jump',
  'teleport',
  'stealth',
  // economy / team
  'farm',
  'economy',
  'team-buff',
  'aura',
  'objective',
] as const;

/** Threats and situations a player has to react to (problem side of a decision). */
export const THREATS = [
  'enemy-spirit-burst',
  'enemy-spirit-dps',
  'enemy-gun-dps',
  'enemy-burst-combo',
  'enemy-melee',
  'enemy-dot',
  'enemy-healing',
  'enemy-lifesteal',
  'enemy-barriers',
  'enemy-tanky',
  'enemy-stun',
  'enemy-silence',
  'enemy-immobilize',
  'enemy-sleep',
  'enemy-disarm',
  'enemy-pull',
  'enemy-slow',
  'enemy-curse',
  'enemy-debuffs',
  'enemy-high-mobility',
  'enemy-dive',
  'enemy-stealth',
  'enemy-long-range',
  'enemy-channel-ult',
  'enemy-summons',
  'enemy-anti-heal',
  'you-die-fast',
  'you-get-caught',
  'you-lose-lane',
  'you-win-lane',
  'you-lack-damage',
  'you-cant-catch',
  'you-get-kited',
  'you-ahead',
  'you-behind',
  'you-low-souls',
  'you-slots-full',
  'you-out-of-ammo',
  'team-lacks-cc',
  'team-lacks-frontline',
  'team-lacks-damage',
  'teamfight',
  'objective-pressure',
  'split-push',
] as const;

/** Knowledge dimensions tracked separately for every item (see learning engine). */
export const DIMENSIONS = [
  'icon',
  'effect',
  'mechanics',
  'situation',
  'counter',
  'synergy',
  'active',
  'build',
] as const;

export const PHASES = ['laning', 'early-mid', 'mid', 'late'] as const;

/**
 * Claim status - shown to the learner next to every statement.
 * data: directly from official client data. expert: situational recommendation.
 * stat: statistical pattern (correlation, not proof). unverified: plausible, needs checking.
 */
export const CLAIM_STATUSES = ['data', 'expert', 'stat', 'unverified'] as const;

export const SCENARIO_KINDS = ['buy', 'diagnose-buy', 'active-timing', 'imbue', 'surgery', 'sell'] as const;

export const VERDICTS = ['best', 'good', 'ok', 'weak', 'bad'] as const;

/** Score bands that a verdict must match (inclusive lower bound). */
export const VERDICT_MIN_SCORE: Record<(typeof VERDICTS)[number], number> = {
  best: 80,
  good: 60,
  ok: 40,
  weak: 20,
  bad: 0,
};

export const CONTENT_STATUSES = ['expert', 'needs-review'] as const;

/** Sections of the glossary page. */
export const GLOSSARY_CATEGORIES = ['items', 'stats', 'combat', 'roles', 'economy', 'map'] as const;

/** Characters the project never uses in authored text (style rule). */
export const FORBIDDEN_CHARS = ['\u2014', '\u2013'];

/**
 * Item names from older Deadlock versions (renamed or removed). Authored text must not use
 * them unless the name exists again in current game data (checked by the validator).
 */
export const OUTDATED_ITEM_NAMES = [
  'Mystic Reach',
  'Improved Cooldown',
  'Ammo Scavenger',
  'Hollow Point Ward',
  'Soul Shredder Bullets',
  'Pristine Emblem',
  'Improved Bullet Armor',
  'Improved Spirit Armor',
  'Superior Stamina',
  'Debuff Remover',
  'Improved Burst',
  'Improved Reach',
  'Enduring Spirit',
  'Combat Barrier',
  'Withering Whip',
  'Medic Bullets',
  'Basic Magazine',
  "Enchanter's Barrier",
  'Bullet Armor',
  'Spirit Armor',
  'Superior Spirit',
];
