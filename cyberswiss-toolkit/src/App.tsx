import { useEffect, useState, type ReactNode } from "react";
import { EncoderTool } from "./components/EncoderTool";
import { GeneratorTool } from "./components/GeneratorTool";
import { HashTool } from "./components/HashTool";
import { JwtTool } from "./components/JwtTool";

type ToolId = "jwt" | "hash" | "encode" | "generate";

const TOOLS: { id: ToolId; label: string; icon: string; blurb: string; render: () => ReactNode }[] = [
  { id: "jwt", label: "JWT Inspector", icon: "⧉", blurb: "Decode & expiry", render: () => <JwtTool /> },
  { id: "hash", label: "Hash Generator", icon: "#", blurb: "SHA-256 / 512", render: () => <HashTool /> },
  { id: "encode", label: "Encoder", icon: "⇄", blurb: "Base64 / Hex", render: () => <EncoderTool /> },
  { id: "generate", label: "Key Generator", icon: "✱", blurb: "Passwords & API keys", render: () => <GeneratorTool /> },
];

function toolFromHash(): ToolId {
  const id = window.location.hash.slice(1);
  return TOOLS.some((t) => t.id === id) ? (id as ToolId) : "jwt";
}

export function App() {
  const [active, setActive] = useState<ToolId>(toolFromHash);

  // Keep the selected tool in the URL so it survives reloads and is linkable.
  useEffect(() => {
    const onHash = () => setActive(toolFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const secure = window.isSecureContext && !!globalThis.crypto?.subtle;
  const tool = TOOLS.find((t) => t.id === active)!;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <span>+</span>
          </div>
          <div>
            <h1>CyberSwiss</h1>
            <p>Security &amp; Crypto Toolkit</p>
          </div>
        </div>
        <div className="topbar-badges">
          <span className="pill pill-ok" title="No network requests are made with your data">● 100% client-side</span>
          {!secure && <span className="pill pill-bad" title="crypto.subtle requires HTTPS or localhost">Web Crypto unavailable</span>}
        </div>
      </header>

      <div className="layout">
        <nav className="sidebar" aria-label="Tools">
          {TOOLS.map((t) => (
            <a
              key={t.id}
              href={`#${t.id}`}
              className={`nav-item ${active === t.id ? "active" : ""}`}
              aria-current={active === t.id ? "page" : undefined}
            >
              <span className="nav-icon" aria-hidden="true">{t.icon}</span>
              <span className="nav-text">
                <span className="nav-label">{t.label}</span>
                <span className="nav-blurb">{t.blurb}</span>
              </span>
            </a>
          ))}
        </nav>

        <main className="content" key={tool.id}>
          {tool.render()}
        </main>
      </div>

      <footer className="footer muted small">
        All operations run locally in your browser using the Web Crypto API. Never paste production secrets into tools you do not control.
      </footer>
    </div>
  );
}
