# Validation record — 2026-11-08

## Current build: v1.3.1

**39 Node tests and 21 actual-extension Chromium checks passed.** Chromium
reports 22 including the enclosing case; nothing skipped.

- Tested code: `9e915072c1e6f9e8d52000fd453d186b0c8cbf55`.
- CI: https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42430500508
- Recovery regression: setup error does not automatically disable protection;
  script-generated clicks cannot invoke recovery; a real top-level button click
  disables globally, removes request rules/registrations and opens the exact
  original destination including query/fragment. Malformed exception preferences
  cannot prevent disabling. Embedded pages hide/reject the recovery control.
- Removed unused notifications permission. Workflow actions are pinned to the
  exact v4 commit SHAs resolved from their official repositories.
- Existing canvas tests remain green. External diagnostics/performance were not
  rerun for this recovery/permission/CI change; the v1.3.0 observations below
  retain their original tested revision and limits.

## v1.3.0 audit baseline

**38 Node tests and 20 actual-extension Chromium checks passed.** The browser
runner reports 21 passing tests because it also counts the enclosing integration
case. Nothing was skipped.

- Final audit code: `f6ba4d43f03306729da64807f76610bbda095df1`.
- CI: https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42427774043
- Browser: Chrome for Testing 151.0.7922.34 on GitHub Actions.
- Local Chromium cannot launch in the execution environment because of socket
  restrictions; browser results were obtained remotely, not inferred from mocks.
- The original supplied ZIP remains preserved in commit `8efbfb8`.
- Performance comparison and retained-memory findings: [PERFORMANCE.md](PERFORMANCE.md).

## v1.3 coverage and diagnostics

- Image upload/File input, decode, crop and PNG export round-trip passed in a
  real browser fixture. Drawing-only frame intervals stayed near 16.7 ms in the
  measured scene. This does not establish compatibility with all editors/sites.
- Opt-in radar collected both page and protected Blob-worker calls, rendered
  them in the popup, cleared tab data, and stopped collection on disabling.
  Unit checks cover opt-in registration, bounded storage/counts, navigation
  identity, message validation and batching/rate limits.
- URL worker canvas readback **returned the original pixel**, confirming the
  documented gap while preserving the native worker's URL and response CSP.
- A controlled pre-registration/startup window with a CacheStorage-served
  document **bypassed the navigation broker and observed the preceding mapping**.
  The test simulates missing session readiness; it does not measure how often
  real browser starts hit that window. No safe generic worker/cache fix was
  established within the current extension architecture.
- BrowserLeaks and CreepJS both completed with HTTP 200 and no captured page
  errors, once with protection off and once on. Radar was disabled for these
  external checks. Successful execution is not a protection/privacy pass.
- CreepJS: **0 lies off / 27 lies on**, across 13 wrapped APIs. It detected
  object-toString/recursion behaviour on canvas/DOM/frame wrappers and explicitly
  flagged modified getImageData pixels. The extension is detectable; optimising
  it did not conceal those modifications. No global Function.toString override
  was added to hide them.
- BrowserLeaks reported database uniqueness **99.87% off / 100% on**. A novel
  perturbed signature can be unique in that database. This result does not show
  that protection failed to alter pixels or that tracking was prevented; it
  certainly must not be presented as improved anonymity.
- Selected observations without fingerprint identifiers are committed in
  [reports/diagnostics-v1.3.json](reports/diagnostics-v1.3.json). Full audit data
  is in the run's `canvas-audit` artifact.

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
- Broad everyday-site/image-editor compatibility: only the stated fixture and
  diagnostic sites were exercised.
- General browsing speed, peak Chrome/GPU memory or user-machine performance.
  The headless Chromium benchmarks in PERFORMANCE.md have explicit limits.

Use site exceptions for incompatible or fidelity-sensitive applications. The
extension remains a canvas-focused development build, not an anonymity guarantee.

## Previous baseline

v1.2.0 passed 31 Node tests and 18 Chromium checks in run:
https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42425611338

v1.1.0 passed 22 Node tests and 11 Chromium checks in run:
https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42422308100
The v1.3.0 suite retains those cases and adds transform equivalence, image
workflow and opt-in radar coverage.
