// polytopes.js — net builders for 4-polytopes.
//
// Each builder returns a polytope spec:
//   { name, description, cells, cameraDistance }
// where each cell is { color, label, vertices, faces, edges } and each vertex
// has { folded: Vector3, unfolded: Vector3 } in 3D.
//
// The shared net-building strategy:
//   • Place a "root" cell at canonical 3D coordinates.
//   • BFS over the cell-adjacency graph along a spanning tree.
//   • For each non-root cell, compute its 3D position by reflecting the parent
//     cell's vertices across the plane of the shared face. The shared-face
//     vertices stay fixed; the non-shared vertices flip to the opposite side.
//
// The "folded" state is the orthographic projection (drop one 4D coord) or
// Schlegel projection of the polytope, so adjacent cells share vertex
// positions at t=0 and the polytope appears assembled.

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Vector helpers
// ─────────────────────────────────────────────────────────────────────────────

export function planeNormal(a, b, c) {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  return new THREE.Vector3().crossVectors(ab, ac).normalize();
}

export function reflectAcrossPlane(point, planePoint, unitNormal) {
  const d = point.clone().sub(planePoint).dot(unitNormal);
  return point.clone().sub(unitNormal.clone().multiplyScalar(2 * d));
}

export function centroid(points) {
  const c = new THREE.Vector3();
  for (const p of points) c.add(p);
  return c.multiplyScalar(1 / points.length);
}

// Generate a smooth color palette (HSL around the wheel)
export function palette(n, satL = [0.55, 0.55], lightL = [0.55, 0.6]) {
  const colors = [];
  for (let i = 0; i < n; i++) {
    const h = (i / n) % 1;
    const s = satL[0] + (satL[1] - satL[0]) * (i / Math.max(1, n - 1));
    const l = lightL[0] + (lightL[1] - lightL[0]) * (i / Math.max(1, n - 1));
    const c = new THREE.Color().setHSL(h, s, l);
    colors.push(c.getHex());
  }
  return colors;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polyhedron face / edge tables (local vertex indices)
// ─────────────────────────────────────────────────────────────────────────────

// Tetrahedron: 4 vertices, 6 edges, 4 triangular faces
export const TETRA_FACES = [[0, 1, 2], [0, 1, 3], [0, 2, 3], [1, 2, 3]];
export const TETRA_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

// ─────────────────────────────────────────────────────────────────────────────
// 4D affine-frame helpers (shared by all polytope builders)
//
// affineFrame: compute centroid + 3 orthonormal basis vectors of the affine
//   span of a set of 4D points.
// applyFrame: express a 4D point in that frame's coordinates, returning a
//   3D Vector3.
// orthoComplement4D: given 3 orthonormal 4D vectors, return a unit 4D vector
//   orthogonal to all three.
// schlegelProjector: build a function projecting any 4D point through a
//   viewpoint (outside the root cell, on the side opposite the polytope's
//   centroid) onto the root cell's hyperplane, expressed in its frame.
// ─────────────────────────────────────────────────────────────────────────────

export function affineFrame(points4D) {
  const N = points4D.length;
  const c = [0, 0, 0, 0];
  for (const p of points4D) for (let k = 0; k < 4; k++) c[k] += p[k];
  for (let k = 0; k < 4; k++) c[k] /= N;
  const centered = points4D.map(p => p.map((x, k) => x - c[k]));
  const basis = [];
  for (const p of centered) {
    let v = p.slice();
    for (const b of basis) {
      let dot = 0;
      for (let k = 0; k < 4; k++) dot += v[k] * b[k];
      for (let k = 0; k < 4; k++) v[k] -= dot * b[k];
    }
    let norm = 0;
    for (let k = 0; k < 4; k++) norm += v[k] * v[k];
    norm = Math.sqrt(norm);
    if (norm > 1e-9) {
      for (let k = 0; k < 4; k++) v[k] /= norm;
      basis.push(v);
      if (basis.length === 3) break;
    }
  }
  while (basis.length < 3) basis.push([0, 0, 0, 0]);
  return { centroid: c, basis };
}

export function applyFrame(P, frame) {
  const d = P.map((x, k) => x - frame.centroid[k]);
  return new THREE.Vector3(
    d.reduce((s, x, k) => s + x * frame.basis[0][k], 0),
    d.reduce((s, x, k) => s + x * frame.basis[1][k], 0),
    d.reduce((s, x, k) => s + x * frame.basis[2][k], 0),
  );
}

export function orthoComplement4D(basis3) {
  for (let i = 0; i < 4; i++) {
    let v = [0, 0, 0, 0]; v[i] = 1;
    for (const b of basis3) {
      let dot = 0;
      for (let k = 0; k < 4; k++) dot += v[k] * b[k];
      for (let k = 0; k < 4; k++) v[k] -= dot * b[k];
    }
    let norm = 0;
    for (let k = 0; k < 4; k++) norm += v[k] * v[k];
    norm = Math.sqrt(norm);
    if (norm > 1e-9) {
      for (let k = 0; k < 4; k++) v[k] /= norm;
      return v;
    }
  }
  return [0, 0, 0, 0];
}

// Convex-hull face + edge extraction for a small set of 3D points (≤ ~30).
// Brute force: every triple defines a candidate face plane. If every other
// point lies on one side of (or on) the plane, the triple is a face triangle.
// Coplanar triples are merged into a single polygon, sorted cyclically around
// its centroid, then fan-triangulated.
export function convexHullFaces(points3D) {
  const N = points3D.length;
  const eps = 1e-7;
  const onPlaneEps = 1e-4;
  const P = points3D.map(p => [p.x, p.y, p.z]);

  // Merge candidate face planes by tolerance: scan known planes and reuse a
  // matching one if its normal is nearly parallel AND offset matches.
  const planeMergeEps = 1e-4;
  const planeGroupList = [];  // each: { normal: [nx,ny,nz], offset }
  function matchOrAddPlane(nx, ny, nz, off) {
    for (const g of planeGroupList) {
      const dot = nx*g.normal[0] + ny*g.normal[1] + nz*g.normal[2];
      if (dot > 1 - planeMergeEps && Math.abs(off - g.offset) < planeMergeEps) {
        return;
      }
    }
    planeGroupList.push({ normal: [nx, ny, nz], offset: off });
  }

  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      for (let k = j + 1; k < N; k++) {
        const a = P[i], b = P[j], c = P[k];
        const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
        const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
        let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
        const nlen = Math.hypot(nx, ny, nz);
        if (nlen < eps) continue;
        nx /= nlen; ny /= nlen; nz /= nlen;
        const off = a[0]*nx + a[1]*ny + a[2]*nz;

        let side = 0;
        let bad = false;
        for (let l = 0; l < N; l++) {
          if (l === i || l === j || l === k) continue;
          const d = P[l][0]*nx + P[l][1]*ny + P[l][2]*nz - off;
          if (Math.abs(d) < onPlaneEps) continue;
          const s = d > 0 ? 1 : -1;
          if (side === 0) side = s;
          else if (side !== s) { bad = true; break; }
        }
        if (bad) continue;

        // Outward-orient
        const fnx = side > 0 ? -nx : nx;
        const fny = side > 0 ? -ny : ny;
        const fnz = side > 0 ? -nz : nz;
        const foff = side > 0 ? -off : off;
        matchOrAddPlane(fnx, fny, fnz, foff);
      }
    }
  }

  const faces = [];
  const polygons = [];   // cyclic vertex-index lists, one per planar face
  const edgeSet = new Set();
  for (const g of planeGroupList) {
    const onPlane = [];
    for (let l = 0; l < N; l++) {
      const d = P[l][0]*g.normal[0] + P[l][1]*g.normal[1] + P[l][2]*g.normal[2] - g.offset;
      if (Math.abs(d) < onPlaneEps) onPlane.push(l);
    }
    if (onPlane.length < 3) continue;

    let cx = 0, cy = 0, cz = 0;
    for (const l of onPlane) { cx += P[l][0]; cy += P[l][1]; cz += P[l][2]; }
    cx /= onPlane.length; cy /= onPlane.length; cz /= onPlane.length;

    let dx = P[onPlane[0]][0] - cx, dy = P[onPlane[0]][1] - cy, dz = P[onPlane[0]][2] - cz;
    const dn = dx*g.normal[0] + dy*g.normal[1] + dz*g.normal[2];
    dx -= dn*g.normal[0]; dy -= dn*g.normal[1]; dz -= dn*g.normal[2];
    const dlen = Math.hypot(dx, dy, dz) || 1;
    const ux = dx/dlen, uy = dy/dlen, uz = dz/dlen;
    const vx = g.normal[1]*uz - g.normal[2]*uy;
    const vy = g.normal[2]*ux - g.normal[0]*uz;
    const vz = g.normal[0]*uy - g.normal[1]*ux;

    const sorted = [...onPlane].sort((a, b) => {
      const ax = P[a][0]-cx, ay = P[a][1]-cy, az = P[a][2]-cz;
      const bx = P[b][0]-cx, by = P[b][1]-cy, bz = P[b][2]-cz;
      return Math.atan2(ax*vx + ay*vy + az*vz, ax*ux + ay*uy + az*uz)
           - Math.atan2(bx*vx + by*vy + bz*vz, bx*ux + by*uy + bz*uz);
    });

    for (let m = 1; m < sorted.length - 1; m++) {
      faces.push([sorted[0], sorted[m], sorted[m+1]]);
    }
    for (let m = 0; m < sorted.length; m++) {
      const a = sorted[m], b = sorted[(m+1) % sorted.length];
      edgeSet.add(`${Math.min(a,b)},${Math.max(a,b)}`);
    }
    polygons.push(sorted);
  }

  return {
    faces,
    edges: [...edgeSet].map(s => s.split(',').map(Number)),
    polygons,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Overlap detection between unfolded cells via the Separating Axis Theorem.
//
// Returns a Set of cell indices that are involved in at least one overlap
// with another cell. Two cells overlap iff their 3D interiors have positive-
// volume intersection. Cells that merely touch along a shared 2D face (BFS
// tree-adjacent cells) project to zero-overlap along the face normal — so
// the `eps`-tolerance separates them, and they are NOT flagged as overlapping.
//
// Candidate separating axes:
//   • Each cell's deduplicated unit face normals
//   • Pairwise cross products of edge directions (one edge from each cell)
// AABB pre-filter rejects most distant pairs cheaply.
// ─────────────────────────────────────────────────────────────────────────────

export function detectOverlappingCells(assembledCells, eps = 1e-3) {
  const N = assembledCells.length;

  function bake(cell) {
    const pts = cell.vertices.map(v => [v.unfolded.x, v.unfolded.y, v.unfolded.z]);
    const aabb = { min: [+Infinity, +Infinity, +Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (const p of pts) for (let k = 0; k < 3; k++) {
      if (p[k] < aabb.min[k]) aabb.min[k] = p[k];
      if (p[k] > aabb.max[k]) aabb.max[k] = p[k];
    }
    const fns = [];
    const seenN = new Set();
    for (const tri of cell.faces) {
      const a = pts[tri[0]], b = pts[tri[1]], c = pts[tri[2]];
      const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
      const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
      let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
      const nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-9) continue;
      nx /= nl; ny /= nl; nz /= nl;
      const k1 = `${Math.round(nx*1000)},${Math.round(ny*1000)},${Math.round(nz*1000)}`;
      const k2 = `${Math.round(-nx*1000)},${Math.round(-ny*1000)},${Math.round(-nz*1000)}`;
      if (seenN.has(k1) || seenN.has(k2)) continue;
      seenN.add(k1);
      fns.push([nx, ny, nz]);
    }
    const eds = [];
    const seenE = new Set();
    for (const [a, b] of cell.edges) {
      const p0 = pts[a], p1 = pts[b];
      let dx = p1[0]-p0[0], dy = p1[1]-p0[1], dz = p1[2]-p0[2];
      const dl = Math.hypot(dx, dy, dz);
      if (dl < 1e-9) continue;
      dx /= dl; dy /= dl; dz /= dl;
      const k1 = `${Math.round(dx*1000)},${Math.round(dy*1000)},${Math.round(dz*1000)}`;
      const k2 = `${Math.round(-dx*1000)},${Math.round(-dy*1000)},${Math.round(-dz*1000)}`;
      if (seenE.has(k1) || seenE.has(k2)) continue;
      seenE.add(k1);
      eds.push([dx, dy, dz]);
    }
    return { pts, aabb, fns, eds };
  }

  const data = assembledCells.map(bake);

  function project(pts, n) {
    let mn = +Infinity, mx = -Infinity;
    for (const p of pts) {
      const d = p[0]*n[0] + p[1]*n[1] + p[2]*n[2];
      if (d < mn) mn = d;
      if (d > mx) mx = d;
    }
    return [mn, mx];
  }

  function separatedAlong(a, b, n) {
    const [aMin, aMax] = project(a.pts, n);
    const [bMin, bMax] = project(b.pts, n);
    const aExt = aMax - aMin, bExt = bMax - bMin;
    if (aExt < eps && bExt < eps) {
      // Both projections collapse to a point along this axis (flat-cell case);
      // they are separated only if the points themselves differ by > eps.
      return Math.abs(aMin - bMin) > eps;
    }
    return (aMax < bMin + eps) || (bMax < aMin + eps);
  }

  function overlapsSAT(a, b) {
    for (let k = 0; k < 3; k++) {
      const aExt = a.aabb.max[k] - a.aabb.min[k];
      const bExt = b.aabb.max[k] - b.aabb.min[k];
      if (aExt < eps && bExt < eps) {
        if (Math.abs(a.aabb.min[k] - b.aabb.min[k]) > eps) return false;
        continue;
      }
      if (a.aabb.max[k] < b.aabb.min[k] + eps) return false;
      if (b.aabb.max[k] < a.aabb.min[k] + eps) return false;
    }
    for (const n of a.fns) if (separatedAlong(a, b, n)) return false;
    for (const n of b.fns) if (separatedAlong(a, b, n)) return false;
    for (const eA of a.eds) {
      for (const eB of b.eds) {
        const cx = eA[1]*eB[2] - eA[2]*eB[1];
        const cy = eA[2]*eB[0] - eA[0]*eB[2];
        const cz = eA[0]*eB[1] - eA[1]*eB[0];
        const cl = Math.hypot(cx, cy, cz);
        if (cl < 1e-6) continue;
        const n = [cx/cl, cy/cl, cz/cl];
        if (separatedAlong(a, b, n)) return false;
      }
    }
    // Face-normal × edge axes: in-plane perpendiculars for flat polygons.
    // Necessary for 3D-polytope nets (cells flat in z=0); redundant but safe
    // for 4D-polytope nets (non-degenerate 3D cells).
    for (const fn of [...a.fns, ...b.fns]) {
      for (const e of [...a.eds, ...b.eds]) {
        const cx = fn[1]*e[2] - fn[2]*e[1];
        const cy = fn[2]*e[0] - fn[0]*e[2];
        const cz = fn[0]*e[1] - fn[1]*e[0];
        const cl = Math.hypot(cx, cy, cz);
        if (cl < 1e-6) continue;
        const n = [cx/cl, cy/cl, cz/cl];
        if (separatedAlong(a, b, n)) return false;
      }
    }
    return true;
  }

  const overlapping = new Set();
  let pairCount = 0;
  for (let i = 0; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      if (overlapsSAT(data[i], data[j])) {
        overlapping.add(i); overlapping.add(j);
        pairCount++;
      }
    }
  }
  return { cells: overlapping, pairCount };
}

// Build a convex cell from its 4D vertex set: compute the affine frame, project
// to 3D, then run the convex hull helper to derive faces and edges.
export function buildConvexCell({ vertexIndices, points4D, color, label }) {
  const cellPoints4D = vertexIndices.map(i => points4D[i]);
  const frame = affineFrame(cellPoints4D);
  const canonical = cellPoints4D.map(P => applyFrame(P, frame));
  const { faces, edges } = convexHullFaces(canonical);
  return { color, label, vertexIndices, canonical, faces, edges };
}

// Schlegel projection from a viewpoint outside the polytope, through the root
// cell's hyperplane, expressed in the root cell's affineFrame basis. Returns
// a (P4D → Vector3) function. Root-cell vertices project to themselves
// (their applyFrame positions), so folded(root) === unfolded(root) when the
// root cell's canonical embedding is `applyFrame(rootPoints4D, rootFrame)`.
export function schlegelProjector({ rootPoints4D, allPoints4D, viewDist = 1.5 }) {
  const rootFrame = affineFrame(rootPoints4D);
  const normal4D = orthoComplement4D(rootFrame.basis);

  // Orient normal AWAY from polytope centroid
  const polyC = [0, 0, 0, 0];
  for (const v of allPoints4D) for (let k = 0; k < 4; k++) polyC[k] += v[k];
  for (let k = 0; k < 4; k++) polyC[k] /= allPoints4D.length;
  let dotN = 0;
  for (let k = 0; k < 4; k++) dotN += normal4D[k] * (polyC[k] - rootFrame.centroid[k]);
  if (dotN > 0) for (let k = 0; k < 4; k++) normal4D[k] = -normal4D[k];

  const V = rootFrame.centroid.map((x, k) => x + viewDist * normal4D[k]);

  return function schlegel(P) {
    let q = 0;
    for (let k = 0; k < 4; k++) q += (P[k] - V[k]) * normal4D[k];
    const t = -viewDist / q;
    const Pproj = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) Pproj[k] = V[k] + t * (P[k] - V[k]);
    return applyFrame(Pproj, rootFrame);
  };
}

// Cube: 8 vertices, 12 edges, 6 quad faces (12 triangles)
// Vertices indexed 0..7 by (sx, sy, sz) ∈ {-1,+1}³, index = (sx>0) + 2*(sy>0) + 4*(sz>0)
export const CUBE_VERTEX_SIGNS = [
  [-1,-1,-1], [+1,-1,-1], [-1,+1,-1], [+1,+1,-1],
  [-1,-1,+1], [+1,-1,+1], [-1,+1,+1], [+1,+1,+1],
];
export const CUBE_EDGES = [
  [0,1], [2,3], [4,5], [6,7], // edges along x
  [0,2], [1,3], [4,6], [5,7], // along y
  [0,4], [1,5], [2,6], [3,7], // along z
];
export const CUBE_FACES = [
  // -x face: 0,4,6,2  → triangulate as (0,4,6), (0,6,2)
  [0,4,6], [0,6,2],
  // +x face: 1,3,7,5
  [1,3,7], [1,7,5],
  // -y face: 0,1,5,4
  [0,1,5], [0,5,4],
  // +y face: 2,6,7,3
  [2,6,7], [2,7,3],
  // -z face: 0,2,3,1
  [0,2,3], [0,3,1],
  // +z face: 4,5,7,6
  [4,5,7], [4,7,6],
];

// Octahedron: 6 vertices (±e_i), 12 edges, 8 triangular faces.
// Local vertex order:  0=+x, 1=-x, 2=+y, 3=-y, 4=+z, 5=-z.
export const OCTA_VERTEX_DIRS = [
  [+1, 0, 0], [-1, 0, 0],
  [ 0,+1, 0], [ 0,-1, 0],
  [ 0, 0,+1], [ 0, 0,-1],
];
export const OCTA_EDGES = [
  // each (+axis, ±axis2) pair, for axis2 ≠ axis
  [0,2],[0,3],[0,4],[0,5],
  [1,2],[1,3],[1,4],[1,5],
  [2,4],[2,5],[3,4],[3,5],
];
// 8 faces — one per (±x, ±y, ±z) octant.
export const OCTA_FACES = [
  [0,2,4], [0,2,5], [0,3,4], [0,3,5],
  [1,2,4], [1,2,5], [1,3,4], [1,3,5],
];

// ─────────────────────────────────────────────────────────────────────────────
// Generic net unfolder
//
// Input:
//   cells: array of abstract cells, each:
//     { vertexIndices: [g0,g1,...],   // global IDs by local index
//       canonical: [Vector3, ...],    // intrinsic 3D shape of the cell, indexed
//                                     // the same way as vertexIndices
//       color, label, faces, edges }
//   rootIdx: which cell to anchor
//   rootEmbedding: Vector3[] giving the world position of each LOCAL vertex of
//     the root cell (typically equal to cells[rootIdx].canonical, but can be any
//     rigid copy of it).
//
// Output:
//   array of Vector3[] — for each cell, its 3D world positions per local vertex
//   (with the cell rigidly embedded so that its shared face matches its parent's
//   world embedding and the rest of the cell sits on the opposite side of that
//   face from the parent's interior).
// ─────────────────────────────────────────────────────────────────────────────

export function unfoldNet({ cells, rootIdx, rootEmbedding }) {
  const N = cells.length;
  const world = new Array(N).fill(null);
  world[rootIdx] = rootEmbedding.map(v => v.clone());

  const visited = new Set([rootIdx]);
  const queue = [rootIdx];

  while (queue.length) {
    const parentIdx = queue.shift();
    const parent = cells[parentIdx];
    const parentWorld = world[parentIdx];

    const parentLocalOf = new Map();
    parent.vertexIndices.forEach((g, l) => parentLocalOf.set(g, l));

    for (let childIdx = 0; childIdx < N; childIdx++) {
      if (visited.has(childIdx)) continue;
      const child = cells[childIdx];

      // Shared global vertices between parent and child
      const shared = child.vertexIndices.filter(g => parentLocalOf.has(g));
      if (shared.length < 3) continue;

      const childLocalOf = new Map();
      child.vertexIndices.forEach((g, l) => childLocalOf.set(g, l));

      // Three points define the hinge frame:
      //   source frame  = child's intrinsic positions of shared face
      //   target frame  = parent's world positions of shared face
      const hingeGlobals = shared.slice(0, 3);
      const src0 = child.canonical[childLocalOf.get(hingeGlobals[0])];
      const src1 = child.canonical[childLocalOf.get(hingeGlobals[1])];
      const src2 = child.canonical[childLocalOf.get(hingeGlobals[2])];
      const tgt0 = parentWorld[parentLocalOf.get(hingeGlobals[0])];
      const tgt1 = parentWorld[parentLocalOf.get(hingeGlobals[1])];
      const tgt2 = parentWorld[parentLocalOf.get(hingeGlobals[2])];

      const u1 = src1.clone().sub(src0).normalize();
      const tmp1 = src2.clone().sub(src0);
      const n1 = new THREE.Vector3().crossVectors(u1, tmp1).normalize();
      const v1 = new THREE.Vector3().crossVectors(n1, u1).normalize();

      const u2 = tgt1.clone().sub(tgt0).normalize();
      const tmp2 = tgt2.clone().sub(tgt0);
      const n2 = new THREE.Vector3().crossVectors(u2, tmp2).normalize();
      const v2 = new THREE.Vector3().crossVectors(n2, u2).normalize();

      // The orientation-preserving rigid motion (u1,v1,n1) → (u2,v2,n2) maps
      // src plane to tgt plane. If the child's intrinsic interior would then
      // land on the SAME side of the tgt plane as the parent's interior, we
      // additionally reflect across the tgt plane (i.e. negate the n-component
      // of the result). This places the child on the opposite side.
      const sharedSet = new Set(shared);

      const parentNonShared = parent.vertexIndices.filter(g => !sharedSet.has(g));
      let parentSide = 0;
      for (const g of parentNonShared) {
        parentSide += parentWorld[parentLocalOf.get(g)].clone().sub(tgt0).dot(n2);
      }

      const childNonShared = child.vertexIndices.filter(g => !sharedSet.has(g));
      let childSide = 0;
      for (const g of childNonShared) {
        childSide += child.canonical[childLocalOf.get(g)].clone().sub(src0).dot(n1);
      }

      const nSign = (Math.sign(childSide) * Math.sign(parentSide) > 0) ? -1 : +1;

      function applyRigid(p) {
        const d = p.clone().sub(src0);
        const lu = d.dot(u1), lv = d.dot(v1), ln = d.dot(n1);
        return new THREE.Vector3()
          .addScaledVector(u2, lu)
          .addScaledVector(v2, lv)
          .addScaledVector(n2, ln * nSign)
          .add(tgt0);
      }

      const childEmb = new Array(child.vertexIndices.length);
      for (let l = 0; l < child.vertexIndices.length; l++) {
        const g = child.vertexIndices[l];
        if (parentLocalOf.has(g) && sharedSet.has(g)) {
          // Shared vertex — exact match for continuity (avoid float drift)
          childEmb[l] = parentWorld[parentLocalOf.get(g)].clone();
        } else {
          // Non-shared (or parent-only) — apply the rigid motion to canonical
          childEmb[l] = applyRigid(child.canonical[l]);
        }
      }

      world[childIdx] = childEmb;
      visited.add(childIdx);
      queue.push(childIdx);
    }
  }

  return world;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2D unfolder for 3D-polytope nets
//
// Each "cell" here is a 2D polygon face of a 3D polyhedron, with its canonical
// embedding being the polygon's true 3D position (in its face plane). The
// unfold lays every face flat in the z=0 plane.
//
// BFS through face-adjacency (≥ 2 shared global vertices). For each child
// face, build local 2D frames in the child's face plane and in the world z=0
// plane, then express each child vertex in the local frame and re-emit in the
// world frame. Pick the frame orientation so the child sits on the opposite
// side of the shared edge from the parent's interior.
// ─────────────────────────────────────────────────────────────────────────────

export function unfoldNet2D({ cells, rootIdx, rootEmbedding }) {
  const N = cells.length;
  const world = new Array(N).fill(null);
  world[rootIdx] = rootEmbedding.map(v => v.clone());

  const visited = new Set([rootIdx]);
  const queue = [rootIdx];

  while (queue.length) {
    const parentIdx = queue.shift();
    const parent = cells[parentIdx];
    const parentWorld = world[parentIdx];

    const parentLocalOf = new Map();
    parent.vertexIndices.forEach((g, l) => parentLocalOf.set(g, l));

    for (let childIdx = 0; childIdx < N; childIdx++) {
      if (visited.has(childIdx)) continue;
      const child = cells[childIdx];
      const shared = child.vertexIndices.filter(g => parentLocalOf.has(g));
      if (shared.length < 2) continue;

      const childLocalOf = new Map();
      child.vertexIndices.forEach((g, l) => childLocalOf.set(g, l));

      const gA = shared[0], gB = shared[1];
      const A_c = child.canonical[childLocalOf.get(gA)];
      const B_c = child.canonical[childLocalOf.get(gB)];
      const A_w = parentWorld[parentLocalOf.get(gA)];
      const B_w = parentWorld[parentLocalOf.get(gB)];

      // Child's in-face 2D frame: u along edge AB, v perpendicular within face plane
      const u_c = B_c.clone().sub(A_c).normalize();
      let v_c = null;
      for (let l = 0; l < child.vertexIndices.length; l++) {
        if (shared.includes(child.vertexIndices[l])) continue;
        const w = child.canonical[l].clone().sub(A_c);
        const proj = u_c.clone().multiplyScalar(w.dot(u_c));
        const perp = w.clone().sub(proj);
        if (perp.length() > 1e-9) { v_c = perp.normalize(); break; }
      }
      if (!v_c) continue;

      // Target frame in z=0: u along world edge, v its 90°-rotation in z=0
      const u_w = B_w.clone().sub(A_w).normalize();
      let v_w = new THREE.Vector3(-u_w.y, u_w.x, 0);

      // Choose orientation: child non-shared verts on opposite side of edge from
      // parent's non-shared verts. Compare signs of v-component for one of each.
      let parentSign = 0, childSign = 0;
      for (let l = 0; l < parent.vertexIndices.length && parentSign === 0; l++) {
        if (shared.includes(parent.vertexIndices[l])) continue;
        const d = parentWorld[l].clone().sub(A_w);
        parentSign = Math.sign(d.dot(v_w));
      }
      for (let l = 0; l < child.vertexIndices.length && childSign === 0; l++) {
        if (shared.includes(child.vertexIndices[l])) continue;
        const d = child.canonical[l].clone().sub(A_c);
        childSign = Math.sign(d.dot(v_c));
      }
      if (parentSign * childSign > 0) v_w = v_w.clone().multiplyScalar(-1);

      // Embed each child vertex
      const childEmb = child.vertexIndices.map((g, l) => {
        const d = child.canonical[l].clone().sub(A_c);
        const lu = d.dot(u_c), lv = d.dot(v_c);
        return new THREE.Vector3(
          A_w.x + lu*u_w.x + lv*v_w.x,
          A_w.y + lu*u_w.y + lv*v_w.y,
          0,
        );
      });

      world[childIdx] = childEmb;
      visited.add(childIdx);
      queue.push(childIdx);
    }
  }

  return world;
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D-polytope builder: given vertices and polygonal faces, produce a polytope
// spec where each "cell" is a 2D polygon face. Folded = the 3D polyhedron (with
// root face oriented to z=0); unfolded = the 2D net in z=0.
// ─────────────────────────────────────────────────────────────────────────────

function orientPolyhedron(vertices3D, rootPoly) {
  // Translate so root-face centroid is at origin; rotate so root-face outward
  // normal is −ẑ (so the polyhedron sits above the z=0 plane).
  const fc = [0, 0, 0];
  for (const i of rootPoly) for (let k = 0; k < 3; k++) fc[k] += vertices3D[i][k] / rootPoly.length;
  const translated = vertices3D.map(v => [v[0]-fc[0], v[1]-fc[1], v[2]-fc[2]]);

  const a = translated[rootPoly[0]], b = translated[rootPoly[1]], c = translated[rootPoly[2]];
  let nx = (b[1]-a[1])*(c[2]-a[2]) - (b[2]-a[2])*(c[1]-a[1]);
  let ny = (b[2]-a[2])*(c[0]-a[0]) - (b[0]-a[0])*(c[2]-a[2]);
  let nz = (b[0]-a[0])*(c[1]-a[1]) - (b[1]-a[1])*(c[0]-a[0]);
  const nl = Math.hypot(nx, ny, nz);
  nx /= nl; ny /= nl; nz /= nl;

  // Outward = direction from polyhedron centroid (after translation) to face centroid (origin)
  const pc = [0, 0, 0];
  for (const v of translated) for (let k = 0; k < 3; k++) pc[k] += v[k] / translated.length;
  if (nx*(-pc[0]) + ny*(-pc[1]) + nz*(-pc[2]) < 0) { nx = -nx; ny = -ny; nz = -nz; }

  // Rotate (nx, ny, nz) → (0, 0, −1)
  const tx = 0, ty = 0, tz = -1;
  let ax = ny*tz - nz*ty, ay = nz*tx - nx*tz, az = nx*ty - ny*tx;
  const al = Math.hypot(ax, ay, az);
  if (al < 1e-9) {
    if (nx*tx + ny*ty + nz*tz > 0) return translated;          // already aligned
    return translated.map(v => [v[0], -v[1], -v[2]]);          // 180° about x
  }
  ax /= al; ay /= al; az /= al;
  const cosA = nx*tx + ny*ty + nz*tz;
  const sinA = al;
  return translated.map(v => {
    const cx = ay*v[2] - az*v[1];
    const cy = az*v[0] - ax*v[2];
    const cz = ax*v[1] - ay*v[0];
    const dot = ax*v[0] + ay*v[1] + az*v[2];
    return [
      v[0]*cosA + cx*sinA + ax*dot*(1-cosA),
      v[1]*cosA + cy*sinA + ay*dot*(1-cosA),
      v[2]*cosA + cz*sinA + az*dot*(1-cosA),
    ];
  });
}

export function buildPolytope3D({ vertices3D, polygons, rootIdx = 0, name, description, cameraDistance, paletteRange }) {
  const oriented = orientPolyhedron(vertices3D, polygons[rootIdx]);
  const PAL = palette(polygons.length, paletteRange?.s ?? [0.55, 0.7], paletteRange?.l ?? [0.5, 0.6]);

  const facesAbstract = polygons.map((poly, idx) => {
    const canonical = poly.map(i => new THREE.Vector3(oriented[i][0], oriented[i][1], oriented[i][2]));
    const tri = [];
    for (let i = 1; i < poly.length - 1; i++) tri.push([0, i, i + 1]);
    const edges = [];
    for (let i = 0; i < poly.length; i++) edges.push([i, (i + 1) % poly.length]);
    return {
      color: PAL[idx],
      label: `face ${idx} (${poly.length}-gon)`,
      vertexIndices: poly,
      canonical,
      faces: tri,
      edges,
    };
  });

  const rootEmbedding = facesAbstract[rootIdx].canonical.map(v => v.clone());
  const world = unfoldNet2D({ cells: facesAbstract, rootIdx, rootEmbedding });

  const cells = facesAbstract.map((f, i) => ({
    color: f.color,
    label: f.label,
    faces: f.faces,
    edges: f.edges,
    vertices: f.vertexIndices.map((g, l) => ({
      folded: f.canonical[l].clone(),
      unfolded: world[i][l].clone(),
    })),
  }));

  return { name, description, cells, cameraDistance };
}

// Assemble final cell objects given per-cell world positions + per-vertex folded
export function assembleCells({ cells, world, foldedByGlobal }) {
  return cells.map((cell, i) => ({
    color: cell.color,
    label: cell.label,
    faces: cell.faces,
    edges: cell.edges,
    vertices: cell.vertexIndices.map((g, l) => ({
      folded: foldedByGlobal[g].clone(),
      unfolded: world[i][l].clone(),
    })),
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5-cell (4-simplex)
// ─────────────────────────────────────────────────────────────────────────────

export function build5Cell() {
  const P = [
    new THREE.Vector3( 1,  1,  1),
    new THREE.Vector3( 1, -1, -1),
    new THREE.Vector3(-1,  1, -1),
    new THREE.Vector3(-1, -1,  1),
  ];
  const G = centroid(P);

  const PALETTE = [0xd9534f, 0x5cb85c, 0x428bca, 0xf0ad4e, 0x9b59b6];

  const root = {
    color: PALETTE[0],
    label: 'Root cell',
    vertices: P.map(p => ({ folded: p.clone(), unfolded: p.clone() })),
    faces: TETRA_FACES,
    edges: TETRA_EDGES,
  };

  const cells = [root];
  for (let i = 0; i < 4; i++) {
    const hingeIdx = [0, 1, 2, 3].filter(j => j !== i);
    const [j, k, l] = hingeIdx;
    const n = planeNormal(P[j], P[k], P[l]);
    const apexUnfolded = reflectAcrossPlane(P[i], P[j], n);

    cells.push({
      color: PALETTE[i + 1],
      label: `Cell opposite vertex ${i}`,
      vertices: [
        { folded: P[j].clone(), unfolded: P[j].clone() },
        { folded: P[k].clone(), unfolded: P[k].clone() },
        { folded: P[l].clone(), unfolded: P[l].clone() },
        { folded: G.clone(),    unfolded: apexUnfolded },
      ],
      faces: TETRA_FACES,
      edges: TETRA_EDGES,
    });
  }

  return {
    name: '5-cell (4-simplex)',
    description:
      '5 regular tetrahedra. At t=1 the flat net (central tetra with 4 peripheral ' +
      'tetras unfolded outward from its faces). At t=0 the peripheral apexes collapse ' +
      'to the root\'s centroid — the Schlegel view of the 5-cell.',
    cells,
    cameraDistance: 8,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8-cell (tesseract)
// ─────────────────────────────────────────────────────────────────────────────

export function build8Cell() {
  // 16 4D vertices at (±1, ±1, ±1, ±1)
  const verts4D = [];
  for (let i = 0; i < 16; i++) {
    verts4D.push([
      (i & 1) ? +1 : -1,
      (i & 2) ? +1 : -1,
      (i & 4) ? +1 : -1,
      (i & 8) ? +1 : -1,
    ]);
  }

  // Schlegel projection from a viewpoint above the w=+1 cell.
  // Onto the hyperplane w=+1, viewed from V = (0,0,0, w_V), w_V > 1.
  const w_V = 2.4;
  function schlegel3D(p4D) {
    const t = (1 - w_V) / (p4D[3] - w_V);
    return new THREE.Vector3(p4D[0] * t, p4D[1] * t, p4D[2] * t);
  }
  const verticesFolded = verts4D.map(schlegel3D);

  // 8 cubic cells indexed by (axis ∈ {0..3}, sign ∈ {-1,+1}).
  // The unfolding tree: root = w=+1 (axis=3, sign=+1). Direct children: x±, y±, z±.
  // Grandchild: w=-1 attached to z=-1 (extends the "tower" along -z).
  //
  // For each cell we hard-code its unfolded embedding (axis-aligned cubes), which
  // also serves as the rigid motion for any 4D vertex of that cell.
  //
  //  Cell           unfolded center      mapping from 4D to world 3D
  //  w=+1 (root)    (0,0,0)              (x,y,z,w) → (x,y,z)
  //  x=±1           (±2, 0, 0)           (x,y,z,w) → (sign*(2-w), y, z)
  //  y=±1           (0, ±2, 0)           (x,y,z,w) → (x, sign*(2-w), z)
  //  z=+1           (0, 0, +2)           (x,y,z,w) → (x, y, +(2-w))
  //  z=-1           (0, 0, -2)           (x,y,z,w) → (x, y, -(2-w))
  //  w=-1 (via z=-1) (0, 0, -4)          (x,y,z,w) → (x, y, -4-z)

  const cellSpecs = [
    { axis: 3, sign: +1, label: 'Root  (w = +1)',  color: 0xd9534f,
      unfolded: ([x,y,z,_w]) => new THREE.Vector3(x, y, z) },
    { axis: 0, sign: +1, label: 'x = +1',          color: 0x5cb85c,
      unfolded: ([_x,y,z,w]) => new THREE.Vector3(+1*(2-w), y, z) },
    { axis: 0, sign: -1, label: 'x = −1',          color: 0x4a90e2,
      unfolded: ([_x,y,z,w]) => new THREE.Vector3(-1*(2-w), y, z) },
    { axis: 1, sign: +1, label: 'y = +1',          color: 0xf0ad4e,
      unfolded: ([x,_y,z,w]) => new THREE.Vector3(x, +1*(2-w), z) },
    { axis: 1, sign: -1, label: 'y = −1',          color: 0x9b59b6,
      unfolded: ([x,_y,z,w]) => new THREE.Vector3(x, -1*(2-w), z) },
    { axis: 2, sign: +1, label: 'z = +1',          color: 0x17a2b8,
      unfolded: ([x,y,_z,w]) => new THREE.Vector3(x, y, +1*(2-w)) },
    { axis: 2, sign: -1, label: 'z = −1',          color: 0xfd7e14,
      unfolded: ([x,y,_z,w]) => new THREE.Vector3(x, y, -1*(2-w)) },
    { axis: 3, sign: -1, label: 'w = −1 (via z = −1)', color: 0xff6b9d,
      unfolded: ([x,y,z,_w]) => new THREE.Vector3(x, y, -4 - z) },
  ];

  function cellVertIndices(axis, sign) {
    // Indices into verts4D for vertices with the axis-coord equal to sign
    const out = [];
    for (let i = 0; i < verts4D.length; i++) {
      if (verts4D[i][axis] === sign) out.push(i);
    }
    return out;
  }

  // For face/edge structure, we need a stable local ordering.
  // Local index l ∈ 0..7 = (s_a + 2*s_b + 4*s_c) where (a, b, c) are the 3 free
  // axes of the cell in 4D-coord order (axes 0..3 minus the fixed axis), and s_*
  // is 1 if that coord is +1, else 0.
  function localIndexOfVert(axis, sign, vi) {
    const v = verts4D[vi];
    const freeAxes = [0, 1, 2, 3].filter(a => a !== axis);
    let idx = 0;
    for (let b = 0; b < 3; b++) {
      if (v[freeAxes[b]] > 0) idx |= (1 << b);
    }
    return idx;
  }

  const cells = cellSpecs.map((spec, ci) => {
    const verts = cellVertIndices(spec.axis, spec.sign); // 8 global indices, arbitrary order
    // Reorder so that local index l is at verts[l]
    const ordered = new Array(8);
    for (const gi of verts) {
      ordered[localIndexOfVert(spec.axis, spec.sign, gi)] = gi;
    }
    return {
      color: spec.color,
      label: spec.label,
      vertices: ordered.map(gi => ({
        folded: verticesFolded[gi].clone(),
        unfolded: spec.unfolded(verts4D[gi]),
      })),
      faces: CUBE_FACES,
      edges: CUBE_EDGES,
    };
  });

  return {
    name: '8-cell (tesseract)',
    description:
      '8 cubic cells. At t=0 a Schlegel projection — a small cube nested inside ' +
      'a larger one, joined by 6 frustum cells. At t=1 the classic 3D cross net: ' +
      '6 cubes around the root + 1 cube extending below.',
    cells,
    cameraDistance: 14,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 16-cell
//
// 8 vertices at (±2, 0, 0, 0) and permutations (one nonzero coord ±2).
// 16 tetrahedral cells indexed by (sx, sy, sz, sw) ∈ {−1, +1}⁴: cell with these
// signs has the four axis vertices (sx·2, 0, 0, 0), (0, sy·2, 0, 0), …
// Two cells share a triangular face iff they differ in exactly one sign.
// The cell-adjacency graph is the 4-cube graph (Q₄).
// ─────────────────────────────────────────────────────────────────────────────

export function build16Cell() {
  // 8 global 4D vertices — indexed (+x=0, −x=1, +y=2, −y=3, +z=4, −z=5, +w=6, −w=7)
  const verts4D = [
    [+2, 0, 0, 0], [-2, 0, 0, 0],
    [0, +2, 0, 0], [0, -2, 0, 0],
    [0, 0, +2, 0], [0, 0, -2, 0],
    [0, 0, 0, +2], [0, 0, 0, -2],
  ];

  // Schlegel projection from V outside the polytope, onto root hyperplane
  // x+y+z+w = 2 (the hyperplane of the (+,+,+,+) cell). Drop the w coord to
  // obtain a 3D position. (The w-axis vertices project away from the origin,
  // landing inside the root cell — so the folded state shows the polytope
  // "from above" the root.)
  // 16 cells indexed by sign pattern 0..15.  Canonical 3D embedding for each
  // cell comes from applyFrame on its 4D vertices (so it's automatically an
  // isometric copy of the regular tetrahedral cell, and matches Schlegel for
  // the root).
  const PAL = palette(16, [0.55, 0.65], [0.5, 0.6]);
  const cells = [];
  for (let signs = 0; signs < 16; signs++) {
    const sx = (signs & 1) ? +1 : -1;
    const sy = (signs & 2) ? +1 : -1;
    const sz = (signs & 4) ? +1 : -1;
    const sw = (signs & 8) ? +1 : -1;

    const vIdx = [
      sx > 0 ? 0 : 1,
      sy > 0 ? 2 : 3,
      sz > 0 ? 4 : 5,
      sw > 0 ? 6 : 7,
    ];

    const cellPoints4D = vIdx.map(i => verts4D[i]);
    const cellFrame = affineFrame(cellPoints4D);
    const canonical = cellPoints4D.map(P => applyFrame(P, cellFrame));

    const label = `(${sx>0?'+':'−'}${sy>0?'+':'−'}${sz>0?'+':'−'}${sw>0?'+':'−'})`;

    cells.push({
      color: PAL[signs],
      label,
      vertexIndices: vIdx,
      canonical,
      faces: TETRA_FACES,
      edges: TETRA_EDGES,
    });
  }

  // Root = (+,+,+,+) i.e. signs = 0b1111 = 15.
  const rootIdx = 15;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());

  // Folded: Schlegel through the root cell's hyperplane
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 1.0,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: '16-cell',
    description:
      '16 regular tetrahedra. Each cell takes one vertex from each ±axis pair; ' +
      'two cells are adjacent when they differ in one sign (the cell-adjacency ' +
      'graph is the 4-cube). At t=0 a Schlegel projection. At t=1 the BFS net.',
    cells: assembled,
    cameraDistance: 12,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 24-cell
//
// 24 vertices = all permutations of (±1, ±1, 0, 0). Edge length √2.
// 24 octahedral cells, partitioned into:
//   • 8 "axis" cells  — one for each of v_a = ±1 (a = 0..3).
//   • 16 "diagonal" cells — one for each sign pattern (s₀,s₁,s₂,s₃) ∈ {±1}⁴,
//     containing the 6 vertices v with s_i·v_i + s_j·v_j = 2 (the two nonzero
//     positions match the sign pattern).
// Each cell is an octahedron of edge √2.
// ─────────────────────────────────────────────────────────────────────────────

export function build24Cell() {
  // ── 24 vertices in 4D ────────────────────────────────────────────────
  const verts4D = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      for (let si = -1; si <= 1; si += 2) {
        for (let sj = -1; sj <= 1; sj += 2) {
          const v = [0, 0, 0, 0];
          v[i] = si; v[j] = sj;
          verts4D.push(v);
        }
      }
    }
  }

  function findVert(target) {
    return verts4D.findIndex(v => v.every((x, k) => x === target[k]));
  }

  // ── Canonical octahedron embedding (replaced per-cell below via applyFrame)
  // We retain OCTA_VERTEX_DIRS only as a fallback reference; canonical comes
  // from each cell's own affineFrame so it matches the Schlegel projection.

  // ── Build the 24 cells ───────────────────────────────────────────────
  // Local order for every octahedral cell:
  //   (0, 1), (2, 3), (4, 5) are the three antipodal pairs.
  //
  // For an axis cell (axis = a, sign = s), the three free axes b₁<b₂<b₃ map:
  //   local (0, 1) ↔ (b₁, ±)   local (2, 3) ↔ (b₂, ±)   local (4, 5) ↔ (b₃, ±)
  //
  // For a diagonal cell (sign pattern s), the three antipodal vertex pairs come
  // from complementary position-pairs ((01)↔(23)), ((02)↔(13)), ((03)↔(12)):
  //   local 0 = v_{01}, 1 = v_{23}
  //   local 2 = v_{02}, 3 = v_{13}
  //   local 4 = v_{03}, 5 = v_{12}
  // (where v_{ij} is the unique cell vertex with nonzero positions i,j and
  // v_i = s_i, v_j = s_j.)

  function buildOctaCell(vIdx, color, label) {
    const cellPoints4D = vIdx.map(i => verts4D[i]);
    const frame = affineFrame(cellPoints4D);
    return {
      color, label,
      vertexIndices: vIdx,
      canonical: cellPoints4D.map(P => applyFrame(P, frame)),
      faces: OCTA_FACES,
      edges: OCTA_EDGES,
    };
  }

  const cells = [];
  const PAL = palette(24, [0.55, 0.65], [0.5, 0.6]);
  let colorIdx = 0;

  // 8 axis cells
  for (let axis = 0; axis < 4; axis++) {
    for (let sign = -1; sign <= 1; sign += 2) {
      const freeAxes = [0, 1, 2, 3].filter(a => a !== axis);
      const vIdx = [];
      for (let b = 0; b < 3; b++) {
        for (const s of [+1, -1]) {
          const target = [0, 0, 0, 0];
          target[axis] = sign;
          target[freeAxes[b]] = s;
          vIdx.push(findVert(target));
        }
      }
      const axName = ['x','y','z','w'][axis];
      cells.push(buildOctaCell(vIdx, PAL[colorIdx++],
        `${axName} = ${sign > 0 ? '+1' : '−1'}`));
    }
  }

  // 16 diagonal cells
  for (let mask = 0; mask < 16; mask++) {
    const s = [
      (mask & 1) ? +1 : -1,
      (mask & 2) ? +1 : -1,
      (mask & 4) ? +1 : -1,
      (mask & 8) ? +1 : -1,
    ];
    const pairOrder = [
      [[0,1],[2,3]],
      [[0,2],[1,3]],
      [[0,3],[1,2]],
    ];
    const vIdx = [];
    for (const [[i1,j1],[i2,j2]] of pairOrder) {
      for (const [a,b] of [[i1,j1],[i2,j2]]) {
        const target = [0,0,0,0];
        target[a] = s[a];
        target[b] = s[b];
        vIdx.push(findVert(target));
      }
    }
    const lbl = s.map(x => x > 0 ? '+' : '−').join('');
    cells.push(buildOctaCell(vIdx, PAL[colorIdx++], `diag (${lbl})`));
  }

  // Root: cells[0] (the first axis cell).
  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());

  // Folded: Schlegel through the root cell's hyperplane
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 1.5,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: '24-cell',
    description:
      '24 regular octahedra. Vertices are the 24 permutations of (±1, ±1, 0, 0). ' +
      'Each cell is face-adjacent to 8 others, partitioning into 8 axis-aligned ' +
      'cells and 16 "diagonal" cells. At t=0 a Schlegel projection from above the ' +
      'x = +1 cell; at t=1 the BFS-unfolded net.',
    cells: assembled,
    cameraDistance: 10,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 600-cell
//
// 120 vertices on the unit 3-sphere, in three orbits:
//   • 8 of type A: permutations of (±1, 0, 0, 0)
//   • 16 of type B: (±½, ±½, ±½, ±½)
//   • 96 of type C: even permutations of (0, ±1/(2φ), ±½, ±φ/2)
// where φ = (1+√5)/2. Edge length is 1/φ; each vertex has 12 neighbours.
// Cells are the 600 tetrahedral 4-cliques in the edge graph.
// ─────────────────────────────────────────────────────────────────────────────

export function build600Cell() {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const EDGE = 1 / PHI;

  // ── 120 vertices ──────────────────────────────────────────────────────
  const verts4D = [];
  // Type A: 8
  for (let a = 0; a < 4; a++) for (const s of [-1, +1]) {
    const v = [0, 0, 0, 0]; v[a] = s; verts4D.push(v);
  }
  // Type B: 16
  for (let m = 0; m < 16; m++) verts4D.push([
    (m & 1) ? 0.5 : -0.5,
    (m & 2) ? 0.5 : -0.5,
    (m & 4) ? 0.5 : -0.5,
    (m & 8) ? 0.5 : -0.5,
  ]);
  // Type C: 96 — even permutations of (0, c, a, b) with all sign combos on nonzero entries
  const a = 0.5, b = PHI / 2, c = 1 / (2 * PHI);
  const vals = [0, c, a, b];
  function permsOf(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permsOf(rest)) out.push([arr[i], ...p]);
    }
    return out;
  }
  function isEven(p) {
    let n = 0;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        if (p[i] > p[j]) n++;
    return n % 2 === 0;
  }
  for (const perm of permsOf([0, 1, 2, 3]).filter(isEven)) {
    const vs = perm.map(i => vals[i]);
    for (let sm = 0; sm < 8; sm++) {
      const sgns = [(sm & 1) ? +1 : -1, (sm & 2) ? +1 : -1, (sm & 4) ? +1 : -1];
      let si = 0;
      verts4D.push(vs.map(x => x === 0 ? 0 : sgns[si++] * x));
    }
  }

  // ── Find edges (pairs at distance EDGE) and adjacency ────────────────
  const tol = 1e-8;
  const target2 = EDGE * EDGE;
  const adj = Array.from({ length: verts4D.length }, () => new Set());
  for (let i = 0; i < verts4D.length; i++) {
    for (let j = i + 1; j < verts4D.length; j++) {
      let d2 = 0;
      for (let k = 0; k < 4; k++) {
        const x = verts4D[i][k] - verts4D[j][k];
        d2 += x * x;
      }
      if (Math.abs(d2 - target2) < tol) {
        adj[i].add(j); adj[j].add(i);
      }
    }
  }

  // ── Enumerate 4-cliques as cells ─────────────────────────────────────
  const cellTuples = [];
  for (let i = 0; i < verts4D.length; i++) {
    const neigh = [...adj[i]].filter(x => x > i).sort((p, q) => p - q);
    for (let p = 0; p < neigh.length; p++) {
      const j = neigh[p];
      for (let q = p + 1; q < neigh.length; q++) {
        const k = neigh[q];
        if (!adj[j].has(k)) continue;
        for (let r = q + 1; r < neigh.length; r++) {
          const l = neigh[r];
          if (adj[j].has(l) && adj[k].has(l)) cellTuples.push([i, j, k, l]);
        }
      }
    }
  }

  // ── Build abstract cells with per-cell affineFrame canonical embeddings ──
  const PAL = palette(cellTuples.length, [0.5, 0.7], [0.45, 0.6]);
  const cells = cellTuples.map((tuple, idx) => {
    const cellPoints4D = tuple.map(i => verts4D[i]);
    const cellFrame = affineFrame(cellPoints4D);
    return {
      color: PAL[idx],
      label: `cell ${idx}`,
      vertexIndices: tuple,
      canonical: cellPoints4D.map(P => applyFrame(P, cellFrame)),
      faces: TETRA_FACES,
      edges: TETRA_EDGES,
    };
  });

  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());

  // ── Folded state: Schlegel projection through the root cell's hyperplane ──
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 0.6,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: '600-cell',
    description:
      '600 regular tetrahedra. 120 vertices on the unit 3-sphere; the vertex ' +
      'figure of each vertex is an icosahedron (12 neighbours). At t=0 an ' +
      'orthographic projection (many cells overlap in this collapse). At t=1 the ' +
      'full BFS-unfolded net — visually busy: ~600 tetrahedra spread across space.',
    cells: assembled,
    cameraDistance: 12,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rectified 24-cell — t_1{3,4,3}
//
// 96 vertices = midpoints of the 24-cell's 96 edges.
// 48 cells:
//   • 24 cubes  — one per 24-cell vertex v. The 8 edges incident to v have
//     8 midpoints; they form a cube (the vertex figure of the 24-cell).
//   • 24 cuboctahedra — one per 24-cell octahedral cell. The 12 edges of an
//     octahedron have 12 midpoints; they form a cuboctahedron.
// ─────────────────────────────────────────────────────────────────────────────

export function buildRectified24Cell() {
  // 24 vertices of the underlying 24-cell
  const verts24 = [];
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    for (const si of [-1, +1]) for (const sj of [-1, +1]) {
      const v = [0, 0, 0, 0]; v[i] = si; v[j] = sj;
      verts24.push(v);
    }
  }
  // 96 edges of the 24-cell — pairs at distance √2
  const edges24 = [];
  const edgeKey = new Map();   // (a,b) → edge index
  for (let i = 0; i < verts24.length; i++) {
    for (let j = i + 1; j < verts24.length; j++) {
      let d2 = 0;
      for (let k = 0; k < 4; k++) { const x = verts24[i][k] - verts24[j][k]; d2 += x*x; }
      if (Math.abs(d2 - 2) < 1e-8) {
        const idx = edges24.length;
        edges24.push([i, j]);
        edgeKey.set(`${i},${j}`, idx);
      }
    }
  }
  function findEdge(a, b) { return edgeKey.get(a < b ? `${a},${b}` : `${b},${a}`); }

  // 96 4D rectified-24-cell vertices = edge midpoints
  const verts4D = edges24.map(([a, b]) => verts24[a].map((x, k) => (x + verts24[b][k]) / 2));

  // 24 cube cells — one per 24-cell vertex
  const cubeCells = [];
  for (let v = 0; v < verts24.length; v++) {
    const inc = [];
    for (let e = 0; e < edges24.length; e++) {
      if (edges24[e][0] === v || edges24[e][1] === v) inc.push(e);
    }
    cubeCells.push(inc);
  }

  // 24 cuboctahedral cells — one per 24-cell octahedral cell.
  // 8 axis-aligned cells (axis a, sign s): 6 verts with v[a] = s.
  // 16 diagonal cells (sign pattern s): 6 verts maximising s·v.
  const cuboctaCells = [];
  for (let axis = 0; axis < 4; axis++) for (const sign of [-1, +1]) {
    const cv = verts24.map((v, i) => v[axis] === sign ? i : -1).filter(x => x >= 0);
    const edgesOfCell = [];
    for (let i = 0; i < cv.length; i++) for (let j = i + 1; j < cv.length; j++) {
      const eIdx = findEdge(cv[i], cv[j]);
      if (eIdx !== undefined) edgesOfCell.push(eIdx);
    }
    cuboctaCells.push(edgesOfCell);
  }
  for (let mask = 0; mask < 16; mask++) {
    const s = [(mask&1)?+1:-1, (mask&2)?+1:-1, (mask&4)?+1:-1, (mask&8)?+1:-1];
    const cv = verts24.map((v, i) => {
      let d = 0; for (let k = 0; k < 4; k++) d += s[k] * v[k];
      return d === 2 ? i : -1;
    }).filter(x => x >= 0);
    const edgesOfCell = [];
    for (let i = 0; i < cv.length; i++) for (let j = i + 1; j < cv.length; j++) {
      const eIdx = findEdge(cv[i], cv[j]);
      if (eIdx !== undefined) edgesOfCell.push(eIdx);
    }
    cuboctaCells.push(edgesOfCell);
  }

  const PAL = palette(48, [0.55, 0.7], [0.45, 0.6]);
  const cells = [];
  for (const verts of cubeCells) {
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[cells.length], label: 'cube',
    }));
  }
  for (const verts of cuboctaCells) {
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[cells.length], label: 'cuboctahedron',
    }));
  }

  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 1.0,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: 'Rectified 24-cell',
    description:
      '96 vertices = edge midpoints of the 24-cell. 48 cells: 24 cubes (one per ' +
      '24-cell vertex, formed by the 8 incident edge midpoints — the cube is the ' +
      'vertex figure of the 24-cell) + 24 cuboctahedra (one per 24-cell ' +
      'octahedral cell, formed by its 12 edge midpoints). The rectification ' +
      'replaces each edge with a point and each vertex with its vertex figure.',
    cells: assembled,
    cameraDistance: 12,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D associahedron K₅ (Loday realization)
//
// 14 vertices = triangulations of a hexagon = binary trees with 4 internal
// nodes. Loday vertex: (l_i · r_i) for i = 1..4 (internal nodes labeled by
// in-order traversal). All vertices sum to 10, so the polytope lives in a 3D
// affine hyperplane within R^4. We project to true 3D Euclidean via the
// affineFrame helper.
//
// 9 facets: 6 pentagonal (one per "short" hexagon diagonal — separates a
// triangle from a pentagon) + 3 quadrilateral (one per "long" hexagon diagonal
// — separates two quadrilaterals).
// ─────────────────────────────────────────────────────────────────────────────

export function buildLodayAssociahedron3D() {
  function generateTrees(n) {
    if (n === 0) return [null];
    const out = [];
    for (let k = 0; k < n; k++) {
      const lefts = generateTrees(k);
      const rights = generateTrees(n - 1 - k);
      for (const l of lefts) for (const r of rights) out.push([l, r]);
    }
    return out;
  }
  function leafCount(t) { return t === null ? 1 : leafCount(t[0]) + leafCount(t[1]); }
  function lodayCoords(tree) {
    const c = [];
    (function walk(t) {
      if (t === null) return;
      walk(t[0]); c.push(leafCount(t[0]) * leafCount(t[1])); walk(t[1]);
    })(tree);
    return c;
  }

  const trees = generateTrees(4);                   // Catalan(4) = 14 trees
  const verts4D = trees.map(lodayCoords);           // 4-tuples summing to 10
  const frame = affineFrame(verts4D);
  const verts3D = verts4D.map(v => {
    const p = applyFrame(v, frame);
    return [p.x, p.y, p.z];
  });

  return polyhedronFromVerts(verts3D, {
    name: '3D associahedron K₅ (Loday)',
    description:
      '14 vertices = triangulations of a hexagon (Catalan C₄). Loday\'s vertex ' +
      'coordinates are (l_i·r_i) over the 4 internal nodes of the corresponding ' +
      'binary tree (l, r = leaf counts of left/right subtrees). 9 polygon ' +
      'faces: 6 pentagons (short hexagon diagonals: triangle × pentagon ' +
      'triangulations) + 3 quadrilaterals (long diagonals: 4-gon × 4-gon). 3D ' +
      'sibling of the 4D K₆ in this catalog.',
    cameraDistance: 10,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Grand antiprism — the only uniform 4-polytope without a Wythoff construction.
//
// Constructed by removing two perpendicular decagonal great circles (20 of the
// 120 vertices) from the 600-cell and taking the convex hull of the remaining
// 100. The two decagons:
//   • Decagon 1 lies in the 2-plane spanned by (1,0,0,0) and (0, 1/(2φ), 0, ½):
//     vertices satisfy z = 0 AND w = φ·y.
//   • Decagon 2 lies in the perpendicular 2-plane: x = 0 AND w = −y/φ.
//
// 320 cells:
//   • 300 tetrahedra — the surviving 600-cell tetrahedral cells (all 4 verts
//     intact).
//   • 20 pentagonal antiprisms — one per removed vertex u, formed by its 10
//     surviving neighbours (the icosahedral vertex figure at u minus the 2
//     decagon-adjacent neighbours leaves a pentagonal antiprism).
// ─────────────────────────────────────────────────────────────────────────────

export function buildGrandAntiprism() {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const EDGE = 1 / PHI;

  // ── 120 vertices of the 600-cell ─────────────────────────────────────
  const v600 = [];
  for (let a = 0; a < 4; a++) for (const s of [-1, +1]) {
    const v = [0, 0, 0, 0]; v[a] = s; v600.push(v);
  }
  for (let m = 0; m < 16; m++) v600.push([
    (m & 1) ? 0.5 : -0.5, (m & 2) ? 0.5 : -0.5,
    (m & 4) ? 0.5 : -0.5, (m & 8) ? 0.5 : -0.5,
  ]);
  const baseVals = [0, 1/(2*PHI), 0.5, PHI/2];
  function permsOf(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0,i).concat(arr.slice(i+1));
      for (const p of permsOf(rest)) out.push([arr[i], ...p]);
    }
    return out;
  }
  function isEven(p) {
    let n = 0;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) n++;
    return n % 2 === 0;
  }
  for (const p of permsOf([0,1,2,3]).filter(isEven)) {
    const vs = p.map(i => baseVals[i]);
    for (let sm = 0; sm < 8; sm++) {
      const sgns = [(sm&1)?+1:-1, (sm&2)?+1:-1, (sm&4)?+1:-1];
      let si = 0;
      v600.push(vs.map(x => x === 0 ? 0 : sgns[si++] * x));
    }
  }

  // ── Mark the 20 vertices on the two decagons ─────────────────────────
  const removed = new Set();
  const tol = 1e-9;
  for (let i = 0; i < v600.length; i++) {
    const v = v600[i];
    const onD1 = Math.abs(v[2]) < tol && Math.abs(v[3] - PHI * v[1]) < tol;
    const onD2 = Math.abs(v[0]) < tol && Math.abs(v[3] + v[1] / PHI) < tol;
    if (onD1 || onD2) removed.add(i);
  }

  // ── 600-cell edge adjacency ──────────────────────────────────────────
  const target2 = EDGE * EDGE;
  const adj = Array.from({length: v600.length}, () => new Set());
  for (let i = 0; i < v600.length; i++) {
    for (let j = i + 1; j < v600.length; j++) {
      let d2 = 0;
      for (let k = 0; k < 4; k++) { const x = v600[i][k] - v600[j][k]; d2 += x*x; }
      if (Math.abs(d2 - target2) < 1e-8) { adj[i].add(j); adj[j].add(i); }
    }
  }

  // ── 300 tetrahedral cells (4-cliques with all 4 vertices surviving) ──
  const tetras = [];
  for (let i = 0; i < v600.length; i++) {
    if (removed.has(i)) continue;
    const neigh = [...adj[i]].filter(x => x > i && !removed.has(x));
    for (let p = 0; p < neigh.length; p++) {
      const j = neigh[p];
      for (let q = p + 1; q < neigh.length; q++) {
        const k = neigh[q];
        if (!adj[j].has(k)) continue;
        for (let r = q + 1; r < neigh.length; r++) {
          const l = neigh[r];
          if (adj[j].has(l) && adj[k].has(l)) tetras.push([i, j, k, l]);
        }
      }
    }
  }

  // ── 20 pentagonal antiprism cells (one per removed vertex) ───────────
  const antiprisms = [];
  for (const u of removed) {
    const verts = [...adj[u]].filter(x => !removed.has(x));
    antiprisms.push(verts);
  }

  // ── Build cells ──────────────────────────────────────────────────────
  const totalCells = tetras.length + antiprisms.length;
  const PAL = palette(totalCells, [0.55, 0.72], [0.45, 0.62]);
  const cells = [];
  for (const tuple of tetras) {
    cells.push(buildConvexCell({
      vertexIndices: tuple, points4D: v600,
      color: PAL[cells.length], label: 'tetrahedron',
    }));
  }
  for (const verts of antiprisms) {
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: v600,
      color: PAL[cells.length], label: 'pentagonal antiprism',
    }));
  }

  // ── Schlegel folded state through root cell ──────────────────────────
  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => v600[i]),
    allPoints4D: v600,
    viewDist: 0.6,
  });
  const foldedByGlobal = v600.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: 'Grand antiprism',
    description:
      '100 vertices = 600-cell minus two perpendicular decagonal great circles. ' +
      '320 cells: 300 tetrahedra + 20 pentagonal antiprisms. The only uniform ' +
      '4-polytope without a Wythoff construction (Conway & Guy, 1965). Each ' +
      'pentagonal antiprism is the icosahedral vertex figure of a removed ' +
      'vertex, minus the two antipodal neighbours that were also on the ' +
      'removed decagon.',
    cells: assembled,
    cameraDistance: 12,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 120-cell (computed by duality from the 600-cell)
//
//   • 120-cell vertex   ↔  600-cell tetrahedral cell  (use its centroid)
//   • 120-cell edge     ↔  600-cell triangular face   (pair of cells share it)
//   • 120-cell cell     ↔  600-cell vertex            (its 20 incident cells form
//                                                       the dodecahedron's verts)
//
// Each cell is a regular dodecahedron; we compute its canonical 3D embedding by
// projecting the 4D vertex positions onto an orthonormal basis of the cell's
// 3-hyperplane. Rendered as a wireframe (edges only) — adding 1440 pentagonal
// faces would dwarf the rendering.
// ─────────────────────────────────────────────────────────────────────────────

export function build120Cell() {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const E600 = 1 / PHI;

  // ── 600-cell vertices (120 of them) ──────────────────────────────────
  const v600 = [];
  for (let a = 0; a < 4; a++) for (const s of [-1, +1]) {
    const v = [0, 0, 0, 0]; v[a] = s; v600.push(v);
  }
  for (let m = 0; m < 16; m++) v600.push([
    (m&1)?0.5:-0.5, (m&2)?0.5:-0.5, (m&4)?0.5:-0.5, (m&8)?0.5:-0.5,
  ]);
  const aV = 0.5, bV = PHI / 2, cV = 1 / (2 * PHI);
  const baseVals = [0, cV, aV, bV];
  function permsOf(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0,i).concat(arr.slice(i+1));
      for (const p of permsOf(rest)) out.push([arr[i], ...p]);
    }
    return out;
  }
  function isEven(p) {
    let n = 0;
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++)
        if (p[i] > p[j]) n++;
    return n % 2 === 0;
  }
  for (const p of permsOf([0,1,2,3]).filter(isEven)) {
    const vs = p.map(i => baseVals[i]);
    for (let sm = 0; sm < 8; sm++) {
      const sgns = [(sm&1)?+1:-1, (sm&2)?+1:-1, (sm&4)?+1:-1];
      let si = 0;
      v600.push(vs.map(x => x === 0 ? 0 : sgns[si++] * x));
    }
  }

  // ── 600-cell edges/adjacency and tetrahedral cells (4-cliques) ───────
  const tol = 1e-8;
  const target2 = E600 * E600;
  const adj600 = Array.from({length: v600.length}, () => new Set());
  for (let i = 0; i < v600.length; i++) {
    for (let j = i+1; j < v600.length; j++) {
      let d2 = 0;
      for (let k = 0; k < 4; k++) {
        const x = v600[i][k] - v600[j][k];
        d2 += x*x;
      }
      if (Math.abs(d2 - target2) < tol) {
        adj600[i].add(j); adj600[j].add(i);
      }
    }
  }
  const tetras = []; // each is sorted [a,b,c,d]
  for (let i = 0; i < v600.length; i++) {
    const neigh = [...adj600[i]].filter(x => x > i).sort((a,b)=>a-b);
    for (let p = 0; p < neigh.length; p++) {
      const j = neigh[p];
      for (let q = p+1; q < neigh.length; q++) {
        const k = neigh[q];
        if (!adj600[j].has(k)) continue;
        for (let r = q+1; r < neigh.length; r++) {
          const l = neigh[r];
          if (adj600[j].has(l) && adj600[k].has(l)) tetras.push([i,j,k,l]);
        }
      }
    }
  }
  // tetras.length === 600

  // ── 120-cell vertices = centroids of tetrahedra ──────────────────────
  const v120 = tetras.map(t => {
    const c = [0,0,0,0];
    for (const vi of t) for (let k = 0; k < 4; k++) c[k] += v600[vi][k];
    return c.map(x => x / 4);
  });

  // For each 600-cell vertex u, the tetras containing u become the 20 vertices
  // of the 120-cell dodecahedron at u.
  const tetrasContaining = Array.from({length: v600.length}, () => []);
  for (let ti = 0; ti < tetras.length; ti++) {
    for (const v of tetras[ti]) tetrasContaining[v].push(ti);
  }

  // 120-cell edges: pairs of tetras sharing a triangular face. We index by face
  // key (sorted 3-tuple of v600 indices) → list of 1 or 2 tetra indices.
  const faceToTetras = new Map();
  const TRI_OF_TETRA = [[0,1,2],[0,1,3],[0,2,3],[1,2,3]];
  for (let ti = 0; ti < tetras.length; ti++) {
    const t = tetras[ti];
    for (const [i,j,k] of TRI_OF_TETRA) {
      const face = [t[i], t[j], t[k]].sort((a,b)=>a-b);
      const key = face.join(',');
      if (!faceToTetras.has(key)) faceToTetras.set(key, []);
      faceToTetras.get(key).push(ti);
    }
  }

  // For each 120-cell cell at u, build its abstract structure.
  // ─ vertexIndices: the 20 tetras containing u, in the order we find them.
  // ─ canonical: 3D positions by projecting (v120[ti] − centroidOfCell) onto an
  //   orthonormal basis of the cell's 3-hyperplane.  The "outward" direction
  //   from the polytope centre (origin) to the cell centroid is the hyperplane's
  //   normal in 4D.
  // ─ edges: pairs of tetras sharing a triangular face that contains u.

  // Helper: order the 5 tetras of a pentagonal face (those containing both u
  // and v) around the pentagon. Two tetras in the pentagon are face-adjacent
  // (in the 120-cell) iff they share a third vertex besides u and v.
  function orderPentagon(pent, u, v) {
    const others = new Map();
    for (const ti of pent) {
      others.set(ti, tetras[ti].filter(x => x !== u && x !== v));
    }
    const localAdj = new Map();
    for (const ti of pent) localAdj.set(ti, []);
    for (let i = 0; i < pent.length; i++) {
      for (let j = i + 1; j < pent.length; j++) {
        const oi = others.get(pent[i]);
        const oj = others.get(pent[j]);
        if (oi.some(x => oj.includes(x))) {
          localAdj.get(pent[i]).push(pent[j]);
          localAdj.get(pent[j]).push(pent[i]);
        }
      }
    }
    const cycle = [pent[0]];
    const used = new Set([pent[0]]);
    while (cycle.length < pent.length) {
      const last = cycle[cycle.length - 1];
      const next = localAdj.get(last).find(x => !used.has(x));
      if (next === undefined) return null;
      cycle.push(next);
      used.add(next);
    }
    return cycle;
  }

  const cells = [];
  const PAL = palette(v600.length, [0.55, 0.7], [0.5, 0.6]);
  for (let u = 0; u < v600.length; u++) {
    const vIdx = tetrasContaining[u]; // 20 indices into v120

    // Canonical 3D embedding: project the 20 4D vertices onto an orthonormal
    // basis of the cell's 3-hyperplane.  Using affineFrame keeps this
    // consistent with the Schlegel projector below.
    const cellPoints4D = vIdx.map(ti => v120[ti]);
    const cellFrame = affineFrame(cellPoints4D);
    const canonical = cellPoints4D.map(P => applyFrame(P, cellFrame));

    const localOf = new Map();
    vIdx.forEach((ti, l) => localOf.set(ti, l));

    // Edges: 30 per cell. For each triangular face of the 600-cell containing
    // u, the two tetras sharing it both lie in this 120-cell cell.
    const cellEdges = [];
    for (const [_, ts] of faceToTetras) {
      if (ts.length !== 2) continue;
      const [a, b] = ts;
      if (!tetras[a].includes(u) || !tetras[b].includes(u)) continue;
      cellEdges.push([localOf.get(a), localOf.get(b)]);
    }

    // Pentagonal faces: 12 per cell. For each neighbour v of u, the 5 tetras
    // containing {u,v} form a pentagon. Order them cyclically and fan-
    // triangulate from local[0].
    const cellFaces = [];
    for (const v of adj600[u]) {
      const pent = vIdx.filter(ti => tetras[ti].includes(v));
      if (pent.length !== 5) continue;
      const cyc = orderPentagon(pent, u, v);
      if (!cyc) continue;
      const L = cyc.map(ti => localOf.get(ti));
      cellFaces.push([L[0], L[1], L[2]]);
      cellFaces.push([L[0], L[2], L[3]]);
      cellFaces.push([L[0], L[3], L[4]]);
    }

    cells.push({
      color: PAL[u],
      label: `cell at v600[${u}]`,
      vertexIndices: vIdx,
      canonical,
      faces: cellFaces,
      edges: cellEdges,
    });
  }

  // Root = cell 0
  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());

  // ── Folded state: Schlegel projection through the root cell's hyperplane ──
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => v120[i]),
    allPoints4D: v120,
    viewDist: 0.6,
  });
  const foldedByGlobal = v120.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: '120-cell',
    description:
      '120 regular dodecahedra. Constructed by duality from the 600-cell: each ' +
      '120-cell vertex is the centroid of a 600-cell cell, and each 120-cell cell ' +
      'corresponds to a 600-cell vertex (with the 20 cells around it forming the ' +
      'dodecahedron\'s 20 vertices). Rendered as wireframe — the pentagonal faces ' +
      'are omitted for clarity.',
    cells: assembled,
    cameraDistance: 14,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4D associahedron K_6 (Loday realization)
//
// • 42 vertices = binary trees with 5 internal nodes = triangulations of a 7-gon
//   = Catalan number C_5.
// • 14 cells, one per diagonal of the 7-gon:
//     7 "short" diagonals (skip 1 vertex)  → K_5 3D associahedra (14 vertices each)
//     7 "medium" diagonals (skip 2 vertices) → pentagonal prisms K_3 × K_4 (10 verts)
// • 56 2-faces = compatible-diagonal pairs.  Each 2-face is a pentagon (5 verts)
//   or a quadrilateral (4 verts), depending on how the diagonal pair partitions
//   the 7-gon.
// • Loday vertex coordinate i = (#leaves in left subtree of node i) × (#leaves
//   in right subtree).  All 42 vertices satisfy x₁+…+x₅ = 15, so the polytope
//   lives in a 4D hyperplane within ℝ⁵; drop the last coord to get 4D.
// ─────────────────────────────────────────────────────────────────────────────

export function buildAssociahedron() {
  const N_INTERNAL = 5;
  const POLY_SIZE = N_INTERNAL + 2; // 7-gon

  // ── Enumerate all binary trees with N_INTERNAL internal nodes ────────
  function generateTrees(n) {
    if (n === 0) return [null];
    const out = [];
    for (let k = 0; k < n; k++) {
      const lefts = generateTrees(k);
      const rights = generateTrees(n - 1 - k);
      for (const l of lefts) for (const r of rights) out.push([l, r]);
    }
    return out;
  }
  function leafCount(t) {
    return t === null ? 1 : leafCount(t[0]) + leafCount(t[1]);
  }
  function lodayCoords(tree) {
    const c = [];
    (function walk(t) {
      if (t === null) return;
      walk(t[0]);
      c.push(leafCount(t[0]) * leafCount(t[1]));
      walk(t[1]);
    })(tree);
    return c;
  }
  function trianglesOf(tree, vStart, vEnd) {
    if (tree === null) return [];
    const apex = vStart + leafCount(tree[0]);
    return [
      [vStart, apex, vEnd],
      ...trianglesOf(tree[0], vStart, apex),
      ...trianglesOf(tree[1], apex, vEnd),
    ];
  }
  function diagonalsOf(triangles) {
    const all = new Set();
    for (const t of triangles) {
      for (const [a, b] of [[t[0],t[1]],[t[1],t[2]],[t[0],t[2]]]) {
        all.add(`${Math.min(a,b)},${Math.max(a,b)}`);
      }
    }
    const out = new Set();
    for (const e of all) {
      const [lo, hi] = e.split(',').map(Number);
      if (hi - lo === 1) continue;                          // adjacent in polygon
      if (lo === 0 && hi === POLY_SIZE - 1) continue;        // closing edge
      out.add(e);
    }
    return out;
  }

  const trees = generateTrees(N_INTERNAL);
  const treeDiags = trees.map(t => diagonalsOf(trianglesOf(t, 0, POLY_SIZE - 1)));
  const verts5D = trees.map(lodayCoords);
  const verts4D = verts5D.map(c => c.slice(0, 4));

  // ── Enumerate the 14 diagonals of the 7-gon ──────────────────────────
  const allDiagonals = [];
  for (let a = 0; a < POLY_SIZE; a++) {
    for (let b = a + 2; b < POLY_SIZE; b++) {
      if (a === 0 && b === POLY_SIZE - 1) continue;
      allDiagonals.push(`${a},${b}`);
    }
  }

  function diagonalsCross(d1, d2) {
    const [a, b] = d1.split(',').map(Number);
    const [c, d] = d2.split(',').map(Number);
    // Diagonals sharing an endpoint don't cross — they just meet at a vertex.
    if (a === c || a === d || b === c || b === d) return false;
    const between = (x, lo, hi) => x > lo && x < hi;
    return between(c, a, b) !== between(d, a, b);
  }

  function project4Dto3D(points4D) {
    const frame = affineFrame(points4D);
    return points4D.map(P => applyFrame(P, frame));
  }

  // ── Order the vertices of a 2-face around its polygonal boundary ─────
  // Two vertices in a 2-face are polygon-adjacent iff their triangulations
  // differ by exactly one diagonal flip.
  function orderPolygon(faceVerts) {
    const adj = new Map();
    for (const v of faceVerts) adj.set(v, []);
    for (let i = 0; i < faceVerts.length; i++) {
      for (let j = i + 1; j < faceVerts.length; j++) {
        const di = treeDiags[faceVerts[i]];
        const dj = treeDiags[faceVerts[j]];
        let diff = 0;
        for (const e of di) if (!dj.has(e)) { diff++; if (diff > 1) break; }
        if (diff === 1) {
          adj.get(faceVerts[i]).push(faceVerts[j]);
          adj.get(faceVerts[j]).push(faceVerts[i]);
        }
      }
    }
    const cycle = [faceVerts[0]];
    const used = new Set([faceVerts[0]]);
    while (cycle.length < faceVerts.length) {
      const last = cycle[cycle.length - 1];
      const next = adj.get(last).find(x => !used.has(x));
      if (next === undefined) return null;
      cycle.push(next);
      used.add(next);
    }
    return cycle;
  }

  // ── Build cells ──────────────────────────────────────────────────────
  const cells = [];
  const PAL = palette(allDiagonals.length, [0.55, 0.7], [0.5, 0.6]);

  for (let di = 0; di < allDiagonals.length; di++) {
    const d = allDiagonals[di];
    const vertexIndices = [];
    for (let ti = 0; ti < trees.length; ti++) {
      if (treeDiags[ti].has(d)) vertexIndices.push(ti);
    }
    const canonical = project4Dto3D(vertexIndices.map(i => verts4D[i]));

    const localOf = new Map();
    vertexIndices.forEach((i, l) => localOf.set(i, l));

    const cellFaces = [];
    const cellEdgesSet = new Set();
    for (const dp of allDiagonals) {
      if (dp === d || diagonalsCross(d, dp)) continue;
      const faceVerts = vertexIndices.filter(i => treeDiags[i].has(dp));
      if (faceVerts.length < 3) continue;
      const cyc = orderPolygon(faceVerts);
      if (!cyc) continue;
      const L = cyc.map(i => localOf.get(i));
      // Fan-triangulate from L[0]
      for (let i = 1; i < L.length - 1; i++) {
        cellFaces.push([L[0], L[i], L[i+1]]);
      }
      // Polygon-boundary edges
      for (let i = 0; i < L.length; i++) {
        const a = L[i], b = L[(i + 1) % L.length];
        cellEdgesSet.add(`${Math.min(a,b)},${Math.max(a,b)}`);
      }
    }
    const cellEdges = [...cellEdgesSet].map(s => s.split(',').map(Number));

    const [a, b] = d.split(',').map(Number);
    const cyclicDist = Math.min(b - a, POLY_SIZE - (b - a));
    cells.push({
      color: PAL[di],
      label: `diagonal (${a},${b}) — ${cyclicDist === 2 ? 'K₅' : 'K₃×K₄'}`,
      vertexIndices,
      canonical,
      faces: cellFaces,
      edges: cellEdges,
    });
  }

  // Root: the first cell.
  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());

  // ── Folded state: Schlegel projection through the root cell's hyperplane ──
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 1.5,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: 'Associahedron K₆ (Loday)',
    description:
      '4D Stasheff associahedron, 42 vertices. Each vertex is a triangulation of ' +
      'a 7-gon (or a binary tree with 5 internal nodes), with Loday coordinates ' +
      '(l_i·r_i)ᵢ. 14 cells, one per diagonal of the 7-gon: 7 are 3D associahedra ' +
      'K₅, 7 are pentagonal prisms K₃×K₄. Cells share a 2-face iff their diagonals ' +
      'are compatible (don\'t cross). t=0 shows a Schlegel projection through the ' +
      'root K₅ cell: every other cell appears nested inside it.',
    cells: assembled,
    cameraDistance: 26,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Dodecahedral prism — dodecahedron × interval
//
// 40 vertices (20 dodecahedron verts at w=0, 20 at w=1).
// 14 cells: 2 dodecahedra + 12 pentagonal prisms.
// ─────────────────────────────────────────────────────────────────────────────

export function buildDodecahedralPrism() {
  const phi = (1 + Math.sqrt(5)) / 2;
  // 20 dodecahedron vertices in 3D
  const dodec3D = [];
  for (let s = 0; s < 8; s++) dodec3D.push([
    (s & 1) ? 1 : -1, (s & 2) ? 1 : -1, (s & 4) ? 1 : -1
  ]);
  for (const sb of [+1, -1]) for (const sc of [+1, -1]) {
    dodec3D.push([0, sb/phi, sc*phi]);
    dodec3D.push([sc*phi, 0, sb/phi]);
    dodec3D.push([sb/phi, sc*phi, 0]);
  }

  // 40 4D vertices: 20 at w=0, 20 at w=1.  Pick w-spacing so prism edges have
  // the same length as dodecahedron edges (= 2/φ).
  const W = 2 / phi;
  const verts4D = [];
  for (const v of dodec3D) verts4D.push([v[0], v[1], v[2], 0]);
  for (const v of dodec3D) verts4D.push([v[0], v[1], v[2], W]);

  // Identify the 12 pentagonal faces of the dodecahedron via convex hull
  const hullProbe = convexHullFaces(dodec3D.map(([x,y,z]) => ({x,y,z})));
  // The hull faces are triangles; we need the underlying pentagons. Group
  // triangles by plane (already done inside convexHullFaces — but it returns
  // triangles only). Easier: re-derive pentagonal faces from the edge graph.
  // A pentagonal face = a 5-cycle where all 5 vertices are coplanar.
  // Build edge graph from hull edges; for each vertex of degree 3, find the
  // three pentagonal faces meeting at it.
  const adj3 = Array.from({length: 20}, () => new Set());
  for (const [a, b] of hullProbe.edges) { adj3[a].add(b); adj3[b].add(a); }

  // Enumerate pentagonal faces: find 5-cycles of coplanar vertices.
  // For each pair of adjacent vertices (a, b), look for the two pentagonal
  // faces containing edge a-b. They are determined by the third vertex.
  const pentagons = new Set();
  for (let a = 0; a < 20; a++) {
    for (const b of adj3[a]) {
      if (b <= a) continue;
      // Pentagon containing edge (a,b): pick a neighbour of b (not a), call it c.
      // Pick a neighbour of c (not b), call it d. Etc. until we return to a.
      for (const c of adj3[b]) {
        if (c === a) continue;
        for (const d of adj3[c]) {
          if (d === b || d === a) continue;
          for (const e of adj3[d]) {
            if (e === c || e === b) continue;
            if (!adj3[e].has(a)) continue;
            // Got a 5-cycle a-b-c-d-e-a. Check coplanar.
            const pa = dodec3D[a], pb = dodec3D[b], pc = dodec3D[c], pd = dodec3D[d], pe = dodec3D[e];
            const ux = pb[0]-pa[0], uy = pb[1]-pa[1], uz = pb[2]-pa[2];
            const vx = pc[0]-pa[0], vy = pc[1]-pa[1], vz = pc[2]-pa[2];
            const nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
            const off = pa[0]*nx + pa[1]*ny + pa[2]*nz;
            const dD = pd[0]*nx + pd[1]*ny + pd[2]*nz - off;
            const dE = pe[0]*nx + pe[1]*ny + pe[2]*nz - off;
            if (Math.abs(dD) > 1e-4 || Math.abs(dE) > 1e-4) continue;
            const key = [a, b, c, d, e].slice().sort((p,q)=>p-q).join(',');
            pentagons.add(key);
          }
        }
      }
    }
  }
  const pentagonFaces = [...pentagons].map(s => s.split(',').map(Number));
  // 12 pentagonal faces expected
  if (pentagonFaces.length !== 12) {
    console.warn('dodec prism: expected 12 pentagonal faces, got', pentagonFaces.length);
  }

  // Build cells
  const PAL = palette(14, [0.5, 0.7], [0.5, 0.6]);
  const cells = [];

  // Two dodecahedra
  for (const offset of [0, 20]) {
    const vIdx = [];
    for (let i = 0; i < 20; i++) vIdx.push(i + offset);
    cells.push(buildConvexCell({
      vertexIndices: vIdx, points4D: verts4D,
      color: PAL[cells.length], label: offset === 0 ? 'dodecahedron (w=0)' : 'dodecahedron (w=1)',
    }));
  }
  // 12 pentagonal prisms
  for (const pent of pentagonFaces) {
    const vIdx = [...pent, ...pent.map(i => i + 20)];
    cells.push(buildConvexCell({
      vertexIndices: vIdx, points4D: verts4D,
      color: PAL[cells.length], label: `pentagonal prism (${pent.join(',')})`,
    }));
  }

  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 1.0,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: 'Dodecahedral prism',
    description:
      'Dodecahedron × interval. Two dodecahedra (one at w=0, one at w=1) joined ' +
      'by 12 pentagonal prisms — one per pentagonal face of the dodecahedron. ' +
      '40 vertices, 14 cells, all regular.',
    cells: assembled,
    cameraDistance: 12,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// (5,5)-duoprism — pentagon × pentagon
//
// 25 vertices = product of two pentagons.  10 pentagonal-prism cells.
// ─────────────────────────────────────────────────────────────────────────────

export function buildDuoprism55() {
  const N = 5;
  // 25 4D vertices: vertex (i, j) at (cos(2πi/N), sin(2πi/N), cos(2πj/N), sin(2πj/N))
  const verts4D = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const t1 = 2 * Math.PI * i / N, t2 = 2 * Math.PI * j / N;
      verts4D.push([Math.cos(t1), Math.sin(t1), Math.cos(t2), Math.sin(t2)]);
    }
  }
  function vIdx(i, j) { return i * N + j; }

  // 10 pentagonal prism cells:
  //   5 prisms: for each edge (i, i+1) of pentagon 1, the prism contains all
  //     5 j-values → pentagon × interval = pent prism.
  //   5 prisms: for each edge (j, j+1) of pentagon 2, the prism contains all
  //     5 i-values.
  const PAL = palette(10, [0.5, 0.7], [0.5, 0.6]);
  const cells = [];
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N;
    const verts = [];
    for (let j = 0; j < N; j++) { verts.push(vIdx(i, j)); verts.push(vIdx(i2, j)); }
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[cells.length], label: `prism along edge (${i},${i2}) of P1`,
    }));
  }
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    const verts = [];
    for (let i = 0; i < N; i++) { verts.push(vIdx(i, j)); verts.push(vIdx(i, j2)); }
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[cells.length], label: `prism along edge (${j},${j2}) of P2`,
    }));
  }

  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 1.2,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: '(5,5)-duoprism',
    description:
      'Cartesian product of two regular pentagons. 25 vertices arranged on a torus ' +
      '(the Clifford torus in S³). 10 pentagonal-prism cells, 5 wrapping each ' +
      'pentagon direction.',
    cells: assembled,
    cameraDistance: 8,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rectified 5-cell
//
// 10 vertices = midpoints of edges of the 5-cell.
// 10 cells: 5 tetrahedra (one per 5-cell vertex — midpoints of edges incident
// to that vertex) + 5 octahedra (one per 5-cell cell — midpoints of its edges).
// ─────────────────────────────────────────────────────────────────────────────

export function buildRectified5Cell() {
  // 5-cell vertices: 5 standard basis vectors of R^5, on the hyperplane sum=1.
  // Use these directly (5D), project to 4D later.
  const V = [
    [1,0,0,0,0], [0,1,0,0,0], [0,0,1,0,0], [0,0,0,1,0], [0,0,0,0,1],
  ];
  // 10 edge midpoints (i<j)
  const pairs = [];
  for (let i = 0; i < 5; i++) for (let j = i + 1; j < 5; j++) pairs.push([i, j]);
  // Midpoint 5D = (V_i + V_j) / 2
  const mid5D = pairs.map(([i, j]) => V[i].map((_, k) => (V[i][k] + V[j][k]) / 2));
  // Drop last coord → 4D
  const verts4D = mid5D.map(p => p.slice(0, 4));

  // Index lookup from (i,j) to vertex index
  const pairIdx = new Map();
  pairs.forEach(([i, j], idx) => pairIdx.set(`${i},${j}`, idx));
  function midIdx(i, j) {
    if (i > j) [i, j] = [j, i];
    return pairIdx.get(`${i},${j}`);
  }

  const PAL = palette(10, [0.55, 0.7], [0.5, 0.6]);
  const cells = [];

  // 5 tetrahedral cells, one per 5-cell vertex i
  for (let i = 0; i < 5; i++) {
    const verts = [];
    for (let j = 0; j < 5; j++) {
      if (j !== i) verts.push(midIdx(i, j));
    }
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[cells.length], label: `tetra at vertex ${i}`,
    }));
  }
  // 5 octahedral cells, one per 5-cell tetrahedral cell {a,b,c,d} = complement of one vertex
  for (let v = 0; v < 5; v++) {
    const others = [0,1,2,3,4].filter(x => x !== v);
    const verts = [];
    for (let i = 0; i < others.length; i++)
      for (let j = i + 1; j < others.length; j++)
        verts.push(midIdx(others[i], others[j]));
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[cells.length], label: `octahedron opposite vertex ${v}`,
    }));
  }

  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 0.5,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: 'Rectified 5-cell',
    description:
      'Smallest non-regular uniform 4-polytope. 10 vertices at edge midpoints of ' +
      'the 5-cell. 10 cells: 5 tetrahedra (one per 5-cell vertex) plus 5 octahedra ' +
      '(one per 5-cell tetrahedral facet).',
    cells: assembled,
    cameraDistance: 5,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4D permutohedron P₅ (omnitruncated 5-cell)
//
// 120 vertices = all permutations of (1, 2, 3, 4, 5).
// 30 cells, one per non-empty proper subset S ⊂ {0,…,4} (5 positions):
//   • |S| ∈ {1, 4}: truncated octahedron (24 vertices) — 10 cells
//   • |S| ∈ {2, 3}: hexagonal prism (12 vertices) — 20 cells
// ─────────────────────────────────────────────────────────────────────────────

export function buildPermutohedron() {
  function permsOf(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permsOf(rest)) out.push([arr[i], ...p]);
    }
    return out;
  }
  const allPerms = permsOf([1, 2, 3, 4, 5]);  // 120 permutations
  // Drop last coord → 4D
  const verts4D = allPerms.map(p => p.slice(0, 4));

  // 30 facets: one per non-empty proper subset of {0,…,4}.
  // Vertices on facet S = permutations where positions in S hold values {1,…,|S|}.
  const PAL = palette(30, [0.55, 0.7], [0.5, 0.6]);
  const cells = [];
  for (let mask = 1; mask < 31; mask++) {
    const S = [];
    for (let i = 0; i < 5; i++) if (mask & (1 << i)) S.push(i);
    const k = S.length;
    const vertexIndices = [];
    for (let p = 0; p < allPerms.length; p++) {
      let valid = true;
      for (const i of S) {
        if (allPerms[p][i] > k) { valid = false; break; }
      }
      if (valid) vertexIndices.push(p);
    }
    const cellType = (k === 1 || k === 4) ? 'tr-oct' : 'hex-prism';
    cells.push(buildConvexCell({
      vertexIndices, points4D: verts4D,
      color: PAL[cells.length], label: `S = {${S.join(',')}} — ${cellType}`,
    }));
  }

  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 2.5,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: 'Permutohedron P₅',
    description:
      '4D permutohedron, the omnitruncated 5-cell. 120 vertices = permutations of ' +
      '(1,2,3,4,5). 30 cells: 10 truncated octahedra (singleton/4-element subset ' +
      'facets) + 20 hexagonal prisms (2- or 3-element subset facets). Sibling to ' +
      'the K₆ associahedron under Loday\'s permutohedron-to-associahedron map.',
    cells: assembled,
    cameraDistance: 12,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Snub 24-cell
//
// 96 vertices = the "Type C" vertices of the 600-cell (= 600-cell vertices not
//   in the inscribed 24-cell).
// 120 cells:
//   • 24 icosahedra — one per Type-A/B vertex u of the 600-cell, comprising the
//     12 Type-C vertices at edge distance from u.
//   • 96 tetrahedra — 4-cliques in the Type-C edge graph.
// ─────────────────────────────────────────────────────────────────────────────

export function buildSnub24Cell() {
  const PHI = (1 + Math.sqrt(5)) / 2;
  const EDGE = 1 / PHI;

  // ── Build 600-cell vertices and find Type A, B, C ─────────────────────
  const v600 = [];
  const typeOf = []; // 'A', 'B', 'C'
  // Type A: 8 perms of (±1, 0, 0, 0)
  for (let a = 0; a < 4; a++) for (const s of [-1, +1]) {
    const v = [0,0,0,0]; v[a] = s; v600.push(v); typeOf.push('A');
  }
  // Type B: 16 (±1/2)^4
  for (let m = 0; m < 16; m++) {
    v600.push([(m&1)?0.5:-0.5, (m&2)?0.5:-0.5, (m&4)?0.5:-0.5, (m&8)?0.5:-0.5]);
    typeOf.push('B');
  }
  // Type C: 96 even perms of (0, ±1/(2φ), ±1/2, ±φ/2)
  const baseVals = [0, 1/(2*PHI), 0.5, PHI/2];
  function permsOfIdx(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0,i).concat(arr.slice(i+1));
      for (const p of permsOfIdx(rest)) out.push([arr[i], ...p]);
    }
    return out;
  }
  function isEven(p) {
    let n = 0;
    for (let i = 0; i < p.length; i++)
      for (let j = i+1; j < p.length; j++) if (p[i] > p[j]) n++;
    return n % 2 === 0;
  }
  for (const p of permsOfIdx([0,1,2,3]).filter(isEven)) {
    const vs = p.map(i => baseVals[i]);
    for (let sm = 0; sm < 8; sm++) {
      const sgns = [(sm&1)?+1:-1, (sm&2)?+1:-1, (sm&4)?+1:-1];
      let si = 0;
      v600.push(vs.map(x => x === 0 ? 0 : sgns[si++] * x));
      typeOf.push('C');
    }
  }

  // Edge graph within full 600-cell
  const tol = 1e-8;
  const target2 = EDGE * EDGE;
  const adj = Array.from({length: v600.length}, () => new Set());
  for (let i = 0; i < v600.length; i++) {
    for (let j = i+1; j < v600.length; j++) {
      let d2 = 0;
      for (let k = 0; k < 4; k++) { const x = v600[i][k] - v600[j][k]; d2 += x*x; }
      if (Math.abs(d2 - target2) < tol) { adj[i].add(j); adj[j].add(i); }
    }
  }

  // ── Snub 24-cell vertex set = Type C indices into v600 ───────────────
  const typeC = [];
  for (let i = 0; i < v600.length; i++) if (typeOf[i] === 'C') typeC.push(i);
  // Re-label Type C as new indices 0..95
  const cToS = new Map();  // v600 index → snub index
  typeC.forEach((vi, snubIdx) => cToS.set(vi, snubIdx));
  const verts4D = typeC.map(vi => v600[vi]);

  // Type-C subgraph
  const adjC = Array.from({length: typeC.length}, () => new Set());
  for (let s = 0; s < typeC.length; s++) {
    for (const n of adj[typeC[s]]) {
      if (typeOf[n] === 'C') adjC[s].add(cToS.get(n));
    }
  }

  // ── Find 4-cliques (tetrahedral cells) entirely in Type C ─────────────
  const tetras = [];
  for (let i = 0; i < typeC.length; i++) {
    const neigh = [...adjC[i]].filter(x => x > i);
    for (let p = 0; p < neigh.length; p++) {
      const j = neigh[p];
      for (let q = p + 1; q < neigh.length; q++) {
        const k = neigh[q];
        if (!adjC[j].has(k)) continue;
        for (let r = q + 1; r < neigh.length; r++) {
          const l = neigh[r];
          if (adjC[j].has(l) && adjC[k].has(l)) tetras.push([i, j, k, l]);
        }
      }
    }
  }

  // ── 24 icosahedral cells, one per Type-A/B vertex of the 600-cell ─────
  const icosCenters = [];  // v600 indices of Type A/B
  for (let i = 0; i < v600.length; i++) if (typeOf[i] !== 'C') icosCenters.push(i);

  const icosCells = [];
  for (const u of icosCenters) {
    const verts = [];
    for (const n of adj[u]) {
      if (typeOf[n] === 'C') verts.push(cToS.get(n));
    }
    if (verts.length !== 12) {
      console.warn('snub: icosahedron at center', u, 'has', verts.length, 'verts (expected 12)');
    }
    icosCells.push(verts);
  }

  // ── Build cells ───────────────────────────────────────────────────────
  const totalCells = icosCells.length + tetras.length;
  const PAL = palette(totalCells, [0.55, 0.72], [0.45, 0.62]);
  const cells = [];
  for (const verts of icosCells) {
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[cells.length], label: `icosahedron`,
    }));
  }
  for (const verts of tetras) {
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[cells.length], label: `tetrahedron`,
    }));
  }

  // Root: icosahedral cell 0
  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 0.6,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: 'Snub 24-cell',
    description:
      '96 vertices = the "Type C" vertices of the 600-cell (the snub points, ' +
      'complementary to the inscribed 24-cell). 144 cells: 24 icosahedra + ' +
      '120 tetrahedra. Vertex figure is the J63 tridiminished icosahedron. One ' +
      'of the most beautiful uniform 4-polytopes.',
    cells: assembled,
    cameraDistance: 10,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Bitruncated 24-cell — t_{1,2}{3,4,3} Wythoff construction
//
// 288 vertices = F_4 orbit of (3+2√2, 1+√2, 1+√2, 1)/2.
// 48 truncated-octahedron cells (24 at long-root facets + 24 at short-root
// facets) — inherited from the self-dual 24-cell's two-orbit cell structure.
//
// The F_4 orbit is generated by exact Z[√2] arithmetic: floating-point BFS
// over reflections involving √2 accumulates errors that split the orbit
// (gave 346 instead of 288). Vertices live in (1/2)·Z[√2]^4; we scale up
// by 2 to land in Z[√2]^4 for the BFS, then divide back.
// ─────────────────────────────────────────────────────────────────────────────

export function buildBitruncated24Cell() {
  // Z[√2] arithmetic: [a, b] means a + b√2 (a, b ∈ ℤ).
  const add2  = (x, y) => [x[0]+y[0], x[1]+y[1]];
  const sub2  = (x, y) => [x[0]-y[0], x[1]-y[1]];
  const muls2 = (x, s) => [x[0]*s, x[1]*s];
  const divs2 = (x, s) => [x[0]/s, x[1]/s];
  const vKey  = v => v.map(x => `${x[0]},${x[1]}`).join('|');

  // F_4 simple reflections.  Vertices are stored 2×-scaled so all
  // intermediate values are integer Z[√2].
  function r0(v) {       // α_0 = e_2 − e_3 (long)
    const d = sub2(v[1], v[2]);
    return [v[0], sub2(v[1], d), add2(v[2], d), v[3]];
  }
  function r1(v) {       // α_1 = e_3 − e_4 (long)
    const d = sub2(v[2], v[3]);
    return [v[0], v[1], sub2(v[2], d), add2(v[3], d)];
  }
  function r2(v) {       // α_2 = e_4 (short)
    return [v[0], v[1], v[2], muls2(v[3], -1)];
  }
  function r3(v) {       // α_3 = (e_1 − e_2 − e_3 − e_4)/2 (short)
    const sum = sub2(sub2(sub2(v[0], v[1]), v[2]), v[3]);
    const h = divs2(sum, 2);
    return [sub2(v[0], h), add2(v[1], h), add2(v[2], h), add2(v[3], h)];
  }

  // Fundamental vertex × 2 = (6+4√2, 2+2√2, 2+2√2, 2)
  const v0sym = [[6,4], [2,2], [2,2], [2,0]];
  const seen = new Map();
  seen.set(vKey(v0sym), v0sym);
  const queue = [v0sym];
  while (queue.length) {
    const v = queue.shift();
    for (const r of [r0, r1, r2, r3]) {
      const w = r(v);
      const k = vKey(w);
      if (!seen.has(k)) { seen.set(k, w); queue.push(w); }
    }
  }
  const sym = [...seen.values()];                          // 288
  const SQ2 = Math.sqrt(2);
  const verts4D = sym.map(v => v.map(x => (x[0] + x[1]*SQ2) / 2));

  // ── F_4 root system (48 roots): 24 long + 24 short ────────────────────
  const roots = [];
  // Long: perms of (±1, ±1, 0, 0)  → 24
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    for (const si of [+1, -1]) for (const sj of [+1, -1]) {
      const r = [0, 0, 0, 0]; r[i] = si; r[j] = sj;
      roots.push(r);
    }
  }
  // Short: ±e_i  → 8
  for (let i = 0; i < 4; i++) for (const s of [+1, -1]) {
    const r = [0, 0, 0, 0]; r[i] = s;
    roots.push(r);
  }
  // Short: (±1, ±1, ±1, ±1)/2  → 16
  for (let m = 0; m < 16; m++) {
    roots.push([
      (m & 1) ? 0.5 : -0.5,
      (m & 2) ? 0.5 : -0.5,
      (m & 4) ? 0.5 : -0.5,
      (m & 8) ? 0.5 : -0.5,
    ]);
  }

  // For each (oriented) root, the facet contains the vertices that maximise
  // v · r.  Group vertices into 48 cells.
  const tol = 1e-6;
  const PAL = palette(48, [0.55, 0.72], [0.45, 0.62]);
  const cells = [];
  for (let ri = 0; ri < roots.length; ri++) {
    const r = roots[ri];
    const dots = verts4D.map(v => v[0]*r[0] + v[1]*r[1] + v[2]*r[2] + v[3]*r[3]);
    let maxDot = -Infinity;
    for (const d of dots) if (d > maxDot) maxDot = d;
    const verts = [];
    for (let i = 0; i < verts4D.length; i++) {
      if (Math.abs(dots[i] - maxDot) < tol) verts.push(i);
    }
    const longRoot = (r[0]*r[0] + r[1]*r[1] + r[2]*r[2] + r[3]*r[3]) > 1.5;
    cells.push(buildConvexCell({
      vertexIndices: verts, points4D: verts4D,
      color: PAL[ri], label: longRoot ? `long-root facet ${ri}` : `short-root facet ${ri}`,
    }));
  }

  const rootIdx = 0;
  const rootEmbedding = cells[rootIdx].canonical.map(v => v.clone());
  const schlegel = schlegelProjector({
    rootPoints4D: cells[rootIdx].vertexIndices.map(i => verts4D[i]),
    allPoints4D: verts4D,
    viewDist: 2.0,
  });
  const foldedByGlobal = verts4D.map(schlegel);

  const world = unfoldNet({ cells, rootIdx, rootEmbedding });
  const assembled = assembleCells({ cells, world, foldedByGlobal });

  return {
    name: 'Bitruncated 24-cell',
    description:
      '288 vertices, 48 truncated-octahedron cells. Wythoff t_{1,2}{3,4,3}: the ' +
      'F_4 orbit of the fundamental vertex (3+2√2, 1+√2, 1+√2, 1)/2. Cells split ' +
      'into 24 long-root facets + 24 short-root facets — corresponding to the ' +
      'original 24-cell\'s vertices and the dual 24-cell\'s vertices.',
    cells: assembled,
    cameraDistance: 16,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D polytopes (for comparison — unfolded into 2D nets)
//
// Build via convex hull of hand-coded vertex sets; the convex-hull helper
// gives back the polygon faces (cyclic vertex lists), which feed straight into
// buildPolytope3D.
// ─────────────────────────────────────────────────────────────────────────────

function polyhedronFromVerts(vertices3D, opts) {
  const points = vertices3D.map(([x, y, z]) => new THREE.Vector3(x, y, z));
  const { polygons } = convexHullFaces(points);
  return buildPolytope3D({ vertices3D, polygons, rootIdx: 0, ...opts });
}

export function buildTetrahedron() {
  return polyhedronFromVerts(
    [[1,1,1], [1,-1,-1], [-1,1,-1], [-1,-1,1]],
    {
      name: 'Tetrahedron',
      description: '4 triangular faces. The simplest 3D polytope — its net is 4 ' +
        'equilateral triangles joined along their edges.',
      cameraDistance: 5,
    },
  );
}

export function buildCube() {
  const v = [];
  for (let s = 0; s < 8; s++) v.push([(s&1)?1:-1, (s&2)?1:-1, (s&4)?1:-1]);
  return polyhedronFromVerts(v, {
    name: 'Cube',
    description: '6 square faces. The canonical net is a cross of 6 squares, ' +
      'though the cube has 11 distinct nets total.',
    cameraDistance: 6,
  });
}

export function buildOctahedron() {
  return polyhedronFromVerts(
    [[1,0,0], [-1,0,0], [0,1,0], [0,-1,0], [0,0,1], [0,0,-1]],
    {
      name: 'Octahedron',
      description: '8 triangular faces, 6 vertices. Dual of the cube.',
      cameraDistance: 5,
    },
  );
}

export function buildDodecahedron() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const v = [];
  for (let s = 0; s < 8; s++) v.push([(s&1)?1:-1, (s&2)?1:-1, (s&4)?1:-1]);
  for (const sb of [+1, -1]) for (const sc of [+1, -1]) {
    v.push([0, sb/phi, sc*phi]);
    v.push([sc*phi, 0, sb/phi]);
    v.push([sb/phi, sc*phi, 0]);
  }
  return polyhedronFromVerts(v, {
    name: 'Dodecahedron',
    description: '12 pentagonal faces, 20 vertices. Has 43,380 distinct nets.',
    cameraDistance: 7,
  });
}

export function buildIcosahedron() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const v = [];
  for (const sb of [+1, -1]) for (const sc of [+1, -1]) {
    v.push([0, sb, sc*phi]);
    v.push([sc*phi, 0, sb]);
    v.push([sb, sc*phi, 0]);
  }
  return polyhedronFromVerts(v, {
    name: 'Icosahedron',
    description: '20 triangular faces, 12 vertices. Dual of the dodecahedron.',
    cameraDistance: 6,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3D permutohedron P₄ — order-4 permutohedron, a.k.a. the truncated octahedron
//
// 24 vertices = all permutations of (1, 2, 3, 4). All sum to 10, so the
// polytope lives in a 3D affine hyperplane in R⁴ — project to true 3D
// Euclidean via affineFrame. Convex hull gives 14 polygon faces: 8 hexagons +
// 6 squares, one per non-empty proper subset of {1, 2, 3, 4} (sizes 1, 2, 3
// → 4 + 6 + 4 = 14 subsets). 3D sibling to the 4D P₅ in this catalog.
// ─────────────────────────────────────────────────────────────────────────────

export function buildPermutohedron3D() {
  function permsOf(arr) {
    if (arr.length <= 1) return [arr];
    const out = [];
    for (let i = 0; i < arr.length; i++) {
      const rest = arr.slice(0, i).concat(arr.slice(i + 1));
      for (const p of permsOf(rest)) out.push([arr[i], ...p]);
    }
    return out;
  }
  const allPerms = permsOf([1, 2, 3, 4]);
  const frame = affineFrame(allPerms);
  const verts3D = allPerms.map(v => {
    const p = applyFrame(v, frame);
    return [p.x, p.y, p.z];
  });

  return polyhedronFromVerts(verts3D, {
    name: '3D permutohedron P₄',
    description:
      '24 vertices = all 4! permutations of (1, 2, 3, 4). 14 faces: 8 hexagons + ' +
      '6 squares — exactly the truncated octahedron. The 3D sibling of the 4D ' +
      'permutohedron P₅ already in the catalog; under Loday\'s map P₄ projects ' +
      'onto K₅ much as P₅ projects onto K₆.',
    cameraDistance: 8,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Stretched icosahedron — a deliberately-overlapping BFS net
//
// Same 20 triangular faces as the regular icosahedron, but stretched 5× along
// the z-axis. The breaking of icosahedral symmetry causes some BFS spanning
// trees to wrap back and collide with themselves. Three of the 20 possible
// root choices produce overlapping nets (roots 9, 11, 18); the other 17 are
// still clean. We anchor at root 9 — the most visually striking — to give
// the overlap-highlight toggle a real demonstration.
// ─────────────────────────────────────────────────────────────────────────────

export function buildStretchedIcosahedron() {
  const phi = (1 + Math.sqrt(5)) / 2;
  const Z = 5;
  const v = [];
  for (const sb of [+1, -1]) for (const sc of [+1, -1]) {
    v.push([0, sb, sc*phi*Z]);
    v.push([sc*phi, 0, sb*Z]);
    v.push([sb, sc*phi, 0]);
  }
  return polyhedronFromVerts(v, {
    name: 'Stretched icosahedron (z × 5)',
    description:
      '20 triangular faces — same combinatorial structure as the icosahedron, ' +
      'just elongated 5× along z. With this root choice, the BFS net has 6 cells ' +
      'overlapping in 4 pairs — toggle "Overlaps" to highlight them in red. The ' +
      'regular icosahedron unfolds without overlap from all 20 root choices; this ' +
      'stretched version overlaps from 3 of 20 (roots 9, 11, 18). Dürer\'s ' +
      'conjecture asks whether every convex polyhedron has SOME non-overlapping ' +
      'edge-unfolding — still open. This example shows BFS isn\'t always such an ' +
      'unfolding.',
    cameraDistance: 35,
    rootIdx: 9,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Registry
// ─────────────────────────────────────────────────────────────────────────────

export const POLYTOPES = {
  '5-cell': build5Cell,
  '8-cell': build8Cell,
  '16-cell': build16Cell,
  '24-cell': build24Cell,
  '120-cell': build120Cell,
  '600-cell': build600Cell,
  'associahedron': buildAssociahedron,
  'rectified-5-cell': buildRectified5Cell,
  'permutohedron': buildPermutohedron,
  'snub-24-cell': buildSnub24Cell,
  'dodec-prism': buildDodecahedralPrism,
  'duoprism-55': buildDuoprism55,
  'bitruncated-24-cell': buildBitruncated24Cell,
  'grand-antiprism': buildGrandAntiprism,
  'rectified-24-cell': buildRectified24Cell,
  // 3D polytopes for comparison
  'tetrahedron': buildTetrahedron,
  'cube': buildCube,
  'octahedron': buildOctahedron,
  'dodecahedron': buildDodecahedron,
  'icosahedron': buildIcosahedron,
  'loday-k5': buildLodayAssociahedron3D,
  'permutohedron-p4': buildPermutohedron3D,
  'stretched-icosahedron': buildStretchedIcosahedron,
};
