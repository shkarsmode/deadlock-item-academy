/**
 * Shareable training: a compact, URL-safe description of a practice set.
 * Contains only content ids (no personal data, no progress).
 */
export interface SharePayload {
  v: 1;
  title?: string;
  hero: string | null;
  scenarios?: string[];
  items?: string[];
  minutes?: number;
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(p: SharePayload): string {
  return toBase64Url(JSON.stringify(p));
}

export function decodeShare(code: string): SharePayload | null {
  try {
    const p = JSON.parse(fromBase64Url(code)) as SharePayload;
    if (p.v !== 1) return null;
    const ids = (x: unknown) => Array.isArray(x) && x.every((y) => typeof y === 'string' && y.length < 80);
    if (p.scenarios && !ids(p.scenarios)) return null;
    if (p.items && !ids(p.items)) return null;
    return { v: 1, title: typeof p.title === 'string' ? p.title.slice(0, 80) : undefined, hero: typeof p.hero === 'string' ? p.hero : null, scenarios: p.scenarios?.slice(0, 40), items: p.items?.slice(0, 60), minutes: typeof p.minutes === 'number' ? Math.min(30, Math.max(2, p.minutes)) : undefined };
  } catch {
    return null;
  }
}
