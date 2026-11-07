# Validation record — 2026-11-07

## Scope and result

The supplied v1.0.0 ZIP is preserved in commit 8efbfb8. This change adds a
canvas-focused v1.1.0 development build. It does not claim all six roadmap
acceptance criteria are complete.

- Node regression suite: 22 tests passing locally and in GitHub Actions.
- Real browser integration: **11 checks passed** (12 Node test results including
  the enclosing integration test) in Chrome for Testing 151.0.7922.34 on GitHub
  Actions, run [42422308100](https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42422308100),
  code commit d8c96c36eb45729231dec631dd7a11729278caba.
  The suite loads the actual unpacked extension and grants its real user-script
  permission. Local Chromium launch remains blocked by socket restrictions;
  successful browser validation was performed remotely, not inferred from mocks.
- BrowserLeaks, CreepJS and everyday-site compatibility: not executed here.
- Worker canvas coverage and atomic startup seed rollover: unresolved, documented.
- Fully adversarial fingerprint recovery: not established. Coarse colour information is
  intentionally retained; perturbation is not a general anti-fingerprinting proof.

## Roadmap disposition

| Item | Implementation | Evidence / remaining work |
| --- | --- | --- |
| Reproducible tests | Node tests + actual-extension Chromium suite + CI | 22 Node tests and 11 browser checks pass |
| Export bypass | Captured native getters, no clean fallback, captured ImageData/intrinsics | Node and real-browser getter bypass regressions pass; taint model test passes |
| Noise model | Crop-independent, idempotent site-shifted bucket projection, top-origin partition | Previous rectangle attack no longer recovers discarded bits; coarse-feature/other attacks remain |
| Alternative canvas paths | Main-thread OffscreenCanvas, frame insertion hooks and fallback guard | Model and real-browser blank/nested/srcdoc checks pass; other realm races and workers remain |
| Startup/controls | In-place updates, serial settings, explicit permission/error/reload status | Registration mocks and browser reload/exception/session checks pass; startup-seed window remains |
| Compatibility/detectability | Preserve native method descriptors/name/length; docs and browser tests | Manual websites/CreepJS and colour-format review still required |

## Important change in tradeoff

Readbacks now change RGB channels by up to 3 instead of sparse +/-1 changes.
Fallback documents can receive SecurityError rather than unmodified pixels.
Wide-gamut/HDR fidelity is not preserved. Exceptions remain the compatibility
escape hatch and require reloading the affected documents.

## Performance observation

A local Node VM check of a synthetic random 1024 x 1024 opaque image took roughly
403 ms for one protected getImageData call (including the in-memory canvas mock).
This is not a Chromium rendering benchmark. The cost is material for large images;
real image-editor/frame-rate workloads still need measurement and may need exceptions.

## Browser checks that passed

- Protection differs from disabled output; repeated reads/reloads are stable.
- Exceptions return original output after reload; removing them restores protection.
- Top-level and cross-origin embedded frames use the top-level-origin partition.
- Own dimension properties cannot force a clean export.
- Overlapping rectangles agree and opaque read/write loops stay stable.
- Native readback in a separate verification realm confirms source preservation.
- PNG toBlob and toDataURL exports agree on the tested opaque drawing.
- Main-thread OffscreenCanvas read/export paths run with protection.
- window.frames, nested blank frames and self-executing srcdoc do not return the
  unprotected reference image in the tested insertion paths.
- No configuration/installer global or legacy hidden div is exposed.
- A new session produces different output after registration completes.

These checks do not establish complete fingerprint resistance, HDR/alpha fidelity,
all iframe insertion/navigation races, or worker coverage.
