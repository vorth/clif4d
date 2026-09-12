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
