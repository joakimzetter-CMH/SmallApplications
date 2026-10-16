import { useMemo, useState } from "react";
import { convert, FORMAT_LABELS, type Format } from "../lib/encoding";
import { CopyButton, ErrorBox, Panel } from "./common";

const FORMATS = Object.keys(FORMAT_LABELS) as Format[];

const PRESETS: { label: string; from: Format; to: Format }[] = [
  { label: "Text → Base64", from: "text", to: "base64" },
  { label: "Base64 → Text", from: "base64", to: "text" },
  { label: "Text → Hex", from: "text", to: "hex" },
  { label: "Hex → Text", from: "hex", to: "text" },
  { label: "Hex → Base64", from: "hex", to: "base64" },
  { label: "Base64 → Hex", from: "base64", to: "hex" },
];

export function EncoderTool() {
  const [input, setInput] = useState("");
  const [from, setFrom] = useState<Format>("text");
  const [to, setTo] = useState<Format>("base64");

  const result = useMemo(() => {
    if (!input) return { output: "" };
    try {
      return { output: convert(input, from, to) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Conversion failed." };
    }
  }, [input, from, to]);

  const swap = () => {
    // Feed the current output back in so swapping is a true inverse.
    if ("output" in result && result.output !== undefined) setInput(result.output);
    setFrom(to);
    setTo(from);
  };

  return (
    <Panel title="Base64 / Hex Encoder" subtitle="Convert between UTF-8 text, Base64, Base64URL and hexadecimal. Conversion is live and byte-exact.">
      <div className="chips" role="group" aria-label="Presets">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={`chip ${from === p.from && to === p.to ? "active" : ""}`}
            onClick={() => {
              setFrom(p.from);
              setTo(p.to);
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="convert-bar">
        <label className="field">
          <span>From</span>
          <select className="input" value={from} onChange={(e) => setFrom(e.target.value as Format)}>
            {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
          </select>
        </label>
        <button type="button" className="btn btn-ghost swap" onClick={swap} disabled={"error" in result} aria-label="Swap direction" title="Swap direction">
          ⇄
        </button>
        <label className="field">
          <span>To</span>
          <select className="input" value={to} onChange={(e) => setTo(e.target.value as Format)}>
            {FORMATS.map((f) => <option key={f} value={f}>{FORMAT_LABELS[f]}</option>)}
          </select>
        </label>
      </div>

      <div className="grid-2">
        <label className="field">
          <span className="row between">
            Input <span className="muted small">{input.length} chars</span>
          </span>
          <textarea className="input mono" rows={9} value={input} onChange={(e) => setInput(e.target.value)} placeholder={`Enter ${FORMAT_LABELS[from]}…`} spellCheck={false} />
        </label>
        <div className="field">
          <span className="row between">
            Output
            <span className="row">
              {"output" in result && <span className="muted small">{result.output!.length} chars</span>}
              <CopyButton value={"output" in result ? result.output! : ""} />
            </span>
          </span>
          <textarea className="input mono output" rows={9} readOnly value={"output" in result ? result.output : ""} aria-invalid={"error" in result} placeholder="Output appears here" />
        </div>
      </div>
      {"error" in result && <ErrorBox>{result.error}</ErrorBox>}
    </Panel>
  );
}
