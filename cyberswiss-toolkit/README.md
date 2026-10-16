# CyberSwiss · Security & Crypto Toolkit

A dark-mode, fully client-side Swiss-army knife for everyday security work. No backend and no network calls: everything runs in your browser on the native [Web Crypto API](https://developer.mozilla.org/docs/Web/API/Web_Crypto_API).

## Tools

| Tool | What it does |
| --- | --- |
| **JWT Inspector** | Decodes header and payload (UTF-8 safe, accepts a `Bearer ` prefix) and shows a live expiry countdown, lifetime progress bar and `iat`/`nbf`/`exp` timeline with a clock-skew leeway setting. Warns about `alg: none`, missing `exp`, millisecond timestamps and malformed claims. Verifies **HS256/384/512** signatures with a shared secret (text or Base64). |
| **Hash Generator** | SHA-256, SHA-384, SHA-512 (plus legacy SHA-1) of text or a dropped file, as hex or Base64. Checks the result against an expected digest and reports which algorithm matches. |
| **Encoder** | Live, byte-exact conversion between UTF-8 text, Base64, Base64URL and hex, with presets and a one-click swap. Invalid input produces a clear error instead of corrupted output. |
| **Key Generator** | Passwords (length 4–256, selectable character sets, look-alike exclusion, "one of each set") and API keys (Base62, Base64URL, hex or UUID v4, with an optional `sk_live_`-style prefix). Shows **exact** entropy and a strength rating. |
| **Strength Checker** | Heuristic entropy estimate for human-chosen passwords. It penalises common passwords, leet-speak, repeats, sequences and keyboard runs, and gives actionable feedback. |

### Security notes

- Randomness comes from `crypto.getRandomValues` with **rejection sampling**, so there is no modulo bias. The "one of each set" constraint is also enforced by rejection, which keeps the output uniform.
- Generated-secret entropy is computed exactly from the generator (`length × log2(alphabet)`). The strength checker is clearly labelled as an *estimate*.
- Crack-time figures assume an offline attacker making 10¹¹ guesses/s and searching half the keyspace.
- HMAC verification uses `crypto.subtle.verify`, which compares in constant time.
- Production builds ship a strict Content-Security-Policy (`connect-src 'none'`), so the bundle cannot send data anywhere.
- `crypto.subtle` only works in a **secure context** (HTTPS or `localhost`). If it is unavailable, the app shows a warning badge.

## Getting started

Requires Node.js 20+.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # type-check + production bundle in dist/
npm run preview    # serve the production build locally
```

`dist/` is a static site built with a relative base path, so you can host it from any sub-path (GitHub Pages, S3, nginx, …).

## Project layout

```
src/
  lib/            Pure, framework-free logic (fully unit-tested)
    encoding.ts   UTF-8 / Base64 / Base64URL / hex
    hash.ts       Web Crypto digests + digest comparison
    jwt.ts        Decode, time-claim inspection, HMAC verification
    random.ts     Unbiased CSPRNG primitives
    generator.ts  Password & API-key generation
    entropy.ts    Strength scoring and password analysis
  components/     React UI for each tool + shared widgets
  App.tsx         Shell, navigation (hash-routed: #jwt, #hash, #encode, #generate)
  styles.css      Dark design system (CSS variables, responsive)
```
