import { WilsonGPU } from "../wilson.js";
import { commonGlsl } from "./shaders/common.js";
import { torusGlsl } from "./shaders/torus.js";
import { createSingleRotationHandler4D, toRows } from "../../module/rotate4d.js";

const identityWilson = [
    [1, 0, 0, 0],
    [0, 1, 0, 0],
    [0, 0, 1, 0],
    [0, 0, 0, 1],
];

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

    const rotHandler = createSingleRotationHandler4D();
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
            generalRotation: identityWilson,
            planarRotation: identityWilson,
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

                    const shift = event.shiftKey;
                    const alt = event.altKey;

                    const normalDrag = !(shift || alt);
                    const generalDrag = shift && alt;

                    rotHandler.mouseDragged(dx, -dy, normalDrag, shift && !alt, !shift && alt, generalDrag);

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
            generalRotation: toRows(rotHandler.getGeneralMatrix()),
            planarRotation: toRows(rotHandler.getPlanarMatrix()),
        });
        wilson.drawFrame();
        requestAnimationFrame(drawFrame);
    }
    drawFrame();
}

initWilson2();
