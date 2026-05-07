// associahedron.js
// Loday's realization of the 3-dimensional Stasheff associahedron K_5.
//
//   For each binary tree T with n+1 = 5 leaves, m(T) = (m_1, …, m_n) where
//   m_i = ℓ_i · r_i is the product of the leaf-counts of the two subtrees
//   at the i-th internal node (in left-to-right / in-order). The 14 vectors
//   m(T) all lie on the hyperplane Σm_i = (n+1 choose 2) = 10 in R^4 and
//   are the vertices of K_5 (Loday, *Realization of the Stasheff Polytope*,
//   Arch. Math. 2004).
//
// 14 vertices ↔ 14 binary trees with 5 leaves
//             ↔ 14 Dyck words of length 8
//             ↔ 14 noncrossing matchings of {1,…,8}
//             ↔ 14 triangulations of a hexagon.
//
// Vertices are indexed by the lex-of-Dyck-word index (matching meanders.js).

import { dyckWords } from './meanders.js';

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------

function dyckToTree(dw) {
  if (dw === '') return { leaf: true };
  // Find the matching ')' for the first '('.
  let depth = 0, i = 0;
  for (; i < dw.length; i++) {
    if (dw[i] === '(') depth++;
    else if (dw[i] === ')' && --depth === 0) break;
  }
  return {
    leaf: false,
    left:  dyckToTree(dw.slice(1, i)),
    right: dyckToTree(dw.slice(i + 1)),
  };
}

function leafCount(t) {
  return t.leaf ? 1 : leafCount(t.left) + leafCount(t.right);
}

// ---------------------------------------------------------------------------
// Loday vertex coordinates
// ---------------------------------------------------------------------------

function lodayCoords(tree) {
  // m_i for i-th internal node in inorder order.
  const m = [];
  function visit(t) {
    if (t.leaf) return;
    visit(t.left);
    m.push(leafCount(t.left) * leafCount(t.right));
    visit(t.right);
  }
  visit(tree);
  return m;
}

// Project R^4 sum-fixed point to R^3 via an orthonormal basis of the
// (sum = 0) hyperplane (Gram–Schmidt on (1,−1,0,0), (1,1,−2,0), (1,1,1,−3)).
const E1 = [1,-1,0,0],   N1 = Math.SQRT2;
const E2 = [1,1,-2,0],   N2 = Math.sqrt(6);
const E3 = [1,1,1,-3],   N3 = 2 * Math.sqrt(3);

function dot4(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]+a[3]*b[3]; }
function projectTo3D(v) {
  return [dot4(v, E1)/N1, dot4(v, E2)/N2, dot4(v, E3)/N3];
}

function lodayVertex(tree, sumValue) {
  const m = lodayCoords(tree);
  const c = sumValue / m.length;
  const centered = m.map(x => x - c);
  return projectTo3D(centered);
}

// ---------------------------------------------------------------------------
// Optimal viewing rotation
// ---------------------------------------------------------------------------
//
// The 14 vertices have minimum pairwise 3-D distance √2 (one neighbor pair).
// Projecting straight onto the xz plane can shrink that to nearly zero if
// the close pair happens to lie in xy. We pre-computed the rotation that
// maximizes the minimum pairwise *xz* distance — i.e., it puts the close
// pair's separation entirely in the vertical (y) direction. The achieved
// min xz separation is 1, the best possible (= √(2 − 1²)).

const OPTIMAL_ROTATION = [
  [ 0.55975868, -0.82206922,  0.10427086],
  [-0.70710678, -0.40824829,  0.57735027],
  [-0.43205349, -0.39690745, -0.80981125],
];

function applyMatrix(R, v) {
  return [
    R[0][0]*v[0] + R[0][1]*v[1] + R[0][2]*v[2],
    R[1][0]*v[0] + R[1][1]*v[1] + R[1][2]*v[2],
    R[2][0]*v[0] + R[2][1]*v[1] + R[2][2]*v[2],
  ];
}

// ---------------------------------------------------------------------------
// Tree → triangulation of the hexagon (used only for edge enumeration)
// ---------------------------------------------------------------------------

function treeToTriangulation(tree) {
  const total = leafCount(tree); // = 5 here
  const diagonals = [];
  function recurse(t, leftV, rightV) {
    if (t.leaf) return;
    const splitV = leftV + leafCount(t.left);
    if (splitV - leftV > 1) diagonals.push([leftV, splitV]);
    if (rightV - splitV > 1) diagonals.push([splitV, rightV]);
    recurse(t.left,  leftV,  splitV);
    recurse(t.right, splitV, rightV);
  }
  recurse(tree, 0, total);
  // Sort each diagonal so [a,b] has a<b, and sort the list canonically.
  return diagonals
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)])
    .sort((p, q) => p[0] - q[0] || p[1] - q[1]);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute the K_5 associahedron via Loday's realization, with vertices
 * indexed by the lex index of the corresponding noncrossing matching of
 * {1, …, 8}.
 *
 * By default applies a pre-computed rotation that maximizes the minimum
 * pairwise distance of vertices in the xz plane — useful when columns
 * are dropped vertically from each vertex (the mobile view).
 *
 * Options:
 *   rotated:  boolean, default true.  Whether to apply the
 *             min-xz-clustering-optimal rotation. Pass false to get raw
 *             Loday coordinates.
 *
 * Returns:
 *   {
 *     vertices:       Array<[x, y, z]>,    indexed 0..13 = matching index
 *     edges:          Array<[i, j]>,       21 pairs of matching indices
 *     triangulations: Array<Diagonal[3]>,  the cluster as 3 hexagon
 *                                          diagonals, indexed by matching
 *   }
 */
export function computeAssociahedron(n = 4, options = {}) {
  if (n !== 4) {
    throw new Error('computeAssociahedron currently only supports n = 4 (K_5).');
  }
  const { rotated = true } = options;

  const dws       = dyckWords(n);
  const sumValue  = ((n + 1) * n) / 2; // (5 choose 2) = 10
  const vertices       = [];
  const triangulations = [];

  for (const dw of dws) {
    const tree = dyckToTree(dw);
    let v = lodayVertex(tree, sumValue);
    if (rotated) {
      v = applyMatrix(OPTIMAL_ROTATION, v);
      // Flip top/bottom (mirror across xz plane).
      v = [v[0], -v[1], v[2]];
    }
    vertices.push(v);
    triangulations.push(treeToTriangulation(tree));
  }

  // Edges: pairs of triangulations sharing 2 of 3 diagonals (= one flip).
  const edges = [];
  for (let i = 0; i < dws.length; i++) {
    for (let j = i + 1; j < dws.length; j++) {
      let shared = 0;
      for (const d1 of triangulations[i]) {
        for (const d2 of triangulations[j]) {
          if (d1[0] === d2[0] && d1[1] === d2[1]) { shared++; break; }
        }
      }
      if (shared === 2) edges.push([i, j]);
    }
  }
  if (edges.length !== 21) {
    throw new Error(`Expected 21 edges, got ${edges.length}.`);
  }

  return { vertices, edges, triangulations };
}
