import { describe, expect, it } from "vitest";
import { AMBIGUOUS, CHARSETS, generateApiKey, generatePassword, type PasswordOptions } from "./generator";
import { randomInt } from "./random";

const all = { lower: true, upper: true, digits: true, symbols: true };
const base: PasswordOptions = { length: 20, classes: all, excludeAmbiguous: false, requireEachClass: true };

describe("generatePassword", () => {
  it("respects length and includes every selected class", () => {
    for (let i = 0; i < 200; i++) {
      const { value } = generatePassword({ ...base, length: 4 });
      expect(Array.from(value)).toHaveLength(4);
      for (const set of Object.values(CHARSETS)) expect([...value].some((c) => set.includes(c))).toBe(true);
    }
  });

  it("reports exact generator entropy", () => {
    const r = generatePassword({ ...base, length: 16, classes: { ...all, symbols: false } });
    expect(r.poolSize).toBe(62);
    expect(r.entropyBits).toBeCloseTo(16 * Math.log2(62));
  });

  it("excludes ambiguous characters", () => {
    for (let i = 0; i < 50; i++) {
      const { value } = generatePassword({ ...base, length: 64, excludeAmbiguous: true });
      expect([...value].some((c) => AMBIGUOUS.includes(c))).toBe(false);
    }
  });

  it("validates options", () => {
    expect(() => generatePassword({ ...base, length: 3 })).toThrow(RangeError);
    expect(() => generatePassword({ ...base, classes: { lower: false, upper: false, digits: false, symbols: false } })).toThrow(
      /at least one/,
    );
  });
});

describe("generateApiKey", () => {
  it("generates hex / base64url / base62 keys with a prefix", () => {
    expect(generateApiKey({ format: "hex", bytes: 32, prefix: "sk_live_" }).value).toMatch(/^sk_live_[0-9a-f]{64}$/);
    expect(generateApiKey({ format: "base64url", bytes: 32, prefix: "" }).value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const b62 = generateApiKey({ format: "base62", bytes: 32, prefix: "" });
    expect(b62.value).toMatch(/^[A-Za-z0-9]{43}$/);
    expect(b62.entropyBits).toBeGreaterThanOrEqual(256);
  });

  it("generates RFC 4122 v4 UUIDs", () => {
    const { value, entropyBits } = generateApiKey({ format: "uuid", bytes: 0, prefix: "" });
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(entropyBits).toBe(122);
  });

  it("rejects bad prefixes and sizes", () => {
    expect(() => generateApiKey({ format: "hex", bytes: 32, prefix: "bad prefix" })).toThrow(RangeError);
    expect(() => generateApiKey({ format: "hex", bytes: 4, prefix: "" })).toThrow(RangeError);
  });
});

describe("randomInt", () => {
  it("stays in range and is roughly uniform", () => {
    const counts = new Array(6).fill(0);
    for (let i = 0; i < 60_000; i++) counts[randomInt(6)]++;
    for (const c of counts) expect(c).toBeGreaterThan(9_000); // expected 10k each
  });
});
