import { WilsonCPU, WilsonGPU } from "../wilson.js";
import { commonGlsl } from "./shaders/common.js";
import { torusGlsl } from "./shaders/torus.js";

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
    const options = {
        shader,
        uniforms: {
            worldCenter: [0, 0],
            worldSize: [5, 5],
            c: [0, 1],
            iTime: 0,
            iResolution: [resolution, resolution],
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
            useForPanAndZoom: true,
            onPanAndZoom: drawFrame,
        },
        fullscreenOptions: {
            fillScreen: true,
            useFullscreenButton: true,
            enterFullscreenButtonIconPath: "../enter-fullscreen.png",
            exitFullscreenButtonIconPath: "../exit-fullscreen.png",
        },
        draggableOptions: {
            draggables: {
                //c: [0, 1]
            },
            callbacks: {
                drag: ({ id, x, y }) => {
                    if (id === "c") {
                        wilson.setUniforms({ c: [x, y] });
                        wilson.drawFrame();
                    }
                }
            }
        }
    };
    const wilson = new WilsonGPU(canvas, options);
    const startTime = performance.now();
    function drawFrame() {
        wilson.setUniforms({
            worldCenter: [wilson.worldCenterX, wilson.worldCenterY],
            worldSize: [wilson.worldWidth, wilson.worldHeight],
            iTime: (performance.now() - startTime) / 1000,
            iResolution: [wilson.canvasWidth, wilson.canvasHeight],
        });
        wilson.drawFrame();
        requestAnimationFrame(drawFrame);
    }
    drawFrame();
}

initWilson2();
