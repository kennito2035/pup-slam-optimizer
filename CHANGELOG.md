# Changelog

All notable changes to LiDAR Arrangement Optimizer for PUP are documented here.

---

## [1.1.1]: PUP-optimizer-v1.1.1.html

### Fixed
- **Convergence detection**: the plateau counter previously reset on any score change larger than `1e-6`, including changes for the worse, so noisy runs could fail to auto-stop; it also counted animation frames (3 iterations each) while the documentation promised iterations. The counter now advances by 3 per frame and resets only when the best score improves by more than `1e-6`, with `PATIENCE` set to 360 iterations.
- **Reference point count unified**: the page loaded 2,000 reference points but each Optimize click silently regenerated 1,200 of them, visibly thinning the coverage sphere and contradicting the README. A single `REF_POINT_COUNT = 2000` constant is now used everywhere.
- **Plot update guards**: `updateLivePlot` exits early until the Plotly plot exists (an input event before initialization previously threw), skips `Plotly.update` when there are no sensor traces yet, and only writes `marker.color` once coverage colors have been computed.
- **Sensor body mesh payload**: the `mesh3d` sensor bodies were fed polyline-style `null` break markers and duplicated connector points, which the convex hull routine happened to tolerate. The payload is now a clean two-ring vertex list.
- **Input validation**: vertical FOV, cognitive and social coefficients, and drone body radius fall back to their defaults and clamp to their documented ranges when blank or out of range; vertical FOV is capped at 180 in the markup because the half-angle coverage model is not meaningful beyond it.

### Changed
- **Objective naming**: the second objective has been the volumetric redundancy ratio since 1.0.1, but the stat grid, status log, and CAD export still labeled it "Max Overlap". All three now read "Redundancy", and the README algorithm sections describe the implemented formula. Anything parsing the export text for the old label needs the new one.
- **View preserved across runs**: restarting the optimizer no longer resets the 3D camera to the default angle.
- **Dead code removed**: the pre-run trace clearing block (the plot is rebuilt from scratch on every start), the `oninput` handler on the read-only horizontal FOV field, and the double-start window on the Optimize button.
- **Seed yaw wrapping**: swarm seeding now uses the same double-modulo wrap as the PSO step, keeping seeded yaw inside the [-180, 180) degree range.
- **Version string**: `<title>` updated from `"PUP Optimizer v1.1.0"` to `"PUP Optimizer v1.1.1"`.
- **README corrections**: dependency entry updated to Plotly.js 3.4.0 (the page has loaded 3.4.0 since 1.1.0), and a note added that fitness is evaluated on a reference shell at body radius + 10 m.

---

## [1.1.0] — PUP-optimizer-v1.1.0.html

### Changed
- **Upgraded Plotly.js library** — Migrated from version `2.27.0` to `3.4.0`. This update provides improved WebGL rendering performance and the latest visualization features from the Plotly CDN.
- **Version string** — `<title>` updated from `"PUP Optimizer v1.0.1"` to `"PUP Optimizer v1.1.0"`.

---

## [1.0.1] — PUP-optimizer-v1.0.1.html

### Added
- **Window resize handler** — `window.addEventListener('resize', ...)` added at the end of `window.onload`. On any resize event, `Plotly.Plots.resize(plotDiv)` is called to reflow the 3D plot to match its container, preventing the plot from clipping or leaving dead space after the window is resized.

### Changed
- **Second fitness objective replaced: max pairwise overlap → volumetric redundancy ratio** — `computeObjectives()` reworked. `obj[1]` was previously the maximum cosine similarity between any two sensor normals, derived from a separate O(n²) pairwise dot-product loop after the coverage pass. It is now a normalized **redundant hit ratio**: the inner sensor loop no longer breaks on first hit — instead a `hits` counter accumulates every sensor that can see each reference point. Points with `hits > 1` contribute `hits - 1` to `redundantCount`. The final value is `redundantCount / (evalPoints.length × (n - 1))`, keeping `obj[1]` between 0.0 and 1.0 and scaling correctly with sensor count. The O(n²) normal-dot loop is removed entirely.
- **CSS layout fixes for full-height plot rendering:**
  - `.generative-section` — added `grid-template-rows: 100%`, changed `flex: 1 1 0` to `flex: 1`, added `height: 100%`
  - `.controls` — added `height: 100%`
  - `.plot-container` — added `height: 100%` and `width: 100%`, ensuring the Plotly div fills its grid cell completely at all viewport sizes
- **Version string** — `<title>` updated from `"PUP Optimizer v1.0.0"` to `"PUP Optimizer v1.0.1"`.

---

## [1.0.0] — PUP-optimizer-v1.0.html

Initial release.

### Features
- MOPSO with Fibonacci sphere seeding and Pareto archive (max 100 solutions)
- Two-objective fitness: blind spot ratio + max pairwise sensor overlap
- Body occlusion test via ray-sphere intersection per reference point
- Cosine-normalized yaw velocity to prevent polar spin-out
- Patience-based auto-stop after 120 iterations without improvement (`< 1e-6`)
- Angular resolution auto-calculator with beam divergence floor
- Live Plotly 3D visualization updating every 15 iterations
- CAD Export Matrix modal with full sensor position and hardware spec report
- Controls lockout during optimization; Stop button always active
- Support for 2–16 sensors across four orientation zones: Omni-Directional, Upper Hemisphere, Lower Hemisphere, Equatorial Band (±45°)
