import { useEffect, useRef, useState } from "react";
import { digestAll, digestsMatch, HASH_ALGORITHMS, type DigestResult } from "../lib/hash";
import { Badge, CopyButton, ErrorBox, Panel } from "./common";

type Source = { kind: "text" } | { kind: "file"; file: File };

/** Web Crypto digests need the whole input in memory, so cap file size. */
const MAX_FILE_BYTES = 256 * 1024 * 1024;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export function HashTool() {
  const [text, setText] = useState("");
  const [source, setSource] = useState<Source>({ kind: "text" });
  const [results, setResults] = useState<DigestResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outFormat, setOutFormat] = useState<"hex" | "base64">("hex");
  const [upper, setUpper] = useState(false);
  const [expected, setExpected] = useState("");
  const [dragging, setDragging] = useState(false);
  const requestId = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = ++requestId.current;
    setError(null);
    // Debounce typing so large pastes don't hash on every keystroke.
    const handle = window.setTimeout(async () => {
      setBusy(true);
      try {
        let data: Uint8Array | string;
        if (source.kind === "file") {
          if (source.file.size > MAX_FILE_BYTES) throw new Error(`File is larger than ${formatBytes(MAX_FILE_BYTES)}.`);
          data = new Uint8Array(await source.file.arrayBuffer());
        } else {
          data = text;
        }
        const r = await digestAll(data);
        if (id === requestId.current) setResults(r);
      } catch (e) {
        if (id === requestId.current) {
          setResults(null);
          setError(e instanceof Error ? e.message : "Hashing failed.");
        }
      } finally {
        if (id === requestId.current) setBusy(false);
      }
    }, source.kind === "text" ? 150 : 0);
    return () => window.clearTimeout(handle);
  }, [text, source]);

  const pickFile = (file: File | undefined) => {
    if (file) setSource({ kind: "file", file });
  };

  const render = (r: DigestResult) => {
    const v = outFormat === "hex" ? r.hex : r.base64;
    return upper && outFormat === "hex" ? v.toUpperCase() : v;
  };

  const expectedTrim = expected.trim();
  const matchedAlg = expectedTrim
    ? results?.find((r) => digestsMatch(r.hex, expectedTrim) || r.base64 === expectedTrim)?.algorithm
    : undefined;

  return (
    <Panel
      title="Hash Generator"
      subtitle="SHA-256, SHA-384, SHA-512 (and legacy SHA-1) via the browser's native Web Crypto API."
      actions={
        <div className="segmented" role="group" aria-label="Output encoding">
          {(["hex", "base64"] as const).map((f) => (
            <button key={f} type="button" className={outFormat === f ? "active" : ""} aria-pressed={outFormat === f} onClick={() => setOutFormat(f)}>
              {f === "hex" ? "Hex" : "Base64"}
            </button>
          ))}
        </div>
      }
    >
      {source.kind === "text" ? (
        <label className="field">
          <span>Input text (UTF-8)</span>
          <textarea className="input mono" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Type or paste text to hash…" spellCheck={false} />
        </label>
      ) : (
        <div className="file-chip">
          <span aria-hidden="true">📄</span>
          <span className="mono truncate">{source.file.name}</span>
          <span className="muted">{formatBytes(source.file.size)}</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSource({ kind: "text" })}>
            Back to text
          </button>
        </div>
      )}

      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pickFile(e.dataTransfer.files[0]);
        }}
      >
        <span>Drop a file here to hash it locally, or</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileInput.current?.click()}>
          Choose file
        </button>
        <input
          ref={fileInput}
          type="file"
          hidden
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      <div className="row wrap between">
        <label className="check">
          <input type="checkbox" checked={upper} disabled={outFormat !== "hex"} onChange={(e) => setUpper(e.target.checked)} />
          Uppercase hex
        </label>
        {busy && (
          <span className="muted small row">
            <span className="spinner" /> Hashing…
          </span>
        )}
      </div>

      <div className={`digest-list ${busy ? "is-busy" : ""}`}>
        {HASH_ALGORITHMS.map((alg) => {
          const r = results?.find((x) => x.algorithm === alg);
          return (
            <div key={alg} className={`digest ${matchedAlg === alg ? "digest-match" : ""}`}>
              <div className="digest-head">
                <strong>{alg}</strong>
                <span className="muted small">{r ? `${r.bits} bits` : ""}</span>
                {alg === "SHA-1" && <Badge tone="warn">Legacy — not collision resistant</Badge>}
                <span className="spacer" />
                <CopyButton value={r ? render(r) : ""} />
              </div>
              <code className="digest-value">{r ? render(r) : "…"}</code>
            </div>
          );
        })}
      </div>

      <label className="field">
        <span>Verify against an expected digest</span>
        <input className="input mono" value={expected} onChange={(e) => setExpected(e.target.value)} placeholder="Paste a known hash (hex or Base64)" spellCheck={false} />
      </label>
      {expectedTrim && results && (matchedAlg ? <Badge tone="ok">✓ Matches {matchedAlg}</Badge> : <Badge tone="bad">✗ No algorithm matches</Badge>)}
    </Panel>
  );
}
