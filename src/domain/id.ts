/**
 * UUID v4. Uses the platform CSPRNG when there is one — Hermes does not always
 * expose crypto.randomUUID, so this degrades rather than crashing at startup.
 */
export function uuid(): string {
  const g = globalThis as { crypto?: Crypto };
  if (typeof g.crypto?.randomUUID === 'function') return g.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof g.crypto?.getRandomValues === 'function') {
    g.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex: string[] = [];
  for (let i = 0; i < 16; i++) hex.push(bytes[i].toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
