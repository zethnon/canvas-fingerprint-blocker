# Chromium performance — v1.3.0

Measured using the actual unpacked extension on one headless GitHub Actions
runner, Chrome for Testing 151.0.7922.34. Results are diagnostic, not predictions
for every machine/site. The comparison baseline is our v1.2 transform, not the
original Web Store extension. No extra protection is disabled to improve scores.

- Tested code: `2e985ed142da550f424a9ecf0262ad06e0985ef6`
- Run: https://github.com/zethnon/canvas-fingerprint-blocker/actions/runs/42427560236
- Numeric summary: [reports/performance-v1.3.json](reports/performance-v1.3.json)
- Full report: `canvas-audit` Actions artifact (`audit.json`). Includes 256x128,
  1024x1024 and 2048x2048 scenes, first reads and memory deltas.

## Same-runner warm medians

Five samples after the first call. Canvas rows below are 1024x1024 pixels.
Values rounded to 0.1 ms. Mode order was off, v1.2, v1.3, v1.3 + radar;
this is a small sequential benchmark, not a randomised statistical study.

| Operation | Off | v1.2 | v1.3 | v1.3 + radar |
| --- | ---: | ---: | ---: | ---: |
| Text canvas getImageData | 2.3 ms | 43.8 ms | 19.7 ms | 20.0 ms |
| Text canvas toDataURL | 8.3 ms | 53.3 ms | 28.9 ms | 29.1 ms |
| Text canvas toBlob | 5.2 ms | 51.4 ms | 27.8 ms | 26.1 ms |
| High-colour getImageData | 2.3 ms | 216.3 ms | 28.3 ms | 28.1 ms |
| High-colour toDataURL | 55.5 ms | 271.3 ms | 79.5 ms | 82.9 ms |
| High-colour toBlob | 49.5 ms | 277.6 ms | 72.5 ms | 73.5 ms |
| Insert/remove 2,000 DOM nodes | 2.1 ms | 9.8 ms | 3.6 ms | 3.7 ms |
| Drawing-only frame interval | 16.7 ms | 16.7 ms | 16.7 ms | 16.7 ms |
| Dedicated Blob worker startup | 4.2 ms | 7.1 ms | 7.4 ms | 7.4 ms |

The first v1.3 high-colour getImageData took **89.8 ms** while filling its colour
cache. Warm reads do not represent that first-call cost. Export methods ran after
getImageData, so their first samples also benefited from that populated cache.
Differences such as a slightly faster radar-on sample are ordinary run variation;
these results do not prove zero overhead from reporting. Timers are batched and
radar remains off by default.

## Changes responsible for the improvement

- Cache final projected RGB values instead of recalculating representatives per
  pixel. Repeated adjacent buckets use a one-entry hot cache.
- Keep a small Map for simple images; high-colour scenes promote once to a
  bounded 65^3 Uint32 table, avoiding v1.2's repeated cache clear/recompute cycle.
- Use a direct byte path; preserve rounding/clamping for float16.
- Avoid native iframe-getter exceptions on ordinary DOM nodes and skip subtree
  selector scans on leaves. Frame protection remains enabled.
- An equivalence regression compares v1.2/current output across two seeds and
  120,000 pixels, including promotion, transparency and repeated transformation.

A populated dense table retained about **1.05 MiB** of ArrayBuffer backing per
protected realm in the high-colour case. The measured retained heap delta was
about 72 KiB for the whole candidate scene; this is not a peak-allocation figure.
Exports still allocate a full-size canvas copy and pixel buffer. Chrome/GPU
memory, transient allocations and combined many-tab memory were not measured.

## Practical impact

Ordinary drawing does not transform pixels until a covered read/export happens.
The synthetic drawing-only test stayed near 60 fps, but it is not a general
website responsiveness benchmark. DOM/frame guards add some page overhead, and
Blob worker startup adds a few milliseconds in this fixture. High-frequency
readback, image editors and large exports can still cause visible stalls.
Use site exceptions for trusted, incompatible or fidelity-sensitive applications.

The first audit's supposed high-colour scene accidentally clamped two RGB bytes.
That generator was corrected before this recorded comparison. Earlier results
from that scene must not be treated as genuine high-colour measurements.
