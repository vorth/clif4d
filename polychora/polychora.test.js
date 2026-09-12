// node --test polychora/polychora.test.js
//
// Checks the combinatorics of the six regular 4-polytopes, the orientation
// that puts the projection pole in a cell, and the geometry the shaders rely
// on: that a tessellated facet stays on its face's great 2-sphere, and that
// the stereographic image of that great sphere really is the sphere the
// fragment shader reconstructs from the face's 4D normal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { build, POLYCHORA, orientForProjection } from './polychora.js';
import { buildFacets, buildEdges, faceNormal, fitCameraDistance } from './geometry.js';

const dot = (a, b) => a.reduce((s, c, i) => s + c * b[i], 0);
const norm = (v) => Math.hypot(...v);
const stereo = (q) => {
    const d = 1 - q[3];
    return [q[0]/d, q[1]/d, q[2]/d];
};

// Euler characteristic of a 4-polytope's boundary is 0: V - E + F - C = 0.
const EXPECTED = {
    '5-cell':    { v: 5,   e: 10,   f: 10,   sides: 3, cells: 5 },
    '16-cell':   { v: 8,   e: 24,   f: 32,   sides: 3, cells: 16 },
    'tesseract': { v: 16,  e: 32,   f: 24,   sides: 4, cells: 8 },
    '24-cell':   { v: 24,  e: 96,   f: 96,   sides: 3, cells: 24 },
    '600-cell':  { v: 120, e: 720,  f: 1200, sides: 3, cells: 600 },
    '120-cell':  { v: 600, e: 1200, f: 720,  sides: 5, cells: 120 },
};

test('each polytope has the right counts, and V - E + F - C = 0', () => {
    for (const [name, want] of Object.entries(EXPECTED)) {
        const p = build(name);
        assert.equal(p.vertices.length, want.v, `${name} vertices`);
        assert.equal(p.edges.length, want.e, `${name} edges`);
        assert.equal(p.faces.length, want.f, `${name} faces`);
        for (const face of p.faces) assert.equal(face.length, want.sides, `${name} face size`);
        assert.equal(want.v - want.e + want.f - want.cells, 0, `${name} Euler characteristic`);
    }
});

test('vertices are on the unit 3-sphere and every edge has the same length', () => {
    for (const name of Object.keys(POLYCHORA)) {
        const p = build(name);
        for (const v of p.vertices) assert.ok(Math.abs(norm(v) - 1) < 1e-9, `${name} not unit`);
        const lengths = p.edges.map(([i, j]) =>
            norm(p.vertices[i].map((c, k) => c - p.vertices[j][k])));
        const spread = Math.max(...lengths) - Math.min(...lengths);
        assert.ok(spread < 1e-9, `${name} edge lengths vary by ${spread}`);
    }
});

test('face cycles are closed: consecutive vertices are edges of the polytope', () => {
    for (const name of Object.keys(POLYCHORA)) {
        const p = build(name);
        const edgeSet = new Set(p.edges.map(([i, j]) => `${Math.min(i,j)},${Math.max(i,j)}`));
        for (const face of p.faces)
            for (let k = 0; k < face.length; k++) {
                const a = face[k], b = face[(k + 1) % face.length];
                assert.ok(edgeSet.has(`${Math.min(a,b)},${Math.max(a,b)}`),
                          `${name}: ${a}-${b} is not an edge`);
            }
    }
});

test('faces are planar in the 4D sense: all vertices lie on one hyperplane through the origin', () => {
    for (const name of Object.keys(POLYCHORA)) {
        const p = build(name);
        for (const face of p.faces) {
            const n = faceNormal(p.vertices, face);
            assert.ok(Math.abs(norm(n) - 1) < 1e-9);
            for (const i of face)
                assert.ok(Math.abs(dot(n, p.vertices[i])) < 1e-9, `${name}: face not flat`);
        }
    }
});

test('orientation puts the projection pole strictly inside a cell', () => {
    for (const name of Object.keys(POLYCHORA)) {
        const p = build(name);
        // No vertex at the pole, so no edge runs off to infinity.
        const maxW = Math.max(...p.vertices.map((v) => v[3]));
        assert.ok(maxW < 1 - 1e-6, `${name}: a vertex sits at the pole (w = ${maxW})`);
        // The pole is a deep hole: turning it anywhere else brings some vertex
        // nearer.  Spot-check against a sample of other directions.
        for (let i = 0; i < 200; i++) {
            const d = [0, 1, 2, 3].map((k) => Math.sin((i + 1) * (k + 1) * 2.399963));
            const len = norm(d);
            const worst = Math.max(...p.vertices.map((v) => dot(v, d.map((c) => c / len))));
            assert.ok(worst >= maxW - 1e-6, `${name}: found a deeper hole than the pole`);
        }
    }
});

test('orienting is a rotation: it preserves all the geometry', () => {
    const raw = build('24-cell', { orient: false });
    const turned = orientForProjection(raw);
    for (let i = 0; i < raw.vertices.length; i++)
        assert.ok(Math.abs(norm(turned.vertices[i]) - 1) < 1e-9);
    for (const [i, j] of raw.edges) {
        const before = dot(raw.vertices[i], raw.vertices[j]);
        const after = dot(turned.vertices[i], turned.vertices[j]);
        assert.ok(Math.abs(before - after) < 1e-9, 'angles changed');
    }
});

test('tessellated facet vertices stay exactly on their face great sphere', () => {
    for (const name of ['tesseract', '24-cell', '120-cell']) {
        const p = build(name);
        const { data, vertexCount, stride } = buildFacets(p, { subdivision: 4 });
        for (let i = 0; i < vertexCount; i++) {
            const k = i * stride;
            const q = [data[k], data[k+1], data[k+2], data[k+3]];
            const n = [data[k+4], data[k+5], data[k+6], data[k+7]];
            // buildFacets stores float32, so the bar is float32 precision.
            assert.ok(Math.abs(norm(q) - 1) < 1e-6, `${name}: tessellation left S^3`);
            assert.ok(Math.abs(dot(q, n)) < 1e-6, `${name}: tessellation left the great sphere`);
        }
    }
});

test('the projected facet lies on the sphere the fragment shader reconstructs', () => {
    // The shader takes the surface normal from the sphere centred at
    // -n.xyz/n.w with radius sqrt(1 + |centre|^2); this checks that the
    // projected points really are on it, which is what makes the shading exact.
    const p = build('120-cell');
    const { data, vertexCount, stride } = buildFacets(p, { subdivision: 3 });
    let checked = 0;
    for (let i = 0; i < vertexCount; i++) {
        const k = i * stride;
        const n = [data[k+4], data[k+5], data[k+6], data[k+7]];
        if (Math.abs(n[3]) < 1e-3) continue;                  // that face projects to a plane
        const centre = [-n[0]/n[3], -n[1]/n[3], -n[2]/n[3]];
        const radius = Math.sqrt(1 + dot(centre, centre));
        const point = stereo([data[k], data[k+1], data[k+2], data[k+3]]);
        const offset = norm(point.map((c, j) => c - centre[j]));
        assert.ok(Math.abs(offset - radius) < 1e-4 * Math.max(1, radius),
                  `off its sphere by ${offset - radius}`);
        checked++;
    }
    assert.ok(checked > 1000);
});

test('a face that projects to a plane passes through the origin', () => {
    // Those are the faces whose great sphere runs through the pole: n.w = 0,
    // and the shader falls back to a plane with normal n.xyz.
    const p = build('120-cell');
    const { data, vertexCount, stride } = buildFacets(p, { subdivision: 3 });
    let planar = 0;
    for (let i = 0; i < vertexCount; i++) {
        const k = i * stride;
        const n = [data[k+4], data[k+5], data[k+6], data[k+7]];
        if (Math.abs(n[3]) > 1e-6) continue;
        const point = stereo([data[k], data[k+1], data[k+2], data[k+3]]);
        assert.ok(Math.abs(dot(point, [n[0], n[1], n[2]])) < 1e-3 * (1 + norm(point)));
        planar++;
    }
    assert.ok(planar > 0, 'expected some faces through the pole');
});

test('edge ribbons carry both endpoints and a full parameter sweep', () => {
    const p = build('16-cell');
    const samples = 12, strokes = 2;
    const { data, indices, vertexCount, stride } = buildEdges(p, {
        vertices: p.vertices, samples, strokes,
    });
    assert.equal(vertexCount, p.edges.length * strokes * samples * 2);
    assert.equal(indices.length, p.edges.length * strokes * (samples - 1) * 6);
    // Both sides of the ribbon at every sample, and t running 0..1.
    for (let s = 0; s < samples; s++) {
        const k = s * 2 * stride;
        assert.ok(Math.abs(data[k + 8] - s / (samples - 1)) < 1e-6);
        assert.equal(data[k + 9], -1);
        assert.equal(data[k + stride + 9], 1);
    }
    assert.ok(Math.max(...indices) < vertexCount);
});

test('the camera fit frames every edge', () => {
    for (const name of Object.keys(POLYCHORA)) {
        const p = build(name);
        const facets = buildFacets(p, { subdivision: 4 });
        const fov = 42;
        const distance = fitCameraDistance(p, facets, fov);
        const halfHeight = distance * Math.tan(fov * Math.PI / 360);
        for (const [i, j] of p.edges)
            for (const q of [p.vertices[i], p.vertices[j]])
                assert.ok(norm(stereo(q)) <= halfHeight + 1e-6,
                          `${name}: an edge falls outside the frame`);
    }
});
