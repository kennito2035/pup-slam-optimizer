# Changelog

All notable changes to LiDAR Arrangement Optimizer for PUP are documented here.

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
