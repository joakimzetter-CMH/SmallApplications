/**
 * Strength scoring. Two sources of entropy are distinguished:
 *  - generated secrets, whose entropy is known exactly from the generator; and
 *  - user-typed passwords, whose entropy is only *estimated* heuristically
 *    (character-pool size minus penalties for common human patterns).
 */

export type StrengthLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface Strength {
  level: StrengthLevel;
  label: string;
  bits: number;
  /** Time to search half the keyspace at the given guess rate. */
  crackTime: string;
}

const LEVELS: { min: number; label: string }[] = [
  { min: 128, label: "Excellent" },
  { min: 80, label: "Very strong" },
  { min: 60, label: "Strong" },
  { min: 40, label: "Fair" },
  { min: 28, label: "Weak" },
  { min: 0, label: "Very weak" },
];

/** Offline attack against a fast hash on a GPU rig. */
export const DEFAULT_GUESSES_PER_SECOND = 1e11;

export function formatCrackTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds > 1e18 * 31_536_000) return "longer than the age of the universe";
  if (seconds < 1) return "instant";
  const units: [string, number][] = [
    ["century", 3_153_600_000],
    ["year", 31_536_000],
    ["day", 86_400],
    ["hour", 3_600],
    ["minute", 60],
    ["second", 1],
  ];
  for (const [name, size] of units) {
    if (seconds >= size) {
      const n = seconds / size;
      if (name === "century" && n >= 1000) {
        return `${n.toExponential(1).replace("e+", " × 10^")} centuries`;
      }
      const rounded = Math.floor(n);
      const plural = name === "century" ? "centuries" : `${name}s`;
      return `${rounded.toLocaleString("en-US")} ${rounded === 1 ? name : plural}`;
    }
  }
  return "instant";
}

export function scoreBits(bits: number, guessesPerSecond = DEFAULT_GUESSES_PER_SECOND): Strength {
  const b = Math.max(0, bits);
  const idx = LEVELS.findIndex((l) => b >= l.min);
  const level = (LEVELS.length - 1 - idx) as StrengthLevel;
  const seconds = 2 ** (b - 1) / guessesPerSecond;
  return { level, label: LEVELS[idx]!.label, bits: b, crackTime: formatCrackTime(seconds) };
}

// ---------- Heuristic estimate for human-chosen passwords ----------

const COMMON = new Set([
  "password", "123456", "12345678", "123456789", "qwerty", "abc123", "letmein", "welcome", "monkey", "dragon",
  "iloveyou", "admin", "login", "master", "sunshine", "princess", "football", "baseball", "passw0rd", "trustno1",
  "111111", "000000", "qwertyuiop", "1q2w3e4r", "secret", "changeme", "root", "toor", "test", "guest",
]);

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890"];

export interface PasswordAnalysis extends Strength {
  poolSize: number;
  rawBits: number;
  feedback: string[];
}

function poolSizeOf(pw: string): number {
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^A-Za-z0-9]/.test(pw)) pool += /[^\x00-\x7f]/.test(pw) ? 100 : 33;
  return pool;
}

/** Number of characters that continue an ascending/descending or keyboard-row run. */
function countSequential(pw: string): number {
  const s = pw.toLowerCase();
  let n = 0;
  for (let i = 2; i < s.length; i++) {
    const a = s.charCodeAt(i - 2), b = s.charCodeAt(i - 1), c = s.charCodeAt(i);
    const arithmetic = (b - a === 1 && c - b === 1) || (a - b === 1 && b - c === 1);
    const tri = s.slice(i - 2, i + 1);
    const keyboard = KEYBOARD_ROWS.some((row) => row.includes(tri) || [...row].reverse().join("").includes(tri));
    if (arithmetic || keyboard) n++;
  }
  return n;
}

export function analyzePassword(pw: string, guessesPerSecond = DEFAULT_GUESSES_PER_SECOND): PasswordAnalysis {
  const chars = Array.from(pw);
  const feedback: string[] = [];
  if (chars.length === 0) {
    return { ...scoreBits(0, guessesPerSecond), poolSize: 0, rawBits: 0, feedback: ["Enter a password to analyze."] };
  }
  const poolSize = poolSizeOf(pw);
  const perChar = Math.log2(poolSize);
  const rawBits = chars.length * perChar;

  // Effective length: discount repeated characters and predictable runs.
  let effective = chars.length;
  const repeats = chars.filter((c, i) => i > 0 && c === chars[i - 1]).length;
  effective -= repeats * 0.75;
  const seq = countSequential(pw);
  effective -= seq * 0.75;
  const uniqueRatio = new Set(chars).size / chars.length;
  if (uniqueRatio < 0.5) effective *= 0.75;

  let bits = Math.max(0, effective * perChar);

  const lower = pw.toLowerCase();
  const deLeet = (s: string) =>
    s.replace(/[@4]/g, "a").replace(/3/g, "e").replace(/[1!|]/g, "i").replace(/0/g, "o").replace(/[$5]/g, "s");
  // Strip digit/symbol affixes *before* de-leeting, otherwise "2024!" would turn into letters.
  const stripped = deLeet(lower.replace(/[^a-z]+$/, "").replace(/^[^a-z]+/, ""));
  if (COMMON.has(lower) || COMMON.has(deLeet(lower))) {
    bits = Math.min(bits, 4);
    feedback.push("This is one of the most common passwords — it would be guessed instantly.");
  } else if (COMMON.has(stripped) && stripped.length >= 4) {
    bits = Math.min(bits, 16);
    feedback.push("Based on a common password with predictable additions.");
  }

  if (repeats > 0) feedback.push("Avoid repeated characters (aaa, 111).");
  if (seq > 0) feedback.push("Avoid sequences and keyboard runs (abc, 123, qwerty).");
  if (chars.length < 12) feedback.push("Use at least 12 characters; length matters most.");
  if (poolSize <= 26) feedback.push("Mix in upper-case letters, digits and symbols.");
  if (/^[A-Z][a-z]+\d+[!@#$%^&*]?$/.test(pw)) feedback.push("Capital-word-number-symbol is a very predictable shape.");

  const strength = scoreBits(bits, guessesPerSecond);
  if (feedback.length === 0 && strength.level >= 3) feedback.push("Looks good. Prefer a password manager for unique secrets.");
  return { ...strength, poolSize, rawBits, feedback };
}
