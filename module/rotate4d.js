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
 *
 * Surface dragging (see "Dragging the surface" below):
 *   torusPoint(phi1, phi2)            client-frame world point of the torus at those parameters
 *   grab(phi1, phi2)                  hold the material point at those parameters
 *   grabNearest(sx, sy, project)      grab the torus point whose projection is nearest (sx, sy)
 *   dragSurface(dx, dy, project)      move the grabbed point by (dx, dy) on screen; returns [dθ1, dθ2]
 *   release()
 *   getGrab()                         [phi1, phi2] or null
 *
 * `project(p4)` is supplied by the client: given a 4-vector in the client's
 * world coordinates, return its screen position [sx, sy] (any consistent
 * units — the same ones dx/dy are in) and optionally a depth [sx, sy, d]
 * with smaller d nearer the viewer.
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

    const reset = () => { P = identity(); theta1 = 0; theta2 = 0; stepsSinceOrthonormalize = 0; grabbed = null; };

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

    // -----------------------------------------------------------------------
    // Dragging the surface
    // -----------------------------------------------------------------------
    // A trackball grabs a point and makes it follow the cursor.  The Clifford
    // torus is parameterized by the two core angles: the material point at
    // (φ1, φ2) sits, in the torus's body frame, at
    //     q0 = (cos φ1, sin φ1)/√2 in core plane 1  ⊕  (cos φ2, sin φ2)/√2 in core plane 2
    // and a T rotation by (dθ1, dθ2) carries it to (φ1+dθ1, φ2+dθ2).  So if
    // s(φ) is the screen position of the posed point, a mouse displacement δ
    // should produce the dθ with J·dθ ≈ δ, J = ∂s/∂φ.  J is taken by finite
    // differences of the client's `project`, and the solve is damped least
    // squares so an edge-on surface direction absorbs the drag instead of
    // blowing up.  Sensitivity is not involved: pixels become radians through J.

    const R = Math.SQRT1_2;
    let grabbed = null;                  // [phi1, phi2] of the held material point

    const torusPoint = (phi1, phi2) => {
        const q0 = [0, 0, 0, 0];
        q0[c1a] = R * Math.cos(phi1);  q0[c1b] = R * Math.sin(phi1);
        q0[c2a] = R * Math.cos(phi2);  q0[c2b] = R * Math.sin(phi2);
        return mulMat4Vec(poseInClient(), q0);
    };

    const screenOf = (project, phi1, phi2) => project(torusPoint(phi1, phi2));

    // 2x2 Jacobian of the screen position with respect to (φ1, φ2).
    const jacobian = (project, phi1, phi2, h = 1e-3) => {
        const a1 = screenOf(project, phi1 + h, phi2), b1 = screenOf(project, phi1 - h, phi2);
        const a2 = screenOf(project, phi1, phi2 + h), b2 = screenOf(project, phi1, phi2 - h);
        return [
            (a1[0] - b1[0]) / (2*h), (a2[0] - b2[0]) / (2*h),
            (a1[1] - b1[1]) / (2*h), (a2[1] - b2[1]) / (2*h),
        ];
    };

    // Damped least squares: (JᵀJ + λI) dφ = Jᵀ δ, with λ = (damping·σmax)² so
    // only surface directions much more foreshortened than the best one are
    // held back; the well-conditioned direction follows the cursor exactly.
    const solve = (J, dx, dy, damping) => {
        const [a, b, c, d] = J;
        const g00 = a*a + c*c, g01 = a*b + c*d, g11 = b*b + d*d;
        const tr = g00 + g11, dt = g00*g11 - g01*g01;
        const sigmaMax2 = tr / 2 + Math.sqrt(Math.max(tr*tr / 4 - dt, 0));
        const lambda = damping * damping * sigmaMax2 + 1e-12;
        const m00 = g00 + lambda, m11 = g11 + lambda;
        const r0 = a*dx + c*dy, r1 = b*dx + d*dy;
        const det = m00*m11 - g01*g01;
        if (!(det > 0)) return [0, 0];
        return [(m11*r0 - g01*r1) / det, (m00*r1 - g01*r0) / det];
    };

    const grab = (phi1, phi2) => { grabbed = [phi1, phi2]; return grabbed; };
    const release = () => { grabbed = null; };
    const getGrab = () => (grabbed ? [...grabbed] : null);

    // Grab the torus point whose projection is nearest (sx, sy).  Several
    // sheets of the surface can lie under one cursor position, so the nearest
    // coarse-grid candidates are each refined onto the cursor by Newton's
    // method, and among those that converge the one nearest the viewer wins.
    // A cursor off the torus grabs the closest surface point.
    const grabNearest = (sx, sy, project, { grid = 64, candidates = 16, tolerance = 1.5 } = {}) => {
        const step = 2 * Math.PI / grid;
        const coarse = [];
        for (let i = 0; i < grid; i++) for (let j = 0; j < grid; j++) {
            const phi1 = i * step, phi2 = j * step;
            const p = screenOf(project, phi1, phi2);
            coarse.push([Math.hypot(p[0] - sx, p[1] - sy), phi1, phi2]);
        }
        coarse.sort((a, b) => a[0] - b[0]);

        const distAt = (phi1, phi2) => { const p = screenOf(project, phi1, phi2); return Math.hypot(p[0] - sx, p[1] - sy); };
        // Newton with backtracking: a step is only taken if it brings the
        // point closer, halving it up to a few times otherwise (the inner wall
        // of the hole is steep on screen, and plain Newton overshoots there).
        const refine = (phi1, phi2) => {
            let dist = distAt(phi1, phi2);
            for (let k = 0; k < 10 && dist > 1e-3; k++) {
                const p = screenOf(project, phi1, phi2);
                const J = jacobian(project, phi1, phi2);
                let [d1, d2] = solve(J, sx - p[0], sy - p[1], 1e-2);
                let taken = false;
                for (let t = 0; t < 5; t++) {
                    const trial = distAt(phi1 + d1, phi2 + d2);
                    if (trial < dist) { phi1 += d1; phi2 += d2; dist = trial; taken = true; break; }
                    d1 /= 2; d2 /= 2;
                }
                if (!taken) break;
            }
            const p = screenOf(project, phi1, phi2);
            return { phi1, phi2, dist, depth: p[2] ?? 0 };
        };

        let best = null;                                   // nearest to the viewer among hits
        let fallback = null;                               // nearest on screen otherwise
        for (const [, phi1, phi2] of coarse.slice(0, candidates)) {
            const r = refine(phi1, phi2);
            if (!fallback || r.dist < fallback.dist) fallback = r;
            if (r.dist <= tolerance && (!best || r.depth < best.depth)) best = r;
        }
        const pick = best ?? fallback;
        return grab(pick.phi1, pick.phi2);
    };

    // Move the grabbed material point by (dx, dy) on screen.  Returns the
    // [dθ1, dθ2] applied.  Each step is clamped so a nearly edge-on surface
    // can't fling the model.
    const dragSurface = (dx, dy, project, { maxStep = 0.5, damping = 0.1 } = {}) => {
        if (!grabbed) return [0, 0];
        const [phi1, phi2] = grabbed;
        const s0 = screenOf(project, phi1, phi2);
        const target = [s0[0] + dx, s0[1] + dy];
        let d1 = 0, d2 = 0;
        for (let k = 0; k < 2; k++) {                 // linearize, step, correct once
            const J = jacobian(project, phi1 + d1, phi2 + d2);
            const s = screenOf(project, phi1 + d1, phi2 + d2);
            const [e1, e2] = solve(J, target[0] - s[0], target[1] - s[1], damping);
            d1 += e1; d2 += e2;
        }
        const len = Math.hypot(d1, d2);
        if (len > maxStep) { d1 *= maxStep / len; d2 *= maxStep / len; }
        theta1 += d1; theta2 += d2;
        grabbed = [phi1 + d1, phi2 + d2];   // the held material point moved with the surface
        return [d1, d2];
    };

    const getTorusMatrix = () => finish(poseInClient());
    const getModelMatrix = () => finish(mulMat4(poseInClient(), coreRotation()));
    const getCoreMatrix  = () => finish(coreRotation());
    const getTorusAngles = () => [theta1, theta2];

    return {
        rotate, drag, getModelMatrix, getTorusMatrix, getCoreMatrix, getTorusAngles, reset, Plane,
        torusPoint, grab, grabNearest, dragSurface, release, getGrab,
    };
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
