
const zero = () =>  [
                      0, 0, 0, 0,
                      0, 0, 0, 0,
                      0, 0, 0, 0,
                      0, 0, 0, 0,
                    ];

// NOTE: The tdl function for this is broken!
const getRow = (m, i) =>
{
  var r = [];
  for (var j = 0; j < 4; j++)
    r[j] = m[i * 4 + j];
  return r;
}

const setRow = (m, i, v) =>
{
  for (var j = 0; j < 4; j++)
    m[i * 4 + j] = v[j];
}

const gramSchmidt = (m) =>
{
  var result = m;
  for (var i = 0; i < 4; i++) {
    for (var j = 0; j < i; j++) {
      var iVec = getRow(m, i);
      var jVec = getRow(m, j);
      iVec = tdl.math.subVector(iVec, tdl.math.mulScalarVector(
        tdl.math.dot(iVec, jVec), jVec));
      setRow(result, i, iVec);
    }

    var normalized = tdl.math.normalize(getRow(result, i));
    setRow(result, i, normalized);
  }

  return result;
}


export const createRotationHandler4D = ( sensitivity = 0.012 ) =>
{
  let torusMatrix = tdl.math.matrix4.identity();
  let generalRotationMatrix = tdl.math.matrix4.identity();

  const getTorusMatrix = function () {
    return torusMatrix;
  }

  const getGeneralMatrix = function () {
    return generalRotationMatrix;
  }

  const mouseDraggedTorus = function (dx, dy, xz_yz, xw_yw, xy_zw) {
    mouseDraggedInternal(dx, dy, xz_yz, xw_yw, xy_zw, true);
  }

  const mouseDraggedGeneral = function (dx, dy) {
    mouseDraggedInternal(dx, dy, false, false, false, false);
  }

  // Handles updating our rotation matrices based on mouse dragging.
  // dx/dy are the actual displacements of the mouse.
  // the following three parameters are booleans, and control which type of rotation is applied.
  // torusOrGeneral controls which matrix we are updating (true = torus).
  const mouseDraggedInternal = function (dx, dy, xz_yz, xw_yw, xy_zw, torusOrGeneral) {
    let spinDelta = zero();

    // Sensitivity/direction.
    dx *= sensitivity;
    dy *= sensitivity;

    if (!torusOrGeneral) {
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

    if (xy_zw || !torusOrGeneral) {
      spinDelta[0 * 4 + 1] += dx;
      spinDelta[1 * 4 + 0] -= dx;

      spinDelta[3 * 4 + 2] -= dy;
      spinDelta[2 * 4 + 3] += dy;
    }

    if (torusOrGeneral)
      torusMatrix = applySpinDelta(spinDelta, torusMatrix);
    else
      generalRotationMatrix = applySpinDelta(spinDelta, generalRotationMatrix);
  }

  const applySpinDelta = function (spinDelta, matrix) {
    var delta = tdl.math.addVector(tdl.math.matrix4.identity(), spinDelta);
    delta = gramSchmidt(delta);
    matrix = tdl.math.matrix4.mul(delta, matrix);
    matrix = gramSchmidt(matrix);
    return matrix;
  }

  return {
    getTorusMatrix,
    getGeneralMatrix,
    mouseDraggedTorus,
    mouseDraggedGeneral
  }
}