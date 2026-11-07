# Validation record — 2026-11-07

## Current build: v1.2.0

**31 Node tests and 18 actual-extension Chromium checks passed.** The browser
runner reports 19 passing tests because it also counts the enclosing integration
case. Nothing was skipped.

- Tested code: `36dcd91abc304d7ec38b2df14a2f7fe16e9e3ae5`.
- CI: https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42425611338
- Browser: Chrome for Testing 151.0.7922.34 on GitHub Actions.
- Local Chromium cannot launch in the execution environment because of socket
  restrictions; browser results were obtained remotely, not inferred from mocks.
- The original supplied ZIP remains preserved in commit `8efbfb8`.

## Worker and startup scope

| Area | Implemented and tested | Remaining limits |
| --- | --- | --- |
| Session model | Same top-level origin/session gives consistent protected results; new session changes them | Exact origin partitioning, not eTLD+1 grouping |
| Dedicated Blob workers | Classic, module and nested workers receive the same projection before original code runs | Only Blob URLs tracked after injection; URL/shared/service workers remain uncovered |
| Worker lifecycle/security | Immediate original-URL revocation works; retained URLs released on readiness/error/termination; no seed in fetchable bootstrap | Module messages queued during import are replayed with isTrusted=false; import.meta.url changes; CSP/Trusted Types may reject bootstrap |
| Worker policy | Native URL worker URL identity and response CSP preserved | URL workers are deliberately not rewritten, so their canvas APIs remain clean |
| Iframes | Blank/nested/window.frames, self-executing srcdoc and parser-created/navigated srcdoc checks pass | Other timing, sandbox, insertion and browser-version cases remain unverified |
| Startup | Persistent GET-navigation hold is released only after current seeded registration; destination query and fragment preserved | Only navigations handled by the browser request-rule engine; already executing pages and some cache/service-worker/history paths are outside the guarantee |
| Forms | POST navigation keeps the original method and body during startup hold | Non-GET startup responses are deliberately outside the hold |
| User controls | Disable removes script/guard/rules; exceptions restore unmodified reads after reload | Previously loaded documents/workers keep installed hooks until reload/termination |

The first marker-based startup experiment failed because Chromium ran userScripts
before dynamic content scripts. It was removed. The current solution coordinates
in extension/browser origin using request rules, instead of trusting page events
or exposing a seed. The new request-rule permission is required for this hold.

## Other regression checks

- Own dimension properties cannot force clean canvas exports.
- Native ImageData/intrinsic capture resists the tested page tampering paths.
- Exports never catch a protection error and silently retry against clean source.
- Crops and full-image reads agree; the demonstrated overlapping-rectangle attack
  no longer recovers discarded information from differently noised rectangles.
- Repeated opaque read/write loops are stable; source canvas pixels remain intact.
- Main-thread OffscreenCanvas read/export paths are protected.
- PNG toBlob and toDataURL agree for the tested opaque drawing.
- No page-global config/installer or legacy hidden div is exposed.
- Site exceptions, permission errors, queued settings, session storage lifecycle
  and registration order are covered by Node tests and browser integration.
- A modified Array iterator cannot replace the Blob bootstrap in the model test.

## Not established by these results

- Complete fingerprint blocking, undetectability or resistance to every recovery
  attack. Coarse image information and other identifying APIs remain available.
- URL-worker, SharedWorker or service-worker canvas protection.
- All startup navigation paths, browser versions or iframe timing combinations.
- Wide-gamut/HDR/float16 or transparency fidelity for image editors.
- BrowserLeaks, CreepJS or everyday-site compatibility: not executed here.
- Image-editor/frame-rate performance. An earlier local Node VM test on a
  synthetic 1024 x 1024 opaque image took about 403 ms for protected getImageData,
  including the in-memory mock. This is not a Chromium rendering benchmark.

Use site exceptions for incompatible or fidelity-sensitive applications. The
extension remains a canvas-focused development build, not an anonymity guarantee.

## Previous baseline

v1.1.0 passed 22 Node tests and 11 Chromium checks in run:
https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42422308100
The v1.2.0 suite retains those cases and adds worker/startup/policy coverage.
