// index.js — the polychora example: regular 4-polytopes on S^3, stereographically
// projected, with the Clifford torus as the trackball.

import { createRotationHandler4D, Plane, transpose } from '../module/rotate4d.js';
import { build, POLYCHORA } from './polychora.js';
import { createRenderer, DEFAULT_STYLE } from './render.js';

const canvas = document.querySelector('#view');
const status = document.querySelector('#status');

// This renderer already uses the standard frame — x right, y up, z toward the
// viewer — and builds its torus with core circles in the (x,y) and (z,w)
// planes, so the handler's defaults are right as they stand.
const handler = createRotationHandler4D();
const renderer = createRenderer(canvas, {});

// Detail per model.  Facets are tessellated on S^3, but stereographic
// projection stretches a patch by 1/(1-w)^2, so the outermost cell needs a
// surprising amount of subdivision before its silhouette stops looking
// polygonal.  Models with few, large facets therefore get the most — and cost
// the least, so that works out.
const DETAIL = {
    '5-cell':    { subdivision: 20, samples: 40 },
    '16-cell':   { subdivision: 18, samples: 32 },
    'tesseract': { subdivision: 16, samples: 32 },
    '24-cell':   { subdivision: 12, samples: 28 },
    '600-cell':  { subdivision: 8,  samples: 20 },
    '120-cell':  { subdivision: 8,  samples: 24 },
};

let fitDistance = DEFAULT_STYLE.cameraDistance;
let describe = () => '';

const showStatus = () => { status.textContent = describe(); };

const loadModel = (name) => {
    const polytope = build(name);
    const stats = renderer.setModel(polytope, { ...DETAIL[name], strokes: 2 });
    fitDistance = stats.fitDistance;
    renderer.setStyle({ cameraDistance: fitDistance });
    describe = () => `${polytope.schlafli} · ${polytope.vertices.length} vertices · `
        + `${polytope.edges.length} edges · ${polytope.faces.length} faces · `
        + `${renderer.getTriangles().toLocaleString()} triangles`;
    showStatus();
};

// Retessellate for the pose we have come to rest in, rather than every frame.
let refineTimer = null;
const refineSoon = (delay = 120) => {
    clearTimeout(refineTimer);
    refineTimer = setTimeout(() => {
        renderer.refine(new Float32Array(transpose(handler.getModelMatrix())));
        showStatus();
    }, delay);
};

// ---------------------------------------------------------------------------
// Mouse — the shared clif4d convention
// ---------------------------------------------------------------------------
//   drag              tumble in 3-space          (XZ, YZ)
//   shift + drag      rotate into the 4th axis   (XW, YW)
//   alt + drag        rotate XY and ZW
//   shift + alt       drag the surface of the Clifford torus
// dy is positive upward.  Plane.XZ carries x toward z, so dragging right
// should carry the near side (+z) toward +x: hence the negations.

let dragging = false, lastX = 0, lastY = 0, grabbing = false;

const canvasPixel = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return [(clientX - rect.left) * canvas.width / rect.width,
            (clientY - rect.top) * canvas.height / rect.height];
};

canvas.addEventListener('mousedown', (event) => {
    dragging = true; lastX = event.clientX; lastY = event.clientY;
    event.preventDefault();
});

document.addEventListener('mouseup', () => {
    if (dragging) refineSoon(0);
    dragging = false; grabbing = false; handler.release();
});

document.addEventListener('mousemove', (event) => {
    if (!dragging) return;
    const dx = event.clientX - lastX, dy = -(event.clientY - lastY);

    if (event.shiftKey && event.altKey) {
        const last = canvasPixel(lastX, lastY);
        const here = canvasPixel(event.clientX, event.clientY);
        if (!handler.getGrab()) handler.grabNearest(last[0], last[1], renderer.project);
        handler.dragSurface(here[0] - last[0], here[1] - last[1], renderer.project);
        grabbing = true;
    }
    else if (event.shiftKey) handler.drag(dx, Plane.XW, dy, Plane.YW);
    else if (event.altKey)   handler.drag(-dx, Plane.XY, -dy, Plane.ZW);
    else                     handler.drag(-dx, Plane.XZ, -dy, Plane.YZ);

    lastX = event.clientX; lastY = event.clientY;
});

canvas.addEventListener('wheel', (event) => {
    const style = renderer.getStyle();
    const distance = Math.min(40, Math.max(2.2, style.cameraDistance * Math.exp(event.deltaY * 0.001)));
    renderer.setStyle({ cameraDistance: distance });
    refineSoon(200);
    event.preventDefault();
}, { passive: false });

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

const control = (id, handlerFn, event = 'input') =>
    document.querySelector(id)?.addEventListener(event, handlerFn);

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const rgbToHex = (rgb) => '#' + rgb.map((c) =>
    Math.round(Math.max(0, Math.min(1, c)) * 255).toString(16).padStart(2, '0')).join('');

const modelSelect = document.querySelector('#model');
for (const name of Object.keys(POLYCHORA)) {
    const option = document.createElement('option');
    option.value = option.textContent = name;
    modelSelect.appendChild(option);
}
modelSelect.value = '120-cell';
control('#model', (e) => { loadModel(e.target.value); refineSoon(0); }, 'change');

document.querySelector('#colour').value = rgbToHex(DEFAULT_STYLE.base);
control('#colour', (e) => renderer.setStyle({ base: hexToRgb(e.target.value) }));
// Glass opacity spans two and a half decades, and the interesting end is the
// thin one, so the slider is logarithmic: 0 -> 0.004, 1 -> 0.6.
const OPACITY_MIN = 0.004, OPACITY_MAX = 0.6;
const sliderToOpacity = (t) => OPACITY_MIN * Math.pow(OPACITY_MAX / OPACITY_MIN, Number(t));
const opacityToSlider = (a) => Math.log(a / OPACITY_MIN) / Math.log(OPACITY_MAX / OPACITY_MIN);
document.querySelector('#opacity').value = opacityToSlider(DEFAULT_STYLE.opacity);
control('#opacity', (e) => renderer.setStyle({ opacity: sliderToOpacity(e.target.value) }));

document.querySelector('#torus-opacity').value = DEFAULT_STYLE.torusOpacity;
control('#torus-opacity', (e) => renderer.setStyle({ torusOpacity: Number(e.target.value) }));
control('#detail', (e) => {
    renderer.setStyle({ targetEdge: Number(e.target.value) });
    refineSoon(0);
}, 'change');
control('#pen', (e) => renderer.setStyle({ strokeWidth: Number(e.target.value) }));
control('#facets', (e) => renderer.setStyle({ showFacets: e.target.checked }), 'change');
control('#edges', (e) => renderer.setStyle({ showEdges: e.target.checked }), 'change');
control('#reset', () => {
    handler.reset(); applyRestPose();
    renderer.setStyle({ cameraDistance: fitDistance });
    refineSoon(0);
}, 'click');

const torusMode = document.querySelector('#torus');

// ---------------------------------------------------------------------------

// Each polytope arrives turned cell-first (see orientForProjection), so all
// that is wanted here is a slight tilt off axis — and only in 3-space, which
// leaves the w axis, and so the cell-first framing, alone.
const applyRestPose = () => {
    handler.rotate(0.37, Plane.XZ);
    handler.rotate(0.61, Plane.YZ);
    handler.rotate(0.23, Plane.XY);
};

loadModel(modelSelect.value);
applyRestPose();
refineSoon(0);

const frame = () => {
    const showTorus = torusMode.value === 'always' || (torusMode.value === 'drag' && grabbing);
    renderer.draw(new Float32Array(transpose(handler.getModelMatrix())), { showTorus });
    requestAnimationFrame(frame);
};
requestAnimationFrame(frame);

window.addEventListener('resize', () => { renderer.resize(); refineSoon(300); });

// Debug handle: window.clif4d.handler / .project from the console.
window.clif4d = { handler, renderer, project: renderer.project };
