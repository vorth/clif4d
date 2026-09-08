
// Row-major flat 16-element 4x4 matrix math (no external dependencies).

const identity = () => [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
];

const zero = () => [
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
    0, 0, 0, 0,
];

const getRow = (m, i) => [m[i*4], m[i*4+1], m[i*4+2], m[i*4+3]];

const setRow = (m, i, v) => {
    m[i*4] = v[0]; m[i*4+1] = v[1]; m[i*4+2] = v[2]; m[i*4+3] = v[3];
};

const dot4    = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
const subVec  = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2], a[3]-b[3]];
const addVec  = (a, b) => a.map((v, i) => v + b[i]);
const scaleVec = (s, v) => [s*v[0], s*v[1], s*v[2], s*v[3]];
const normVec = (v) => {
    const len = Math.sqrt(dot4(v, v));
    return [v[0]/len, v[1]/len, v[2]/len, v[3]/len];
};

// Row-major 4x4 multiply: c = a * b
const mulMat4 = (a, b) => {
    const c = new Array(16).fill(0);
    for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++)
            for (let k = 0; k < 4; k++)
                c[i*4+j] += a[i*4+k] * b[k*4+j];
    return c;
};

const gramSchmidt = (m) => {
    const result = [...m];
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < i; j++) {
            const iVec = getRow(result, i);
            const jVec = getRow(result, j);
            setRow(result, i, subVec(iVec, scaleVec(dot4(iVec, jVec), jVec)));
        }
        setRow(result, i, normVec(getRow(result, i)));
    }
    return result;
};

// Convert the internal flat row-major matrix to value[row][col] format.
export const toRows = (m) => [
    [m[0],  m[1],  m[2],  m[3]],
    [m[4],  m[5],  m[6],  m[7]],
    [m[8],  m[9],  m[10], m[11]],
    [m[12], m[13], m[14], m[15]],
];

// Convert internal flat row-major matrix to flat column-major matrix (e.g. for three.js Matrix4).
export const transpose = (m) => [
    m[0], m[4], m[8],  m[12],
    m[1], m[5], m[9],  m[13],
    m[2], m[6], m[10], m[14],
    m[3], m[7], m[11], m[15],
];


// Single combined matrix, right-multiply (intrinsic) accumulation.
// Right multiply means each delta is applied in the object's current local frame,
// so "drag left" always rolls the model left relative to its current screen pose,
// regardless of prior drag history.
export const createSingleRotationHandler4D = ( sensitivity = 0.012 ) =>
{
    let planarMatrix = identity();
    let generalMatrix = identity();

    const getPlanarMatrix = () => planarMatrix;
    const getGeneralMatrix = () => generalMatrix;
    const reset = () => { planarMatrix = identity(); generalMatrix = identity(); };

    const applyDelta = (spinDelta, target) => {
        let delta = gramSchmidt(addVec(identity(), spinDelta));
        return gramSchmidt(mulMat4(target, delta));  // right multiply = intrinsic
    };

    // general=true updates generalMatrix (XY+ZW planes, Clifford-preserving) instead of the planar matrix.
    const mouseDragged = (dx, dy, xz_yz, xw_yw, xy_zw, general = false) => {
        let spinDelta = zero();
        dx *= sensitivity;
        dy *= sensitivity;

        if (general) {
            dx *= 0.1;
            dy *= 0.1;
            // NOTE: These don't match createRotationHandler4D below, because of some differences in iniatial 
            // orientation in the Wilson example. We should make this standard, and the controls better/configurable.
            spinDelta[0*4+2] += dx;  spinDelta[2*4+0] -= dx;
            spinDelta[1*4+3] -= dy;  spinDelta[3*4+1] += dy;
            generalMatrix = applyDelta(spinDelta, generalMatrix);
            return;
        }

        if (xz_yz) {
            spinDelta[0*4+2] += dx;  spinDelta[2*4+0] -= dx;
            spinDelta[1*4+2] += dy;  spinDelta[2*4+1] -= dy;
        }
        if (xw_yw) {
            spinDelta[0*4+3] -= dx;  spinDelta[3*4+0] += dx;
            spinDelta[1*4+3] -= dy;  spinDelta[3*4+1] += dy;
        }
        if (xy_zw) {
            spinDelta[0*4+1] += dx;  spinDelta[1*4+0] -= dx;
            spinDelta[3*4+2] -= dy;  spinDelta[2*4+3] += dy;
        }

        planarMatrix = applyDelta(spinDelta, planarMatrix);
    };

    return { getPlanarMatrix, getGeneralMatrix, mouseDragged, reset };
};


export const createRotationHandler4D = ( sensitivity = 0.012 ) =>
{
    let planarMatrix = identity();
    let generalRotationMatrix = identity();

    const getPlanarMatrix = function () {
        return [ ...planarMatrix ];
    };

    const getGeneralMatrix = function () {
        return [ ...generalRotationMatrix ];
    };

    const mouseDraggedPlanar = function (dx, dy, xz_yz, xw_yw, xy_zw) {
        mouseDraggedInternal(dx, dy, xz_yz, xw_yw, xy_zw, true);
    };

    const mouseDraggedGeneral = function (dx, dy) {
        mouseDraggedInternal(dx, dy, false, false, false, false);
    };

    // Handles updating our rotation matrices based on mouse dragging.
    // dx/dy are the actual displacements of the mouse.
    // the following three parameters are booleans, and control which type of rotation is applied.
    // planarOrGeneral controls which matrix we are updating (true = planar).
    const mouseDraggedInternal = function (dx, dy, xz_yz, xw_yw, xy_zw, planarOrGeneral) {
        let spinDelta = zero();

        // Sensitivity/direction.
        dx *= sensitivity;
        dy *= sensitivity;

        if (!planarOrGeneral) {
            dx *= 0.1;
            dy *= 0.1;
        }

        if (xz_yz) {
            spinDelta[0 * 4 + 2] += dx;
            spinDelta[2 * 4 + 0] -= dx;

            spinDelta[1 * 4 + 2] += dy;
            spinDelta[2 * 4 + 1] -= dy;
        }

        if (xw_yw) {
            spinDelta[0 * 4 + 3] -= dx;
            spinDelta[3 * 4 + 0] += dx;

            spinDelta[1 * 4 + 3] -= dy;
            spinDelta[3 * 4 + 1] += dy;
        }

        if (xy_zw || !planarOrGeneral) {
            spinDelta[0 * 4 + 1] += dx;
            spinDelta[1 * 4 + 0] -= dx;

            spinDelta[3 * 4 + 2] -= dy;
            spinDelta[2 * 4 + 3] += dy;
        }

        if (planarOrGeneral)
            planarMatrix = applySpinDelta(spinDelta, planarMatrix);
        else
            generalRotationMatrix = applySpinDelta(spinDelta, generalRotationMatrix);
    };

    const applySpinDelta = function (spinDelta, matrix) {
        let delta = addVec(identity(), spinDelta);
        delta = gramSchmidt(delta);
        matrix = mulMat4(delta, matrix);
        matrix = gramSchmidt(matrix);
        return matrix;
    };

    return {
        getPlanarMatrix,
        getGeneralMatrix,
        mouseDraggedPlanar,
        mouseDraggedGeneral,
    };
};
