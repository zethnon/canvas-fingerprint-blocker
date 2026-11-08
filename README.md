# Fingerprint Shield (personal) — canvas-focused development build (v1.3.0)

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

Click the extension icon to open the protection/activity popup. Its **Enable
protection** switch changes registration for future documents. Previously installed
hooks remain until those documents reload. Exceptions include subdomains;
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
  configuration variable, DOM settings bridge or fake response header. Page events
  never configure protection; the optional radar treats page reports as untrusted.
- Main-thread OffscreenCanvas 2D readbacks and convertToBlob are wrapped.
- Tracked dedicated Blob workers get protected before their original code runs.
  Configuration is sent through captured native messaging, never baked into a
  fetchable Blob URL. Immediate original URL revocation and nested workers are supported.
- Parent accesses and common insertion methods patch same-origin fallback frames,
  including child insertion methods for nested frames. A browser content-script
  guard blocks canvas reads in fallback documents (about:blank/srcdoc/data/blob)
  when they execute without a usable seeded installer. New workers in fallback
  frames are denied rather than constructed in the parent's CSP realm. This can
  break legitimate frame-based image workflows; use site exceptions when appropriate.
- Existing script registrations are updated in place. Queued preferences are not
  dropped. Permission/setup failures are surfaced in Options and the action title.
- An optional local canvas activity radar is available in the popup. No audio,
  font, hardware spoofing or general tracker blocklist is included.

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
- **Startup navigations may briefly show an extension page.** A persistent
  browser redirect holds non-exempt HTTP(S) GET main-frame requests until this
  session's seeded registration is installed. A higher-priority session-only
  allow rule releases them. Chrome clears that allow on browser restart.
  The extension page opens the destination after setup; unavailable permissions
  keep it on the setup page instead of silently continuing. Disabling protection
  removes the navigation hold. This requires declarativeNetRequestWithHostAccess.
  POST/form submissions are never redirected, so those startup responses are not
  covered by this hold. HTTP cache, service-worker responses and history
  restoration are not all the same network path. The audit **confirmed a
  CacheStorage service-worker response bypass**: it could execute using the
  preceding registration before refresh. Already running documents also remain
  outside this safeguard's guarantee.
- **Colour conversion matters.** Canvas exports use an sRGB 8-bit copy. Wide gamut,
  float16/HDR, alpha premultiplication and WebGL drawing-buffer lifetime can produce
  export/readback differences. Float16 reads are projected into 8-bit RGB while
  preserving alpha. Use exceptions for fidelity-sensitive editing applications.
- **Export cost is proportional to pixel count**, including a full-size copy and
  CPU readback. A small colour Map promotes after 4096 buckets to a bounded
  65^3 Uint32 table (~1.05 MiB per protected realm that uses high-colour readback).
  It stores transformed colours, not source images. Repeated-colour reads use a
  one-entry hot cache. Avoid high-frequency image-processing workloads without
  measuring overhead; see PERFORMANCE.md.
- No protection for WebGL readPixels, WebGPU, audio, fonts, cookies, account logins,
  IP addresses or other browser signals. No stealth or undetectability guarantee.

## Optional canvas radar

Open the popup, enable **Collect canvas activity locally**, then reload the tab.
Use **Refresh** to inspect counts for getImageData, exports, main-thread
OffscreenCanvas and tracked Blob workers. The popup also labels observed URL
worker creation as uncovered. It does not monitor WebGL/audio/fonts or all
SharedWorker/service-worker activity.

- Disabled by default; no reporting bridge, timers or counters are installed in
  new page documents while disabled. Already loaded hooks require a reload.
- Counts and frame origins stay in extension session storage; no seeds, full
  page URLs or telemetry are recorded. No network reporting is added.
- Reports are batched (about once per second per reporting realm). Retention is
  bounded to 30 tabs / 20 frames per tab. Navigation/tab close, Clear, disabling
  collection, or browser shutdown clear the relevant counters.
- Reports are **best effort and page-influenceable**. Pages can forge/suppress
  their own activity. Short-lived documents/workers can close before a batch
  arrives. Frame identity comes from Chrome; worker activity is attributed to
  its creating frame. Counts describe attempted API calls, including calls
  that throw; they are not a tracker verdict or a protection guarantee.

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

The optional audit uses the same runner for unprotected/v1.2/current comparisons:

```sh
CANVAS_AUDIT=1 CANVAS_EXTERNAL=0 npm run test:browser
# Set CANVAS_EXTERNAL=1 to also visit BrowserLeaks and CreepJS once off/on.
```

Routine CI does not contact those diagnostic sites. Commit markers `[bench]` and
`[audit]` explicitly enable local-only or external diagnostics respectively. The
`canvas-audit` Actions artifact contains timing, retained JS memory deltas and
coverage findings; it deliberately omits fingerprint identifiers.
