import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, bytesToBase64Url, convert, EncodingError, hexToBytes, utf8Decode } from "./encoding";

describe("encoding", () => {
  it("round-trips UTF-8 text through Base64 (including non-Latin-1)", () => {
    const text = "Grüezi 🇨🇭 — 日本";
    const b64 = convert(text, "text", "base64");
    expect(b64).toBe("R3LDvGV6aSDwn4eo8J+HrSDigJQg5pel5pys");
    expect(convert(b64, "base64", "text")).toBe(text);
  });

  it("produces RFC 4648 test vectors", () => {
    const vectors: [string, string][] = [["", ""], ["f", "Zg=="], ["fo", "Zm8="], ["foo", "Zm9v"], ["foobar", "Zm9vYmFy"]];
    for (const [plain, b64] of vectors) expect(convert(plain, "text", "base64")).toBe(b64);
    expect(convert("foobar", "text", "hex")).toBe("666f6f626172");
  });

  it("emits and accepts unpadded URL-safe Base64", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe]);
    expect(bytesToBase64(bytes)).toBe("+//+");
    expect(bytesToBase64Url(bytes)).toBe("-__-");
    expect([...base64ToBytes("-__-")]).toEqual([0xfb, 0xff, 0xfe]);
    expect([...base64ToBytes("Zm8")]).toEqual([0x66, 0x6f]);
  });

  it("tolerates hex formatting and rejects bad hex", () => {
    expect([...hexToBytes("0xDE:AD be ef")]).toEqual([0xde, 0xad, 0xbe, 0xef]);
    expect(() => hexToBytes("abc")).toThrow(EncodingError);
    expect(() => hexToBytes("zz")).toThrow(EncodingError);
  });

  it("rejects malformed Base64", () => {
    expect(() => base64ToBytes("ab$c")).toThrow(EncodingError);
    expect(() => base64ToBytes("abcde")).toThrow(EncodingError);
  });

  it("refuses to render invalid UTF-8 as text", () => {
    expect(() => utf8Decode(new Uint8Array([0xff, 0xfe]))).toThrow(EncodingError);
    expect(() => convert("ff", "hex", "text")).toThrow(EncodingError);
  });
});
