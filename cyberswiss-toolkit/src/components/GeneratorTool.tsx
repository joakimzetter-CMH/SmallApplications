import { useCallback, useEffect, useMemo, useState } from "react";
import { analyzePassword, scoreBits } from "../lib/entropy";
import {
  API_KEY_FORMATS,
  generateApiKey,
  generatePassword,
  MAX_KEY_BYTES,
  MAX_PASSWORD_LENGTH,
  MIN_KEY_BYTES,
  MIN_PASSWORD_LENGTH,
  type ApiKeyFormat,
  type CharClass,
  type GeneratedSecret,
} from "../lib/generator";
import { CopyButton, ErrorBox, Panel, StrengthMeter } from "./common";

type Mode = "password" | "apikey";

const CLASS_LABELS: Record<CharClass, string> = {
  lower: "a–z",
  upper: "A–Z",
  digits: "0–9",
  symbols: "!@#$…",
};

function clampInt(v: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(v, 10);
  return Number.isNaN(n) ? fallback : Math.min(max, Math.max(min, n));
}

export function GeneratorTool() {
  const [mode, setMode] = useState<Mode>("password");
  const [length, setLength] = useState(24);
  const [classes, setClasses] = useState<Record<CharClass, boolean>>({ lower: true, upper: true, digits: true, symbols: true });
  const [excludeAmbiguous, setExcludeAmbiguous] = useState(false);
  const [requireEachClass, setRequireEachClass] = useState(true);
  const [format, setFormat] = useState<ApiKeyFormat>("base62");
  const [bytes, setBytes] = useState(32);
  const [prefix, setPrefix] = useState("sk_live_");
  const [secret, setSecret] = useState<GeneratedSecret | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(true);
  const [checkInput, setCheckInput] = useState("");

  const regenerate = useCallback(() => {
    try {
      setSecret(
        mode === "password"
          ? generatePassword({ length, classes, excludeAmbiguous, requireEachClass })
          : generateApiKey({ format, bytes, prefix }),
      );
      setError(null);
    } catch (e) {
      setSecret(null);
      setError(e instanceof Error ? e.message : "Generation failed.");
    }
  }, [mode, length, classes, excludeAmbiguous, requireEachClass, format, bytes, prefix]);

  // Regenerate whenever an option changes so the preview always matches the settings.
  useEffect(regenerate, [regenerate]);

  const strength = secret ? scoreBits(secret.entropyBits) : null;
  const analysis = useMemo(() => (checkInput ? analyzePassword(checkInput) : null), [checkInput]);

  return (
    <>
      <Panel
        title="Password & API-Key Generator"
        subtitle="Unbiased output from crypto.getRandomValues with exact entropy accounting."
        actions={
          <div className="segmented" role="tablist" aria-label="Generator mode">
            {(["password", "apikey"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} className={mode === m ? "active" : ""} onClick={() => setMode(m)}>
                {m === "password" ? "Password" : "API key"}
              </button>
            ))}
          </div>
        }
      >
        <div className="secret-out">
          <code className={`secret-value ${revealed ? "" : "masked"}`} aria-label="Generated secret">
            {secret ? (revealed ? secret.value : "•".repeat(Math.min(48, secret.value.length))) : "—"}
          </code>
          <div className="secret-actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRevealed((r) => !r)} aria-pressed={!revealed}>
              {revealed ? "Hide" : "Show"}
            </button>
            <CopyButton value={secret?.value ?? ""} />
            <button type="button" className="btn btn-primary btn-sm" onClick={regenerate}>
              ↻ Regenerate
            </button>
          </div>
        </div>

        {error && <ErrorBox>{error}</ErrorBox>}
        {secret && strength && (
          <StrengthMeter {...strength} note={`· ${secret.poolSize}-symbol alphabet · ${Array.from(secret.value).length} chars`} />
        )}

        {mode === "password" ? (
          <div className="options">
            <label className="field">
              <span className="row between">
                Length <span className="mono accent">{length}</span>
              </span>
              <div className="row">
                <input type="range" min={MIN_PASSWORD_LENGTH} max={128} value={Math.min(length, 128)} onChange={(e) => setLength(Number(e.target.value))} aria-label="Password length" />
                <input
                  type="number"
                  className="input input-sm num"
                  min={MIN_PASSWORD_LENGTH}
                  max={MAX_PASSWORD_LENGTH}
                  value={length}
                  onChange={(e) => setLength(clampInt(e.target.value, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH, length))}
                  aria-label="Password length (exact)"
                />
              </div>
            </label>
            <fieldset className="toggles">
              <legend>Character sets</legend>
              {(Object.keys(CLASS_LABELS) as CharClass[]).map((c) => (
                <label key={c} className={`toggle ${classes[c] ? "on" : ""}`}>
                  <input type="checkbox" checked={classes[c]} onChange={(e) => setClasses((prev) => ({ ...prev, [c]: e.target.checked }))} />
                  <span className="mono">{CLASS_LABELS[c]}</span>
                </label>
              ))}
            </fieldset>
            <div className="row wrap">
              <label className="check">
                <input type="checkbox" checked={excludeAmbiguous} onChange={(e) => setExcludeAmbiguous(e.target.checked)} />
                Exclude look-alikes (0 O 1 l I |)
              </label>
              <label className="check">
                <input type="checkbox" checked={requireEachClass} onChange={(e) => setRequireEachClass(e.target.checked)} />
                At least one of each set
              </label>
            </div>
          </div>
        ) : (
          <div className="options grid-3">
            <label className="field">
              <span>Format</span>
              <select className="input" value={format} onChange={(e) => setFormat(e.target.value as ApiKeyFormat)}>
                {(Object.keys(API_KEY_FORMATS) as ApiKeyFormat[]).map((f) => <option key={f} value={f}>{API_KEY_FORMATS[f]}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Entropy (bytes)</span>
              <select className="input" value={bytes} disabled={format === "uuid"} onChange={(e) => setBytes(Number(e.target.value))}>
                {[16, 24, 32, 48, 64].filter((b) => b >= MIN_KEY_BYTES && b <= MAX_KEY_BYTES).map((b) => (
                  <option key={b} value={b}>{b} bytes · {b * 8} bits</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Prefix (optional)</span>
              <input className="input mono" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="e.g. sk_live_" maxLength={32} spellCheck={false} />
            </label>
          </div>
        )}
      </Panel>

      <Panel title="Password Strength Checker" subtitle="Heuristic entropy estimate for human-chosen passwords. Nothing is stored or transmitted.">
        <label className="field">
          <span>Password to analyze</span>
          <input type="password" className="input mono" value={checkInput} onChange={(e) => setCheckInput(e.target.value)} placeholder="Type a password…" autoComplete="off" spellCheck={false} />
        </label>
        {analysis ? (
          <>
            <StrengthMeter {...analysis} note={`(est.) · naive ${analysis.rawBits.toFixed(1)} bits`} />
            <ul className="warnings tips">
              {analysis.feedback.map((f) => <li key={f}>{f}</li>)}
            </ul>
          </>
        ) : (
          <p className="muted small">Estimates penalise dictionary words, leet-speak, repeats, sequences and keyboard runs.</p>
        )}
      </Panel>
    </>
  );
}
