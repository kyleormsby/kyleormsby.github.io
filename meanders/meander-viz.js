// meander-viz.js
// Three.js geometry helpers for visualizing meandric systems with marked
// points placed on a circle (the "equator" of an implicit unit sphere) and
// arcs drawn as half-circles in the vertical plane through their endpoints,
// either above or below the equator.
//
// Public API:
//   createMeanderObject(topPairs, bottomPairs, n, options)
//     -> THREE.Group with userData.balls = [{ mesh, curve, length }]
//   updateMeanderBalls(group, elapsedSeconds, options)
//   HalfCircleCurve, ComponentCurve  (curve classes, exported for reuse)

import * as THREE from 'three';
import { findComponents } from './meanders.js';

// ---------------------------------------------------------------------------
// Curves
// ---------------------------------------------------------------------------

/**
 * Half-circle whose diameter is the chord between marked points i and j on
 * the equator (radius R, in the xy-plane). The half-circle lies in the
 * vertical plane through i and j; side='top' goes above (z>0), 'bottom'
 * below (z<0).
 *
 *   t = 0  ->  point i
 *   t = 1  ->  point j
 *   t = 0.5 -> apex (z = ±|i-j|/2)
 *
 * Note: getPoint is already arc-length parameterized for a half-circle
 * (constant angular speed), so no remap is needed.
 */
export class HalfCircleCurve extends THREE.Curve {
  constructor(fromVertex, toVertex, side, n, sphereRadius = 1) {
    super();
    const N = 2 * n;
    const ti = (2 * Math.PI * (fromVertex - 1)) / N;
    const tj = (2 * Math.PI * (toVertex   - 1)) / N;
    const Pi = new THREE.Vector3(sphereRadius * Math.cos(ti), sphereRadius * Math.sin(ti), 0);
    const Pj = new THREE.Vector3(sphereRadius * Math.cos(tj), sphereRadius * Math.sin(tj), 0);
    this.M = Pi.clone().add(Pj).multiplyScalar(0.5);
    this.u = Pj.clone().sub(Pi).multiplyScalar(0.5); // points M -> Pj
    this.r = this.u.length();
    this.zSign = side === 'top' ? 1 : -1;
    this.length = Math.PI * this.r;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const phi = Math.PI * t;
    const c = Math.cos(phi), s = Math.sin(phi);
    target.set(
      this.M.x - c * this.u.x,
      this.M.y - c * this.u.y,
      this.zSign * s * this.r
    );
    return target;
  }
}

/**
 * Composite curve following a component's arcs in traversal order, with
 * arc-length parameterization so the racing ball moves at constant speed.
 */
export class ComponentCurve extends THREE.Curve {
  constructor(arcs, n, sphereRadius = 1) {
    super();
    this.subCurves = arcs.map(([from, to, side]) =>
      new HalfCircleCurve(from, to, side, n, sphereRadius)
    );
    this.subLengths = this.subCurves.map(c => c.length);
    this.totalLength = this.subLengths.reduce((a, b) => a + b, 0);
    // Cumulative endpoints
    this.cum = [];
    let acc = 0;
    for (const l of this.subLengths) { acc += l; this.cum.push(acc); }
  }

  getPoint(t, target = new THREE.Vector3()) {
    const targetLen = ((t % 1) + 1) % 1 * this.totalLength;
    let idx = 0;
    while (idx < this.cum.length - 1 && this.cum[idx] < targetLen) idx++;
    const prev = idx === 0 ? 0 : this.cum[idx - 1];
    const localT = (targetLen - prev) / this.subLengths[idx];
    return this.subCurves[idx].getPoint(localT, target);
  }
}

// ---------------------------------------------------------------------------
// Color palettes
// ---------------------------------------------------------------------------

// All-cool primary palette: mint teal, azure blue, purple, green. These
// four are used by virtually every order-4 system (≤ 4 components per
// system); extras for n ≥ 5 follow.
const COMPONENT_PALETTE = [
  0x7be0cb, // mint teal
  0x6fa8ff, // azure blue
  0x8a5fcc, // purple
  0x50dd6f, // green
  0xa8ee5a, // lime
  0x4abf9b, // deep teal
  0x9d8aff, // periwinkle
  0x3fb6ff, // bright cyan-blue
];

// Plasma palette kept around because some callers may still want a
// continuous map; the dark indigo/navy at the low end is no longer
// the default.
const PLASMA = [
  0x0d0887, 0x46039f, 0x7201a8, 0x9c179e, 0xbd3786,
  0xd8576b, 0xed7953, 0xfb9f3a, 0xfdca26, 0xf0f921
];

function lerpColor(a, b, f) {
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  return ca.lerp(cb, f);
}

/** Plasma color at t in [0,1]. */
export function plasmaColor(t) {
  const x = Math.max(0, Math.min(1, t)) * (PLASMA.length - 1);
  const i = Math.floor(x);
  const j = Math.min(i + 1, PLASMA.length - 1);
  return lerpColor(PLASMA[i], PLASMA[j], x - i);
}

/** Distinct color for component idx out of total components. Curated to
 *  stay readable against a black background. */
export function componentColor(idx, total) {
  return new THREE.Color(COMPONENT_PALETTE[idx % COMPONENT_PALETTE.length]);
}

/** The full curated palette (read-only) — useful if a caller wants to
 *  match colors used by createMeanderObject elsewhere. */
export function getComponentPalette() {
  return COMPONENT_PALETTE.slice();
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build a THREE.Group representing one meandric system.
 *
 * Returns a Group whose userData has:
 *   - balls:      [{ mesh, curve, color, componentIndex }, ...]
 *   - components: as returned by findComponents
 *   - n, sphereRadius, options (for reference)
 *
 * Options (all optional):
 *   sphereRadius        radius of the equator circle on which points live (default 1)
 *   tubeRadius          tube cross-section radius                          (default 0.045)
 *   tubeOpacity         tube alpha                                         (default 0.40)
 *   ballRadius          racing ball radius                                 (default 0.075)
 *   ballEmissive        ball emissive intensity                            (default 2.5)
 *   pointRadius         marked-point dot radius                            (default 0.05)
 *   showPoints          render the 8 marked dots                           (default true)
 *   tubularSegments     tube longitudinal resolution                       (default 28)
 *   radialSegments      tube cross-section resolution                      (default 8)
 *   colorFn             (idx, total, comp) => THREE.Color                  (default plasma)
 *   pointColor          color of marked dots                               (default 0xffffff)
 *   pointMaterial       a THREE.Material to share across cells (perf)      (optional)
 *   ballGeometry        a SphereGeometry to share (perf)                   (optional)
 *   pointGeometry       a SphereGeometry to share (perf)                   (optional)
 */
export function createMeanderObject(topPairs, bottomPairs, n, options = {}) {
  const opts = Object.assign({
    sphereRadius: 1.0,
    tubeRadius: 0.13,             // thicker by default
    tubeOpacity: 0.32,            // more solid translucent, less ghost-glass
    tubeTransmission: 0.55,       // some refraction but not pure-glass invisibility
    tubeRoughness: 0.12,
    tubeIor: 1.45,
    tubeThickness: 0.6,
    tubeEmissiveIntensity: 0.35,  // self-glow so tube reads even far from ball
    tubeClearcoat: 0.85,          // fresnel rim catches light at silhouettes
    tubeAttenuationDistance: 0.9,
    ballRadius: 0.045,            // unchanged: ball stays compact inside the cavity
    ballEmissive: 4.0,
    haloRadiusFactor: 1.45,       // halo factor scales with tube; this gives same overshoot
    haloOpacity: 0.55,
    showHalo: true,
    pointRadius: 0.05,
    showPoints: true,
    tubularSegments: 28,
    radialSegments: 10,
    colorFn: componentColor,
    pointColor: 0xffffff,
  }, options);

  const group = new THREE.Group();
  group.userData = {
    balls: [],
    components: null,
    n,
    sphereRadius: opts.sphereRadius,
    options: opts,
  };

  const components = findComponents(topPairs, bottomPairs, n);
  group.userData.components = components;

  // Marked points -------------------------------------------------------------
  if (opts.showPoints) {
    const pointGeom = opts.pointGeometry ||
      new THREE.SphereGeometry(opts.pointRadius, 12, 8);
    const pointMat = opts.pointMaterial ||
      new THREE.MeshBasicMaterial({ color: opts.pointColor });
    const N = 2 * n;
    for (let k = 0; k < N; k++) {
      const theta = (2 * Math.PI * k) / N;
      const dot = new THREE.Mesh(pointGeom, pointMat);
      dot.position.set(
        opts.sphereRadius * Math.cos(theta),
        opts.sphereRadius * Math.sin(theta),
        0
      );
      group.add(dot);
    }
  }

  // Components: tubes + ball + halo --------------------------------------------
  const total = components.length;
  components.forEach((comp, ci) => {
    const color = opts.colorFn(ci, total, comp);

    // Translucent-glass tube. Some transmission so the ball+halo refract
    // into the wall, but enough opacity + emissive that the tube itself
    // is visible everywhere — not just where the ball is. Strong clearcoat
    // adds a fresnel rim so the silhouette pops on a black background.
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color,
      transparent: true,
      opacity: opts.tubeOpacity,
      transmission: opts.tubeTransmission,
      thickness: opts.tubeThickness,
      ior: opts.tubeIor,
      roughness: opts.tubeRoughness,
      metalness: 0.0,
      side: THREE.DoubleSide,
      depthWrite: false,
      clearcoat: opts.tubeClearcoat,
      clearcoatRoughness: 0.12,
      attenuationColor: color,
      attenuationDistance: opts.tubeAttenuationDistance,
      emissive: color,
      emissiveIntensity: opts.tubeEmissiveIntensity,
      toneMapped: false,
    });

    for (const [from, to, side] of comp.arcs) {
      const curve = new HalfCircleCurve(from, to, side, n, opts.sphereRadius);
      const tubeGeom = new THREE.TubeGeometry(
        curve, opts.tubularSegments, opts.tubeRadius, opts.radialSegments, false
      );
      const tubeMesh = new THREE.Mesh(tubeGeom, tubeMat);
      // Render tubes before halos so additive halos light up the tube
      // wall correctly. (Higher renderOrder = drawn later.)
      tubeMesh.renderOrder = 1;
      group.add(tubeMesh);
    }

    // Compact bright ball (the "filament") inside the tube.
    const compCurve = new ComponentCurve(comp.arcs, n, opts.sphereRadius);
    const ballGeom = opts.ballGeometry ||
      new THREE.SphereGeometry(opts.ballRadius, 14, 12);
    const ballMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: color,
      emissiveIntensity: opts.ballEmissive,
      toneMapped: false,
      roughness: 0.5,
      metalness: 0.0,
    });
    const ball = new THREE.Mesh(ballGeom, ballMat);
    ball.renderOrder = 2;
    ball.position.copy(compCurve.getPoint(0));
    group.add(ball);

    // Additive halo: a sphere larger than the tube radius that travels with
    // the ball. Where the halo overlaps the tube wall, additive blending
    // brightens that wall — visually the tube "lights up" around the ball.
    let halo = null;
    if (opts.showHalo) {
      const haloRadius = opts.tubeRadius * opts.haloRadiusFactor;
      const haloGeom = new THREE.SphereGeometry(haloRadius, 16, 12);
      const haloMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: opts.haloOpacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      halo = new THREE.Mesh(haloGeom, haloMat);
      halo.renderOrder = 3;
      ball.add(halo); // halo follows ball
    }

    group.userData.balls.push({
      mesh: ball,
      halo,
      curve: compCurve,
      color,
      componentIndex: ci,
      length: compCurve.totalLength,
    });
  });

  return group;
}

// ---------------------------------------------------------------------------
// Animation helper
// ---------------------------------------------------------------------------

/**
 * Move every ball in `group` along its component curve.
 *
 *   updateMeanderBalls(group, elapsedSeconds, { speed, mode })
 *
 *   speed = path-lengths per second (default 0.25, i.e. one loop per 4s)
 *   mode  = 'sync' (all balls at the same fractional t) or
 *           'arclength' (all balls move at the same linear speed; longer
 *            loops take longer)            [default 'sync']
 */
export function updateMeanderBalls(group, elapsedSeconds, options = {}) {
  const speed = options.speed ?? 0.25;
  const mode = options.mode ?? 'sync';
  const tmp = new THREE.Vector3();
  for (const b of group.userData.balls) {
    let t;
    if (mode === 'arclength') {
      // Constant linear speed; period scales with component length.
      t = ((elapsedSeconds * speed) / b.length) % 1;
    } else {
      // Same fractional progress for every component; visually synchronous.
      t = (elapsedSeconds * speed) % 1;
    }
    b.curve.getPoint(t, tmp);
    b.mesh.position.copy(tmp);
  }
}

// Expose THREE for caller convenience (when used as a module dependency).
export { THREE };
