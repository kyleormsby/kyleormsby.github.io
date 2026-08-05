// app.js — Nets of 4D polytopes (Three.js)
//
// A polytope spec is { name, description, cells }.
// A cell is { color, label, vertices, faces, edges } where
//   vertices = [{folded: Vector3, unfolded: Vector3}, ...]
//   faces    = [[i,j,k], ...]   (triangle indices into vertices[])
//   edges    = [[i,j], ...]     (line indices into vertices[])
//
// The unfold slider t ∈ [0,1] smoothly interpolates each vertex
// between folded and unfolded.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { POLYTOPES, detectOverlappingCells } from './polytopes.js';

// ─────────────────────────────────────────────────────────────────────────────
// Per-cell render bundle (face mesh + edge lines, sharing a position buffer)
// ─────────────────────────────────────────────────────────────────────────────

class CellRenderer {
  constructor(cell, scene) {
    this.cell = cell;
    this.scene = scene;

    const N = cell.vertices.length;
    this.positions = new Float32Array(N * 3);
    const positionAttr = new THREE.BufferAttribute(this.positions, 3);
    positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.positionAttr = positionAttr;

    // Translucent faces
    this.faceGeom = new THREE.BufferGeometry();
    this.faceGeom.setAttribute('position', positionAttr);
    this.faceGeom.setIndex(cell.faces.flat());

    this.baseOpacity = 0.32;
    this.faceMat = new THREE.MeshPhongMaterial({
      color: cell.color,
      transparent: true,
      opacity: this.baseOpacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      shininess: 24,
      specular: 0x222222,
    });

    this.faceMesh = new THREE.Mesh(this.faceGeom, this.faceMat);
    this.faceMesh.renderOrder = 1;
    this.faceMesh.userData.cellRenderer = this;
    scene.add(this.faceMesh);

    // Wireframe edges, drawn on top of faces
    this.edgeGeom = new THREE.BufferGeometry();
    this.edgeGeom.setAttribute('position', positionAttr);
    this.edgeGeom.setIndex(cell.edges.flat());
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x111111 });
    this.edgeMesh = new THREE.LineSegments(this.edgeGeom, this.edgeMat);
    this.edgeMesh.renderOrder = 2;
    scene.add(this.edgeMesh);

    this._hovered = false;
  }

  update(t) {
    // Smoothstep easing on the slider for less linear, nicer motion
    const s = 0.5 - 0.5 * Math.cos(Math.PI * t);
    const V = this.cell.vertices;
    for (let i = 0; i < V.length; i++) {
      const f = V[i].folded;
      const u = V[i].unfolded;
      this.positionAttr.setXYZ(
        i,
        f.x + (u.x - f.x) * s,
        f.y + (u.y - f.y) * s,
        f.z + (u.z - f.z) * s,
      );
    }
    this.positionAttr.needsUpdate = true;
    this.faceGeom.computeVertexNormals();
    this.faceGeom.computeBoundingSphere();
    this.edgeGeom.computeBoundingSphere();
  }

  setHover(on) {
    if (on === this._hovered) return;
    this._hovered = on;
    this.faceMat.opacity = on ? 0.72 : this.baseOpacity;
  }

  setOverlapHighlight(isOverlapping) {
    // Red edges for cells participating in an overlap, default dark grey otherwise.
    this.edgeMat.color.setHex(isOverlapping ? 0xdc2a2a : 0x111111);
  }

  dispose() {
    this.scene.remove(this.faceMesh);
    this.scene.remove(this.edgeMesh);
    this.faceGeom.dispose();
    this.faceMat.dispose();
    this.edgeGeom.dispose();
    this.edgeMat.dispose();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scene
// ─────────────────────────────────────────────────────────────────────────────

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf6f5f1);

const camera = new THREE.PerspectiveCamera(
  42, window.innerWidth / window.innerHeight, 0.1, 200,
);
camera.position.set(7, 5.5, 8);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const key = new THREE.DirectionalLight(0xffffff, 0.75);
key.position.set(6, 9, 5);
scene.add(key);
const fill = new THREE.DirectionalLight(0xffffff, 0.3);
fill.position.set(-5, -2, -4);
scene.add(fill);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);

// ─────────────────────────────────────────────────────────────────────────────
// Polytope lifecycle
// ─────────────────────────────────────────────────────────────────────────────

let cellRenderers = [];
let currentPolytope = null;
let currentPolytopeName = null;

function loadPolytope(name) {
  for (const r of cellRenderers) r.dispose();
  cellRenderers = [];

  const builder = POLYTOPES[name];
  if (!builder) { console.warn('Unknown polytope:', name); return; }

  currentPolytope = builder();
  currentPolytopeName = name;
  for (const cell of currentPolytope.cells) {
    const r = new CellRenderer(cell, scene);
    r.baseOpacity = currentOpacity;
    r.faceMat.opacity = currentOpacity;
    cellRenderers.push(r);
  }

  document.getElementById('description').textContent = currentPolytope.description;

  // Frame the camera to the bounds of the unfolded net
  if (currentPolytope.cameraDistance) {
    const d = currentPolytope.cameraDistance;
    camera.position.set(d * 0.78, d * 0.62, d);
    controls.update();
  }

  applySlider();
  // Re-apply overlap highlight if the toggle is on
  if (overlapHighlightOn) applyOverlapHighlight();
}

function applySlider() {
  const t = parseFloat(slider.value);
  document.getElementById('unfold-value').textContent = t.toFixed(2);
  for (const r of cellRenderers) r.update(t);
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────

const slider = document.getElementById('unfold-slider');
slider.addEventListener('input', applySlider);

const opacitySlider = document.getElementById('opacity-slider');
let currentOpacity = parseFloat(opacitySlider.value);
opacitySlider.addEventListener('input', () => {
  currentOpacity = parseFloat(opacitySlider.value);
  document.getElementById('opacity-value').textContent = currentOpacity.toFixed(2);
  for (const r of cellRenderers) {
    r.baseOpacity = currentOpacity;
    if (r !== hoveredRenderer) r.faceMat.opacity = currentOpacity;
  }
});

document.getElementById('polytope-select')
  .addEventListener('change', e => loadPolytope(e.target.value));

// ── Overlap highlight ────────────────────────────────────────────────────────
let overlapHighlightOn = false;
const overlapCache = new Map();
const overlapStatusEl = document.getElementById('overlap-status');

function ensureOverlapResult(name, cells) {
  if (overlapCache.has(name)) return overlapCache.get(name);
  const r = detectOverlappingCells(cells);
  overlapCache.set(name, r);
  return r;
}

function applyOverlapHighlight() {
  if (!overlapHighlightOn || !currentPolytope) {
    for (const r of cellRenderers) r.setOverlapHighlight(false);
    overlapStatusEl.textContent = '';
    return;
  }
  const result = ensureOverlapResult(currentPolytopeName, currentPolytope.cells);
  for (let i = 0; i < cellRenderers.length; i++) {
    cellRenderers[i].setOverlapHighlight(result.cells.has(i));
  }
  if (result.pairCount === 0) {
    overlapStatusEl.textContent = 'no overlaps';
    overlapStatusEl.style.color = '#3a9d3a';
  } else {
    overlapStatusEl.textContent = `${result.cells.size} cells / ${result.pairCount} pairs`;
    overlapStatusEl.style.color = '#dc2a2a';
  }
}

document.getElementById('highlight-overlaps').addEventListener('change', (e) => {
  overlapHighlightOn = e.target.checked;
  if (overlapHighlightOn && !overlapCache.has(currentPolytopeName)) {
    // Defer the heavy SAT pass so the checkbox can repaint first
    overlapStatusEl.textContent = 'computing…';
    overlapStatusEl.style.color = '#6b6b6b';
    setTimeout(applyOverlapHighlight, 16);
  } else {
    applyOverlapHighlight();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Hover highlight
// ─────────────────────────────────────────────────────────────────────────────

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerInside = false;
let hoveredRenderer = null;

renderer.domElement.addEventListener('mousemove', e => {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  pointerInside = true;
});
renderer.domElement.addEventListener('mouseleave', () => {
  pointerInside = false;
});

function updateHover() {
  let next = null;
  if (pointerInside) {
    raycaster.setFromCamera(pointer, camera);
    const meshes = cellRenderers.map(r => r.faceMesh);
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length) {
      next = hits[0].object.userData.cellRenderer;
    }
  }
  if (next !== hoveredRenderer) {
    if (hoveredRenderer) hoveredRenderer.setHover(false);
    hoveredRenderer = next;
    if (hoveredRenderer) hoveredRenderer.setHover(true);
    document.getElementById('hover-label').textContent =
      hoveredRenderer ? hoveredRenderer.cell.label : '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resize + animation loop
// ─────────────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  updateHover();
  renderer.render(scene, camera);
}

// Force initial UI state in case the browser restored cached form values
const initialPolytope = '16-cell';
const initialOpacity = 0.25;
document.getElementById('polytope-select').value = initialPolytope;
opacitySlider.value = String(initialOpacity);
currentOpacity = initialOpacity;
document.getElementById('opacity-value').textContent = initialOpacity.toFixed(2);
loadPolytope(initialPolytope);
animate();
