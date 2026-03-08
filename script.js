const COLORS = ["#00e5ff", "#ff3366", "#7c3aed", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16", "#ef4444", "#3b82f6", "#eab308", "#d946ef", "#00ffaa", "#ffaa00", "#aa00ff", "#ff00aa"];

let optAnimFrame, isOptimizing = false,
    optimizationStarted = false,
    genParams = [],
    refPoints = [],
    evalPoints = [],
    currentEpoch = 0;

// ─────────────────────────────────────────────────────────────
// MOPSO State
// ─────────────────────────────────────────────────────────────
let swarm = [];
let paretoArchive = [];
let bestScore = Infinity;
let noImprovementCount = 0;
const PATIENCE = 120;
const TOLERANCE = 1e-6;
const V_MAX = 0.35;
const ARCHIVE_MAX = 100;

// ─────────────────────────────────────────────────────────────
// Helper: derive mount radius from body radius (no slider)
// ─────────────────────────────────────────────────────────────
function getMountRadius() {
    return parseFloat(document.getElementById('bodyRadiusSlider').value) + 0.30;
}

// ─────────────────────────────────────────────────────────────
// Controls lock / unlock
// ─────────────────────────────────────────────────────────────
function setControlsLocked(locked) {
    const panel = document.getElementById('controlsPanel');
    if (locked) {
        panel.classList.add('locked');
        // Physically disable inputs so they can't be tabbed into or changed
        panel.querySelectorAll('input, select, button').forEach(el => {
            if (!el.classList.contains('btn-stop')) {
                el.disabled = true;
            }
        });
    } else {
        panel.classList.remove('locked');
        panel.querySelectorAll('input, select, button').forEach(el => {
            el.disabled = false;
        });
    }
}

function updateBodyRadiusDisplay(val) {
    const numVal = parseFloat(val) || 0;
    // Update the Spatial Analytics grid display
    document.getElementById('st-rad').innerText = numVal.toFixed(2) + " m";
    // Trigger the 3D visual update
    updateLivePlot();
}

// ─────────────────────────────────────────────────────────────
// Angular Resolution Auto-Calculator
// ─────────────────────────────────────────────────────────────
function updateAngularResolutions() {
    const hFov = parseFloat(document.getElementById('hFovInput').value) || 360;
    const vFov = parseFloat(document.getElementById('vFovInput').value);
    const channels = parseInt(document.getElementById('channelsInput').value) || 16;
    const scanFreq = parseFloat(document.getElementById('scanFreqInput').value) || 10;
    const rangeFreq = parseFloat(document.getElementById('rangeFreqInput').value) || 300;

    const hDiverg = parseFloat(document.getElementById('hDivergInput').value) || 0;
    const vDiverg = parseFloat(document.getElementById('vDivergInput').value) || 0;

    // Convert mrad to degrees
    const hDivergDeg = hDiverg * 180 / Math.PI / 1000;
    const vDivergDeg = vDiverg * 180 / Math.PI / 1000;

    const effectiveVFov = Math.max(vFov, vDivergDeg);

    const pointsPerRev = (rangeFreq * 1000) / scanFreq;
    const mechHAngRes = hFov / pointsPerRev;

    const effectiveHAngRes = Math.max(mechHAngRes, hDivergDeg);
    const vAngRes = channels > 0 ? effectiveVFov / channels : effectiveVFov;

    document.getElementById('hAngResDisplay').innerText = effectiveHAngRes.toFixed(4) + '°';
    document.getElementById('vAngResDisplay').innerText = vAngRes.toFixed(4) + '°';
}

function getOrientationRange() {
    const orient = document.getElementById('orientSelect').value;
    switch (orient) {
        case 'upper':
            return [0, Math.PI / 2];
        case 'lower':
            return [-Math.PI / 2, 0];
        case 'equatorial':
            return [-Math.PI / 4, Math.PI / 4];
        default:
            return [-Math.PI / 2, Math.PI / 2];
    }
}

// ─────────────────────────────────────────────────────────────
// Geometry Helpers
// ─────────────────────────────────────────────────────────────
function anglesToVector(pitch, yaw) {
    return [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
}

function generateArc(normal, spanDeg) {
    const mountRad = getMountRadius();
    const r = mountRad;
    const arcVisualRadius = mountRad + 0.2;

    let tmp = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let cx = normal[1] * tmp[2] - normal[2] * tmp[1];
    let cy = normal[2] * tmp[0] - normal[0] * tmp[2];
    let cz = normal[0] * tmp[1] - normal[1] * tmp[0];
    let lenC = Math.hypot(cx, cy, cz);
    let u = [cx / lenC, cy / lenC, cz / lenC];
    let v_vec = [normal[1] * u[2] - normal[2] * u[1], normal[2] * u[0] - normal[0] * u[2], normal[0] * u[1] - normal[1] * u[0]];

    let x = [],
        y = [],
        z = [];
    const spanRad = (spanDeg * Math.PI) / 180;
    const segments = 80;
    for (let i = 0; i <= segments; i++) {
        let t = (i / segments - 0.5) * spanRad;
        x.push(r * normal[0] + arcVisualRadius * (Math.cos(t) * u[0] + Math.sin(t) * v_vec[0]));
        y.push(r * normal[1] + arcVisualRadius * (Math.cos(t) * u[1] + Math.sin(t) * v_vec[1]));
        z.push(r * normal[2] + arcVisualRadius * (Math.cos(t) * u[2] + Math.sin(t) * v_vec[2]));
    }
    return {
        x,
        y,
        z
    };
}

function checkOcclusion(pOrigin, pTarget, bodyRad) {
    const vx = pTarget[0] - pOrigin[0];
    const vy = pTarget[1] - pOrigin[1];
    const vz = pTarget[2] - pOrigin[2];

    const a = vx * vx + vy * vy + vz * vz;
    const b = 2 * (pOrigin[0] * vx + pOrigin[1] * vy + pOrigin[2] * vz);
    const c = (pOrigin[0] * pOrigin[0] + pOrigin[1] * pOrigin[1] + pOrigin[2] * pOrigin[2]) - bodyRad * bodyRad;

    const discriminant = b * b - 4 * a * c;
    if (discriminant > 0) {
        // Find the closest point of intersection along the ray
        const t = (-b - Math.sqrt(discriminant)) / (2 * a);
        // If intersection happens between the sensor (t=0) and the target (t=1), it's blocked
        if (t > 0 && t < 1) return true;
    }
    return false;
}

function getShortestAngle(target, current) {
    let diff = (target - current) % (2 * Math.PI);
    if (diff > Math.PI) diff -= 2 * Math.PI;
    if (diff < -Math.PI) diff += 2 * Math.PI;
    return diff;
}

// ─────────────────────────────────────────────────────────────
// Reference Points — unit sphere, scaled at render time
// ─────────────────────────────────────────────────────────────
function generateReferencePoints(nSamples = 1500) {
    const pts = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < nSamples; i++) {
        let z = 1 - (i / (nSamples - 1)) * 2;
        //if (z < -0.85) continue;	// Ignore the bottom 15% of the sphere (the "South Pole")
        let radius = Math.sqrt(1 - z * z);
        let theta = phi * i;
        pts.push([Math.cos(theta) * radius, Math.sin(theta) * radius, z]);
    }
    return pts;
}

// Display radius for reference sphere: always outside drone body
function getRefDisplayRadius() {
    const bodyRad = parseFloat(document.getElementById('bodyRadiusSlider').value);
    return bodyRad + 10.0;
}

// ─────────────────────────────────────────────────────────────
// Fibonacci Sphere Sensor Initializer
// ─────────────────────────────────────────────────────────────
function fibonacciSphereInit(n) {
    const pts = [];
    const phi = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
        const z = 1 - (i / Math.max(n - 1, 1)) * 2;
        const radius = Math.sqrt(Math.max(0, 1 - z * z));
        const theta = phi * i;
        pts.push({
            pitch: Math.asin(Math.max(-1, Math.min(1, z))),
            yaw: Math.atan2(Math.sin(theta) * radius, Math.cos(theta) * radius)
        });
    }
    return pts;
}

// ─────────────────────────────────────────────────────────────
// Multi-Objective Evaluation
// ─────────────────────────────────────────────────────────────
function computeObjectives(params) {
    const vFov = parseFloat(document.getElementById('vFovInput').value);
    const vDiverg = parseFloat(document.getElementById('vDivergInput').value) || 0;
    const vDivergDeg = vDiverg * 180 / Math.PI / 1000;
    const effectiveVFov = Math.max(vFov, vDivergDeg);

    const vFovRad = effectiveVFov * Math.PI / 180;
    const sinVFovHalf = Math.sin(vFovRad / 2);

    const bodyRad = parseFloat(document.getElementById('bodyRadiusSlider').value);
    const mountRad = getMountRadius();
    const displayR = getRefDisplayRadius();

    const normals = params.map(p => anglesToVector(p.pitch, p.yaw));
    const sensorPos = normals.map(n => [n[0] * mountRad, n[1] * mountRad, n[2] * mountRad]);

    let coveredCount = 0;
    let redundantCount = 0; // Tracks points hit by 2 or more sensors

    for (let pt of evalPoints) {
        const targetPt = [pt[0] * displayR, pt[1] * displayR, pt[2] * displayR];
        let hits = 0; // Count how many sensors can see this specific point

        for (let i = 0; i < normals.length; i++) {
            const n = normals[i];
            const pos = sensorPos[i];

            let dirX = targetPt[0] - pos[0];
            let dirY = targetPt[1] - pos[1];
            let dirZ = targetPt[2] - pos[2];
            const dist = Math.hypot(dirX, dirY, dirZ);

            if (dist === 0) continue;
            dirX /= dist;
            dirY /= dist;
            dirZ /= dist;

            const dot = dirX * n[0] + dirY * n[1] + dirZ * n[2];

            if (Math.abs(dot) <= sinVFovHalf) {
                if (!checkOcclusion(pos, targetPt, bodyRad)) {
                    hits++;
                }
            }
        }
        
        if (hits > 0) coveredCount++;
		if (hits > 1) {
            redundantCount += (hits - 1); // Your intensity multiplier
        }
    }

	const blindRatio = 1 - (coveredCount / evalPoints.length);
    
    // Normalize by maximum possible redundant hits to keep it between 0.0 and 1.0
    const maxPossibleRedundancy = evalPoints.length * (normals.length - 1);
    const overlapRatio = maxPossibleRedundancy > 0 
        ? redundantCount / maxPossibleRedundancy 
        : 0;

    return [blindRatio, overlapRatio];
}

// ─────────────────────────────────────────────────────────────
// Pareto Dominance + Archive
// ─────────────────────────────────────────────────────────────
function dominates(objA, objB) {
    return objA[0] <= objB[0] && objA[1] <= objB[1] &&
        (objA[0] < objB[0] || objA[1] < objB[1]);
}

function updateParetoArchive(candidate) {
    for (let member of paretoArchive) {
        if (dominates(member.obj, candidate.obj)) return;
    }
    paretoArchive = paretoArchive.filter(m => !dominates(candidate.obj, m.obj));
    paretoArchive.push({
        pos: candidate.pos.map(p => ({
            ...p
        })),
        obj: [...candidate.obj]
    });
    if (paretoArchive.length > ARCHIVE_MAX) {
        paretoArchive = paretoArchive.slice(-ARCHIVE_MAX);
    }
}

function selectGlobalBest() {
    if (paretoArchive.length === 0) return swarm[0].pbest;
    return paretoArchive[Math.floor(Math.random() * paretoArchive.length)].pos;
}

function getBestArchiveMember() {
    if (paretoArchive.length === 0) return null;
    return paretoArchive.reduce((a, b) =>
        (a.obj[0] * 0.8 + a.obj[1] * 0.2) < (b.obj[0] * 0.8 + b.obj[1] * 0.2) ? a : b
    );
}

// ─────────────────────────────────────────────────────────────
// MOPSO Core Step
// ─────────────────────────────────────────────────────────────
function psoStep() {
    if (!isOptimizing) return;

    const w = parseFloat(document.getElementById('inertiaSlider').value);
    const c1 = parseFloat(document.getElementById('c1Input').value);
    const c2 = parseFloat(document.getElementById('c2Input').value);
    const [pitchMin, pitchMax] = getOrientationRange();

    for (let step = 0; step < 3; step++) {
        currentEpoch++;

        for (let particle of swarm) {
            const gbest = selectGlobalBest();

            for (let i = 0; i < particle.pos.length; i++) {
                const r1p = Math.random(),
                    r1y = Math.random();
                const r2p = Math.random(),
                    r2y = Math.random();

                // Normalize yaw velocity by the cosine of the pitch
                // This prevents the search from "spinning out" at high/low latitudes
                const currentPitch = particle.pos[i].pitch;
                const cosPitch = Math.max(Math.cos(currentPitch), 0.01); // Avoid div by zero

                // Standard Pitch Update
                particle.vel[i].pitch = w * particle.vel[i].pitch +
                    c1 * r1p * (particle.pbest[i].pitch - particle.pos[i].pitch) +
                    c2 * r2p * (gbest[i].pitch - particle.pos[i].pitch);

                // Normalized Yaw Update (with shortest path calculation)
                particle.vel[i].yaw = w * particle.vel[i].yaw +
                    (c1 * r1y * getShortestAngle(particle.pbest[i].yaw, particle.pos[i].yaw) +
                        c2 * r2y * getShortestAngle(gbest[i].yaw, particle.pos[i].yaw)) / cosPitch;

                // Clamp velocities to prevent explosive movement
                particle.vel[i].pitch = Math.max(-V_MAX, Math.min(V_MAX, particle.vel[i].pitch));
                particle.vel[i].yaw = Math.max(-V_MAX, Math.min(V_MAX, particle.vel[i].yaw));

                // Apply Pitch Position (with boundary clamping)
                particle.pos[i].pitch = Math.max(pitchMin, Math.min(pitchMax,
                    particle.pos[i].pitch + particle.vel[i].pitch));

                // Apply Yaw Position (with circular wrapping)
                let ny = particle.pos[i].yaw + particle.vel[i].yaw;
                particle.pos[i].yaw = (((ny + Math.PI) % (2 * Math.PI)) + (2 * Math.PI)) % (2 * Math.PI) - Math.PI;
            }

            const obj = computeObjectives(particle.pos);

            if (dominates(obj, particle.pbestObj) ||
                (!dominates(particle.pbestObj, obj) && Math.random() < 0.05)) {
                particle.pbest = particle.pos.map(p => ({
                    ...p
                }));
                particle.pbestObj = [...obj];
            }

            updateParetoArchive({
                pos: particle.pos.map(p => ({
                    ...p
                })),
                obj: [...obj]
            });
        }
    }

    const currentBest = getBestArchiveMember();
    if (currentBest) {
        genParams = currentBest.pos.map(p => ({
            ...p
        }));
        // Corrected score calculation without the misplaced .toFixed()
        const currentScoreValue = currentBest.obj[0] * 0.8 + currentBest.obj[1] * 0.2;

        if (Math.abs(bestScore - currentScoreValue) < TOLERANCE) {
            noImprovementCount++;
        } else {
            noImprovementCount = 0;
        }
        if (currentScoreValue < bestScore) bestScore = currentScoreValue;
    }

    if (currentEpoch % 15 === 0 || currentEpoch === 3) {
        const b = getBestArchiveMember();
        if (b) {
            // Calculate values once to ensure parity between Log and Grid
            const coverageVal = (1 - b.obj[0]) * 100;
            const coveragePct = coverageVal.toFixed(1);
            const overlapPct = (b.obj[1] * 100).toFixed(1);
            const formattedScore = (b.obj[0] * 0.8 + b.obj[1] * 0.2).toFixed(5);

            // Update the Status Box Log
            let statusHtml = `Iteration: <span style="color:#fff">${currentEpoch}</span><br>`;
            statusHtml += `Coverage: <span style="color:var(--accent)">${coveragePct}%</span><br>`;
            statusHtml += `Max Overlap: <span style="color:var(--warning)">${overlapPct}%</span><br>`;
            statusHtml += `Pareto Front: <span style="color:var(--success)">${paretoArchive.length} solution(s)</span>`;

            if (noImprovementCount > 10) {
                statusHtml += `<br><span style="color:var(--warning)">Plateau (${noImprovementCount}/${PATIENCE})</span>`;
            } else {
                statusHtml += `<br><span style="color:var(--success)">Swarm Converging...</span>`;
            }

            document.getElementById('optLog').innerHTML = statusHtml;

            // Update the Stat Grid (Spatial Analytics)
            document.getElementById('st-coverage').innerText = coveragePct + "%";
            document.getElementById('st-blind').innerText = (100 - coverageVal).toFixed(1) + "%";
            document.getElementById('st-loss').innerText = formattedScore;
            document.getElementById('st-pareto').innerText = paretoArchive.length + ' solution(s)';
            document.getElementById('st-overlap').innerText = overlapPct + '%';
        }
        // updateLivePlot now just handles the 3D visualization
        updateLivePlot();
    }

    if (noImprovementCount >= PATIENCE) {
        document.getElementById('optLog').innerHTML +=
            `<br><br><span style="color:var(--success); font-weight:bold;">SWARM CONVERGED.</span><br>Auto-stopping at Iteration ${currentEpoch}.`;
        stopGenerativeOptimization();
        updateLivePlot();
        return;
    }

    optAnimFrame = requestAnimationFrame(psoStep);
}

// ─────────────────────────────────────────────────────────────
// Start / Stop
// ─────────────────────────────────────────────────────────────
function startGenerativeOptimization() {
    const n = parseInt(document.getElementById('nSlider').value);
    const swarmSize = parseInt(document.getElementById('swarmSizeSlider').value);
    const [pitchMin, pitchMax] = getOrientationRange();

    // 1. Reset global parameters and clear existing Plotly traces from previous runs
    genParams = [];
    if (document.getElementById('livePlot').data && document.getElementById('livePlot').data.length > 2) {
        const tracesToRemove = [];
        // Traces 0 and 1 are the background volume and drone body; remove everything else
        for (let i = 2; i < document.getElementById('livePlot').data.length; i++) {
            tracesToRemove.push(i);
        }
        Plotly.deleteTraces('livePlot', tracesToRemove);
    }

    const fibSeed = fibonacciSphereInit(n).map(p => ({
        pitch: Math.max(pitchMin, Math.min(pitchMax, p.pitch)),
        yaw: p.yaw
    }));

    const sharedPoints = generateReferencePoints(1200);
    refPoints = sharedPoints;
    evalPoints = sharedPoints;

    swarm = [];
    for (let s = 0; s < swarmSize; s++) {
        const perturbScale = s === 0 ? 0 : 0.6;
        const pos = fibSeed.map(p => ({
            pitch: Math.max(pitchMin, Math.min(pitchMax, p.pitch + (Math.random() - 0.5) * perturbScale)),
            yaw: ((p.yaw + (Math.random() - 0.5) * perturbScale * 1.2 + Math.PI) % (2 * Math.PI)) - Math.PI
        }));
        const vel = Array.from({
            length: n
        }, () => ({
            pitch: (Math.random() - 0.5) * 0.1,
            yaw: (Math.random() - 0.5) * 0.1
        }));
        const obj = computeObjectives(pos);
        swarm.push({
            pos,
            vel,
            pbest: pos.map(p => ({
                ...p
            })),
            pbestObj: [...obj]
        });
    }

    paretoArchive = [];
    swarm.forEach(p => updateParetoArchive({
        pos: p.pos.map(x => ({
            ...x
        })),
        obj: [...p.pbestObj]
    }));

    // 2. Initialize genParams with the seed to ensure updateLivePlot has data to draw
    genParams = fibSeed.map(p => ({
        ...p
    }));

    currentEpoch = 0;
    bestScore = Infinity;
    noImprovementCount = 0;
    isOptimizing = true;
    optimizationStarted = true;

    setControlsLocked(true);

    document.getElementById('optLog').innerHTML =
        `Initializing MOPSO...<br>` +
        `Swarm: ${swarmSize} particles × ${n} sensors<br>` +
        `Fibonacci sphere seed applied. Optimizing...`;

    initLivePlot();
    psoStep();
}

function stopGenerativeOptimization() {
    isOptimizing = false;
    cancelAnimationFrame(optAnimFrame);
    setControlsLocked(false);
}

// ─────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────
function showExport() {
    const hFov = parseFloat(document.getElementById('hFovInput').value);
    const vFov = parseFloat(document.getElementById('vFovInput').value);
    const channels = parseInt(document.getElementById('channelsInput').value);
    const minRange = parseFloat(document.getElementById('minRangeInput').value);
    const maxRange = parseFloat(document.getElementById('maxRangeInput').value);
    const scanFreq = parseFloat(document.getElementById('scanFreqInput').value);
    const rangeFreq = parseFloat(document.getElementById('rangeFreqInput').value);
    const noise = parseFloat(document.getElementById('noiseInput').value);
    const hDiverg = parseFloat(document.getElementById('hDivergInput').value);
    const vDiverg = parseFloat(document.getElementById('vDivergInput').value);
    const sensorCount = parseInt(document.getElementById('nSlider').value);
    const bodyRad = parseFloat(document.getElementById('bodyRadiusSlider').value);
    const mountRad = getMountRadius();

    const hAngRes = document.getElementById('hAngResDisplay').innerText.replace('°', '');
    const vAngRes = document.getElementById('vAngResDisplay').innerText.replace('°', '');

    const best = getBestArchiveMember();
    const objStr = best ?
        `Coverage: ${((1-best.obj[0])*100).toFixed(1)}% | Max Overlap: ${(best.obj[1]*100).toFixed(1)}%` :
        'N/A';

    let output = "";
    output += "╔══════════════════════════════════════════════════╗\n";
    output += "║        LiDAR Arrangement Optimizer for PUP       ║\n";
    output += "╚══════════════════════════════════════════════════╝\n\n";
    output += "── LIDAR SPECIFICATIONS ──────────────────────────\n";
    output += `  Horizontal FOV       : ${hFov}°\n`;
    output += `  Vertical FOV         : ${vFov}°\n`;
    output += `  Channels / Beams     : ${channels}\n`;
    output += `  H. Angular Resolution: ${hAngRes}°   [AUTO]\n`;
    output += `  V. Angular Resolution: ${vAngRes}°   [AUTO]\n`;
    output += `  Min Ranging Distance : ${minRange} m\n`;
    output += `  Max Ranging Distance : ${maxRange} m\n`;
    output += `  Scanning Frequency   : ${scanFreq} Hz\n`;
    output += `  Ranging Frequency    : ${rangeFreq} kHz\n`;
    output += `  Measurement Noise    : ${noise} cm\n`;
    output += `  H. Beam Divergence   : ${hDiverg} mrad\n`;
    output += `  V. Beam Divergence   : ${vDiverg} mrad\n\n`;
    output += "── DRONE PARAMETERS ──────────────────────────────\n";
    output += `  Body Radius          : ${bodyRad.toFixed(2)} m\n`;
    output += `  Mount Radius (auto)  : ${mountRad.toFixed(2)} m\n`;
    output += `  Sensor Count         : ${sensorCount}\n`;
    output += `  Orientation Zone     : ${document.getElementById('orientSelect').options[document.getElementById('orientSelect').selectedIndex].text}\n\n`;
    output += "── MOPSO SOLUTION QUALITY ────────────────────────\n";
    output += `  ${objStr}\n`;
    output += `  Pareto Front Size    : ${paretoArchive.length} solution(s)\n`;
    output += `  Iterations           : ${currentEpoch}\n\n`;
    output += "── OPTIMIZED SENSOR POSITIONS ────────────────────\n";
    output += "  SENSOR ID  │ PITCH (°)   │ YAW (°)\n";
    output += "  ───────────┼─────────────┼──────────\n";
    genParams.forEach((p, i) => {
        const pitchDeg = (p.pitch * 180 / Math.PI).toFixed(3);
        const yawDeg = (((p.yaw * 180 / Math.PI) % 360 + 360) % 360).toFixed(3);
        output += `  LIDAR_${(i+1).toString().padStart(2,'0')}   │ ${pitchDeg.padStart(11)} │ ${yawDeg.padStart(9)}\n`;
    });

    document.getElementById('exportText').innerText = output;
    document.getElementById('exportModal').style.display = 'flex';
}

// ─────────────────────────────────────────────────────────────
// Sphere mesh generator
// ─────────────────────────────────────────────────────────────
function buildSphereMesh(r, tSteps = 24, pSteps = 24) {
    let bx = [],
        by = [],
        bz = [];
    for (let i = 0; i <= tSteps; i++) {
        let t = i * Math.PI / tSteps;
        for (let j = 0; j <= pSteps; j++) {
            let p = j * 2 * Math.PI / pSteps;
            bx.push(r * Math.sin(t) * Math.cos(p));
            by.push(r * Math.sin(t) * Math.sin(p));
            bz.push(r * Math.cos(t));
        }
    }
    return {
        bx,
        by,
        bz
    };
}

// ─────────────────────────────────────────────────────────────
// Plot Init
// ─────────────────────────────────────────────────────────────
function initLivePlot() {
    const bodyRad = parseFloat(document.getElementById('bodyRadiusSlider').value);
    const displayR = getRefDisplayRadius();
    const {
        bx,
        by,
        bz
    } = buildSphereMesh(bodyRad);

    let traces = [{
            type: 'scatter3d',
            mode: 'markers',
            x: refPoints.map(p => p[0] * displayR),
            y: refPoints.map(p => p[1] * displayR),
            z: refPoints.map(p => p[2] * displayR),
            marker: {
                size: 2,
                color: '#1e3a5f',
                opacity: 0.8
            },
            hoverinfo: 'none',
            name: 'Volume'
        },
        {
            type: 'mesh3d',
            x: bx,
            y: by,
            z: bz,
            alphahull: 0,
            opacity: 0.15,
            color: '#00e5ff',
            name: 'Drone Body'
        },
    ];

    let layout = {
        paper_bgcolor: '#000000',
        plot_bgcolor: '#000000',
        margin: {
            l: 0,
            r: 0,
            b: 0,
            t: 0
        },
        scene: {
            xaxis: {
                visible: false
            },
            yaxis: {
                visible: false
            },
            zaxis: {
                visible: false
            },
            camera: {
                eye: {
                    x: 1.5,
                    y: 1.5,
                    z: 1.2
                }
            },
            aspectmode: 'cube'
        },
        showlegend: false
    };
    Plotly.newPlot('livePlot', traces, layout, {
        displayModeBar: false
    });
}

// ─────────────────────────────────────────────────────────────
// Live Plot Update
// ─────────────────────────────────────────────────────────────
function updateLivePlot() {
    const hFov = parseFloat(document.getElementById('hFovInput').value);
    const vFov = parseFloat(document.getElementById('vFovInput').value);
    const bodyRad = parseFloat(document.getElementById('bodyRadiusSlider').value);
    const mountRad = getMountRadius();
    const displayR = getRefDisplayRadius();

    document.getElementById('st-rad').innerText = bodyRad.toFixed(2) + " m";

    let updateData = {
        x: [],
        y: [],
        z: []
    };
    let indices = [];
    let normals = genParams.map(p => anglesToVector(p.pitch, p.yaw));

    const expectedTraces = (genParams.length * 2) + 2;

    if (document.getElementById('livePlot').data.length !== expectedTraces) {
        const currentTraces = document.getElementById('livePlot').data.length;
        if (currentTraces > 2) {
            let toDelete = [];
            for (let i = 2; i < currentTraces; i++) toDelete.push(i);
            Plotly.deleteTraces('livePlot', toDelete);
        }

        let newTraces = [];
        genParams.forEach((p, i) => {
            let col = COLORS[i % COLORS.length];
            newTraces.push({
                type: 'scatter3d',
                mode: 'lines',
                line: {
                    width: 3,
                    color: col
                },
                opacity: 0.8,
                hoverinfo: 'none'
            });
            newTraces.push({
                type: 'mesh3d',
                color: col,
                opacity: 1.0,
                alphahull: 0,
                flatshading: true,
                lighting: {
                    ambient: 0.5,
                    diffuse: 0.8,
                    specular: 0.5,
                    roughness: 0.3,
                    fresnel: 0.2
                },
                hoverinfo: 'none'
            });
        });
        Plotly.addTraces('livePlot', newTraces);
    }

    genParams.forEach((p, i) => {
        let arc = generateArc(normals[i], hFov);
        updateData.x.push(arc.x);
        updateData.y.push(arc.y);
        updateData.z.push(arc.z);
        indices.push(2 + (i * 2));

        let hx = [],
            hy = [],
            hz = [];

        // Dynamic adjustment of sensor size based on drone body radius 
        const hwRadius = bodyRad * 0.20; // The thickness/girth of the LiDAR unit (in meters)
        const hwLength = bodyRad * 0.20; // The height/length of the LiDAR unit (in meters)
        const rBase = bodyRad * 0.95; // Attachment point slightly inside the body

        let n = normals[i];
        let orthogonal = Math.abs(n[0]) < 0.8 ? [1, 0, 0] : [0, 1, 0];
        let u = [n[1] * orthogonal[2] - n[2] * orthogonal[1], n[2] * orthogonal[0] - n[0] * orthogonal[2], n[0] * orthogonal[1] - n[1] * orthogonal[0]];
        let v_vec = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
        let uLen = Math.hypot(...u),
            vLen = Math.hypot(...v_vec);
        u = u.map(x => x / uLen);
        v_vec = v_vec.map(x => x / vLen);

        // Bottom ring
        for (let j = 0; j <= 8; j++) {
            let ang = (j / 8) * 2 * Math.PI;
            hx.push(rBase * n[0] + Math.cos(ang) * hwRadius * u[0] + Math.sin(ang) * hwRadius * v_vec[0]);
            hy.push(rBase * n[1] + Math.cos(ang) * hwRadius * u[1] + Math.sin(ang) * hwRadius * v_vec[1]);
            hz.push(rBase * n[2] + Math.cos(ang) * hwRadius * u[2] + Math.sin(ang) * hwRadius * v_vec[2]);
        }
        hx.push(null);
        hy.push(null);
        hz.push(null); // Break line

        // Top ring
        for (let j = 0; j <= 8; j++) {
            let ang = (j / 8) * 2 * Math.PI;
            hx.push((rBase + hwLength) * n[0] + Math.cos(ang) * hwRadius * u[0] + Math.sin(ang) * hwRadius * v_vec[0]);
            hy.push((rBase + hwLength) * n[1] + Math.cos(ang) * hwRadius * u[1] + Math.sin(ang) * hwRadius * v_vec[1]);
            hz.push((rBase + hwLength) * n[2] + Math.cos(ang) * hwRadius * u[2] + Math.sin(ang) * hwRadius * v_vec[2]);
        }
        hx.push(null);
        hy.push(null);
        hz.push(null); // Break line

        // Connectors
        for (let j = 0; j < 8; j += 2) {
            let ang = (j / 8) * 2 * Math.PI;
            hx.push(rBase * n[0] + Math.cos(ang) * hwRadius * u[0] + Math.sin(ang) * hwRadius * v_vec[0]);
            hy.push(rBase * n[1] + Math.cos(ang) * hwRadius * u[1] + Math.sin(ang) * hwRadius * v_vec[1]);
            hz.push(rBase * n[2] + Math.cos(ang) * hwRadius * u[2] + Math.sin(ang) * hwRadius * v_vec[2]);

            hx.push((rBase + hwLength) * n[0] + Math.cos(ang) * hwRadius * u[0] + Math.sin(ang) * hwRadius * v_vec[0]);
            hy.push((rBase + hwLength) * n[1] + Math.cos(ang) * hwRadius * u[1] + Math.sin(ang) * hwRadius * v_vec[1]);
            hz.push((rBase + hwLength) * n[2] + Math.cos(ang) * hwRadius * u[2] + Math.sin(ang) * hwRadius * v_vec[2]);
            hx.push(null);
            hy.push(null);
            hz.push(null); // Break line
        }

        updateData.x.push(hx);
        updateData.y.push(hy);
        updateData.z.push(hz);
        indices.push(3 + (i * 2));
    });

    Plotly.update('livePlot', updateData, {}, indices);

    const {
        bx,
        by,
        bz
    } = buildSphereMesh(bodyRad);
    Plotly.restyle('livePlot', {
        x: [bx],
        y: [by],
        z: [bz]
    }, [1]);

    let coveredCount = 0;
    let pointColors;

    if (optimizationStarted) {
        const vDiverg = parseFloat(document.getElementById('vDivergInput').value) || 0;
        const vDivergDeg = vDiverg * 180 / Math.PI / 1000;
        const effectiveVFov = Math.max(vFov, vDivergDeg);
        const vFovRad = effectiveVFov * Math.PI / 180;
        const sinVFovHalf = Math.sin(vFovRad / 2);

        const sensorPos = normals.map(n => [n[0] * mountRad, n[1] * mountRad, n[2] * mountRad]);

        coveredCount = 0;
        pointColors = refPoints.map(pt => {
            const targetPt = [pt[0] * displayR, pt[1] * displayR, pt[2] * displayR];
            let isCovered = false;

            for (let i = 0; i < normals.length; i++) {
                const n = normals[i];
                const pos = sensorPos[i];

                let dirX = targetPt[0] - pos[0];
                let dirY = targetPt[1] - pos[1];
                let dirZ = targetPt[2] - pos[2];
                const dist = Math.hypot(dirX, dirY, dirZ);
                if (dist === 0) continue;

                const dot = (dirX / dist) * n[0] + (dirY / dist) * n[1] + (dirZ / dist) * n[2];

                if (Math.abs(dot) <= sinVFovHalf) {
                    if (!checkOcclusion(pos, targetPt, bodyRad)) {
                        isCovered = true;
                        break;
                    }
                }
            }
            if (isCovered) coveredCount++;
            return isCovered ? '#1e293b' : '#ef4444';
        });
    }

    Plotly.restyle('livePlot', {
        x: [refPoints.map(p => p[0] * displayR)],
        y: [refPoints.map(p => p[1] * displayR)],
        z: [refPoints.map(p => p[2] * displayR)],
        'marker.color': [pointColors]
    }, [0]);

    if (optimizationStarted) {
        const coveragePct = (coveredCount / refPoints.length * 100).toFixed(1);
        document.getElementById('st-coverage').innerText = coveragePct + "%";
        document.getElementById('st-blind').innerText = (100 - coveragePct).toFixed(1) + "%";
    }
}

// ─────────────────────────────────────────────────────────────
// Init
// ─────────────────────────────────────────────────────────────
window.onload = function () {
    // Generate one set of 2000 points and share it
    const commonPoints = generateReferencePoints(2000);
    refPoints = commonPoints;
    evalPoints = commonPoints;

    updateAngularResolutions();
    initLivePlot();
	
	// Automatically resize the 3D plot whenever the window changes size
	window.addEventListener('resize', function() {
		const plotDiv = document.getElementById('livePlot');
		if (plotDiv) {
			Plotly.Plots.resize(plotDiv);
		}
	});
};