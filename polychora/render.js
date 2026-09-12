// render.js — a WebGL2 renderer for stereographically projected polychora.
//
// ---------------------------------------------------------------------------
// How the transparency works
// ---------------------------------------------------------------------------
// Glass facets overlap heavily and there is no useful order to draw them in:
// sorting 90,000 curved triangles per frame is slow, and sorting them wrongly
// makes the image flicker as the model turns.  So instead of alpha blending we
// accumulate optical depth, which is order independent.
//
// A layer of glass with opacity a transmits (1 - a).  Writing τ = -ln(1 - a),
// a stack of layers transmits T = Π(1 - aᵢ) = exp(-Στᵢ), so summing τ with
// ordinary additive blending gives the exact total transmittance no matter
// what order the fragments arrive in.  Each fragment writes (c·τ, τ); the
// composite pass then draws
//
//     result = background · T  +  (1 - T) · (Σ c τ) / (Σ τ)
//
// which is *exactly* Porter-Duff compositing when the layers share a colour,
// and a τ-weighted average of their colours when they don't.  Since these
// facets differ only in shading, the approximation is invisible — and, unlike
// a sort, it never pops.
//
// Edges are drawn first, into their own buffer, and they write depth.  The
// facet pass then depth-tests against them, so only the glass *in front of* a
// line accumulates over it and interior edges are veiled by the glass they
// lie behind, while the lines themselves keep their bite.  (Glass strictly
// behind a line is dropped — an error confined to the few pixels under a line
// that is nearly opaque anyway.)
//
// The lines have no thickness in 3-space: the vertex shader projects the arc
// and expands it into a ribbon in screen pixels, with a tapered, wobbling
// width and a little grain along its length, so an edge reads as a drawn mark
// rather than a tube.

import { buildFacets, buildEdges, buildTorusWireframe, facetLevels, fitCameraDistance } from './geometry.js';

// The stereographic projection R^3 ← S^3 divides by (1 - w), matching the
// other clif4d examples.  The clamp keeps geometry at the pole finite.
const PROJECT_GLSL = /* glsl */ `
    const float POLE_EPS = 5e-3;
    vec3 stereo(vec4 q) { return q.xyz / max(1.0 - q.w, POLE_EPS); }
`;

const FACET_VS = /* glsl */ `#version 300 es
    precision highp float;
    in vec4 aPosition;          // on S^3
    in vec4 aFaceNormal;        // unit 4D normal of the face's hyperplane
    uniform mat4 uRotation4d;
    uniform mat4 uViewProjection;
    out vec3 vWorld;
    out vec4 vNormal4;
    ${PROJECT_GLSL}
    void main() {
        vec4 q = uRotation4d * aPosition;
        vWorld = stereo(q);
        vNormal4 = uRotation4d * aFaceNormal;
        gl_Position = uViewProjection * vec4(vWorld, 1.0);
    }
`;

// A face lies on a great 2-sphere of S^3, whose stereographic image is an
// ordinary sphere centred at -n.xyz/n.w (or a plane through the origin when
// the great sphere passes through the pole).  Taking the normal from that
// sphere rather than from the tessellation makes the shading exact, however
// coarse the triangles are.
const FACET_FS = /* glsl */ `#version 300 es
    precision highp float;
    in vec3 vWorld;
    in vec4 vNormal4;
    uniform vec3 uEye, uBaseColor, uRimColor, uLight;
    uniform float uOpacity, uRimOpacity, uTauScale;
    out vec4 fragColor;
    void main() {
        vec3 N = abs(vNormal4.w) > 1e-4
            ? normalize(vWorld + vNormal4.xyz / vNormal4.w)
            : normalize(vNormal4.xyz);
        vec3 V = normalize(uEye - vWorld);
        if (dot(N, V) < 0.0) N = -N;                       // facets are two-sided

        float ndv = clamp(dot(N, V), 0.0, 1.0);
        float fresnel = pow(1.0 - ndv, 3.0);
        float diffuse = clamp(0.5 + 0.5 * dot(N, uLight), 0.0, 1.0);   // wrapped: matte
        vec3 H = normalize(uLight + V);
        float spec = pow(max(dot(N, H), 0.0), 6.0) * 0.12;             // broad, low sheen

        vec3 rim = mix(uRimColor, uBaseColor, 0.35);
        vec3 colour = uBaseColor * (0.42 + 0.58 * diffuse) + fresnel * 0.5 * rim + spec;
        float alpha = clamp(uOpacity + (0.9 - uOpacity) * fresnel * uRimOpacity, 0.0, 0.9);

        float tau = -log(1.0 - alpha) * uTauScale;
        fragColor = vec4(colour * tau, tau);
    }
`;

const EDGE_VS = /* glsl */ `#version 300 es
    precision highp float;
    in vec4 aStart, aEnd;       // the arc's endpoints on S^3
    in vec4 aParams;            // t along the arc, side (±1), stroke index, seed
    uniform mat4 uRotation4d;
    uniform mat4 uViewProjection;
    uniform vec2 uViewport;
    uniform float uStrokeWidth, uInkOpacity, uArtistic;
    out float vSide, vHalfWidth, vAlpha;
    ${PROJECT_GLSL}

    vec4 arc(float t) {
        vec4 a = uRotation4d * aStart, b = uRotation4d * aEnd;
        float d = clamp(dot(a, b), -1.0, 1.0);
        float om = acos(d);
        vec4 q = om < 1e-4 ? mix(a, b, t)
                           : (sin((1.0 - t) * om) * a + sin(t * om) * b) / sin(om);
        return uViewProjection * vec4(stereo(q), 1.0);
    }
    vec2 toPixels(vec4 clip) { return (clip.xy / clip.w * 0.5 + 0.5) * uViewport; }

    void main() {
        float t = aParams.x, side = aParams.y, stroke = aParams.z, seed = aParams.w;
        const float DT = 0.01;
        vec4 here = arc(t);
        if (here.w <= 1e-4) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }  // behind the eye
        vec2 s  = toPixels(here);
        vec2 sp = toPixels(arc(clamp(t - DT, 0.0, 1.0)));
        vec2 sn = toPixels(arc(clamp(t + DT, 0.0, 1.0)));
        vec2 tangent = normalize(sn - sp + vec2(1e-6, 0.0));
        vec2 normal = vec2(-tangent.y, tangent.x);

        // A drawn mark: tapered at both ends, with a slow wobble and a faster
        // tremor in the width, and a little dry grain in the ink.
        // uArtistic 0 turns all of that off, for the torus guide lines.
        float phase = seed * 6.2831853;
        float taper = mix(1.0, 0.3 + 0.7 * pow(max(sin(3.1415927 * t), 0.0), 0.5), uArtistic);
        float wobble = 1.0 + uArtistic * (0.22 * sin(6.2831853 * 2.5 * t + phase)
                                        + 0.12 * sin(6.2831853 * 6.3 * t + 2.1 * phase));
        float thin = stroke < 0.5 ? 1.0 : 0.45;
        float halfWidth = max(uStrokeWidth * 0.5 * taper * wobble * thin, 0.35);
        float offset = stroke < 0.5 ? 0.0 : 0.8 * halfWidth * (mod(stroke, 2.0) < 0.5 ? -1.0 : 1.0);

        vec2 pixel = s + normal * (offset + side * halfWidth);
        gl_Position = vec4((pixel / uViewport * 2.0 - 1.0) * here.w, here.z, here.w);

        float grain = 1.0 - uArtistic * 0.22 * (1.0 - sin(6.2831853 * 4.1 * t + 0.7 * phase)
                                                    * sin(6.2831853 * 9.7 * t + phase));
        vSide = side;
        vHalfWidth = halfWidth;
        vAlpha = uInkOpacity * (stroke < 0.5 ? 1.0 : 0.45) * grain;
    }
`;

const EDGE_FS = /* glsl */ `#version 300 es
    precision highp float;
    in float vSide, vHalfWidth, vAlpha;
    uniform vec3 uInkColor;
    out vec4 fragColor;
    void main() {
        float feather = clamp((1.0 - abs(vSide)) * vHalfWidth, 0.0, 1.0);   // ~1px edge
        float a = vAlpha * feather;
        if (a < 0.12) discard;              // keep faint fringes out of the depth buffer
        fragColor = vec4(uInkColor, a);
    }
`;

const COMPOSITE_VS = /* glsl */ `#version 300 es
    precision highp float;
    out vec2 vUv;
    void main() {                                   // one big triangle
        vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
        vUv = p;
        gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
    }
`;

const COMPOSITE_FS = /* glsl */ `#version 300 es
    precision highp float;
    in vec2 vUv;
    uniform sampler2D uInk, uAccum;
    uniform float uTauScale;
    uniform int uSamples;                           // supersampling factor (1 or 2)
    out vec4 fragColor;

    vec3 resolve(ivec2 texel) {
        vec4 acc = texelFetch(uAccum, texel, 0);
        vec3 ink = texelFetch(uInk, texel, 0).rgb;
        float tau = acc.a / uTauScale;
        float T = exp(-tau);
        vec3 glass = acc.a > 1e-6 ? acc.rgb / acc.a : vec3(0.0);
        return ink * T + (1.0 - T) * glass;
    }
    void main() {
        ivec2 base = ivec2(gl_FragCoord.xy) * uSamples;
        vec3 sum = vec3(0.0);
        for (int j = 0; j < uSamples; j++)
            for (int i = 0; i < uSamples; i++)
                sum += resolve(base + ivec2(i, j));
        fragColor = vec4(sum / float(uSamples * uSamples), 1.0);
    }
`;

// Exported so the offscreen test harness can compile and run the real shaders.
export const SHADER_SOURCE = { FACET_VS, FACET_FS, EDGE_VS, EDGE_FS, COMPOSITE_VS, COMPOSITE_FS };

// ---------------------------------------------------------------------------
// Small matrix helpers (column-major, the order WebGL wants)
// ---------------------------------------------------------------------------

export const perspective = (fovYRadians, aspect, near, far) => {
    const f = 1 / Math.tan(fovYRadians / 2), nf = 1 / (near - far);
    return [f/aspect, 0, 0, 0,  0, f, 0, 0,  0, 0, (far + near)*nf, -1,  0, 0, 2*far*near*nf, 0];
};

export const lookAtOrigin = (distance) => [            // eye on +z, looking at the origin
    1, 0, 0, 0,   0, 1, 0, 0,   0, 0, 1, 0,   0, 0, -distance, 1,
];

export const multiply = (a, b) => {                    // a·b, both column-major
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c++)
        for (let r = 0; r < 4; r++)
            for (let k = 0; k < 4; k++)
                out[c*4 + r] += a[k*4 + r] * b[c*4 + k];
    return out;
};

// ---------------------------------------------------------------------------
// GL plumbing
// ---------------------------------------------------------------------------

const compile = (gl, type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`shader: ${gl.getShaderInfoLog(shader)}\n${source}`);
    return shader;
};

const link = (gl, vsSource, fsSource) => {
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vsSource));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, fsSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(`link: ${gl.getProgramInfoLog(program)}`);
    const uniforms = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
        const name = gl.getActiveUniform(program, i).name.replace(/\[0\]$/, '');
        uniforms[name] = gl.getUniformLocation(program, name);
    }
    return { program, uniforms };
};

export const DEFAULT_STYLE = {
    background: [0.965, 0.935, 0.860],
    base:       [0.860, 0.660, 0.340],
    rim:        [1.000, 0.970, 0.900],
    ink:        [0.180, 0.150, 0.118],
    light:      [-0.45, 0.75, 0.55],
    opacity:    0.05,         // face-on opacity of one sheet of glass
    rimOpacity: 0.60,         // how much grazing angles close the glass up
    strokeWidth: 4.0,         // pixels, before the taper
    inkOpacity: 1.0,
    torusWidth: 1.6,          // pixels; the Clifford torus guide lines
    torusOpacity: 0.45,
    targetEdge: 9,            // facet tessellation: wanted triangle edge, in pixels
    showFacets: true,
    showEdges: true,
    cameraDistance: 6.5,
    fieldOfView: 42,
};

/**
 * createRenderer(canvas, options)
 *
 *   setModel(polytope, { subdivision, samples, strokes })
 *   setStyle(partialStyle)
 *   draw(rotation4dColumnMajor, { showTorus })
 *   project(point4)      screen pixels + depth, for the surface-drag handler
 *   resize()
 */
export const createRenderer = (canvas, options = {}) => {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    if (!gl) throw new Error('WebGL2 is required for this example.');

    // Rendering to a float target lets optical depth accumulate past 1.  Where
    // it isn't available, τ is scaled down to fit in 8 bits per channel; the
    // picture is the same until the glass gets very deep.
    const float = gl.getExtension('EXT_color_buffer_float');
    const half = float ? null : gl.getExtension('EXT_color_buffer_half_float');
    const accumFormat = float ? gl.RGBA16F : (half ? gl.RGBA16F : gl.RGBA8);
    const accumType = (float || half) ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    const tauScale = (float || half) ? 1.0 : 0.18;

    let style = { ...DEFAULT_STYLE, ...(options.style ?? {}) };
    let supersample = options.supersample ?? 2;

    const facetProgram = link(gl, FACET_VS, FACET_FS);
    const edgeProgram = link(gl, EDGE_VS, EDGE_FS);
    const compositeProgram = link(gl, COMPOSITE_VS, COMPOSITE_FS);
    const emptyVao = gl.createVertexArray();

    // -- model buffers -------------------------------------------------------
    let model = null;

    const makeBuffers = ({ data, indices, stride }, attributes) => {
        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        for (const { location, size, offset } of attributes) {
            if (location < 0) continue;
            gl.enableVertexAttribArray(location);
            gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride * 4, offset * 4);
        }
        let ibo = null;
        if (indices) {
            ibo = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
        }
        gl.bindVertexArray(null);
        return { vao, vbo, ibo, count: indices ? indices.length : data.length / stride };
    };

    const FACET_ATTRIBUTES = () => [
        { location: gl.getAttribLocation(facetProgram.program, 'aPosition'), size: 4, offset: 0 },
        { location: gl.getAttribLocation(facetProgram.program, 'aFaceNormal'), size: 4, offset: 4 },
    ];
    const EDGE_ATTRIBUTES = () => [
        { location: gl.getAttribLocation(edgeProgram.program, 'aStart'), size: 4, offset: 0 },
        { location: gl.getAttribLocation(edgeProgram.program, 'aEnd'), size: 4, offset: 4 },
        { location: gl.getAttribLocation(edgeProgram.program, 'aParams'), size: 4, offset: 8 },
    ];

    const release = (part) => {
        if (!part) return;
        gl.deleteVertexArray(part.vao); gl.deleteBuffer(part.vbo);
        if (part.ibo) gl.deleteBuffer(part.ibo);
    };

    const rebuildFacets = (options) => {
        const data = buildFacets(model.polytope, options);
        release(model.facets);
        model.facets = makeBuffers(data, FACET_ATTRIBUTES());
        model.triangles = data.indices.length / 3;
        return data;
    };

    const setModel = (polytope, opts = {}) => {
        if (model) { release(model.facets); release(model.edges); }

        const edgeData = buildEdges(polytope, {
            vertices: polytope.vertices,
            samples: opts.samples ?? 24,
            strokes: opts.strokes ?? 2,
        });
        model = {
            polytope,
            baseSubdivision: opts.subdivision ?? 5,
            facets: null,
            edges: makeBuffers(edgeData, EDGE_ATTRIBUTES()),
        };
        const facetData = rebuildFacets({ subdivision: model.baseSubdivision });
        return {
            triangles: model.triangles,
            strokeVertices: edgeData.vertexCount,
            fitDistance: fitCameraDistance(polytope, facetData, style.fieldOfView),
        };
    };

    const torusData = buildTorusWireframe();
    const torus = makeBuffers(torusData, EDGE_ATTRIBUTES());

    // -- offscreen targets ---------------------------------------------------
    let targets = null;

    const makeTexture = (width, height, internal, format, type) => {
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    };

    const releaseTargets = () => {
        if (!targets) return;
        gl.deleteTexture(targets.ink); gl.deleteTexture(targets.accum);
        gl.deleteRenderbuffer(targets.depth);
        gl.deleteFramebuffer(targets.inkFbo); gl.deleteFramebuffer(targets.accumFbo);
        targets = null;
    };

    const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const height = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width; canvas.height = height;
        }
        const w = width * supersample, h = height * supersample;
        if (targets && targets.width === w && targets.height === h) return;
        releaseTargets();

        const ink = makeTexture(w, h, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
        const accum = makeTexture(w, h, accumFormat, gl.RGBA, accumType);
        const depth = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

        const attach = (texture) => {
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer incomplete: ${status}`);
            return fbo;
        };
        targets = { width: w, height: h, ink, accum, depth, inkFbo: attach(ink), accumFbo: attach(accum) };
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };

    // -- camera --------------------------------------------------------------
    const viewProjection = () => {
        const aspect = canvas.width / Math.max(canvas.height, 1);
        return multiply(perspective(style.fieldOfView * Math.PI / 180, aspect, 0.05, 200),
                        lookAtOrigin(style.cameraDistance));
    };

    // Screen position (canvas pixels, y down) and depth of a 4D world point —
    // the same projection the shaders do, for the handler's surface drag.
    const project = (q) => {
        const denominator = Math.max(1 - q[3], 5e-3);
        const p = [q[0]/denominator, q[1]/denominator, q[2]/denominator];
        const m = viewProjection();
        const clip = [0, 1, 2, 3].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
        const w = clip[3] || 1e-6;
        return [(clip[0]/w * 0.5 + 0.5) * canvas.width,
                (0.5 - clip[1]/w * 0.5) * canvas.height,
                w];                                        // eye-space depth, smaller is nearer
    };

    // -- the frame -----------------------------------------------------------
    const draw = (rotation4d, { showTorus = false } = {}) => {
        if (!model) return;
        resize();
        const vp = viewProjection();
        const size = [targets.width, targets.height];
        gl.viewport(0, 0, size[0], size[1]);
        gl.disable(gl.CULL_FACE);

        // Pass 1 — the ink, over the background, writing depth.
        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.inkFbo);
        gl.clearColor(style.background[0], style.background[1], style.background[2], 1);
        gl.clearDepth(1);
        gl.depthMask(true);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LESS);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        if (showTorus || style.showEdges) {
            gl.useProgram(edgeProgram.program);
            const u = edgeProgram.uniforms;
            gl.uniformMatrix4fv(u.uRotation4d, false, rotation4d);
            gl.uniformMatrix4fv(u.uViewProjection, false, vp);
            gl.uniform2fv(u.uViewport, size);
            gl.uniform3fv(u.uInkColor, style.ink);

            if (showTorus) {                        // a guide: even lines, and it occludes nothing
                gl.uniform1f(u.uStrokeWidth, style.torusWidth * supersample);
                gl.uniform1f(u.uInkOpacity, style.torusOpacity);
                gl.uniform1f(u.uArtistic, 0);
                gl.depthMask(false);
                gl.bindVertexArray(torus.vao);
                gl.drawElements(gl.TRIANGLES, torus.count, gl.UNSIGNED_INT, 0);
                gl.depthMask(true);
            }
            if (style.showEdges) {
                gl.uniform1f(u.uStrokeWidth, style.strokeWidth * supersample);
                gl.uniform1f(u.uInkOpacity, style.inkOpacity);
                gl.uniform1f(u.uArtistic, 1);
                gl.bindVertexArray(model.edges.vao);
                gl.drawElements(gl.TRIANGLES, model.edges.count, gl.UNSIGNED_INT, 0);
            }
        }

        // Pass 2 — optical depth of the glass in front of whatever the ink left.
        gl.bindFramebuffer(gl.FRAMEBUFFER, targets.accumFbo);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);              // depth is shared, and kept
        gl.depthMask(false);
        gl.blendFunc(gl.ONE, gl.ONE);

        if (style.showFacets) {
            gl.useProgram(facetProgram.program);
            const u = facetProgram.uniforms;
            gl.uniformMatrix4fv(u.uRotation4d, false, rotation4d);
            gl.uniformMatrix4fv(u.uViewProjection, false, vp);
            gl.uniform3f(u.uEye, 0, 0, style.cameraDistance);
            gl.uniform3fv(u.uBaseColor, style.base);
            gl.uniform3fv(u.uRimColor, style.rim);
            const L = style.light, n = Math.hypot(L[0], L[1], L[2]) || 1;
            gl.uniform3f(u.uLight, L[0]/n, L[1]/n, L[2]/n);
            gl.uniform1f(u.uOpacity, style.opacity);
            gl.uniform1f(u.uRimOpacity, style.rimOpacity);
            gl.uniform1f(u.uTauScale, tauScale);
            gl.bindVertexArray(model.facets.vao);
            gl.drawElements(gl.TRIANGLES, model.facets.count, gl.UNSIGNED_INT, 0);
        }

        // Pass 3 — resolve to the canvas.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.BLEND);
        gl.useProgram(compositeProgram.program);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, targets.ink);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, targets.accum);
        gl.uniform1i(compositeProgram.uniforms.uInk, 0);
        gl.uniform1i(compositeProgram.uniforms.uAccum, 1);
        gl.uniform1f(compositeProgram.uniforms.uTauScale, tauScale);
        gl.uniform1i(compositeProgram.uniforms.uSamples, supersample);
        gl.bindVertexArray(emptyVao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    };

    // -- variable resolution -------------------------------------------------
    // Retessellate for the pose the model is actually in.  This is not done per
    // frame — it walks every face and rebuilds a large buffer — but on mouse-up,
    // after a zoom, or on resize, which is when the answer has changed and the
    // user is not mid-gesture.  Nothing is rebuilt if the levels come back the
    // same, so repeated calls are cheap.
    const applyRotation = (rotation, q) => [0, 1, 2, 3].map((i) =>
        rotation[i] * q[0] + rotation[4 + i] * q[1] + rotation[8 + i] * q[2] + rotation[12 + i] * q[3]);

    let builtLevels = null;

    const refine = (rotation4d) => {
        if (!model) return null;
        resize();
        const levels = facetLevels(model.polytope, (q) => project(applyRotation(rotation4d, q)),
                                   { targetEdge: style.targetEdge });
        const unchanged = builtLevels && levels.every((l, i) => l === builtLevels[i]);
        if (unchanged) return { triangles: model.triangles, rebuilt: false };
        rebuildFacets({ levels });
        builtLevels = levels;
        return { triangles: model.triangles, rebuilt: true };
    };

    return {
        gl,
        setModel,
        refine,
        setStyle: (patch) => { style = { ...style, ...patch }; },
        getStyle: () => ({ ...style }),
        setSupersample: (n) => { supersample = Math.max(1, Math.min(2, n | 0)); releaseTargets(); },
        getTriangles: () => (model ? model.triangles : 0),
        draw,
        project,
        resize,
    };
};
