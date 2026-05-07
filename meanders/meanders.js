// meanders.js
// Core math for noncrossing matchings and meandric systems.
// Pure JS, no rendering dependencies.
//
// Conventions:
//   - Marked points are 1-indexed: 1, 2, ..., 2n.
//   - A "noncrossing matching" is a list of pairs [a, b] with a < b, sorted by a.
//   - A "meandric system of order n" is an ordered pair (top, bottom)
//     of noncrossing matchings on {1, ..., 2n}.

// ---------------------------------------------------------------------------
// Dyck words and noncrossing matchings
// ---------------------------------------------------------------------------

/** All Dyck words of semi-length n, in lexicographic order ('(' < ')'). */
export function dyckWords(n) {
  const out = [];
  function rec(w, o, c) {
    if (o === n && c === n) { out.push(w); return; }
    if (o < n) rec(w + '(', o + 1, c);
    if (c < o) rec(w + ')', o, c + 1);
  }
  rec('', 0, 0);
  return out;
}

/** Convert a Dyck word to its noncrossing matching as sorted 1-indexed pairs. */
export function pairsFromDyck(dw) {
  const stack = [];
  const pairs = [];
  for (let i = 0; i < dw.length; i++) {
    if (dw[i] === '(') stack.push(i + 1);
    else pairs.push([stack.pop(), i + 1]);
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return pairs;
}

/** All C_n noncrossing matchings of {1,...,2n}, lex-ordered by Dyck word. */
export function allMatchings(n) {
  return dyckWords(n).map(pairsFromDyck);
}

/** Catalan number C_n. */
export function catalan(n) {
  let c = 1;
  for (let k = 0; k < n; k++) c = (c * 2 * (2 * k + 1)) / (k + 2);
  return Math.round(c);
}

// ---------------------------------------------------------------------------
// Meandric components
// ---------------------------------------------------------------------------

/**
 * Find the connected components of the meandric system (topPairs, bottomPairs).
 *
 * Each vertex has exactly one top-partner and one bottom-partner; the union
 * is a 2-regular multigraph whose components are cycles. As we walk a cycle,
 * the edges alternate top/bottom.
 *
 * Returns an array of components. Each component is an object
 *   { arcs: [[from, to, side], ...] }
 * where the arcs are listed in traversal order, each arc has side 'top' or
 * 'bottom', and consecutive arcs share an endpoint. The last arc closes the
 * cycle back to the first vertex.
 */
export function findComponents(topPairs, bottomPairs, n) {
  const N = 2 * n;
  const top = new Array(N + 1);
  const bot = new Array(N + 1);
  for (const [a, b] of topPairs) { top[a] = b; top[b] = a; }
  for (const [a, b] of bottomPairs) { bot[a] = b; bot[b] = a; }

  const visited = new Array(N + 1).fill(false);
  const components = [];

  for (let start = 1; start <= N; start++) {
    if (visited[start]) continue;
    const arcs = [];
    let cur = start;
    let useTop = true;
    do {
      visited[cur] = true;
      const next = useTop ? top[cur] : bot[cur];
      arcs.push([cur, next, useTop ? 'top' : 'bottom']);
      cur = next;
      useTop = !useTop;
    } while (cur !== start);
    components.push({ arcs });
  }
  return components;
}

/** Just the number of connected components (the meander polynomial coefficient). */
export function componentCount(topPairs, bottomPairs, n) {
  return findComponents(topPairs, bottomPairs, n).length;
}
