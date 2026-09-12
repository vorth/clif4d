// Run with:  node --test module/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    createRotationHandler4D, Plane, identity, mulMat4, mulMat4Vec, transposeMat4, givens,
} from './rotate4d.js';

const EPS = 1e-9;
const close = (a, b, msg) => {
    for (let i = 0; i < a.length; i++)
        assert.ok(Math.abs(a[i] - b[i]) < EPS, `${msg ?? ''} index ${i}: ${a[i]} vs ${b[i]}`);
};
const isOrthonormal = (m) => close(mulMat4(m, transposeMat4(m)), identity(), 'MMᵀ = I');
const norm = (v) => Math.hypot(...v);

// A point on the standard Clifford torus: |(x,y)| = |(z,w)| = 1/√2.
const onCliffordTorus = (p) => Math.abs(norm([p[0], p[1]]) - norm([p[2], p[3]])) < EPS;

test('givens rotates the from-axis toward the to-axis', () => {
    close(mulMat4Vec(givens(0, 1, Math.PI / 2), [1, 0, 0, 0]), [0, 1, 0, 0]);
    close(mulMat4Vec(givens(2, 3, Math.PI / 2), [0, 0, 1, 0]), [0, 0, 0, 1]);
});

test('rotate(angle, XY) is exactly that angle', () => {
    const h = createRotationHandler4D();
    h.rotate(Math.PI / 2, Plane.XY);
    close(mulMat4Vec(h.getModelMatrix(), [1, 0, 0, 0]), [0, 1, 0, 0]);
    close(h.getModelMatrix(), h.getTorusMatrix(), 'no T rotation → model = torus');
});

test('matrices stay orthonormal across many mixed drags', () => {
    const h = createRotationHandler4D({ sensitivity: 0.05 });
    const planes = Object.values(Plane);
    for (let i = 0; i < 5000; i++)
        h.drag(Math.sin(i), planes[i % 8], Math.cos(i * 1.3), planes[(i * 3) % 8]);
    isOrthonormal(h.getModelMatrix());
    isOrthonormal(h.getTorusMatrix());
});

test('T1/T2 leave the torus matrix alone and preserve the Clifford torus', () => {
    const h = createRotationHandler4D();
    h.rotate(0.7, Plane.XZ); h.rotate(-0.4, Plane.YW);
    const torusBefore = h.getTorusMatrix();
    h.rotate(1.1, Plane.T1); h.rotate(-2.3, Plane.T2);
    close(h.getTorusMatrix(), torusBefore, 'torus unchanged');

    // A standard-torus point in model geometry renders (via the model matrix)
    // onto the posed torus (torus matrix · standard torus): pull back by the
    // torus pose and check the standard-torus condition.
    const invTorus = transposeMat4(h.getTorusMatrix());
    const model = h.getModelMatrix();
    const r = Math.SQRT1_2;
    for (const [a, b] of [[0.3, 2.1], [1.0, -0.5], [2.9, 4.4]]) {
        const p0 = [r*Math.cos(a), r*Math.sin(a), r*Math.cos(b), r*Math.sin(b)];
        const q = mulMat4Vec(invTorus, mulMat4Vec(model, p0));
        assert.ok(onCliffordTorus(q));
        assert.ok(norm(q.map((v, i) => v - p0[i])) > 0.1, 'but the point did move');
    }
    close(h.getTorusAngles(), [1.1, -2.3]);
});

test('T1 and T2 commute; XZ and YZ do not', () => {
    const a = createRotationHandler4D(); a.rotate(0.5, Plane.T1); a.rotate(0.8, Plane.T2);
    const b = createRotationHandler4D(); b.rotate(0.8, Plane.T2); b.rotate(0.5, Plane.T1);
    close(a.getModelMatrix(), b.getModelMatrix());

    const c = createRotationHandler4D(); c.rotate(0.5, Plane.XZ); c.rotate(0.8, Plane.YZ);
    const d = createRotationHandler4D(); d.rotate(0.8, Plane.YZ); d.rotate(0.5, Plane.XZ);
    const diff = c.getModelMatrix().map((v, i) => v - d.getModelMatrix()[i]);
    assert.ok(norm(diff) > 0.1);
});

test('coordinate-plane drags commute with T drags', () => {
    const a = createRotationHandler4D(); a.rotate(0.5, Plane.XZ); a.rotate(0.8, Plane.T1);
    const b = createRotationHandler4D(); b.rotate(0.8, Plane.T1); b.rotate(0.5, Plane.XZ);
    close(a.getModelMatrix(), b.getModelMatrix());
});

test('axis map conjugates into the client frame', () => {
    // Client's z plays standard y, client's -y plays standard z.
    const h = createRotationHandler4D({ axes: ['x', 'z', '-y', 'w'] });
    h.rotate(Math.PI / 2, Plane.XY);         // standard: x → y
    // In client coords that is x → z.
    close(mulMat4Vec(h.getModelMatrix(), [1, 0, 0, 0]), [0, 0, 1, 0]);
    isOrthonormal(h.getModelMatrix());

    // axes does NOT move the torus: cores stay in the client's xy/zw by default.
    h.reset(); h.rotate(Math.PI / 2, Plane.T1);
    close(mulMat4Vec(h.getModelMatrix(), [1, 0, 0, 0]), [0, 1, 0, 0]);
    close(mulMat4Vec(h.getModelMatrix(), [0, 0, 1, 0]), [0, 0, 1, 0]);
});

test('corePlanes places the torus independently of axes (Wilson configuration)', () => {
    const h = createRotationHandler4D({ axes: ['x', 'y', '-z', 'w'], corePlanes: ['xz', 'yw'] });
    // Screen frame: standard XZ (tumble about screen-vertical) is the client's x → -z.
    h.rotate(Math.PI / 2, Plane.XZ);
    close(mulMat4Vec(h.getModelMatrix(), [1, 0, 0, 0]), [0, 0, -1, 0]);

    // Torus: cores in the client's (x,z) and (y,w) planes; T1 turns x toward z.
    h.reset(); h.rotate(Math.PI / 2, Plane.T1);
    close(mulMat4Vec(h.getModelMatrix(), [1, 0, 0, 0]), [0, 0, 1, 0]);
    close(mulMat4Vec(h.getModelMatrix(), [0, 1, 0, 0]), [0, 1, 0, 0]);

    // After posing the torus, T drags leave the torus matrix alone and keep
    // client-torus points (|(x,z)| = |(y,w)|) on the posed client torus.
    h.reset(); h.rotate(0.7, Plane.XZ); h.rotate(-0.4, Plane.YW); h.rotate(0.3, Plane.T2);
    const torusBefore = h.getTorusMatrix();
    h.rotate(1.1, Plane.T1); h.rotate(-2.3, Plane.T2);
    close(h.getTorusMatrix(), torusBefore);
    const invTorus = transposeMat4(h.getTorusMatrix()), model = h.getModelMatrix(), r = Math.SQRT1_2;
    for (const [a, b] of [[0.3, 2.1], [1.0, -0.5], [2.9, 4.4]]) {
        const p0 = [r*Math.cos(a), r*Math.cos(b), r*Math.sin(a), r*Math.sin(b)];   // (x,z) and (y,w) circles
        const q = mulMat4Vec(invTorus, mulMat4Vec(model, p0));
        assert.ok(Math.abs(norm([q[0], q[2]]) - norm([q[1], q[3]])) < EPS);
    }
    assert.throws(() => createRotationHandler4D({ corePlanes: ['xy', 'yz'] }));
    assert.throws(() => createRotationHandler4D({ corePlanes: ['xy'] }));
});

test('inverse option returns the transpose', () => {
    const f = createRotationHandler4D(), g = createRotationHandler4D({ inverse: true });
    for (const h of [f, g]) { h.rotate(0.3, Plane.XW); h.rotate(0.9, Plane.YZ); h.rotate(0.2, Plane.T2); }
    close(g.getModelMatrix(), transposeMat4(f.getModelMatrix()));
    close(mulMat4(f.getModelMatrix(), g.getModelMatrix()), identity());
});

test('rejects bad input', () => {
    assert.throws(() => createRotationHandler4D({ axes: ['x', 'x', 'y', 'z'] }));
    assert.throws(() => createRotationHandler4D({ axes: ['x', 'y', 'z'] }));
    assert.throws(() => createRotationHandler4D().rotate(1, 'QQ'));
});

// A stand-in for a renderer's projection: stereographic-ish divide by
// (cameraDist - w), then an orthographic screen with y down; depth = -z.
const project = ([x, y, z, w]) => {
    const d = Math.max(1.5 - w, 1e-4);
    return [200 * x / d, -200 * y / d, -z / d];
};

test('torusPoint lies on the posed torus', () => {
    const h = createRotationHandler4D();
    h.rotate(0.6, Plane.XZ); h.rotate(-1.1, Plane.YW); h.rotate(0.4, Plane.T1);
    const inv = transposeMat4(h.getTorusMatrix());
    for (const [a, b] of [[0, 0], [1.2, 2.5], [4.0, -0.3]]) {
        const q = mulMat4Vec(inv, h.torusPoint(a, b));
        assert.ok(Math.abs(norm([q[0], q[1]]) - Math.SQRT1_2) < EPS);
        assert.ok(Math.abs(norm([q[2], q[3]]) - Math.SQRT1_2) < EPS);
    }
});

test('grabNearest recovers a point under the cursor, preferring the front', () => {
    const h = createRotationHandler4D();
    h.rotate(0.9, Plane.YZ); h.rotate(0.3, Plane.XW);
    const target = [0.7, 2.0];
    const s = project(h.torusPoint(...target));
    const [p1, p2] = h.grabNearest(s[0], s[1], project);
    const got = project(h.torusPoint(p1, p2));
    assert.ok(Math.hypot(got[0] - s[0], got[1] - s[1]) < 0.05, 'projects onto the cursor');
    assert.ok(got[2] <= s[2] + 1e-6, 'no farther than the target');
    assert.deepEqual(h.getGrab(), [p1, p2]);
});

test('dragSurface moves the grabbed point with the cursor and leaves the torus alone', () => {
    const h = createRotationHandler4D();
    h.rotate(0.9, Plane.YZ); h.rotate(0.3, Plane.XW);
    const torusBefore = h.getTorusMatrix();
    const [g1, g2] = h.grabNearest(40, -30, project);
    let s = project(h.torusPoint(g1, g2));
    // Track the cursor across many small steps.
    let cx = s[0], cy = s[1];
    for (let i = 0; i < 20; i++) {
        h.dragSurface(3, 1, project);
        cx += 3; cy += 1;
    }
    const [p1, p2] = h.getGrab();
    const now = project(h.torusPoint(p1, p2));
    assert.ok(Math.hypot(now[0] - cx, now[1] - cy) < 0.5, `held point strays ${Math.hypot(now[0] - cx, now[1] - cy)} px`);
    close(h.getTorusMatrix(), torusBefore, 'torus pose unchanged');
    const [t1, t2] = h.getTorusAngles();
    assert.ok(Math.abs(t1) + Math.abs(t2) > 0.05, 'angles actually changed');
    // The held material point is the original one, carried by the angles.
    close([p1, p2], [g1 + t1, g2 + t2], 'grab tracks the material point');
    // Dragging past the silhouette: the surface can't follow, and must not fling.
    for (let i = 0; i < 100; i++) {
        const [d1, d2] = h.dragSurface(3, 1, project);
        assert.ok(Number.isFinite(d1) && Number.isFinite(d2) && Math.hypot(d1, d2) <= 0.5);
    }
    close(h.getTorusMatrix(), torusBefore, 'torus pose still unchanged');
    h.release();
    assert.equal(h.getGrab(), null);
    assert.deepEqual(h.dragSurface(5, 5, project), [0, 0]);
});
