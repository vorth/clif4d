// polychora.js — the six regular 4-polytopes, as combinatorics plus vertices
// on the unit 3-sphere.
//
// Every generator returns
//
//   { name, schlafli, vertices, edges, faces }
//
//     vertices  array of [x, y, z, w], each of unit length (so they lie on S^3)
//     edges     array of [i, j]
//     faces     array of vertex-index cycles, in order around the polygon
//
// Cells are not needed: this renderer draws the 2-faces (as spherical polygons)
// and the 1-faces (as arcs of great circles).  Nothing here knows about
// projection or rendering.
//
// No dependencies.

const PHI = (1 + Math.sqrt(5)) / 2;

const dot4 = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3];
const normalize4 = (v) => {
    const n = Math.hypot(v[0], v[1], v[2], v[3]);
    return [v[0]/n, v[1]/n, v[2]/n, v[3]/n];
};

// Index pairs whose vertices are a given dot product apart.  Regular polytopes
// have a single edge length, so "nearest neighbours" is unambiguous.
const edgesByDot = (verts, target, tol = 1e-6) => {
    const edges = [];
    for (let i = 0; i < verts.length; i++)
        for (let j = i + 1; j < verts.length; j++)
            if (Math.abs(dot4(verts[i], verts[j]) - target) < tol) edges.push([i, j]);
    return edges;
};

const adjacency = (n, edges) => {
    const adj = Array.from({ length: n }, () => new Set());
    for (const [i, j] of edges) { adj[i].add(j); adj[j].add(i); }
    return adj;
};

// Every triangle of mutually adjacent vertices.  Correct for the polytopes
// whose 2-faces are triangles ({3,3,3}, {3,3,4}, {3,4,3}, {3,3,5}): in those,
// three mutually adjacent vertices always bound a face.
const triangleFaces = (n, adj) => {
    const faces = [];
    for (let i = 0; i < n; i++)
        for (const j of adj[i]) { if (j <= i) continue;
            for (const k of adj[j]) { if (k <= j) continue;
                if (adj[i].has(k)) faces.push([i, j, k]);
            }
        }
    return faces;
};

// --------------------------------------------------------------------------
// {3,3,3} — 5-cell
// --------------------------------------------------------------------------
export const cell5 = () => {
    const s = 1 / Math.sqrt(5);
    const vertices = [
        [ 1,  1,  1, -s], [ 1, -1, -1, -s], [-1,  1, -1, -s], [-1, -1,  1, -s],
        [ 0,  0,  0, 4*s],
    ].map(normalize4);
    const edges = edgesByDot(vertices, -0.25);
    const faces = triangleFaces(5, adjacency(5, edges));
    return { name: '5-cell', schlafli: '{3,3,3}', vertices, edges, faces };
};

// --------------------------------------------------------------------------
// {3,3,4} — 16-cell
// --------------------------------------------------------------------------
export const cell16 = () => {
    const vertices = [];
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
        const v = [0, 0, 0, 0]; v[i] = s; vertices.push(v);
    }
    const edges = edgesByDot(vertices, 0);            // everything but antipodes
    const faces = triangleFaces(8, adjacency(8, edges));
    return { name: '16-cell', schlafli: '{3,3,4}', vertices, edges, faces };
};

// --------------------------------------------------------------------------
// {4,3,3} — tesseract
// --------------------------------------------------------------------------
export const tesseract = () => {
    const vertices = [];
    const index = new Map();
    for (let m = 0; m < 16; m++) {
        const v = [0, 1, 2, 3].map((k) => ((m >> k) & 1 ? 0.5 : -0.5));
        index.set(v.join(','), vertices.length);
        vertices.push(v);
    }
    const edges = edgesByDot(vertices, 0.5);          // differ in one coordinate
    // Square faces: pick two axes to vary, fix the other two, and walk the
    // square in order so the cycle is a genuine polygon.
    const faces = [];
    const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
        const rest = [0, 1, 2, 3].filter((k) => k !== a && k !== b);
        for (const fa of [-0.5, 0.5]) for (const fb of [-0.5, 0.5]) {
            faces.push(corners.map(([va, vb]) => {
                const v = [0, 0, 0, 0];
                v[a] = va; v[b] = vb; v[rest[0]] = fa; v[rest[1]] = fb;
                return index.get(v.join(','));
            }));
        }
    }
    return { name: 'tesseract', schlafli: '{4,3,3}', vertices, edges, faces };
};

// --------------------------------------------------------------------------
// {3,4,3} — 24-cell
// --------------------------------------------------------------------------
export const cell24 = () => {
    const r = Math.SQRT1_2;
    const vertices = [];
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++)
        for (const sa of [1, -1]) for (const sb of [1, -1]) {
            const v = [0, 0, 0, 0]; v[a] = sa*r; v[b] = sb*r; vertices.push(v);
        }
    const edges = edgesByDot(vertices, 0.5);
    const faces = triangleFaces(24, adjacency(24, edges));
    return { name: '24-cell', schlafli: '{3,4,3}', vertices, edges, faces };
};

// --------------------------------------------------------------------------
// {3,3,5} — 600-cell
// --------------------------------------------------------------------------
// The 120 icosians: 8 unit axis vectors, 16 half-coordinate points, and 96
// even permutations of (±φ, ±1, ±1/φ, 0)/2.
const icosians = () => {
    const verts = [];
    for (let i = 0; i < 4; i++) for (const s of [1, -1]) {
        const v = [0, 0, 0, 0]; v[i] = s; verts.push(v);
    }
    for (let m = 0; m < 16; m++)
        verts.push([0, 1, 2, 3].map((k) => ((m >> k) & 1 ? 0.5 : -0.5)));
    const base = [PHI/2, 0.5, 1/(2*PHI), 0];
    for (const p of evenPermutations4())
        for (let m = 0; m < 8; m++) {
            const v = [0, 0, 0, 0];
            for (let k = 0; k < 3; k++) v[p[k]] = ((m >> k) & 1 ? -1 : 1) * base[k];
            verts.push(v);
        }
    return verts;
};

const evenPermutations4 = () => {
    const perms = [];
    const permute = (arr, k) => {
        if (k === arr.length) { perms.push([...arr]); return; }
        for (let i = k; i < arr.length; i++) {
            [arr[k], arr[i]] = [arr[i], arr[k]];
            permute(arr, k + 1);
            [arr[k], arr[i]] = [arr[i], arr[k]];
        }
    };
    permute([0, 1, 2, 3], 0);
    const parity = (p) => {
        let swaps = 0;
        for (let i = 0; i < p.length; i++)
            for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) swaps++;
        return swaps % 2;
    };
    return perms.filter((p) => parity(p) === 0);
};

export const cell600 = () => {
    const vertices = icosians();
    const edges = edgesByDot(vertices, PHI/2);        // edge length 1/φ
    const faces = triangleFaces(120, adjacency(120, edges));
    return { name: '600-cell', schlafli: '{3,3,5}', vertices, edges, faces };
};

// --------------------------------------------------------------------------
// {5,3,3} — 120-cell, built as the dual of the 600-cell
// --------------------------------------------------------------------------
// The 600-cell's 600 tetrahedral cells give the 120-cell's 600 vertices; two
// are joined when their tetrahedra share a triangle; and the five tetrahedra
// around an edge of the 600-cell give a pentagonal face.  Walking that ring in
// order is what puts each pentagon's vertices in cyclic order.
export const cell120 = () => {
    const v600 = icosians();
    const e600 = edgesByDot(v600, PHI/2);
    const adj = adjacency(120, e600);

    const tets = [];
    for (let i = 0; i < 120; i++)
        for (const j of adj[i]) { if (j <= i) continue;
            for (const k of adj[j]) { if (k <= j || !adj[i].has(k)) continue;
                for (const l of adj[k]) {
                    if (l <= k || !adj[i].has(l) || !adj[j].has(l)) continue;
                    tets.push([i, j, k, l]);
                }
            }
        }

    const vertices = tets.map((t) => normalize4(
        t.reduce((s, i) => [s[0]+v600[i][0], s[1]+v600[i][1], s[2]+v600[i][2], s[3]+v600[i][3]],
                 [0, 0, 0, 0])));

    // Edges: pairs of tetrahedra sharing a triangle.
    const byTriangle = new Map();
    tets.forEach((t, ti) => {
        for (let s = 0; s < 4; s++) {
            const key = t.filter((_, i) => i !== s).join(',');
            (byTriangle.get(key) ?? byTriangle.set(key, []).get(key)).push(ti);
        }
    });
    const edges = [...byTriangle.values()].map((pair) => [pair[0], pair[1]]);

    // Faces: the ring of five tetrahedra around each 600-cell edge, ordered by
    // stepping from one tetrahedron to the next one sharing a triangle.
    const ringsOf = new Map();
    tets.forEach((t, ti) => {
        for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
            const key = `${t[a]},${t[b]}`;
            (ringsOf.get(key) ?? ringsOf.set(key, []).get(key)).push(ti);
        }
    });
    const faces = [];
    for (const ring of ringsOf.values()) {
        const cycle = [ring[0]];
        const rest = new Set(ring.slice(1));
        while (rest.size) {
            const last = new Set(tets[cycle[cycle.length - 1]]);
            let next = null;
            for (const r of rest)
                if (tets[r].filter((v) => last.has(v)).length === 3) { next = r; break; }
            if (next === null) break;                 // not a ring; skip
            cycle.push(next); rest.delete(next);
        }
        if (cycle.length === ring.length) faces.push(cycle);
    }

    return { name: '120-cell', schlafli: '{5,3,3}', vertices, edges, faces };
};

// ---------------------------------------------------------------------------
// Orientation
// ---------------------------------------------------------------------------
// Stereographic projection sends the pole (0,0,0,1) to infinity.  If the pole
// happens to lie on a face's great 2-sphere — which it does whenever a vertex
// sits at the pole, as it does for the 16-cell and 600-cell as written above —
// that face's image is an infinite plane, and a few of those swamp the picture.
//
// So each polytope is turned to put the pole in its deep hole — the direction
// furthest from every vertex, which for a regular polytope is the centre of a
// cell.  Then no face contains the pole, every facet projects to a bounded
// piece of a sphere, the antipodal cell centre lands on the origin, and what
// you get is the familiar centred, cell-first view.

const dot4v = dot4;

// The deep hole of the vertex set: the unit direction whose largest dot product
// with any vertex is as small as possible.  For a regular polytope that is the
// centre of a cell, so this is the classic cell-first view — and the antipodal
// direction projects to the origin, which centres the picture.
//
// max over vertices is convex, so a subgradient descent (step away from the
// currently nearest vertices) converges; a handful of deterministic starts
// keeps it from stalling on a face or an edge of the graph.
const deepHole = (vertices) => {
    const worstDot = (d) => vertices.reduce((m, v) => Math.max(m, dot4v(v, d)), -Infinity);

    const descend = (start) => {
        let d = normalize4(start);
        for (let i = 0; i < 600; i++) {
            const step = 0.5 * Math.pow(0.99, i);
            const m = worstDot(d);
            const pull = [0, 0, 0, 0];
            for (const v of vertices)
                if (dot4v(v, d) > m - 1e-6)
                    for (let k = 0; k < 4; k++) pull[k] += v[k];
            const n = Math.hypot(...pull);
            if (n < 1e-12) break;
            d = normalize4(d.map((c, k) => c - step * pull[k] / n));
        }
        return d;
    };

    let best = null, bestScore = Infinity;
    for (let i = 0; i < 12; i++) {
        // deterministic, spread-out starting directions
        const start = [0, 1, 2, 3].map((k) => Math.sin((i + 1) * (k + 1) * 1.61803398875) + 0.1 * k);
        const d = descend(start), score = worstDot(d);
        if (score < bestScore - 1e-9) { best = d; bestScore = score; }
    }
    return best;
};

// A rotation taking `d` to (0,0,0,1): Gram-Schmidt an orthonormal basis whose
// last vector is d, then use its rows.  Negating the first row where needed
// keeps the determinant +1, so the polytope is turned rather than mirrored.
const rotationTakingToPole = (d) => {
    const basis = [normalize4(d)];
    for (const axis of [[1,0,0,0], [0,1,0,0], [0,0,1,0], [0,0,0,1]]) {
        if (basis.length === 4) break;
        let v = [...axis];
        for (const b of basis) {
            const p = dot4v(v, b);
            v = v.map((c, k) => c - p * b[k]);
        }
        if (Math.hypot(...v) > 1e-6) basis.push(normalize4(v));
    }
    const rows = [basis[1], basis[2], basis[3], basis[0]];   // d becomes the w axis
    if (determinant4(rows) < 0) rows[0] = rows[0].map((c) => -c);
    return rows;
};

const determinant4 = (m) => {
    const minor3 = (r, c) => {
        const rows = [0,1,2,3].filter((i) => i !== r), cols = [0,1,2,3].filter((j) => j !== c);
        const a = rows.map((i) => cols.map((j) => m[i][j]));
        return a[0][0]*(a[1][1]*a[2][2] - a[1][2]*a[2][1])
             - a[0][1]*(a[1][0]*a[2][2] - a[1][2]*a[2][0])
             + a[0][2]*(a[1][0]*a[2][1] - a[1][1]*a[2][0]);
    };
    return [0,1,2,3].reduce((s, c) => s + (c % 2 ? -1 : 1) * m[0][c] * minor3(0, c), 0);
};

export const orientForProjection = (polytope) => {
    const { vertices } = polytope;
    const R = rotationTakingToPole(deepHole(vertices));
    return {
        ...polytope,
        vertices: vertices.map((v) => R.map((row) => dot4v(row, v))),
    };
};

export const POLYCHORA = {
    '5-cell':    cell5,
    '16-cell':   cell16,
    'tesseract': tesseract,
    '24-cell':   cell24,
    '600-cell':  cell600,
    '120-cell':  cell120,
};

export const build = (name, { orient = true } = {}) => {
    const make = POLYCHORA[name];
    if (!make) throw new Error(`unknown polychoron ${JSON.stringify(name)}`);
    const polytope = make();
    return orient ? orientForProjection(polytope) : polytope;
};
