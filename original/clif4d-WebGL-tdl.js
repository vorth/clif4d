import { createRotationHandler4D, Plane } from "../module/rotate4d.js";
import { cliffordTorus } from "./torus.js";

// tdl scripts are loaded via script tags in index.html since
// tdl.require() uses document.write() which doesn't work in ES modules
window.onload = initialize;

// globals
var gl;                   // the gl context.
var canvas;               // the canvas
var math;                 // the math lib.
var fast;                 // the fast math lib.

var g_eyeRadius = 15;

function CreateApp()
{
    var zoom4d = false;
    // Standard frame already matches this renderer: x right, y up, z toward the
    // viewer (eye sits on +z), w the fourth axis.
    var m_rotationHandler = createRotationHandler4D();
    
    window .addEventListener( 'keydown', handleKeyDown, false );
    window .addEventListener( 'keyup', handleKeyUp, false );
    canvas .onmousedown = handleMouseDown;
    document .onmouseup = handleMouseUp;
    document .onmousemove = handleMouseMove;

    function handleKeyDown(event)
    {
        if ( event .shiftKey )
            zoom4d = true;
    }
    
    function handleKeyUp( event )
    {
        zoom4d = false;
    }
    
    var tau = ( 1.0 + Math.sqrt( 5.0 ) ) / 2.0;
    
    // The commented out value was used for the 120cell model
    //var cameraDist = tau* tau;
    var cameraDist = 1;

    function zoom( delta )
    {
        if ( zoom4d )
        {
            delta = delta / 25;
            //if ( cameraDist - delta >= 1.0 )
                cameraDist = cameraDist - delta;
        }
        else
        {
            if ( g_eyeRadius >= delta )
                g_eyeRadius = g_eyeRadius - delta;
        }
    }
    
    function wheel(event)
    {
        var delta = 0;
        if (!event) event = window.event;
        if (event.wheelDelta) {
            delta = event.wheelDelta/120; 
        } else if (event.detail) {
            delta = -event.detail/3;
        }
        if (delta)
            zoom( delta * 3 );
        if (event.preventDefault)
                event.preventDefault();
        event.returnValue = false;
    }
    
    /* Initialization code. */
    if ( window.addEventListener )
        window .addEventListener( 'DOMMouseScroll', wheel, false );
    window.onmousewheel = document.onmousewheel = wheel;

    var model = {};
    var newInstances = [];
    var models = [];
    
    var stereoView = false;
    
    // pre-allocate a bunch of arrays
    var projection = new Float32Array(16);
    var view = new Float32Array(16);
    var viewProjection = new Float32Array(16);
    var rotation4d = new Float32Array(16);
    var worldViewProjection = new Float32Array(16);
    var eyePosition = new Float32Array(3);
    var target = new Float32Array(3);
    var up = new Float32Array([0,1,0]);

    function degToRad(degrees) {
        return degrees * Math.PI / 180;
    }

    var mouseDown = false;
    var lastMouseX = null;
    var lastMouseY = null;

    function handleMouseDown(event)
    {
        mouseDown = true;
        lastMouseX = event.clientX;
        lastMouseY = event.clientY;
    }

    function handleMouseUp(event)
    {
        mouseDown = false;
    }

    function handleMouseMove(event)
    {
        if (!mouseDown) {
          return;
        }
        var newX = event.clientX;
        var newY = event.clientY;
        var deltaX = newX - lastMouseX;
        var deltaY = newY - lastMouseY;

        var dx = deltaX;
        var dy = -deltaY;   // screen up is positive
        var shiftDown = event.shiftKey;
        var altKey = event.altKey;

        // Plane.XZ carries x toward z; dragging right should carry the near
        // side (+z) toward +x, hence the negations on the default drag.
        if ( shiftDown && altKey )
            m_rotationHandler.drag( -0.1 * dx, Plane.T1, -0.1 * dy, Plane.T2 );   // about the torus's core circles
        else if ( shiftDown )
            m_rotationHandler.drag( dx, Plane.XW, dy, Plane.YW );
        else if ( altKey )
            m_rotationHandler.drag( -dx, Plane.XY, -dy, Plane.ZW );
        else
            m_rotationHandler.drag( -dx, Plane.XZ, -dy, Plane.YZ );

        lastMouseX = newX
        lastMouseY = newY;
    }

    var fragmentShaderSrc;
    var vertexShaderSrc;
    var scene;

    function handleFragmentShader(src)
    {
        fragmentShaderSrc = src;
        finishLoading();
    }

    function handleVertexShader(src)
    {
        vertexShaderSrc = src;
        finishLoading();
    }

    function startLoading( modelName )
    {
        if ( modelName == "cliffordTorus" )
        {
            scene = cliffordTorus();
			//scene = Clif4d.KleinBottle();
        }
        else
        {
            var request = new XMLHttpRequest();
            request.open( "GET", "./" + modelName + ".clif4d.json" );
            request.onreadystatechange = function () {
                if (request.readyState == 4) {
                    var foo = 35;
                   handleLoadedScene( JSON.parse( request.responseText ) );
                }
            }
            request.send();
        }

        var fsrequest = new XMLHttpRequest();
        fsrequest.open( "GET", "clif4d-fragment-shader.glsl" );
        fsrequest.onreadystatechange = function () {
            if ( fsrequest.readyState == 4 ) {
                handleFragmentShader( fsrequest.responseText );
            }
        }
        fsrequest.send();

        var vsrequest = new XMLHttpRequest();
        vsrequest.open( "GET", "clif4d-vertex-shader.glsl" );
        vsrequest.onreadystatechange = function () {
            if (vsrequest.readyState == 4) {
                handleVertexShader( vsrequest.responseText );
            }
        }
        vsrequest.send();
    }

    function handleLoadedScene( loadedScene )
    {
        scene = loadedScene;
        finishLoading();
    }

    function finishLoading()
    {
        if ( vertexShaderSrc == null || fragmentShaderSrc == null || scene == null ) {
            return;
        }        

        // Create Shader Program
        scene .program = tdl.programs.loadProgram( vertexShaderSrc, fragmentShaderSrc );

		if ( ! scene .background )
		{
            scene .background = [ 0.9, 0.9, 0.9 ];
		}
		
        scene .uniforms = {
            worldViewProjection: worldViewProjection,
            rotation4d: rotation4d,
            cameraDist: cameraDist
        };

        var shape = scene .shape;
        var positions = new tdl.primitives.AttribBuffer( 4, shape .points .length );
        for ( var ii = 0; ii < shape .points .length; ++ii )
        {
            positions .push( shape .points[ ii ] );
        }
        var indices = new tdl.primitives.AttribBuffer( 2, shape .indices .length, 'Uint16Array' );
        for ( var ii = 0; ii < shape .indices .length; ++ii )
        {
            indices .push( shape .indices[ ii ] );
        }
        let colors = new tdl.primitives.AttribBuffer( 4, shape .points .length );
        if ( shape .colors ?.length > 0 ) {
            for ( var ii = 0; ii < shape .colors .length; ++ii )
            {
                colors .push( shape .colors[ ii ] );
            }
        } else
        {
            for ( var ii = 0; ii < shape .points .length; ++ii )
            {
                colors .push( (ii<20)? [ 0.9, 0.7, 0.7, 1 ] : [ 0.8, 0.5, 0.0, 1.0 ] );
            }
        }
        var geometry = {
            position : positions,
            indices : indices,
            color : colors,
        };
    
        scene .model = new tdl.models.Model( scene .program, geometry, null, gl.LINES );
    }
  
    function modelIsReady()
    {
        return scene && scene .model;
    }

    function render()
    {
        renderView( -1 );
        if ( stereoView )
            renderView( 1 );
    }

    function renderView( eye )
    {
        var m4 = fast.matrix4;
        
        var borderPercent = 0.027;
        var width  = Math.floor( canvas.width  * ( ( 1 - 3 * borderPercent ) / 2 ) );
        var eyeOffset = ( eye + 1 ) / 2;
        var border = canvas.width * borderPercent;
        var left   = Math.floor( border * (eyeOffset + 1 ) + width * eyeOffset );
        var height = Math.floor( canvas.height * 0.9 );
        var bottom = Math.floor( canvas.height * 0.05 );
        var aspectRatio = canvas.clientWidth / canvas.clientHeight;
        
        if ( stereoView )
        {
            aspectRatio = 0.52 * aspectRatio;
            gl.viewport( left, bottom, width, height );
            gl.scissor( left, bottom, width, height );
            gl.enable( gl.SCISSOR_TEST );
        }
        
        // clear the screen.
        gl.colorMask(true, true, true, true);
        gl.depthMask(true);
        gl.clearColor( scene .background[0], scene .background[1], scene .background[2], 0);
        gl.clearDepth(1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
        
        gl.enable(gl.CULL_FACE);
        gl.enable(gl.DEPTH_TEST);
        
        // Compute a projection and view matrices.
        m4.perspective( projection, math .degToRad( 20 ), aspectRatio, 1, 5000 );
        
        eyePosition = [ 0, 0, g_eyeRadius];
        if ( stereoView )
        {
            eyePosition = [ eye * g_eyeRadius * 0.03, 0, g_eyeRadius];
            target = [ 0, 0, g_eyeRadius * 0.2 ];
        }
        
        m4 .lookAt( view, eyePosition, target, up );
        m4 .mul( viewProjection, view, projection );
        
        // Setup uniforms.
        scene.uniforms.worldViewProjection = viewProjection;
        // Torus and model share one shape here, so the model matrix drives both.
        scene.uniforms.rotation4d = m_rotationHandler.getModelMatrix();
        scene.uniforms.cameraDist = cameraDist;
        for( var uniform in scene.uniforms ) 
            scene.program.setUniform( uniform, scene.uniforms[uniform] );

        scene .model .drawPrep();
        scene .model .draw();

        // Set the alpha to 255.
        gl .colorMask( false, false, false, true );
        gl .clearColor( 0, 0, 0, 1 );
        gl .clear( gl.COLOR_BUFFER_BIT );
    }

    return {
        modelReady   : modelIsReady,
        startLoading : startLoading,
        render       : render
    };
}

function initialize()
{
    math = tdl.math;
    fast = tdl.fast;
    canvas = document.getElementById( "modelView" );
    var modelName = canvas.dataset.fourDModel;

    var fpsTimer = new tdl.fps.FPSTimer();
    var fpsElem = document.getElementById( "fps" );
    
    gl = tdl.webgl.setupWebGL( canvas );
    if (!gl) {
        return false;
    }
    
    var app = CreateApp();
    var then = (new Date()).getTime() * 0.001;

    function render()
    {
        tdl.webgl.requestAnimationFrame( render, canvas );
                
        if ( ! app .modelReady() )
            return;

        if( !document.hasFocus() )
            return;

        // Compute the elapsed time since the last rendered frame
        // in seconds.
        var now = (new Date()).getTime() * 0.001;
        var elapsedTime = now - then;
        then = now;
        
        // Update the FPS timer.
        fpsTimer.update(elapsedTime);
        fpsElem.innerHTML = fpsTimer.averageFPS;
        
        app .render();
    }

    app .startLoading( modelName );
    render();
    return true;
}
