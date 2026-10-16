import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StrengthLevel } from "../lib/entropy";

export function Panel({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

type CopyState = "idle" | "copied" | "error";

async function writeClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  // Fallback for insecure contexts where the async Clipboard API is missing.
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("Copy command was rejected");
}

export function CopyButton({ value, label = "Copy", disabled }: { value: string; label?: string; disabled?: boolean }) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onClick = async () => {
    try {
      await writeClipboard(value);
      setState("copied");
    } catch {
      setState("error");
    }
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState("idle"), 1600);
  };

  return (
    <button
      type="button"
      className={`btn btn-ghost btn-sm copy-${state}`}
      onClick={onClick}
      disabled={disabled || !value}
      aria-live="polite"
    >
      {state === "copied" ? "✓ Copied" : state === "error" ? "Copy failed" : label}
    </button>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div className="alert alert-error" role="alert">
      <span aria-hidden="true">⚠</span>
      <span>{children}</span>
    </div>
  );
}

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

export function Badge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

const LEVEL_TONES: Tone[] = ["bad", "bad", "warn", "ok", "ok", "info"];

export function StrengthMeter({ level, label, bits, crackTime, note }: { level: StrengthLevel; label: string; bits: number; crackTime: string; note?: string }) {
  const pct = Math.min(100, (bits / 128) * 100);
  return (
    <div className={`strength strength-${level}`}>
      <div className="strength-row">
        <Badge tone={LEVEL_TONES[level]!}>{label}</Badge>
        <span className="mono strength-bits">{bits.toFixed(1)} bits{note ? ` ${note}` : ""}</span>
      </div>
      <div
        className="meter"
        role="meter"
        aria-label="Entropy strength"
        aria-valuemin={0}
        aria-valuemax={128}
        aria-valuenow={Math.round(bits)}
        aria-valuetext={`${label}, ${bits.toFixed(0)} bits`}
      >
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        Brute-force time (half the keyspace at 10¹¹ guesses/s): <strong>{crackTime}</strong>
      </p>
    </div>
  );
}

/** Pretty-printed JSON with lightweight token colouring (no innerHTML). */
export function JsonView({ value }: { value: unknown }) {
  const json = JSON.stringify(value, null, 2);
  const parts = json.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|\b-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g);
  return (
    <pre className="code json">
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const cls = p.startsWith('"') ? (p.trimEnd().endsWith(":") ? "j-key" : "j-str") : /^(true|false|null)$/.test(p) ? "j-lit" : "j-num";
        return (
          <span key={i} className={cls}>
            {p}
          </span>
        );
      })}
    </pre>
  );
}
