# Validation record — 2026-11-07

## Scope and result

The supplied v1.0.0 ZIP is preserved in commit 8efbfb8. This change adds a
canvas-focused v1.1.0 development build. It does not claim all six roadmap
acceptance criteria are complete.

- Local Node regression suite: 21 tests passing at initial implementation.
- Real Chromium integration: suite added; local launch is blocked by the execution
  environment's socket restrictions. It has NOT been recorded as passing.
- BrowserLeaks, CreepJS and everyday-site compatibility: not executed here.
- Worker canvas coverage and atomic startup seed rollover: unresolved, documented.
- Fully adversarial fingerprint recovery: not established. Upper colour bits are
  intentionally retained; perturbation is not a general anti-fingerprinting proof.

## Roadmap disposition

| Item | Implementation | Evidence / remaining work |
| --- | --- | --- |
| Reproducible tests | Node tests + actual-extension Chromium suite + CI | Node pass; browser results required |
| Export bypass | Captured native getters, no clean fallback, captured ImageData/intrinsics | Node regression pass; browser regression added |
| Noise model | Crop-independent, idempotent low-bit projection, top-origin partition | Previous rectangle attack no longer recovers discarded bits; high-bit/other attacks remain |
| Alternative canvas paths | Main-thread OffscreenCanvas, frame insertion hooks and fallback guard | Model tests pass; iframe timing/browser verification pending; workers uncovered |
| Startup/controls | In-place updates, serial settings, explicit permission/error/reload status | Mock registration tests pass; old startup-seed window remains |
| Compatibility/detectability | Preserve native method descriptors/name/length; docs and browser tests | Manual websites/CreepJS and colour-format review still required |

## Important change in tradeoff

Readbacks now change RGB channels by up to 3 instead of sparse +/-1 changes.
Fallback documents can receive SecurityError rather than unmodified pixels.
Wide-gamut/HDR fidelity is not preserved. Exceptions remain the compatibility
escape hatch and require reloading the affected documents.
