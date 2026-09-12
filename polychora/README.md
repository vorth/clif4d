# Regular polychora

The six regular 4-polytopes on the 3-sphere, stereographically projected into
3-space, drawn as glass and ink, and turned with the Clifford torus trackball
from [`module/rotate4d.js`](../module/rotate4d.js).

Facets are spherical polygons with a matte-glass surface; edges are drawn as
lines with no thickness in 3-space; vertices are not drawn.

## Controls

| | |
|---|---|
| drag | tumble in 3-space (XZ, YZ) |
| shift + drag | rotate into the fourth axis (XW, YW) |
| alt + drag | rotate in the XY and ZW planes |
| shift + alt + drag | drag the surface of the Clifford torus |
| scroll | zoom |

The same convention as the other three examples.  This renderer already works
in the standard frame — x right, y up, z toward the viewer — and builds its
torus with core circles in the (x,y) and (z,w) planes, so it uses the rotation
handler's defaults as they stand.

## How it draws

**Facets are pieces of spheres.**  A 2-face of the polytope, radially projected
onto S³, is a spherical polygon lying on a great 2-sphere.  Stereographic
projection is conformal and sends spheres to spheres, so the image of that
great sphere is an ordinary sphere in 3-space — centred at `-n.xyz/n.w` with
radius `sqrt(1 + |centre|²)`, where `n` is the unit 4D normal of the face's
hyperplane.  (When the great sphere runs through the projection pole, `n.w = 0`
and the image is a plane through the origin: those are the large facets that
sweep off past the edge of the frame.)

Facets are tessellated on S³ by fanning from the face centre and subdividing;
normalizing barycentric combinations keeps every vertex exactly on the face's
great sphere, so the fragment shader can take the surface normal from the
sphere above rather than from the triangles.  The shading is therefore exact
however coarse the tessellation is — only the silhouette needs subdivision, and
it needs more than you would guess, since projection stretches a patch by
1/(1-w)².

**Transparency is accumulated, not sorted.**  These facets overlap deeply and
there is no cheap order to draw them in; sorting tens of thousands of curved
triangles per frame is slow, and getting the order slightly wrong makes the
image pop as the model turns.  So instead of alpha blending, each fragment
writes optical depth τ = -ln(1 - α) additively.  A stack of layers transmits
T = Π(1 - αᵢ) = exp(-Στᵢ), which does not depend on the order the fragments
arrive in, and the composite pass draws

    result = background · T  +  (1 - T) · (Σ c τ) / (Σ τ)

This is *exactly* Porter-Duff compositing when the layers share a colour, and a
τ-weighted average of their colours when they differ — and these facets differ
only by shading.  One additive pass, no sort, and nothing to flicker.

**Edges are marks, not tubes.**  Each edge is an arc of a great circle.  The
vertex shader slerps along it, projects, and expands the arc into a ribbon in
screen pixels with a tapered, wobbling width and a little grain along its
length — so the line has no thickness in 3-space but still reads as something
drawn.  The edge pass runs first and writes depth; the facet pass depth-tests
against it, which is what lets glass in front of a line veil it while the lines
in front keep their bite.

**Orientation.**  Each polytope is turned so the projection pole sits in a deep
hole of its vertex set — the centre of a cell.  That keeps any vertex off the
pole, keeps most facets bounded, and puts the antipodal cell centre at the
origin, which is the centred, cell-first view these are usually drawn in.

## Files

| | |
|---|---|
| `polychora.js` | the six polytopes: vertices on S³, edges, face cycles, and the cell-first orientation |
| `geometry.js` | tessellation of facets, ribbon geometry for edges, the Clifford torus wireframe, camera fitting |
| `render.js` | WebGL2: the three passes, the shaders, the style |
| `index.js` | rotation handler, mouse, controls |
| `polychora.test.js` | `node --test polychora/polychora.test.js` |

Needs WebGL2.  Rendering to a float target (`EXT_color_buffer_float`) is used
where available so optical depth can accumulate past 1; without it τ is scaled
to fit in 8 bits, which looks the same until the glass gets very deep.
