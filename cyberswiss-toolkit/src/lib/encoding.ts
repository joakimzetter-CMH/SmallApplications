/**
 * Byte-level encoding helpers. Everything round-trips through Uint8Array so
 * text is always handled as UTF-8 (unlike raw btoa/atob, which break on
 * non-Latin-1 input).
 */

const textEncoder = new TextEncoder();
// fatal: true makes invalid UTF-8 throw instead of silently inserting U+FFFD.
const strictDecoder = new TextDecoder("utf-8", { fatal: true });

export class EncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EncodingError";
  }
}

export function utf8Encode(text: string): Uint8Array {
  return textEncoder.encode(text);
}

export function utf8Decode(bytes: Uint8Array): string {
  try {
    return strictDecoder.decode(bytes);
  } catch {
    throw new EncodingError("Decoded bytes are not valid UTF-8 text.");
  }
}

// ---------- Hex ----------

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  // Tolerate common formatting: whitespace, colons, and a leading 0x.
  const clean = hex.trim().replace(/^0x/i, "").replace(/[\s:]/g, "");
  if (clean.length % 2 !== 0) {
    throw new EncodingError("Hex input must contain an even number of digits.");
  }
  if (!/^[0-9a-fA-F]*$/.test(clean)) {
    throw new EncodingError("Hex input contains non-hexadecimal characters.");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

// ---------- Base64 / Base64URL ----------

export function bytesToBase64(bytes: Uint8Array): string {
  // Chunk to avoid "Maximum call stack size exceeded" on large inputs.
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Decodes standard or URL-safe Base64, with or without padding. */
export function base64ToBytes(input: string): Uint8Array {
  let clean = input.replace(/\s/g, "").replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
    throw new EncodingError("Base64 input contains invalid characters.");
  }
  clean = clean.replace(/=+$/, "");
  if (clean.length % 4 === 1) {
    throw new EncodingError("Base64 input has an invalid length.");
  }
  clean += "=".repeat((4 - (clean.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(clean);
  } catch {
    throw new EncodingError("Base64 input could not be decoded.");
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ---------- Generic conversion used by the Encoder panel ----------

export type Format = "text" | "base64" | "base64url" | "hex";

export const FORMAT_LABELS: Record<Format, string> = {
  text: "Plain text (UTF-8)",
  base64: "Base64",
  base64url: "Base64URL",
  hex: "Hex",
};

export function decodeFrom(format: Format, input: string): Uint8Array {
  switch (format) {
    case "text":
      return utf8Encode(input);
    case "base64":
    case "base64url":
      return base64ToBytes(input);
    case "hex":
      return hexToBytes(input);
  }
}

export function encodeTo(format: Format, bytes: Uint8Array): string {
  switch (format) {
    case "text":
      return utf8Decode(bytes);
    case "base64":
      return bytesToBase64(bytes);
    case "base64url":
      return bytesToBase64Url(bytes);
    case "hex":
      return bytesToHex(bytes);
  }
}

export function convert(input: string, from: Format, to: Format): string {
  return encodeTo(to, decodeFrom(from, input));
}
