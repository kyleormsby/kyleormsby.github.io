// app-nets.js — render all 261 nets of the tesseract simultaneously, with
// per-cube Schlegel-folded state at t=0 (so each cube becomes its piece of the
// tesseract's "cube within a cube" Schlegel diagram: cell 0 = outer cube,
// cell 4 = inner cube, the 6 lateral cells = frustums) and unfolded state at t=1.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TESSERACT_NETS, MAX_EXTENT } from './tesseract-nets-data.js';

const N_NETS = TESSERACT_NETS.length;     // 261
const TILE_SIZE = MAX_EXTENT + 4;
const COLS = 18;
const ROWS = Math.ceil(N_NETS / COLS);    // 15
const gridW = COLS * TILE_SIZE;
const gridH = ROWS * TILE_SIZE;

// ── Scene ────────────────────────────────────────────────────────────────────
const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6f5f1);

const camera = new THREE.PerspectiveCamera(
  45, window.innerWidth / window.innerHeight, 1, gridW * 4
);
camera.position.set(gridW * 0.5, gridW * 0.55, gridH * 1.15);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 0.75);
sun.position.set(gridW * 0.5, gridW, gridH * 0.5);
scene.add(sun);
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(-gridW * 0.3, gridW * 0.3, -gridH * 0.3);
scene.add(fill);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(gridW * 0.5, 0, gridH * 0.5);

// ── Cell colours (one per 4D cell of the 8-cell) ─────────────────────────────
const CELL_COLORS = [
  0xd9534f, 0x5cb85c, 0x428bca, 0xf0ad4e,
  0x9b59b6, 0x17a2b8, 0xfd7e14, 0xff6b9d,
];

// ── Cell label helpers (match data: cell c = (axis = c%4, sign = c<4 ? + : -)) ─
function cellAxis(c) { return c % 4; }
function cellSign(c) { return c < 4 ? +1 : -1; }

// ── Schlegel projection ──────────────────────────────────────────────────────
// Viewpoint V = (V_x, 0, 0, 0). Project onto hyperplane x_0 = 1.
// For 4D point P, 3D Schlegel point = ((V_x - 1)/(V_x - P[0])) * (P[1], P[2], P[3]).
// V_x = 3 yields: P[0]=+1 → outer cube, P[0]=-1 → small inner cube (scale 0.5).
const V_SCHLEGEL = 3;
const SCHLEGEL_NUM = V_SCHLEGEL - 1;  // = 2

// ── Per-cube structure for flat-shaded faces + wireframe edges ───────────────
// We track 8 unique cube corners per cube (folded + unfolded), and expand to
// 24 face vertices (4 per face × 6 faces) for flat shading via computeVertexNormals.

// Corner enumeration: corner index c = (sx_bit << 2) | (sy_bit << 1) | sz_bit
//   sx_bit = 1 ↔ sx = +1, etc.
const CORNERS = [];
for (let c = 0; c < 8; c++) {
  CORNERS.push([
    (c & 4) ? +1 : -1,
    (c & 2) ? +1 : -1,
    (c & 1) ? +1 : -1,
  ]);
}

// Build FACE_VERT_CORNERS: 24 entries giving, for each face-vertex slot, the
// corner index it samples. Face-vertex slot index v = f*4 + k.
// Faces ordered: -x, +x, -y, +y, -z, +z. Within each face, 4 corners CCW from outside.
const FACE_VERT_CORNERS = (() => {
  const cornerOf = (sx, sy, sz) =>
    ((sx > 0) ? 4 : 0) | ((sy > 0) ? 2 : 0) | ((sz > 0) ? 1 : 0);
  const faces = [
    [cornerOf(-1,-1,-1), cornerOf(-1,-1,+1), cornerOf(-1,+1,+1), cornerOf(-1,+1,-1)], // -x
    [cornerOf(+1,-1,-1), cornerOf(+1,+1,-1), cornerOf(+1,+1,+1), cornerOf(+1,-1,+1)], // +x
    [cornerOf(-1,-1,-1), cornerOf(+1,-1,-1), cornerOf(+1,-1,+1), cornerOf(-1,-1,+1)], // -y
    [cornerOf(-1,+1,-1), cornerOf(-1,+1,+1), cornerOf(+1,+1,+1), cornerOf(+1,+1,-1)], // +y
    [cornerOf(-1,-1,-1), cornerOf(-1,+1,-1), cornerOf(+1,+1,-1), cornerOf(+1,-1,-1)], // -z
    [cornerOf(-1,-1,+1), cornerOf(+1,-1,+1), cornerOf(+1,+1,+1), cornerOf(-1,+1,+1)], // +z
  ];
  return faces.flat();
})();

// Triangulation per face: (0,1,2), (0,2,3). Total 36 indices per cube.
const FACE_INDICES = (() => {
  const out = [];
  for (let f = 0; f < 6; f++) {
    const b = f * 4;
    out.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return out;
})();

// 12 cube edges as pairs of corner indices.
const EDGE_PAIRS = (() => {
  const out = [];
  // along +x: each (sy, sz) pair contributes (sy<<1|sz, sy<<1|sz | 4)
  for (let yz = 0; yz < 4; yz++) out.push([yz, yz | 4]);
  // along +y: each (sx, sz) pair contributes (sx<<2|sz, sx<<2|sz | 2)
  for (let xz = 0; xz < 4; xz++) {
    const base = ((xz & 2) << 1) | (xz & 1);  // 0,1,4,5
    out.push([base, base | 2]);
  }
  // along +z: each (sx, sy) pair contributes (sx<<2|sy<<1, sx<<2|sy<<1 | 1)
  for (let xy = 0; xy < 4; xy++) {
    const base = (xy << 1);  // 0,2,4,6
    out.push([base, base | 1]);
  }
  return out;
})();

// ── Precompute folded + unfolded corner positions ────────────────────────────
// foldedCorners[cell] / unfoldedCorners[cell]: Float32Array of length N_NETS * 8 * 3.
// Each net occupies a tile in the XZ-plane grid; the y-axis is vertical.
const foldedCorners = [];
const unfoldedCorners = [];
for (let c = 0; c < 8; c++) {
  foldedCorners.push(new Float32Array(N_NETS * 8 * 3));
  unfoldedCorners.push(new Float32Array(N_NETS * 8 * 3));
}

for (let netIdx = 0; netIdx < N_NETS; netIdx++) {
  const col = netIdx % COLS;
  const row = Math.floor(netIdx / COLS);
  const tcx = (col + 0.5) * TILE_SIZE;
  const tcz = (row + 0.5) * TILE_SIZE;
  const net = TESSERACT_NETS[netIdx];

  for (let cell = 0; cell < 8; cell++) {
    const cube = net[cell];
    const cx = cube[0], cy = cube[1], cz = cube[2];
    // orient[i] = [axis_4d, sign]; local axis i maps to 4D axis with sign.
    const oAx = [cube[3], cube[5], cube[7]];
    const oSg = [cube[4], cube[6], cube[8]];
    const aCell = cellAxis(cell);
    const sCell = cellSign(cell);

    const foldedArr = foldedCorners[cell];
    const unfoldedArr = unfoldedCorners[cell];

    for (let cIdx = 0; cIdx < 8; cIdx++) {
      const [sx, sy, sz] = CORNERS[cIdx];

      // 4D vertex of this corner: free coords from local axes, cell coord = sCell.
      const P0 = (aCell === 0) ? sCell
              : (oAx[0] === 0) ? oSg[0] * sx
              : (oAx[1] === 0) ? oSg[1] * sy
              :                  oSg[2] * sz;
      const P1 = (aCell === 1) ? sCell
              : (oAx[0] === 1) ? oSg[0] * sx
              : (oAx[1] === 1) ? oSg[1] * sy
              :                  oSg[2] * sz;
      const P2 = (aCell === 2) ? sCell
              : (oAx[0] === 2) ? oSg[0] * sx
              : (oAx[1] === 2) ? oSg[1] * sy
              :                  oSg[2] * sz;
      const P3 = (aCell === 3) ? sCell
              : (oAx[0] === 3) ? oSg[0] * sx
              : (oAx[1] === 3) ? oSg[1] * sy
              :                  oSg[2] * sz;

      // Folded: Schlegel project (drop axis 0), centred at tile.
      const t = SCHLEGEL_NUM / (V_SCHLEGEL - P0);

      const off = (netIdx * 8 + cIdx) * 3;
      foldedArr[off    ] = tcx + t * P1;
      foldedArr[off + 1] = 0   + t * P2;
      foldedArr[off + 2] = tcz + t * P3;

      // Unfolded: cube centre + local corner offset (cube edge length 2).
      unfoldedArr[off    ] = tcx + cx + sx;
      unfoldedArr[off + 1] = 0   + cy + sy;
      unfoldedArr[off + 2] = tcz + cz + sz;
    }
  }
}

// ── Per-cell BufferGeometry: 24 face-verts per cube (flat-shaded) ────────────
const cellMeshes = [];
let currentOpacity = 0.5;

for (let cell = 0; cell < 8; cell++) {
  const positions = new Float32Array(N_NETS * 24 * 3);
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  positionAttr.setUsage(THREE.DynamicDrawUsage);

  const indices = new Uint32Array(N_NETS * 36);
  for (let n = 0; n < N_NETS; n++) {
    const baseV = n * 24;
    const baseI = n * 36;
    for (let k = 0; k < 36; k++) indices[baseI + k] = baseV + FACE_INDICES[k];
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', positionAttr);
  geom.setIndex(new THREE.BufferAttribute(indices, 1));

  const mat = new THREE.MeshPhongMaterial({
    color: CELL_COLORS[cell],
    transparent: true,
    opacity: currentOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    shininess: 18,
  });

  const mesh = new THREE.Mesh(geom, mat);
  mesh.renderOrder = 1;
  scene.add(mesh);

  cellMeshes.push({ mesh, mat, geom, positions, positionAttr });
}

// ── Edges: single LineSegments covering every cube ──────────────────────────
const TOTAL_CUBES = 8 * N_NETS;
const edgePositions = new Float32Array(TOTAL_CUBES * 12 * 2 * 3);
const edgeAttr = new THREE.BufferAttribute(edgePositions, 3);
edgeAttr.setUsage(THREE.DynamicDrawUsage);
const edgeGeom = new THREE.BufferGeometry();
edgeGeom.setAttribute('position', edgeAttr);
const edgeMat = new THREE.LineBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.35 });
const edgeLines = new THREE.LineSegments(edgeGeom, edgeMat);
edgeLines.renderOrder = 2;
scene.add(edgeLines);

// ── Update: lerp corner positions, expand to face verts + edges ─────────────
const cornerScratch = new Float32Array(24);  // 8 corners × 3 floats

function update(tSlider) {
  const s = 0.5 - 0.5 * Math.cos(Math.PI * tSlider);

  let edgeWrite = 0;
  for (let cell = 0; cell < 8; cell++) {
    const { positions, positionAttr, geom } = cellMeshes[cell];
    const folded = foldedCorners[cell];
    const unfolded = unfoldedCorners[cell];

    for (let n = 0; n < N_NETS; n++) {
      const cornerBase = n * 8 * 3;

      // Lerp the 8 unique corner positions for this cube
      for (let k = 0; k < 24; k++) {
        const f = folded[cornerBase + k];
        cornerScratch[k] = f + (unfolded[cornerBase + k] - f) * s;
      }

      // Expand to 24 face-vertices for flat shading
      const faceBase = n * 24 * 3;
      for (let v = 0; v < 24; v++) {
        const cIdx = FACE_VERT_CORNERS[v];
        const co = cIdx * 3;
        const off = faceBase + v * 3;
        positions[off    ] = cornerScratch[co    ];
        positions[off + 1] = cornerScratch[co + 1];
        positions[off + 2] = cornerScratch[co + 2];
      }

      // Emit 12 edges for this cube
      for (let e = 0; e < 12; e++) {
        const [a, b] = EDGE_PAIRS[e];
        const ao = a * 3, bo = b * 3;
        edgePositions[edgeWrite    ] = cornerScratch[ao    ];
        edgePositions[edgeWrite + 1] = cornerScratch[ao + 1];
        edgePositions[edgeWrite + 2] = cornerScratch[ao + 2];
        edgePositions[edgeWrite + 3] = cornerScratch[bo    ];
        edgePositions[edgeWrite + 4] = cornerScratch[bo + 1];
        edgePositions[edgeWrite + 5] = cornerScratch[bo + 2];
        edgeWrite += 6;
      }
    }

    positionAttr.needsUpdate = true;
    geom.computeVertexNormals();
  }
  edgeAttr.needsUpdate = true;
}

// ── UI ───────────────────────────────────────────────────────────────────────
const slider = document.getElementById('unfold');
const sliderVal = document.getElementById('unfold-value');
slider.addEventListener('input', () => {
  const t = parseFloat(slider.value);
  sliderVal.textContent = t.toFixed(2);
  update(t);
});

const opacitySlider = document.getElementById('opacity');
const opacityVal = document.getElementById('opacity-value');
opacitySlider.addEventListener('input', () => {
  currentOpacity = parseFloat(opacitySlider.value);
  opacityVal.textContent = currentOpacity.toFixed(2);
  for (const { mat } of cellMeshes) mat.opacity = currentOpacity;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

slider.value = '1';
sliderVal.textContent = '1.00';
update(1);
animate();
