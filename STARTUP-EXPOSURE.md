# Startup-page exposure investigation — 2026-11-08

**Do not install this experimental branch.** The tested release remains v1.3.1:
https://github.com/zethnon/canvas-fingerprint-blocker/archive/db61137402f5891b55f69248e1b385cc1d6133d8.zip

The proposed manifest-only `use_dynamic_url: true` change is **not compatible
with the current startup redirect in the tested browser**. No such change was
merged into fix/core-rewrite.

## Actual browser observations

- Chrome for Testing 151.0.7922.34, unpacked extension, real Allow user scripts
  setting enabled. Uses v1.3.1 runtime code with only dynamic resource URLs enabled.
- `chrome.runtime.getURL('startup.html')` returned a dynamic resource ID.
- A page fetch to the known static resource URL rejected with TypeError.
- A freshly installed startup redirect failed with **ERR_BLOCKED_BY_CLIENT**;
  it did not open the destination. Therefore query/fragment preservation could
  not pass either. This was not merely a destination-string mismatch.
- Browser restart rotated the resource ID. Simulating the persisted old redirect
  before background refresh also failed with ERR_BLOCKED_BY_CLIENT.
- Diagnostic run: https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42430737693
- Tested revision: `167522e4588b289d23989f1c4201ad1465de9952`.
- Machine-readable observations: [reports/startup-exposure.json](reports/startup-exposure.json).

The diagnostic job being green means it collected observations, **not** that
this manifest change passed compatibility. The follow-up commit has the same
source tree; its repeated run is not independent evidence.

## Decision

Retain the v1.3.1 startup resource configuration. It remains web accessible and
therefore provides an extension-detection surface if a site knows the extension
ID and resource path. Dynamic IDs address predictable resource addressing; they
are not destination validation or a general open-redirect defence.

A future solution must handle browser startup before the background worker has
refreshed persisted redirect rules. It should bind continuation to an expected
top-level navigation and pass exact query/fragment, restart, setup-error recovery,
exception and POST tests. Replacing the current redirect with another broad
interception mechanism without these checks would trade one flaw for breakage.
No safe replacement was implemented or established by this spike.

Fallback-frame worker blocking is a separate intentional compatibility trade-off.
Leave that policy intact until a concrete affected application can be reproduced;
site exceptions are the existing user-controlled workaround. Removing the block
without equivalent protection reopens an uncovered execution path.

## Primary references

- Chrome web-accessible resource semantics / per-session IDs:
  https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources
- Chromium report of dynamic URL + DNR destination parameter/fragment problems:
  https://issues.chromium.org/issues/461836625

The historical browser report is context, not proof of the cause of the blocked
redirect observed here. This spike did not test Chrome 138 or the user's Chrome
156, all redirect variants, or claim this limitation is impossible to solve.
