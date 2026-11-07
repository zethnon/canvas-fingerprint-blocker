# Fingerprint Shield (personal) — canvas-focused development build (v1.2.0)

A personal Chrome MV3 fork of joue-quroi/canvas-fingerprint-blocker.
**This build is not a complete anti-tracking system or a verified anonymity tool.**

## Load locally

1. Download this branch and extract it.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select the folder containing `manifest.json` (the repository root).
4. In the extension's Details, enable **Allow user scripts**. Chrome 138+ is required.
5. If Options still reports permission unavailable, reload the extension, then recheck.
6. Reload existing web tabs. The **R** badge is a persistent reload reminder. It is
   not a tracker count, per-page verification, or proof of complete protection.

Clicking the extension icon toggles registration for future documents. Previously
installed hooks remain until those documents reload. Exceptions include subdomains;
IPv4/localhost exceptions match exactly. Invalid/IPv6 rules are rejected visibly.

## What changed from the baseline

- Native dimension and ImageData accessors close the demonstrated export fallback
  and page-defined getter paths; captured intrinsics resist simple page tampering.
- Copy failures propagate; exports never silently retry against clean source data.
- Readback projects each visible RGB pixel into a keyed representative of a
  four-value colour bucket, with boundaries shifted per site. The maximum 8-bit channel change is 3, alpha is preserved,
  and transparent pixels remain untouched.
- Equal pixels receive equal transformations independent of crop dimensions or
  positions. Repeated read/write loops are idempotent. The previously demonstrated
  overlapping-rectangle majority attack returns the same transformed pixels.
- The session key uses 128 random bits and a top-level-origin partition. Embedded
  third parties get different mappings under different top-level origins. This is
  exact origin partitioning, not public-suffix/eTLD+1 grouping.
- Seed/config/installer are enclosed in one registered script, with no page-global
  configuration variable, DOM bridge, fake response header, or page-event trust.
- Main-thread OffscreenCanvas 2D readbacks and convertToBlob are wrapped.
- Tracked dedicated Blob workers get protected before their original code runs.
  Configuration is sent through captured native messaging, never baked into a
  fetchable Blob URL. Immediate original URL revocation and nested workers are supported.
- Parent accesses and common insertion methods patch same-origin fallback frames,
  including child insertion methods for nested frames. A browser content-script
  guard blocks canvas reads in fallback documents (about:blank/srcdoc/data/blob)
  when they execute without a usable seeded installer. This can break legitimate
  frame-based image workflows; use site exceptions when appropriate.
- Existing script registrations are updated in place. Queued preferences are not
  dropped. Permission/setup failures are surfaced in Options and the action title.
- No audio, font, hardware, network blocking, or fingerprint radar features added.

## Important limits — do not interpret green tests as anonymity

- **Coarse image information remains exposed.** Site-shifted boundaries resist
  simply masking low bits, but a tracker can still use coarser image features,
  probe transformations, combine other signals, or use other APIs. Passing the crop test does not establish resistance to all pixel recovery
  or fingerprint extraction attacks. The noise model is a limited perturbation.
- **Worker coverage is partial.** Dedicated Blob workers whose URLs were created
  after injection receive the same session/site projection, including nested Blob
  workers. URL workers, SharedWorkers and service workers retain native loaders
  and remain uncovered. Pre-existing/foreign Blob workers are denied rather than
  silently run without protection. Reloading removes these hooks on exempt sites.
- **Blob worker compatibility:** Bootstrap URLs and import.meta.url differ from
  native Blob workers. Module messages queued during import are replayed with
  isTrusted=false. CSP/Trusted Types may reject bootstrapping; security policies
  are not relaxed. URL-worker response CSP and SharedWorker identity are preserved
  by leaving their loaders native. Use exceptions for incompatible applications.
- **Iframe timing and browser compatibility need broader validation.**
  Synchronous initial blank documents, parser-created frames, opaque/sandboxed
  contexts, navigation and page tampering have complex timing. The fallback guard
  is defence in depth. The included blank/nested/srcdoc Chromium checks pass,
  but this repo does not claim every realm race is solved.
- **Early startup documents can block reads.** A non-persistent content-script
  gate is registered only after the current seeded code. Persisted code that runs
  without that gate denies canvas readbacks and new Worker/SharedWorker creation;
  a later page-forged marker cannot unlock it. Reload affected tabs after setup.
  This preserves session stability instead of switching to per-document seeds.
  We require the browser integration tests to verify normal injection order;
  ordering changes fail closed. It cannot protect a document where Chrome never
  injects the extension at all, or retrofit a document/worker already running.
- **Colour conversion matters.** Canvas exports use an sRGB 8-bit copy. Wide gamut,
  float16/HDR, alpha premultiplication and WebGL drawing-buffer lifetime can produce
  export/readback differences. Float16 reads are projected into 8-bit RGB while
  preserving alpha. Use exceptions for fidelity-sensitive editing applications.
- **Export cost is proportional to pixel count**, including a full-size copy and
  CPU readback. A bounded 4096-bucket cache avoids unbounded retention. Avoid this
  build on high-frequency image-processing workloads without measuring overhead.
- No protection for WebGL readPixels, WebGPU, audio, fonts, cookies, account logins,
  IP addresses or other browser signals. No stealth or undetectability guarantee.

## Tests

```sh
npm test                          # no dependencies: Node VM + registration mocks
npm install                       # pinned Playwright development dependency
npx playwright install chromium
npm run test:browser               # actual unpacked extension, not injected mocks
```

`npm test` exercises colour/crop/idempotence properties, the own-dimension bypass,
source preservation, taint/error handling, captured intrinsics, main-thread
OffscreenCanvas, fallback guards, seed lifecycle and settings registrations.
These tests use an in-memory canvas API and do not validate rasterisation or
Chrome injection timing.

The browser suite loads the unpacked extension, enables the actual permission,
and checks exports, exceptions, reloads, nested frames, srcdoc, OffscreenCanvas,
source preservation using a separate verification realm, and session rollover.
GitHub Actions runs both suites. A browser test that cannot launch is a failure,
not a skipped/passing protection check. See VALIDATION.md for observed results.

For manual checks, compare this extension enabled/disabled in the same profile:

- https://browserleaks.com/canvas
- https://abrahamjuliot.github.io/creepjs/
- Normal image upload/crop/export, maps, charts and web image editors you use.

CreepJS findings are diagnostics. Fewer detected modifications are not proof of
better privacy, and a changed canvas hash is not proof tracking is prevented.
