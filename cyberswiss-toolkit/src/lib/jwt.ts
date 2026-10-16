import { base64ToBytes, EncodingError, utf8Decode, utf8Encode } from "./encoding";

export type JsonObject = Record<string, unknown>;

export interface DecodedJwt {
  header: JsonObject;
  payload: JsonObject;
  signature: string;
  /** `header.payload` — the exact bytes covered by the signature. */
  signingInput: string;
  raw: { header: string; payload: string };
}

export class JwtError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JwtError";
  }
}

function decodeSegment(segment: string, name: string): JsonObject {
  if (segment.length === 0) throw new JwtError(`The ${name} segment is empty.`);
  let text: string;
  try {
    text = utf8Decode(base64ToBytes(segment));
  } catch (e) {
    const reason = e instanceof EncodingError ? e.message : "invalid Base64URL";
    throw new JwtError(`The ${name} segment is not valid Base64URL: ${reason}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JwtError(`The ${name} segment is not valid JSON.`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new JwtError(`The ${name} segment must be a JSON object.`);
  }
  return parsed as JsonObject;
}

export function decodeJwt(token: string): DecodedJwt {
  // Accept tokens pasted with a "Bearer " prefix or surrounding whitespace/quotes.
  const clean = token.trim().replace(/^Bearer\s+/i, "").replace(/^["']|["']$/g, "");
  if (!clean) throw new JwtError("Paste a JWT to decode.");
  const parts = clean.split(".");
  if (parts.length === 5) {
    throw new JwtError("This looks like an encrypted JWE (5 segments); only signed JWS tokens can be decoded.");
  }
  if (parts.length !== 3) {
    throw new JwtError(`A JWT must have 3 dot-separated segments, found ${parts.length}.`);
  }
  const [h, p, s] = parts as [string, string, string];
  return {
    header: decodeSegment(h, "header"),
    payload: decodeSegment(p, "payload"),
    signature: s,
    signingInput: `${h}.${p}`,
    raw: { header: h, payload: p },
  };
}

// ---------- Time-based claim inspection ----------

export type TokenStatus = "valid" | "expired" | "not-yet-valid" | "no-expiry";

export interface TimeClaim {
  claim: "exp" | "nbf" | "iat";
  label: string;
  seconds: number;
  date: Date;
}

export interface Inspection {
  status: TokenStatus;
  claims: TimeClaim[];
  /** Seconds until expiry (negative if already expired); null if no exp. */
  secondsToExpiry: number | null;
  /** Total lifetime iat→exp in seconds, when both are present. */
  lifetimeSeconds: number | null;
  /** 0–1 fraction of lifetime elapsed, when computable. */
  lifetimeElapsed: number | null;
  warnings: string[];
}

const CLAIM_LABELS = { exp: "Expires", nbf: "Not before", iat: "Issued at" } as const;

function numericClaim(payload: JsonObject, key: string, warnings: string[]): number | null {
  const v = payload[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "number" || !Number.isFinite(v)) {
    warnings.push(`Claim "${key}" should be a NumericDate (seconds since epoch), got ${JSON.stringify(v)}.`);
    return null;
  }
  // Millisecond timestamps are a common bug; flag them.
  if (v > 1e11) warnings.push(`Claim "${key}" looks like milliseconds rather than seconds.`);
  return v;
}

export function inspectJwt(decoded: DecodedJwt, nowMs: number = Date.now(), leewaySeconds = 0): Inspection {
  const warnings: string[] = [];
  const now = nowMs / 1000;
  const exp = numericClaim(decoded.payload, "exp", warnings);
  const nbf = numericClaim(decoded.payload, "nbf", warnings);
  const iat = numericClaim(decoded.payload, "iat", warnings);

  const claims: TimeClaim[] = [];
  for (const [claim, seconds] of [["iat", iat], ["nbf", nbf], ["exp", exp]] as const) {
    if (seconds !== null) claims.push({ claim, label: CLAIM_LABELS[claim], seconds, date: new Date(seconds * 1000) });
  }

  let status: TokenStatus;
  if (nbf !== null && now + leewaySeconds < nbf) status = "not-yet-valid";
  else if (exp !== null && now - leewaySeconds >= exp) status = "expired";
  else if (exp === null) status = "no-expiry";
  else status = "valid";

  if (iat !== null && iat > now + leewaySeconds) warnings.push("Issued-at (iat) is in the future — check clock skew.");
  if (exp !== null && iat !== null && exp <= iat) warnings.push("Expiry (exp) is not after issued-at (iat).");

  const alg = decoded.header.alg;
  if (typeof alg === "string" && alg.toLowerCase() === "none") {
    warnings.push('Header uses alg "none": the token is unsigned and must never be trusted.');
  } else if (typeof alg !== "string") {
    warnings.push('Header is missing the required "alg" parameter.');
  }
  if (exp === null) warnings.push("No expiry (exp) claim: this token never expires on its own.");

  const lifetimeSeconds = exp !== null && iat !== null && exp > iat ? exp - iat : null;
  const lifetimeElapsed =
    lifetimeSeconds !== null && iat !== null ? Math.min(1, Math.max(0, (now - iat) / lifetimeSeconds)) : null;

  return {
    status,
    claims,
    secondsToExpiry: exp !== null ? exp - now : null,
    lifetimeSeconds,
    lifetimeElapsed,
    warnings,
  };
}

/** Human-friendly relative duration, e.g. "3d 4h", "12m 5s". */
export function formatDuration(totalSeconds: number): string {
  let s = Math.floor(Math.abs(totalSeconds));
  const units: [string, number][] = [["y", 31_536_000], ["d", 86_400], ["h", 3_600], ["m", 60], ["s", 1]];
  const parts: string[] = [];
  for (const [label, size] of units) {
    if (s >= size) {
      parts.push(`${Math.floor(s / size)}${label}`);
      s %= size;
    }
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(" ") : "0s";
}

// ---------- Optional HMAC signature verification ----------

const HMAC_HASH: Record<string, string> = { HS256: "SHA-256", HS384: "SHA-384", HS512: "SHA-512" };

export function isHmacAlg(alg: unknown): alg is "HS256" | "HS384" | "HS512" {
  return typeof alg === "string" && alg in HMAC_HASH;
}

export async function verifyHmac(decoded: DecodedJwt, secret: Uint8Array): Promise<boolean> {
  const alg = decoded.header.alg;
  if (!isHmacAlg(alg)) throw new JwtError(`Signature verification only supports HS256/384/512 (token uses ${String(alg)}).`);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new JwtError("Web Crypto is unavailable in this context.");
  let sig: Uint8Array;
  try {
    sig = base64ToBytes(decoded.signature);
  } catch {
    throw new JwtError("Signature segment is not valid Base64URL.");
  }
  if (secret.length === 0) throw new JwtError("Enter the shared secret to verify the signature.");
  const key = await subtle.importKey("raw", secret as BufferSource, { name: "HMAC", hash: HMAC_HASH[alg]! }, false, [
    "verify",
  ]);
  // subtle.verify performs a constant-time comparison.
  return subtle.verify("HMAC", key, sig as BufferSource, utf8Encode(decoded.signingInput) as BufferSource);
}
