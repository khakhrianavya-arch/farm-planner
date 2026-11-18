// Family links: the farm's private code lives after # in the address,
// e.g. https://…/farm-planner/#farm-k7Qx92mZpL4wR8tV3nB6 — pure code, no network.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

export function makeCode(len = 22){
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return 'farm-' + Array.from(bytes, b => ALPHABET[b % ALPHABET.length]).join('');
}

// Accepts a whole link, a "#farm-…" hash, or just the code. Returns the code or null.
export function parseCode(text){
  const m = String(text || '').match(/farm-[A-Za-z0-9]{16,64}/);
  return m ? m[0] : null;
}
