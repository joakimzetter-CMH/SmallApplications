import { describe, expect, it } from "vitest";
import { bytesToBase64Url, utf8Encode } from "./encoding";
import { decodeJwt, formatDuration, inspectJwt, JwtError, verifyHmac } from "./jwt";

// The canonical jwt.io example, signed with HS256 and "your-256-bit-secret".
const JWT_IO =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const seg = (o: object) => bytesToBase64Url(utf8Encode(JSON.stringify(o)));
const unsigned = (payload: object, header: object = { alg: "HS256", typ: "JWT" }) =>
  `${seg(header)}.${seg(payload)}.sig`;

describe("decodeJwt", () => {
  it("decodes header and payload", () => {
    const d = decodeJwt(`Bearer ${JWT_IO}`);
    expect(d.header).toEqual({ alg: "HS256", typ: "JWT" });
    expect(d.payload).toMatchObject({ sub: "1234567890", name: "John Doe", iat: 1516239022 });
  });

  it("handles UTF-8 claims", () => {
    expect(decodeJwt(unsigned({ name: "Zürich ✓" })).payload.name).toBe("Zürich ✓");
  });

  it.each([
    ["", /Paste a JWT/],
    ["abc.def", /3 dot-separated/],
    ["a.b.c.d.e", /JWE/],
    ["!!!.e30.x", /header segment is not valid Base64URL/],
    [`${bytesToBase64Url(utf8Encode("nope"))}.e30.x`, /header segment is not valid JSON/],
    [`${seg([1, 2])}.e30.x`, /must be a JSON object/],
  ])("rejects malformed token %#", (token, msg) => {
    expect(() => decodeJwt(token)).toThrow(JwtError);
    expect(() => decodeJwt(token)).toThrow(msg);
  });
});

describe("inspectJwt", () => {
  const now = 1_700_000_000_000;
  const nowS = now / 1000;

  it("reports a valid token with lifetime progress", () => {
    const r = inspectJwt(decodeJwt(unsigned({ iat: nowS - 100, exp: nowS + 300 })), now);
    expect(r.status).toBe("valid");
    expect(r.secondsToExpiry).toBe(300);
    expect(r.lifetimeSeconds).toBe(400);
    expect(r.lifetimeElapsed).toBeCloseTo(0.25);
  });

  it("detects expired, not-yet-valid and no-expiry tokens", () => {
    expect(inspectJwt(decodeJwt(unsigned({ exp: nowS - 1 })), now).status).toBe("expired");
    expect(inspectJwt(decodeJwt(unsigned({ exp: nowS })), now).status).toBe("expired");
    expect(inspectJwt(decodeJwt(unsigned({ nbf: nowS + 60, exp: nowS + 600 })), now).status).toBe("not-yet-valid");
    const noExp = inspectJwt(decodeJwt(unsigned({ sub: "x" })), now);
    expect(noExp.status).toBe("no-expiry");
    expect(noExp.warnings.join(" ")).toMatch(/never expires/);
  });

  it("applies clock-skew leeway", () => {
    expect(inspectJwt(decodeJwt(unsigned({ exp: nowS - 10 })), now, 30).status).toBe("valid");
  });

  it("warns about alg none, millisecond timestamps and non-numeric claims", () => {
    const r = inspectJwt(decodeJwt(unsigned({ exp: now, iat: "yesterday" }, { alg: "none" })), now);
    const w = r.warnings.join(" ");
    expect(w).toMatch(/alg "none"/);
    expect(w).toMatch(/milliseconds/);
    expect(w).toMatch(/"iat" should be a NumericDate/);
  });
});

describe("verifyHmac", () => {
  it("verifies the jwt.io example with the right secret only", async () => {
    const d = decodeJwt(JWT_IO);
    expect(await verifyHmac(d, utf8Encode("your-256-bit-secret"))).toBe(true);
    expect(await verifyHmac(d, utf8Encode("wrong-secret"))).toBe(false);
  });

  it("refuses non-HMAC algorithms and empty secrets", async () => {
    await expect(verifyHmac(decodeJwt(unsigned({}, { alg: "RS256" })), utf8Encode("k"))).rejects.toThrow(/HS256/);
    await expect(verifyHmac(decodeJwt(JWT_IO), new Uint8Array())).rejects.toThrow(/secret/);
  });
});

describe("formatDuration", () => {
  it("formats the two most significant units", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(65)).toBe("1m 5s");
    expect(formatDuration(-90061)).toBe("1d 1h");
  });
});
