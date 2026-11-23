/**
 * Which words in learning texts link to the glossary. Hand-picked on purpose: only jargon and
 * game terms a beginner may not know, never everyday words, and never words that are part of
 * item names ("Reactive Barrier", "Compress Cooldown", "Mystic Slow"), so English patterns are
 * limited to multi-word stats and map objects. Russian patterns list the common word endings.
 * Each entry is a regex fragment matched case-insensitively as a whole word.
 */
export const TERM_PATTERNS: Record<string, string[]> = {
  // items and shop
  imbue: ['imbue[ds]?'],
  'active-item': ['активк(?:а|и|у|е|ой|ам|ами|ах)', 'active items?'],
  'passive-item': ['пассивк(?:а|и|у|е|ой|ам|ами|ах)', 'passive items?'],
  component: ['компонент(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  'investment-bonus': ['бонус(?:а|у|ом|е|ы|ов)? вложений', 'investment bonus(?:es)?'],
  quickbuy: ['quick ?buy', 'быстр(?:ая|ой|ую) покупк(?:а|и|у|е|ой)'],
  'street-brawl': ['street brawl'],
  'item-slots': ['слот(?:а|у|ом|е|ы|ов|ам|ами|ах)? предметов'],
  // stats
  'spirit-power': ['spirit power', 'спиритическ(?:ая|ой|ую|ою) мощ(?:ь|и|ью)', 'духовн(?:ая|ой|ую|ою) сил(?:а|ы|у|ой|е)'],
  scaling: ['скейлинг(?:а|у|ом|е)?', 'spirit scaling'],
  'spirit-damage': ['spirit damage', 'спирит-урон(?:а|у|ом|е)?', 'спиритическ(?:ий|ого|ому|им|ом) урон(?:а|у|ом|е)?'],
  'weapon-damage': ['weapon damage'],
  'fire-rate': ['fire rate'],
  headshot: ['хедшот(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  'bullet-resist': ['bullet resist(?:ance)?(?!\\s+shredder)','пулев(?:ая|ой|ую|ою) брон(?:я|и|ю|ей)', 'сопротивляемост(?:ь|и|ью) пулям'],
  'spirit-resist': ['spirit resist(?:ance)?', 'спирит-брон(?:я|и|ю|ей)', 'сопротивляемост(?:ь|и|ью) спиритизму'],
  'resist-shred': ['шред(?:а|у|ом|е|ы|ов)?'],
  lifesteal: ['вампиризм(?:а|у|ом|е)?', 'лайфстил(?:а|у|ом|е)?'],
  barrier: ['барьер(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  regen: ['реген(?:а|у|ом|е)?'],
  cooldown: ['кулдаун(?:а|у|ом|е|ы|ов)?', 'кд'],
  stamina: ['выносливост(?:ь|и|ью)', 'стамин(?:а|ы|у|ой)'],
  // combat
  cc: ['cc', 'crowd control', 'контрол(?:ь|я|ю|ем|е)'],
  stun: ['оглушени(?:е|я|ю|ем|и|й)', 'стан(?:а|у|ом|е|ы|ов)?'],
  silence: ['безмолви(?:е|я|ю|ем|и)', 'сайленс(?:а|у|ом|е|ы)?'],
  sleep: ['усыплени(?:е|я|ю|ем)', 'слип(?:а|у|ом)?'],
  disarm: ['обезоруживани(?:е|я|ю|ем)', 'дизарм(?:а|у|ом|е)?'],
  immobilize: ['обездвиживани(?:е|я|ю|ем)', 'рут(?:а|у|ом|ы)?'],
  slow: ['замедлени(?:е|я|ю|ем|и|й|ям|ями|ях)', 'слоу'],
  debuff: ['дебафф(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  buff: ['бафф(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  cleanse: ['очищени(?:е|я|ю|ем)', 'диспел(?:а|у|ом|е)?'],
  'anti-heal': ['антихил(?:а|у|ом|е)?', 'anti-?heal(?:ing)?', 'снижени(?:е|я|ю|ем) лечения'],
  burst: ['бурст(?:а|у|ом|е)?'],
  dps: ['dps', 'дпс'],
  dot: ['dot'],
  parry: ['парировани(?:е|я|ю|ем)', 'парри', 'parry'],
  ultimate: ['ульт(?:а|ы|е|у|ой|ом|ов|ам|ами|ах)?', 'ультимейт(?:а|у|ом|е|ы|ов)?'],
  kite: ['кайт(?:а|у|ом|е|ить|ит|ят|ишь)?'],
  dive: ['дайв(?:а|у|ом|е|ить|ит|ят)?'],
  poke: ['поук(?:а|у|ом|е)?'],
  trade: ['размен(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  engage: ['энгейдж(?:а|у|ом|е)?', 'инициаци(?:я|и|ю|ей)'],
  // roles and playstyle
  carry: ['керри', 'кэрри'],
  picker: ['пикер(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  support: ['саппорт(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  tank: ['танк(?:а|у|ом|е|и|ов|ам|ами|ах)?'],
  frontline: ['фронтлайн(?:а|у|ом|е)?', 'frontline'],
  initiator: ['инициатор(?:а|у|ом|е|ы|ов)?'],
  ganker: ['ганк(?:а|у|ом|е|и|ов|ер|ера|еры|ать|ают)?'],
  'split-push': ['сплит-?пуш(?:а|у|ем|е)?', 'split[- ]push(?:ing)?'],
  'power-spike': ['пик(?:а|у|ом|е|и)? силы', 'спайк(?:а|у|ом|е)?', 'power spikes?'],
  'scaling-hero': ['лейт(?:а|у|ом|е)?', 'лейтов(?:ый|ого|ому|ым|ом|ая|ой|ые|ых)'],
  snowball: ['сноуболл(?:а|у|ом|е)?', 'снежн(?:ый|ого|ым) ком(?:а|ом)?'],
  // souls and farm
  'last-hit': ['добивани(?:е|я|ю|ем|и|й|ям)', 'ласт-?хит(?:а|у|ом|ы|ов)?', 'last hits?'],
  deny: ['денай(?:а|у|ем|е|и|ить|ят)?', 'den(?:y|ies|ied)'],
  farm: ['фарм(?:а|у|ом|е|ить|ит|ят|ишь)?'],
  jungle: ['нейтрал(?:ы|ов|ам|ами|ах|а)', 'haunts?'],
  'net-worth': ['net ?worth', 'нетворс(?:а|у|ом|е)?'],
  'ability-points': ['очк(?:о|и|ов|ами|ах) умений', 'ability points?'],
  // map
  lane: ['лайн(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  laning: ['лайнинг(?:а|у|ом|е)?', 'laning'],
  troopers: ['крип(?:а|у|ом|е|ы|ов|ам|ами|ах)?', 'troopers?'],
  'base-guardian': ['base guardians?'],
  guardian: ['guardians?(?!\\s+ward)'],
  walker: ['(?<!veil\\s)walkers?', 'шагоход(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
  shrine: ['shrines?', 'святилищ(?:е|а|у|ем|ами)?'],
  patron: ['patron'],
  'mid-boss': ['mid-?boss', 'мид-?босс(?:а|у|ом|е)?'],
  rejuvenator: ['rejuvenator', 'реджув(?:а|у|ом|е)?'],
  urn: ['soul urn', 'урн(?:а|ы|у|ой|е)'],
  zipline: ['ziplines?', 'зиплайн(?:а|у|ом|е|ы)?'],
  objective: ['обжектив(?:а|у|ом|е|ы|ов|ам|ами|ах)?'],
};

export interface TermMatcher {
  re: RegExp;
  /** Term id for each capture group, in order. */
  ids: string[];
}

export interface TermSegment {
  t: string;
  /** Glossary id when this piece links to a term. */
  term?: string;
}

/** One combined regex for the terms that exist in the glossary (longer patterns win). */
export function buildTermMatcher(known: ReadonlySet<string>, patterns: Record<string, string[]> = TERM_PATTERNS): TermMatcher | null {
  const alts: { id: string; src: string }[] = [];
  for (const [id, list] of Object.entries(patterns)) {
    if (!known.has(id)) continue;
    for (const src of list) alts.push({ id, src });
  }
  if (!alts.length) return null;
  alts.sort((a, b) => b.src.length - a.src.length);
  const body = alts.map((a) => `(${a.src})`).join('|');
  return { re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'giu'), ids: alts.map((a) => a.id) };
}

/**
 * Splits text into plain pieces and term links. Each term links once per call (`seen` is shared
 * between the pieces of one text so a paragraph does not turn into a row of underlines).
 */
export function splitByTerms(text: string, m: TermMatcher | null, seen: Set<string>): TermSegment[] {
  if (!m || !text) return text ? [{ t: text }] : [];
  const out: TermSegment[] = [];
  let last = 0;
  m.re.lastIndex = 0;
  for (let hit = m.re.exec(text); hit; hit = m.re.exec(text)) {
    const g = hit.findIndex((v, i) => i > 0 && v !== undefined);
    const id = g > 0 ? m.ids[g - 1] : undefined;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (hit.index > last) out.push({ t: text.slice(last, hit.index) });
    out.push({ t: hit[0], term: id });
    last = hit.index + hit[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}
