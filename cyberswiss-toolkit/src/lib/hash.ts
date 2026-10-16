import { bytesToBase64, bytesToHex, utf8Encode } from "./encoding";

export type HashAlgorithm = "SHA-1" | "SHA-256" | "SHA-384" | "SHA-512";

export const HASH_ALGORITHMS: readonly HashAlgorithm[] = ["SHA-256", "SHA-384", "SHA-512", "SHA-1"];

export interface DigestResult {
  algorithm: HashAlgorithm;
  hex: string;
  base64: string;
  bits: number;
}

function getSubtle(): SubtleCrypto {
  // crypto.subtle is only exposed in secure contexts (HTTPS or localhost).
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto is unavailable. Serve the app over HTTPS or from localhost.");
  }
  return subtle;
}

export async function digest(algorithm: HashAlgorithm, data: Uint8Array | string): Promise<DigestResult> {
  const bytes = typeof data === "string" ? utf8Encode(data) : data;
  const buf = new Uint8Array(await getSubtle().digest(algorithm, bytes as BufferSource));
  return { algorithm, hex: bytesToHex(buf), base64: bytesToBase64(buf), bits: buf.length * 8 };
}

export async function digestAll(
  data: Uint8Array | string,
  algorithms: readonly HashAlgorithm[] = HASH_ALGORITHMS,
): Promise<DigestResult[]> {
  return Promise.all(algorithms.map((a) => digest(a, data)));
}

/** Constant-time-ish comparison of two hex digests (case-insensitive, whitespace tolerant). */
export function digestsMatch(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x.length !== y.length || x.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
