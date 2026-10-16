/** Cryptographically secure random primitives backed by crypto.getRandomValues. */

function getCrypto(): Crypto {
  const c = globalThis.crypto;
  if (!c?.getRandomValues) throw new Error("A cryptographically secure random source is unavailable.");
  return c;
}

export function randomBytes(n: number): Uint8Array {
  if (!Number.isInteger(n) || n < 0) throw new RangeError("Byte count must be a non-negative integer.");
  const out = new Uint8Array(n);
  // getRandomValues is limited to 65536 bytes per call.
  for (let i = 0; i < n; i += 65536) getCrypto().getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
  return out;
}

/**
 * Uniform integer in [0, max) using rejection sampling, so there is no modulo
 * bias (e.g. `byte % 62` would favour the first 8 characters).
 */
export function randomInt(max: number): number {
  if (!Number.isInteger(max) || max <= 0 || max > 2 ** 32) throw new RangeError("max must be an integer in (0, 2^32].");
  const limit = Math.floor(2 ** 32 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    getCrypto().getRandomValues(buf);
    const v = buf[0]!;
    if (v < limit) return v % max;
  }
}

export function randomString(alphabet: string, length: number): string {
  const chars = Array.from(alphabet);
  if (chars.length === 0) throw new RangeError("Alphabet must not be empty.");
  let out = "";
  for (let i = 0; i < length; i++) out += chars[randomInt(chars.length)];
  return out;
}
