import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";

// Strict CSP for the production bundle only: the dev server relies on inline
// scripts (React Fast Refresh preamble) that this policy would block.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

function cspPlugin(): Plugin {
  return {
    name: "cyberswiss-csp",
    apply: "build",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { "http-equiv": "Content-Security-Policy", content: CSP }, injectTo: "head-prepend" },
    ],
  };
}

export default defineConfig({
  plugins: [react(), cspPlugin()],
  // Relative base so the static build works from any sub-path or file host.
  base: "./",
  test: {
    environment: "node",
  },
});
