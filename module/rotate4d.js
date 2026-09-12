// rotate4d.js — mouse-driven rotations of 4-space, built around the Clifford torus.
//
// No dependencies. Matrices are flat, row-major, 16-element arrays acting on
// column vectors (p' = M · p).  See "Conventions" at the bottom for how that
// interacts with WebGL uniform uploads.
//
// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------
// A rotation of R^4 is chosen by dragging in one of eight planes:
//
//   XY XZ YZ XW YW ZW   the six coordinate planes of the *standard* frame
//   T1 T2               the two core circles of the Clifford torus, wherever
//                       the torus currently sits
//
// Rotating in a coordinate plane moves the torus and the model together, in
// world coordinates.  Rotating in T1 or T2 spins the model about one of the
// torus's core circles; the torus itself is invariant under those rotations,
// so it stays put while the model turns around it — it is the trackball.
//
// Rotations about the two core circles commute (they generate the maximal
// torus of SO(4)), so the handler keeps its state as
//
//   P        ∈ SO(4)   the pose of the torus   (coordinate-plane drags: P ← Δ·P)
//   θ1, θ2   angles     rotation about the core circles (T1/T2 drags add to these)
//
// and reports   torus matrix = P,   model matrix = P · G(θ1, θ2)
// where G(θ1, θ2) = rot_core1(θ1) ⊕ rot_core2(θ2).
//
// ---------------------------------------------------------------------------
// Axis mapping
// ---------------------------------------------------------------------------
// Two independent things vary between renderers, and they get two options.
//
// `axes` — the screen frame.  In the standard frame x = screen right,
// y = screen up, z = toward the viewer, w = the fourth axis.  A client whose
// renderer assigns these differently lists which of *its* axes plays each
// standard role:
//
//   axes: ['x', 'y', '-z', 'w']   // standard z (toward viewer) is the client's -z
//
// The six coordinate-plane names stay in the standard frame, so "XZ" always
// means "tumble about screen-vertical"; every matrix returned is conjugated
// into the client's frame.
//
// `corePlanes` — where the torus lives, in the CLIENT's coordinates: the two
// (complementary) planes holding its core circles at the identity pose.
// Default ['xy', 'zw'].  A renderer whose torus is built with cores in its
// (x,z) and (y,w) planes passes ['xz', 'yw'].  T1 rotates in the first plane,
// T2 in the second, from the first named axis toward the second.
//
// `inverse: true` returns inverse (transposed) matrices.  Use it for
// raymarchers and other renderers that transform *sample points* rather than
// geometry — those see the object move by the inverse of the matrix applied.

export const Plane = Object.freeze({
    XY: 'XY', XZ: 'XZ', YZ: 'YZ', XW: 'XW', YW: 'YW', ZW: 'ZW',
    T1: 'T1', T2: 'T2',
});

// Coordinate planes as (from, to) axis indices: a positive angle rotates the
// `from` axis toward the `to` axis.
const PLANE_AXES = {
    XY: [0, 1], XZ: [0, 2], YZ: [1, 2],
    XW: [0, 3], YW: [1, 3], ZW: [2, 3],
};

// ---------------------------------------------------------------------------
// Flat row-major 4x4 helpers
// ---------------------------------------------------------------------------

export const identity = () => [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
];

// c = a · b
export const mulMat4 = (a, b) => {
    const c = new Array(16).fill(0);
    for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
            for (let k = 0; k < 4; k++)
                c[i*4+j] += a[i*4+k] * b[k*4+j];
    return c;
};

export const transposeMat4 = (m) => {
    const t = new Array(16);
    for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
            t[j*4+i] = m[i*4+j];
    return t;
};

// M · v for a 4-vector v.
export const mulMat4Vec = (m, v) => [
    m[0]*v[0]  + m[1]*v[1]  + m[2]*v[2]  + m[3]*v[3],
    m[4]*v[0]  + m[5]*v[1]  + m[6]*v[2]  + m[7]*v[3],
    m[8]*v[0]  + m[9]*v[1]  + m[10]*v[2] + m[11]*v[3],
    m[12]*v[0] + m[13]*v[1] + m[14]*v[2] + m[15]*v[3],
];

// Exact rotation by `angle` in the plane spanned by axes a and b,
// carrying e_a toward e_b for positive angles.
export const givens = (a, b, angle) => {
    const m = identity();
    const c = Math.cos(angle), s = Math.sin(angle);
    m[a*4+a] = c;  m[a*4+b] = -s;
    m[b*4+a] = s;  m[b*4+b] = c;
    return m;
};

// Re-orthonormalize the rows of a nearly-orthogonal matrix (drift control).
const gramSchmidt = (m) => {
    const r = [...m];
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < i; j++) {
            let d = 0;
            for (let k = 0; k < 4; k++) d += r[i*4+k] * r[j*4+k];
            for (let k = 0; k < 4; k++) r[i*4+k] -= d * r[j*4+k];
        }
        let len = 0;
        for (let k = 0; k < 4; k++) len += r[i*4+k] * r[i*4+k];
        len = Math.sqrt(len);
        for (let k = 0; k < 4; k++) r[i*4+k] /= len;
    }
    return r;
};

// ---------------------------------------------------------------------------
// Output adapters
// ---------------------------------------------------------------------------

// Flat column-major array: what gl.uniformMatrix4fv(loc, false, ·) and
// three.js Matrix4.elements expect.
export const transpose = (m) => transposeMat4(m);

// value[row][col] nested-array format (Wilson's mat4 uniforms).
export const toRows = (m) => [
    [m[0],  m[1],  m[2],  m[3]],
    [m[4],  m[5],  m[6],  m[7]],
    [m[8],  m[9],  m[10], m[11]],
    [m[12], m[13], m[14], m[15]],
];

// ---------------------------------------------------------------------------
// Axis map
// ---------------------------------------------------------------------------

const AXIS_INDEX = { x: 0, y: 1, z: 2, w: 3 };

// Parse ['xz', 'yw'] into [[0,2],[1,3]], requiring two complementary planes.
const parseCorePlanes = (planes) => {
    const bad = () => { throw new Error(`corePlanes must be two complementary planes like ['xy','zw'], got ${JSON.stringify(planes)}`); };
    if (!Array.isArray(planes) || planes.length !== 2) bad();
    const idx = planes.map((p) => {
        const s = String(p).trim().toLowerCase();
        if (s.length !== 2) bad();
        const a = AXIS_INDEX[s[0]], b = AXIS_INDEX[s[1]];
        if (a === undefined || b === undefined) bad();
        return [a, b];
    });
    if (new Set(idx.flat()).size !== 4) bad();
    return idx;
};

// Build the signed permutation M (client ← standard) from an `axes` spec.
// M · e_k(standard) = ±e_j(client) where axes[k] = '±j'.
const axisMapMatrix = (axes) => {
    if (!Array.isArray(axes) || axes.length !== 4)
        throw new Error("axes must be an array of four entries like ['x','z','-y','w']");
    const m = new Array(16).fill(0);
    const seen = new Set();
    axes.forEach((spec, k) => {
        const s = String(spec).trim().toLowerCase();
        const sign = s.startsWith('-') ? -1 : 1;
        const letter = s.replace(/^[+-]/, '');
        const j = AXIS_INDEX[letter];
        if (j === undefined || seen.has(j))
            throw new Error(`bad axes spec ${JSON.stringify(axes)}: entry ${k} = ${JSON.stringify(spec)}`);
        seen.add(j);
        m[j*4+k] = sign;
    });
    return m;
};

// ---------------------------------------------------------------------------
// The handler
// ---------------------------------------------------------------------------

/**
 * createRotationHandler4D(options)
 *
 * options:
 *   sensitivity  radians per pixel for drag()            (default 0.012)
 *   axes         client axis for each standard axis       (default ['x','y','z','w'])
 *   corePlanes   client planes holding the torus cores    (default ['xy','zw'])
 *   inverse      return inverse matrices (raymarchers)    (default false)
 *
 * returns:
 *   rotate(angle, plane)              rotate by `angle` radians in `plane` (a Plane value)
 *   drag(dx, planeX, dy, planeY)      rotate(dx·sensitivity, planeX) then rotate(dy·sensitivity, planeY)
 *   getModelMatrix()                  P·G, in client coordinates
 *   getTorusMatrix()                  P,   in client coordinates
 *   getCoreMatrix()                   G(θ1,θ2) alone, in client coordinates
 *   getTorusAngles()                  [θ1, θ2]
 *   reset()
 *   Plane                             the enum, for convenience
 */
export const createRotationHandler4D = ({
    sensitivity = 0.012,
    axes = ['x', 'y', 'z', 'w'],
    corePlanes = ['xy', 'zw'],
    inverse = false,
} = {}) =>
{
    const M  = axisMapMatrix(axes);      // client ← standard
    const Mt = transposeMat4(M);         // standard ← client
    const [[c1a, c1b], [c2a, c2b]] = parseCorePlanes(corePlanes);

    let P = identity();                  // torus pose (standard frame)
    let theta1 = 0, theta2 = 0;          // rotation about the torus's core circles
    let stepsSinceOrthonormalize = 0;
    const ORTHONORMALIZE_EVERY = 256;

    const reset = () => { P = identity(); theta1 = 0; theta2 = 0; stepsSinceOrthonormalize = 0; };

    const rotate = (angle, plane) => {
        if (!angle) return;
        if (plane === Plane.T1) { theta1 += angle; return; }
        if (plane === Plane.T2) { theta2 += angle; return; }
        const ab = PLANE_AXES[plane];
        if (!ab) throw new Error(`unknown plane ${JSON.stringify(plane)}`);
        P = mulMat4(givens(ab[0], ab[1], angle), P);   // world-frame: left multiply
        if (++stepsSinceOrthonormalize >= ORTHONORMALIZE_EVERY) {
            P = gramSchmidt(P);
            stepsSinceOrthonormalize = 0;
        }
    };

    // The workhorse for mouse handling.  Order matters when planeX and planeY
    // don't commute (any two coordinate planes sharing an axis, e.g. XZ and YZ);
    // planeX is applied first.  Disjoint coordinate planes, T1/T2, and any
    // coordinate plane paired with a T plane all commute.
    const drag = (dx, planeX, dy, planeY) => {
        rotate(dx * sensitivity, planeX);
        rotate(dy * sensitivity, planeY);
    };

    // G(θ1, θ2): rotation about the torus's core circles, built directly in the
    // client's frame (the torus is defined there).  Applied before the pose,
    // i.e. in the torus's body frame.
    const coreRotation = () => mulMat4(givens(c1a, c1b, theta1), givens(c2a, c2b, theta2));

    // Standard-frame pose → client frame (conjugate by the axis map).
    const poseInClient = () => mulMat4(M, mulMat4(P, Mt));
    const finish = (C) => (inverse ? transposeMat4(C) : C);

    const getTorusMatrix = () => finish(poseInClient());
    const getModelMatrix = () => finish(mulMat4(poseInClient(), coreRotation()));
    const getCoreMatrix  = () => finish(coreRotation());
    const getTorusAngles = () => [theta1, theta2];

    return { rotate, drag, getModelMatrix, getTorusMatrix, getCoreMatrix, getTorusAngles, reset, Plane };
};

// ---------------------------------------------------------------------------
// Conventions
// ---------------------------------------------------------------------------
// The flat arrays here are row-major and act on column vectors.  WebGL's
// uniformMatrix4fv expects column-major, so:
//
//   • upload transpose(m) and write   `M * p`   in GLSL, or
//   • upload m as-is (it lands transposed) and write   `p * M`   in GLSL.
//
// Both give the same p' = M · p.  The tdl example takes the second route,
// Wilson (via toRows) and the three.js notebook (via transpose) the first.
