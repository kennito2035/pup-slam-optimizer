# LiDAR Arrangement Optimizer for PUP — v1.0.0

A standalone browser tool that uses **Multi-Objective Particle Swarm Optimization (MOPSO)** and **Fibonacci sphere seeding** to find optimal LiDAR sensor arrangements for drone platforms. Designed specifically for use with **[PUP — Parameter Uplink Spectagraph](https://github.com/kennito2035/pup-slam-simulation)**, a PUP simulator inspired by Prometheus 2012. Results can be exported directly as parameter tables for input into parametric CAD assemblies.

---

## Overview

Given a sensor count, drone body radius, and LiDAR hardware specifications, the optimizer searches for sensor orientations (pitch + yaw) that simultaneously maximize volumetric coverage and minimize inter-sensor overlap. The search space is the surface of a sphere, constrained to a user-selected orientation zone. A live Plotly 3D visualization updates in real time as the swarm evolves.

---

## Features

- **MOPSO** — Multi-Objective Particle Swarm Optimization with a capped Pareto archive (max 100 solutions). Each PSO step runs 3 sub-iterations per animation frame via `requestAnimationFrame`, keeping the UI responsive throughout
- **Fibonacci sphere initialization** — The swarm is seeded using the golden-angle Fibonacci spiral, giving near-uniform initial sensor spacing across the sphere before perturbation
- **Two-objective fitness evaluation** — Each particle is evaluated against two objectives: blind spot ratio (fraction of 1,200 reference sphere points not covered by any sensor) and maximum pairwise sensor overlap (cosine similarity of facing normals). The Pareto front tracks all non-dominated solutions
- **Body occlusion test** — For every reference point, a ray-sphere intersection check (`checkOcclusion`) determines whether the drone body blocks the line of sight from the sensor to the evaluation point, excluding self-occluded coverage from the fitness score
- **Cosine-normalized yaw velocity** — Yaw PSO updates are divided by `cos(pitch)` to prevent particles from spinning excessively near the poles, stabilizing convergence at high and low latitudes
- **Patience-based auto-stop** — Optimization halts automatically after 120 consecutive iterations with improvement below `1e-6`, preventing unnecessary compute after convergence
- **Angular resolution auto-calculator** — H. and V. angular resolutions are computed live from scan frequency, ranging frequency, beam divergence (converted from mrad), channels, and FOV — accounting for beam divergence as a floor on the achievable resolution
- **CAD export matrix** — Produces a formatted plain-text report of all optimized sensor positions (pitch °, yaw °) alongside full hardware specs, PSO solution quality, and Pareto front size. Suitable for pasting directly into parametric assembly environments
- **Controls lockout during optimization** — All inputs are disabled while the swarm runs; only the Stop button remains interactive

---

## File Structure

```
PUP-optimizer-v1.0.html   # Main entry point and UI layout
script.js                 # MOPSO engine, fitness evaluation, Plotly visualization, export
styles.css                # Dark-mode UI styling
```

---

## Dependencies

- [Plotly.js 2.27.0](https://cdn.plot.ly/plotly-2.27.0.min.js) — 3D scatter visualization

> No build step required. Open `PUP-optimizer-v1.0.html` directly in any modern browser. Internet connection required on first load.

---

## Usage

### 1. Configure LiDAR Parameters
| Field | Description |
|---|---|
| **Vertical FOV (°)** | Beam width of each scanner (horizontal FOV is fixed at 360°) |
| **Channels / Beams** | Number of vertical beam layers per scanner |
| **Ranging Distance** | Min and max sensing range in meters |
| **Scanning Frequency** | Rotation rate in Hz |
| **Ranging Frequency** | Pulse rate in kHz — drives angular resolution calculation |
| **Measurement Noise** | Expected ranging noise in cm |
| **Beam Divergence** | H. and V. divergence in mrad — sets a floor on angular resolution |

H. and V. angular resolutions are computed automatically and displayed as read-only fields.

### 2. Configure Drone Parameters
| Field | Description |
|---|---|
| **Sensor Count (N)** | Number of LiDAR units to place, 2–16 |
| **Drone Body Radius** | Physical drone hull radius in meters; mount radius is auto-set to `body radius + 0.30 m` |
| **Sensor Orientation** | Constrains the search space to a hemisphere or band: Omni-Directional, Upper Hemisphere, Lower Hemisphere, or Equatorial Band (±45°) |

### 3. Configure PSO Algorithm
| Field | Description |
|---|---|
| **Swarm Size** | Number of particles, 5–60 |
| **Inertia Weight (ω)** | Momentum carried from previous velocity, 0.20–0.99 |
| **Cognitive Coeff (c₁)** | Pull toward each particle's personal best |
| **Social Coeff (c₂)** | Pull toward the global best from the Pareto archive |

### 4. Run
Click **Optimize** to start. The 3D plot updates every 15 iterations showing current sensor positions, scanning arcs, the reference coverage sphere, and the drone body. The status log reports iteration count, coverage %, max overlap %, and Pareto front size.

Click **Stop** at any time to halt and unlock controls. The optimizer also stops automatically on convergence.

### 5. Export
Click **Export Optimized Positions** to open the CAD Export Matrix modal, containing a full formatted report of sensor positions and hardware specs.

---

## Spatial Analytics

| Metric | Description |
|---|---|
| **Vol. Coverage** | Percentage of reference sphere points visible to at least one sensor, accounting for body occlusion |
| **Blind Spots** | Inverse of coverage — fraction of the sphere not seen by any sensor |
| **Body Radius** | Current drone body radius setting |
| **Max Overlap** | Highest pairwise cosine similarity between any two sensor normals |
| **Pareto Front** | Number of non-dominated solutions in the current archive |
| **Best Score** | Weighted scalar `0.8 × blindRatio + 0.2 × maxOverlap` of the best archive member |

---

## Algorithm Notes

**Fitness objectives** (both minimized):
- `obj[0]` — blind spot ratio: `1 - coveredPoints / totalRefPoints`
- `obj[1]` — max overlap: highest absolute dot product between any two sensor normal vectors

**Best archive member** is selected by weighted scalarization: `0.8 × obj[0] + 0.2 × obj[1]`, prioritizing coverage over overlap reduction.

**Velocity clamping** — pitch and yaw velocities are clamped to `±0.35 rad/step`. Yaw velocity is further normalized by `cos(pitch)` to maintain uniform angular step size across latitudes.

**Pareto dominance** — solution A dominates B if A is better or equal on both objectives and strictly better on at least one. The archive is capped at 100 members; oldest excess members are pruned when the cap is reached.

---

## Browser Compatibility

Any modern browser supporting **ES6** and **WebGL** (required by Plotly 3D). Tested in Chrome, Firefox, and Edge.