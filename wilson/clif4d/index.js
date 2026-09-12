import { WilsonGPU } from "../wilson.js";
import { commonGlsl } from "./shaders/common.js";
import { torusGlsl } from "./shaders/torus.js";
import { createRotationHandler4D, Plane, toRows } from "../../module/rotate4d.js";

const identityWilson = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
];

// Screen frame: this scene's camera sits on +z looking at the origin, but
// dragging feels right with standard z (toward the viewer) = this scene's -z.
const AXES = ['x', 'y', '-z', 'w'];
// Torus frame: the SDF builds the Clifford torus with its core circles in this
// scene's (x,z) and (y,w) planes (see the torusSdf / core() swizzles).
const CORE_PLANES = ['xz', 'yw'];

// Shared mouse convention (same as the tdl example):
//   drag             tumble in 3-space         (XZ, YZ)
//   shift + drag     rotate into the 4th axis  (XW, YW)
//   alt + drag       rotate XY and ZW
//   shift+alt + drag rotate about the torus's core circles (T1, T2), slowed 10x
// dy is positive upward.  Plane.XZ carries x toward z; dragging right should
// carry the near side (+z) toward +x, hence the negations on the default drag.
function dragRotate(handler, dx, dy, shift, alt) {
    if (shift && alt)  handler.drag(-0.1 * dx, Plane.T1, -0.1 * dy, Plane.T2);
    else if (shift)    handler.drag(-dx, Plane.XW, -dy, Plane.YW);
    else if (alt)      handler.drag(-dx, Plane.XY, -dy, Plane.ZW);
    else               handler.drag(-dx, Plane.XZ, -dy, Plane.YZ);
}

function initWilson2() {
    const canvas = document.querySelector("#demo-canvas-2");
    const resolution = 1000;

    const shader = /* glsl */ `
		precision highp float;

		varying vec2 uv;

		uniform vec2 worldCenter;
		uniform vec2 worldSize;
		uniform vec2 c;
		uniform float iTime;
        uniform vec2 iResolution;

		${commonGlsl}
        ${torusGlsl}

		void main(void)
		{
            vec2 fragCoord = (uv * 0.5 + 0.5) * iResolution;
            gl_FragColor = image( fragCoord, iResolution, iTime );

            // Debugging
            // gl_FragColor = vec4(1.0, 1.0, 0, 1.0);
		}
	`;

    // The raymarcher transforms sample points, so it needs inverse matrices.
    const rotHandler = createRotationHandler4D({ inverse: true, axes: AXES, corePlanes: CORE_PLANES });
    let lastClientX = null;
    let lastClientY = null;

    const options = {
        shader,
        uniforms: {
            worldCenter: [0, 0],
            worldSize: [5, 5],
            c: [0, 1],
            iTime: 0,
            iResolution: [resolution, resolution],
            rotation4d: identityWilson,
        },
        canvasWidth: resolution,
        onResizeCanvas: drawFrame,
        worldHeight: 3,
        minWorldWidth: 0.00001,
        minWorldHeight: 0.00001,
        minWorldX: -2.5,
        maxWorldX: 2.5,
        minWorldY: -2.5,
        maxWorldY: 2.5,
        useResetButton: true,
        resetButtonIconPath: "../reset.png",
        interactionOptions: {
            callbacks: {
                mousedown: ({ event }) => {
                    lastClientX = event.clientX;
                    lastClientY = event.clientY;
                },
                mouseup: () => {
                    lastClientX = null;
                    lastClientY = null;
                },
                mousedrag: ({ event }) => {
                    if (lastClientX === null) return;
                    const dx = event.clientX - lastClientX;
                    const dy = event.clientY - lastClientY;

                    dragRotate(rotHandler, dx, -dy, event.shiftKey, event.altKey);

                    lastClientX = event.clientX;
                    lastClientY = event.clientY;
                },
            },
        },
        fullscreenOptions: {
            fillScreen: true,
            useFullscreenButton: true,
            enterFullscreenButtonIconPath: "../enter-fullscreen.png",
            exitFullscreenButtonIconPath: "../exit-fullscreen.png",
        },
    };
    const wilson = new WilsonGPU(canvas, options);

    const startTime = performance.now();
    function drawFrame() {
        wilson.setUniforms({
            worldCenter: [wilson.worldCenterX, wilson.worldCenterY],
            worldSize: [wilson.worldWidth, wilson.worldHeight],
            iTime: (performance.now() - startTime) / 1000,
            iResolution: [wilson.canvasWidth, wilson.canvasHeight],
            rotation4d: toRows(rotHandler.getModelMatrix()),
        });
        wilson.drawFrame();
        requestAnimationFrame(drawFrame);
    }
    drawFrame();
}

initWilson2();
