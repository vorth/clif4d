clif4d
======

exploring 4d rotations with WebGL
## `module/rotate4d.js`

A dependency-free rotation handler for R⁴, built around the Clifford torus.
Drags rotate in one of eight planes:

| Plane | Meaning |
|---|---|
| `XY XZ YZ XW YW ZW` | the six coordinate planes of the standard frame (world-frame rotations: torus and model move together) |
| `T1 T2` | the torus's two core circles, wherever the torus currently sits (the torus stays put; the model turns around it) |

```js
import { createRotationHandler4D, Plane, transpose } from './module/rotate4d.js';

const rot = createRotationHandler4D({
    sensitivity: 0.012,          // radians per pixel for drag()
    axes: ['x', 'y', 'z', 'w'],  // screen frame: which of YOUR axes is right / up / toward-viewer / 4th
    corePlanes: ['xy', 'zw'],    // torus frame: which of YOUR planes hold the torus's core circles
    inverse: false,              // true for raymarchers, which transform sample points
});

rot.rotate(angle, Plane.XW);                 // one plane, radians
rot.drag(dx, Plane.XZ, dy, Plane.YZ);        // two planes, pixels; planeX is applied first
rot.getModelMatrix();                        // flat row-major 4x4, column-vector convention (p' = M·p)
rot.getTorusMatrix();                        // the torus's pose alone
rot.getCoreMatrix();                         // the T1/T2 rotation alone
rot.getTorusAngles();                        // [θ1, θ2]
rot.reset();
```

The standard frame has x to the right, y up, and z toward the viewer.  `axes`
conjugates every returned matrix into the client's frame, so the six plane
names mean the same thing in every client ("XZ" is always a tumble about
screen-vertical).  `corePlanes` is separate because a renderer's torus need not
be aligned with its screen: the Wilson example draws its torus with cores in
its (x,z) and (y,w) planes and uses `axes: ['x','y','-z','w'],
corePlanes: ['xz','yw']`.  T1 rotates in the first core plane, T2 in the second.
Order matters in `drag()` only when the two planes share an axis (e.g. XZ then
YZ); T1/T2 commute with everything.

Uploading to WebGL: `gl.uniformMatrix4fv(loc, false, transpose(m))` with
`M * p` in GLSL, or upload `m` as-is and write `p * M`.  `toRows(m)` gives the
nested `value[row][col]` form Wilson wants.  Tests: `node --test module/rotate4d.test.js`.
