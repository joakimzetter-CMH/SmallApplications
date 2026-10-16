import { describe, expect, it } from "vitest";
import { digest, digestAll, digestsMatch } from "./hash";

describe("hash", () => {
  it("matches NIST 'abc' test vectors", async () => {
    expect((await digest("SHA-256", "abc")).hex).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect((await digest("SHA-512", "abc")).hex).toBe(
      "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a" +
        "2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    );
  });

  it("hashes the empty string and raw bytes", async () => {
    expect((await digest("SHA-256", "")).hex).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const results = await digestAll(new Uint8Array([0x61, 0x62, 0x63]));
    expect(results.map((r) => r.bits)).toEqual([256, 384, 512, 160]);
  });

  it("compares digests case-insensitively", () => {
    expect(digestsMatch("ABcd", " abcd ")).toBe(true);
    expect(digestsMatch("abcd", "abce")).toBe(false);
    expect(digestsMatch("", "")).toBe(false);
  });
});
