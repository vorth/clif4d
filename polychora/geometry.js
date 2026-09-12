// geometry.js — turn a polychoron into GPU buffers.
//
// Two things get built, both in S^3 (rotation happens on the GPU, and a
// rotation of R^4 is an isometry of S^3, so none of this has to be rebuilt
// when the model turns):
//
//   facets — each 2-face is a spherical polygon on a great 2-sphere of S^3.
//     Its stereographic image in R^3 is a piece of an ordinary sphere (or of a
//     plane, when the great sphere runs through the projection pole).  We
//     tessellate the polygon on S^3 by fanning from its centre and subdividing
//     each spherical triangle; normalizing barycentric combinations keeps every
//     vertex exactly on the face's great sphere, so the analytic normal the
//     fragment shader derives from the face's 4D normal is exact even though
//     the triangles themselves are flat.
//
//   edges — each 1-face is an arc of a great circle.  Nothing is built here
//     except the endpoints and a parameter: the vertex shader slerps, projects,
//     and expands the arc into a screen-space ribbon, so the line has no
//     thickness in 3-space.
//
// No dependencies.

const normalize4 = (v) => {
    const n = Math.hypot(v[0], v[1], v[2], v[3]);
    return [v[0]/n, v[1]/n, v[2]/n, v[3]/n];
};

// The 4D analogue of the cross product: a vector orthogonal to all three
// arguments, as the cofactor expansion of the 4x4 determinant.
const cross4 = (a, b, c) => {
    const d = (i, j, k) =>
          a[i]*(b[j]*c[k] - b[k]*c[j])
        - a[j]*(b[i]*c[k] - b[k]*c[i])
        + a[k]*(b[i]*c[j] - b[j]*c[i]);
    return normalize4([ -d(1,2,3), d(0,2,3), -d(0,1,3), d(0,1,2) ]);
};

// The unit normal of the hyperplane through the origin containing the face:
// the face's great 2-sphere is that hyperplane's intersection with S^3.
export const faceNormal = (vertices, face) => {
    const [a, b, c] = [vertices[face[0]], vertices[face[1]], vertices[face[2]]];
    return cross4(a, b, c);
};

const centroid = (vertices, face) => normalize4(face.reduce(
    (s, i) => [s[0]+vertices[i][0], s[1]+vertices[i][1], s[2]+vertices[i][2], s[3]+vertices[i][3]],
    [0, 0, 0, 0]));

/**
 * buildFacets(polytope, { subdivision, levels })
 *
 * Interleaved vertex buffer of position (vec4, on S^3) and the face's 4D
 * normal (vec4), plus a 32-bit index buffer of triangles.
 *
 * `levels`, if given, is a subdivision level per face — see facetLevels below.
 * Otherwise every face gets `subdivision`.
 */
export const buildFacets = ({ vertices, faces }, { subdivision = 5, levels = null } = {}) => {
    const positions = [];
    const normals = [];
    const indices = [];

    faces.forEach((face, faceIndex) => {
        const L = Math.max(1, (levels ? levels[faceIndex] : subdivision) | 0);
        const n = faceNormal(vertices, face);
        const c = centroid(vertices, face);
        for (let e = 0; e < face.length; e++) {
            const a = vertices[face[e]];
            const b = vertices[face[(e + 1) % face.length]];
            const base = positions.length / 4;
            // Barycentric grid on the spherical triangle (c, a, b): row i has
            // i+1 points, row L being the arc from a to b.
            for (let i = 0; i <= L; i++)
                for (let j = 0; j <= i; j++) {
                    const wc = (L - i) / L, wb = j / L, wa = (i - j) / L;
                    positions.push(...normalize4([
                        wc*c[0] + wa*a[0] + wb*b[0],
                        wc*c[1] + wa*a[1] + wb*b[1],
                        wc*c[2] + wa*a[2] + wb*b[2],
                        wc*c[3] + wa*a[3] + wb*b[3],
                    ]));
                    normals.push(n[0], n[1], n[2], n[3]);
                }
            const at = (i, j) => base + (i * (i + 1)) / 2 + j;
            for (let i = 0; i < L; i++)
                for (let j = 0; j <= i; j++) {
                    indices.push(at(i, j), at(i + 1, j), at(i + 1, j + 1));
                    if (j < i) indices.push(at(i, j), at(i + 1, j + 1), at(i, j + 1));
                }
        }
    });

    const count = positions.length / 4;
    const data = new Float32Array(count * 8);
    for (let v = 0; v < count; v++) {
        data.set(positions.slice(v*4, v*4 + 4), v*8);
        data.set(normals.slice(v*4, v*4 + 4), v*8 + 4);
    }
    return { data, indices: new Uint32Array(indices), vertexCount: count, stride: 8 };
};

/**
 * buildEdges(polytope, { samples, strokes })
 *
 * Ribbon geometry for the edge arcs.  Per vertex: the arc's two endpoints on
 * S^3 (vec4 each), the parameter along the arc, which side of the centreline
 * this vertex is (±1), the stroke index, and a per-edge random seed.  The
 * vertex shader does the rest.
 *
 * `strokes` sub-strokes are laid over each edge, slightly offset and thinner
 * than the first: one pass is a clean line, two or three make a drier, more
 * brushed mark.
 */
export const buildEdges = ({ edges }, { vertices: verts4, samples = 24, strokes = 2 } = {}) => {
    const S = Math.max(2, samples | 0);
    const K = Math.max(1, strokes | 0);
    const data = [];
    const indices = [];
    let base = 0;

    edges.forEach(([i, j], e) => {
        const a = verts4[i], b = verts4[j];
        for (let k = 0; k < K; k++) {
            const seed = (e * 2654435761 + k * 40503) % 65536 / 65536;
            for (let s = 0; s < S; s++) {
                const t = s / (S - 1);
                for (const side of [-1, 1])
                    data.push(a[0], a[1], a[2], a[3], b[0], b[1], b[2], b[3], t, side, k, seed);
            }
            for (let s = 0; s < S - 1; s++) {
                const v = base + s*2;
                indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
            }
            base += S * 2;
        }
    });

    return {
        data: new Float32Array(data),
        indices: new Uint32Array(indices),
        vertexCount: base,
        stride: 12,
    };
};

/**
 * facetLevels(polytope, project, { targetEdge, maxLevel, budget })
 *
 * A subdivision level per face, from how big that face currently looks.
 *
 * Uniform subdivision is the wrong measure here.  Stereographic projection
 * stretches a patch by 1/(1-w)², so in any given pose a handful of facets —
 * the ones wrapped around the outside — are enormous on screen while most are
 * a few pixels across.  Subdividing everything enough for the big ones wastes
 * almost all of it; subdividing for the average leaves the outer silhouettes
 * visibly polygonal.
 *
 * So each face is measured: its boundary arcs are projected and their screen
 * length divided by `targetEdge` pixels.  Tiny facets fall to a single fan,
 * big ones climb to `maxLevel`, and if the total blows past `budget`
 * triangles every level is scaled back together.
 *
 * `project(p4)` is the client's projection — the same one the surface drag
 * uses — returning screen pixels.
 */
export const facetLevels = ({ vertices, faces }, project, {
    targetEdge = 9, maxLevel = 48, budget = 900000,
} = {}) => {
    const ARC_SAMPLES = 4;
    const screen = (a, b, t) => {                       // slerp on S^3, then project
        const d = Math.max(-1, Math.min(1, a.reduce((s, c, k) => s + c * b[k], 0)));
        const omega = Math.acos(d);
        const q = omega < 1e-6 ? a : a.map((c, k) =>
            (Math.sin((1 - t) * omega) * c + Math.sin(t * omega) * b[k]) / Math.sin(omega));
        return project(q);
    };

    const levels = faces.map((face) => {
        let perimeter = 0;
        for (let e = 0; e < face.length; e++) {
            const a = vertices[face[e]], b = vertices[face[(e + 1) % face.length]];
            let previous = screen(a, b, 0);
            for (let s = 1; s <= ARC_SAMPLES; s++) {
                const here = screen(a, b, s / ARC_SAMPLES);
                const step = Math.hypot(here[0] - previous[0], here[1] - previous[1]);
                perimeter += Number.isFinite(step) ? Math.min(step, 1e5) : 0;
                previous = here;
            }
        }
        const level = Math.ceil(perimeter / (face.length * targetEdge));
        return Math.max(1, Math.min(maxLevel, level));
    });

    // Triangles are level² per fan triangle, so scaling levels by k scales the
    // count by k²; that is what keeps the pull-back cheap to compute.
    const triangles = () => faces.reduce(
        (sum, face, i) => sum + face.length * levels[i] * levels[i], 0);
    const total = triangles();
    if (total > budget) {
        const k = Math.sqrt(budget / total);
        for (let i = 0; i < levels.length; i++)
            levels[i] = Math.max(1, Math.floor(levels[i] * k));
    }
    return levels;
};

/**
 * fitCameraDistance(polytope, facets, fieldOfViewDegrees)
 *
 * A camera distance that frames the model in its rest pose.  Two things are
 * asked of the framing: every edge must fit, since the linework is the drawing;
 * and most of the glass must fit.  Only *most*, because in a cell-first view one
 * cell wraps around the outside and a few of its facets run out towards the
 * horizon — framing those would shrink everything else to a dot.  So the rule is
 * the larger of (every edge) and (the 99th percentile of the facet surface).
 * The mouse wheel does the rest.
 */
export const fitCameraDistance = ({ vertices, edges }, facets, fieldOfViewDegrees) => {
    const radiusOf = (q) => {
        const d = Math.max(1 - q[3], 5e-3);
        return Math.hypot(q[0]/d, q[1]/d, q[2]/d);
    };

    let edgeRadius = 0;
    for (const [i, j] of edges) {
        const a = vertices[i], b = vertices[j];
        const omega = Math.acos(Math.max(-1, Math.min(1, a.reduce((s, c, k) => s + c*b[k], 0))));
        for (let s = 0; s <= 8; s++) {
            const t = s / 8;
            const q = omega < 1e-6 ? a : a.map((c, k) =>
                (Math.sin((1 - t)*omega)*c + Math.sin(t*omega)*b[k]) / Math.sin(omega));
            edgeRadius = Math.max(edgeRadius, radiusOf(q));
        }
    }

    const surface = new Float64Array(facets.vertexCount);
    for (let i = 0; i < facets.vertexCount; i++) {
        const k = i * facets.stride;
        surface[i] = radiusOf([facets.data[k], facets.data[k+1], facets.data[k+2], facets.data[k+3]]);
    }
    surface.sort();
    const facetRadius = surface[Math.floor(0.99 * (facets.vertexCount - 1))];

    return Math.max(edgeRadius, facetRadius) / (0.85 * Math.tan(fieldOfViewDegrees * Math.PI / 360));
};

// The Clifford torus, drawn as a wireframe when the user grabs it.  Its core
// circles lie in the (x,y) and (z,w) planes — the handler's default corePlanes,
// which is what makes a shift+alt drag turn the model around the torus.
//
// It comes back as edge-ribbon geometry rather than GL lines: a hardware line
// is one pixel wide, which all but disappears once the supersampled buffer is
// resolved, and the torus is meant to be seen.  Each short segment becomes its
// own two-sample ribbon; the edge shader's taper and grain are switched off
// for it, so the result is an even line of the width asked for.
export const buildTorusWireframe = ({ lines = 20, samples = 72 } = {}) => {
    const r = Math.SQRT1_2;
    const point = (p1, p2) => [r*Math.cos(p1), r*Math.sin(p1), r*Math.cos(p2), r*Math.sin(p2)];
    const vertices = [];
    const edges = [];
    const strand = (at) => {
        const first = vertices.length;
        for (let s = 0; s < samples; s++) vertices.push(at((s / samples) * 2 * Math.PI));
        for (let s = 0; s < samples; s++) edges.push([first + s, first + (s + 1) % samples]);
    };
    for (let i = 0; i < lines; i++) {
        const fixed = (i / lines) * 2 * Math.PI;
        strand((t) => point(fixed, t));
        strand((t) => point(t, fixed));
    }
    return buildEdges({ edges }, { vertices, samples: 2, strokes: 1 });
};
