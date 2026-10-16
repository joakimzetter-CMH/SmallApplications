import { useEffect, useMemo, useState } from "react";
import { base64ToBytes, bytesToBase64Url, utf8Encode } from "../lib/encoding";
import { decodeJwt, formatDuration, inspectJwt, isHmacAlg, JwtError, verifyHmac, type DecodedJwt, type TokenStatus } from "../lib/jwt";
import { Badge, CopyButton, ErrorBox, JsonView, Panel, type Tone } from "./common";

const DEMO_SECRET = "cyberswiss-demo-secret";

async function makeDemoToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const seg = (o: object) => bytesToBase64Url(utf8Encode(JSON.stringify(o)));
  const input = `${seg({ alg: "HS256", typ: "JWT" })}.${seg({
    iss: "https://auth.cyberswiss.example",
    sub: "agent-007",
    aud: "toolkit",
    name: "Demo Operator",
    scope: "read:hashes write:keys",
    iat: now - 600,
    nbf: now - 600,
    exp: now + 3000,
  })}`;
  const key = await crypto.subtle.importKey("raw", utf8Encode(DEMO_SECRET) as BufferSource, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, utf8Encode(input) as BufferSource));
  return `${input}.${bytesToBase64Url(sig)}`;
}

const STATUS: Record<TokenStatus, { tone: Tone; label: string }> = {
  valid: { tone: "ok", label: "Active" },
  expired: { tone: "bad", label: "Expired" },
  "not-yet-valid": { tone: "warn", label: "Not yet valid" },
  "no-expiry": { tone: "warn", label: "No expiry" },
};

function useNow(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return now;
}

type VerifyState = { kind: "idle" } | { kind: "busy" } | { kind: "done"; ok: boolean } | { kind: "error"; message: string };

function SignatureVerifier({ decoded }: { decoded: DecodedJwt }) {
  const [secret, setSecret] = useState("");
  const [secretIsB64, setSecretIsB64] = useState(false);
  const [state, setState] = useState<VerifyState>({ kind: "idle" });
  const alg = decoded.header.alg;

  // Any change to the token or secret invalidates the previous result.
  useEffect(() => setState({ kind: "idle" }), [decoded, secret, secretIsB64]);

  if (!isHmacAlg(alg)) {
    return (
      <p className="muted small">
        Signature verification is available for HS256/384/512. This token uses <code>{String(alg)}</code>, which needs the
        issuer&apos;s public key.
      </p>
    );
  }

  const verify = async () => {
    setState({ kind: "busy" });
    try {
      const key = secretIsB64 ? base64ToBytes(secret) : utf8Encode(secret);
      setState({ kind: "done", ok: await verifyHmac(decoded, key) });
    } catch (e) {
      setState({ kind: "error", message: e instanceof Error ? e.message : "Verification failed." });
    }
  };

  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault();
        void verify();
      }}
    >
      <label className="field">
        <span>Shared secret ({alg})</span>
        <input
          type="password"
          className="input mono"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          placeholder="Secret never leaves this browser"
          autoComplete="off"
          spellCheck={false}
        />
      </label>
      <div className="row wrap">
        <label className="check">
          <input type="checkbox" checked={secretIsB64} onChange={(e) => setSecretIsB64(e.target.checked)} />
          Secret is Base64-encoded
        </label>
        <button type="submit" className="btn btn-primary btn-sm" disabled={!secret || state.kind === "busy"}>
          {state.kind === "busy" ? <span className="spinner" aria-label="Verifying" /> : "Verify signature"}
        </button>
        {state.kind === "done" &&
          (state.ok ? <Badge tone="ok">✓ Signature valid</Badge> : <Badge tone="bad">✗ Signature invalid</Badge>)}
      </div>
      {state.kind === "error" && <ErrorBox>{state.message}</ErrorBox>}
    </form>
  );
}

export function JwtTool() {
  const [token, setToken] = useState("");
  const [leeway, setLeeway] = useState(0);
  const [demoError, setDemoError] = useState<string | null>(null);

  const result = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return { decoded: decodeJwt(token) };
    } catch (e) {
      return { error: e instanceof JwtError ? e.message : "Unable to decode token." };
    }
  }, [token]);

  const decoded = result && "decoded" in result ? result.decoded : null;
  const now = useNow(decoded !== null);
  const info = decoded ? inspectJwt(decoded, now, leeway) : null;

  const loadDemo = async () => {
    setDemoError(null);
    try {
      setToken(await makeDemoToken());
    } catch {
      setDemoError("Could not create a demo token: Web Crypto is unavailable (use HTTPS or localhost).");
    }
  };

  return (
    <Panel
      title="JWT Decoder & Expiration Inspector"
      subtitle="Decode header and claims, track expiry in real time, and verify HMAC signatures — entirely offline."
      actions={
        <>
          <button type="button" className="btn btn-ghost btn-sm" onClick={loadDemo}>
            Load demo token
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setToken("")} disabled={!token}>
            Clear
          </button>
        </>
      }
    >
      <label className="field">
        <span>Encoded token</span>
        <textarea
          className="input mono token-input"
          rows={5}
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="eyJhbGciOi… (a leading “Bearer ” is fine)"
          spellCheck={false}
          autoComplete="off"
        />
      </label>
      {demoError && <ErrorBox>{demoError}</ErrorBox>}

      {decoded && (
        <div className="jwt-colored mono" aria-label="Token segments">
          <span className="seg-h">{decoded.raw.header}</span>.<span className="seg-p">{decoded.raw.payload}</span>.
          <span className="seg-s">{decoded.signature}</span>
        </div>
      )}

      {result === null && (
        <div className="empty">
          <div className="empty-icon" aria-hidden="true">🔑</div>
          <p>Paste a JSON Web Token above, or load a freshly signed demo token.</p>
        </div>
      )}
      {result && "error" in result && <ErrorBox>{result.error}</ErrorBox>}

      {decoded && info && (
        <>
          <div className={`status-banner status-${info.status}`}>
            <Badge tone={STATUS[info.status].tone}>{STATUS[info.status].label}</Badge>
            <span className="status-text">
              {info.status === "valid" && info.secondsToExpiry !== null && <>Expires in <strong className="mono">{formatDuration(info.secondsToExpiry)}</strong></>}
              {info.status === "expired" && info.secondsToExpiry !== null && <>Expired <strong className="mono">{formatDuration(info.secondsToExpiry)}</strong> ago</>}
              {info.status === "not-yet-valid" && <>Token is not active yet (nbf in the future)</>}
              {info.status === "no-expiry" && <>Token has no exp claim</>}
            </span>
            <label className="leeway">
              Clock-skew leeway
              <select className="input input-sm" value={leeway} onChange={(e) => setLeeway(Number(e.target.value))}>
                {[0, 30, 60, 300].map((s) => (
                  <option key={s} value={s}>{s}s</option>
                ))}
              </select>
            </label>
          </div>

          {info.lifetimeElapsed !== null && (
            <div className="lifetime">
              <div className="meter" role="progressbar" aria-label="Token lifetime elapsed" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(info.lifetimeElapsed * 100)}>
                <div className={`meter-fill lifetime-fill ${info.lifetimeElapsed > 0.85 ? "late" : ""}`} style={{ width: `${info.lifetimeElapsed * 100}%` }} />
              </div>
              <p className="muted small">
                {Math.round(info.lifetimeElapsed * 100)}% of a {formatDuration(info.lifetimeSeconds!)} lifetime elapsed
              </p>
            </div>
          )}

          {info.claims.length > 0 && (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>Claim</th><th>Timestamp</th><th>Local time</th><th>Relative</th></tr>
                </thead>
                <tbody>
                  {info.claims.map((c) => {
                    const delta = c.seconds - now / 1000;
                    return (
                      <tr key={c.claim}>
                        <td><code>{c.claim}</code> <span className="muted">{c.label}</span></td>
                        <td className="mono">{c.seconds}</td>
                        <td>{Number.isNaN(c.date.getTime()) ? "—" : c.date.toLocaleString()}</td>
                        <td className="mono">{delta >= 0 ? `in ${formatDuration(delta)}` : `${formatDuration(delta)} ago`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {info.warnings.length > 0 && (
            <ul className="warnings">
              {info.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          <div className="grid-2">
            <div className="sub-card">
              <div className="sub-head">
                <h3><span className="dot dot-h" /> Header</h3>
                <CopyButton value={JSON.stringify(decoded.header, null, 2)} />
              </div>
              <JsonView value={decoded.header} />
            </div>
            <div className="sub-card">
              <div className="sub-head">
                <h3><span className="dot dot-p" /> Payload</h3>
                <CopyButton value={JSON.stringify(decoded.payload, null, 2)} />
              </div>
              <JsonView value={decoded.payload} />
            </div>
          </div>

          <div className="sub-card">
            <div className="sub-head">
              <h3><span className="dot dot-s" /> Signature</h3>
            </div>
            <SignatureVerifier decoded={decoded} />
          </div>
        </>
      )}
    </Panel>
  );
}
