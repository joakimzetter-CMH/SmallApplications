import { bytesToBase64Url, bytesToHex } from "./encoding";
import { randomBytes, randomString } from "./random";

export const CHARSETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.<>/?~",
} as const;

export type CharClass = keyof typeof CHARSETS;

/** Characters that are easy to confuse visually (0/O, 1/l/I, etc). */
export const AMBIGUOUS = "0O1lI|`'\"";

export interface PasswordOptions {
  length: number;
  classes: Record<CharClass, boolean>;
  excludeAmbiguous: boolean;
  /** Guarantee at least one character from every selected class. */
  requireEachClass: boolean;
}

export const MIN_PASSWORD_LENGTH = 4;
export const MAX_PASSWORD_LENGTH = 256;

export function buildClassSets(opts: Pick<PasswordOptions, "classes" | "excludeAmbiguous">): string[] {
  return (Object.keys(CHARSETS) as CharClass[])
    .filter((c) => opts.classes[c])
    .map((c) => (opts.excludeAmbiguous ? [...CHARSETS[c]].filter((ch) => !AMBIGUOUS.includes(ch)).join("") : CHARSETS[c]))
    .filter((s) => s.length > 0);
}

export interface GeneratedSecret {
  value: string;
  /** Entropy in bits of the generation process (not a heuristic estimate). */
  entropyBits: number;
  poolSize: number;
}

export function generatePassword(opts: PasswordOptions): GeneratedSecret {
  const { length } = opts;
  if (!Number.isInteger(length) || length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH) {
    throw new RangeError(`Length must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH}.`);
  }
  const sets = buildClassSets(opts);
  if (sets.length === 0) throw new RangeError("Select at least one character set.");
  if (opts.requireEachClass && sets.length > length) {
    throw new RangeError("Length is too short to include every selected character set.");
  }
  const pool = sets.join("");

  // Rejection sampling keeps the output uniform over all passwords that satisfy
  // the class constraint (forcing characters into fixed slots would not).
  for (let attempt = 0; attempt < 10_000; attempt++) {
    const value = randomString(pool, length);
    if (!opts.requireEachClass || sets.every((s) => [...value].some((ch) => s.includes(ch)))) {
      return { value, entropyBits: length * Math.log2(pool.length), poolSize: pool.length };
    }
  }
  // Practically unreachable for valid inputs (min success probability is ~9% at length 4 with all classes).
  throw new Error("Could not satisfy character-set requirements; try a longer length.");
}

// ---------- API keys / tokens ----------

export type ApiKeyFormat = "hex" | "base64url" | "base62" | "uuid";

export const API_KEY_FORMATS: Record<ApiKeyFormat, string> = {
  base62: "Alphanumeric (Base62)",
  base64url: "Base64URL",
  hex: "Hex",
  uuid: "UUID v4",
};

const BASE62 = CHARSETS.digits + CHARSETS.upper + CHARSETS.lower;

export interface ApiKeyOptions {
  format: ApiKeyFormat;
  /** Random bytes of entropy (ignored for UUID). */
  bytes: number;
  /** Optional identifying prefix like "sk_live_". */
  prefix: string;
}

export const MIN_KEY_BYTES = 8;
export const MAX_KEY_BYTES = 128;

export function generateApiKey(opts: ApiKeyOptions): GeneratedSecret {
  const prefix = opts.prefix.trim();
  if (prefix && !/^[A-Za-z0-9_\-.]{1,32}$/.test(prefix)) {
    throw new RangeError("Prefix may only contain letters, digits, '_', '-' or '.', up to 32 characters.");
  }
  if (opts.format === "uuid") {
    const b = randomBytes(16);
    b[6] = (b[6]! & 0x0f) | 0x40; // version 4
    b[8] = (b[8]! & 0x3f) | 0x80; // RFC 4122 variant
    const h = bytesToHex(b);
    const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
    return { value: prefix + uuid, entropyBits: 122, poolSize: 16 };
  }
  const n = opts.bytes;
  if (!Number.isInteger(n) || n < MIN_KEY_BYTES || n > MAX_KEY_BYTES) {
    throw new RangeError(`Key size must be between ${MIN_KEY_BYTES} and ${MAX_KEY_BYTES} bytes.`);
  }
  switch (opts.format) {
    case "hex":
      return { value: prefix + bytesToHex(randomBytes(n)), entropyBits: n * 8, poolSize: 16 };
    case "base64url":
      return { value: prefix + bytesToBase64Url(randomBytes(n)), entropyBits: n * 8, poolSize: 64 };
    case "base62": {
      // Enough base62 characters to carry at least n*8 bits.
      const len = Math.ceil((n * 8) / Math.log2(62));
      return { value: prefix + randomString(BASE62, len), entropyBits: len * Math.log2(62), poolSize: 62 };
    }
  }
}
