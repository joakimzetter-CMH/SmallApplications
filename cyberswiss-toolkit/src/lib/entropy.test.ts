import { describe, expect, it } from "vitest";
import { analyzePassword, formatCrackTime, scoreBits } from "./entropy";

describe("scoreBits", () => {
  it("maps bits to levels", () => {
    expect(scoreBits(0).label).toBe("Very weak");
    expect(scoreBits(30).label).toBe("Weak");
    expect(scoreBits(50).label).toBe("Fair");
    expect(scoreBits(70).label).toBe("Strong");
    expect(scoreBits(100).label).toBe("Very strong");
    expect(scoreBits(256)).toMatchObject({ level: 5, label: "Excellent" });
  });
});

describe("formatCrackTime", () => {
  it("formats durations", () => {
    expect(formatCrackTime(0.5)).toBe("instant");
    expect(formatCrackTime(1)).toBe("1 second");
    expect(formatCrackTime(7200)).toBe("2 hours");
    expect(formatCrackTime(Infinity)).toMatch(/universe/);
  });
});

describe("analyzePassword", () => {
  it("handles empty input", () => {
    expect(analyzePassword("")).toMatchObject({ bits: 0, level: 0 });
  });

  it("crushes common and leet-speak passwords", () => {
    expect(analyzePassword("password").level).toBe(0);
    expect(analyzePassword("P@ssw0rd").level).toBe(0);
    expect(analyzePassword("password2024!").bits).toBeLessThanOrEqual(16);
  });

  it("penalises sequences and repeats", () => {
    const seq = analyzePassword("abcdefgh1234");
    expect(seq.bits).toBeLessThan(seq.rawBits);
    expect(seq.feedback.join(" ")).toMatch(/sequences/);
    expect(analyzePassword("aaaaaaaaaaaa").bits).toBeLessThan(analyzePassword("kq9wz3mf7xtr").bits);
  });

  it("rates long random passwords highly", () => {
    expect(analyzePassword("vT7#qL2!xN9@pR4$mK8&").level).toBeGreaterThanOrEqual(4);
  });
});
