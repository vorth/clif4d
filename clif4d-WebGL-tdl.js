tdl.require('tdl.buffers');
tdl.require('tdl.fast');
tdl.require('tdl.fps');
tdl.require('tdl.log');
tdl.require('tdl.math');
tdl.require('tdl.models');
tdl.require('tdl.primitives');
tdl.require('tdl.programs');
tdl.require('tdl.webgl');
window.onload = initialize;

// globals
var gl;                   // the gl context.
var canvas;               // the canvas
var math;                 // the math lib.
var fast;                 // the fast math lib.

var g_eyeSpeed          = 0.4;
var g_eyeHeight         = 2;
var g_eyeRadius         = 3;

function CreateApp()
{
    window.addEventListener('keypress', handleKeyPress, false);
        canvas.onmousedown = handleMouseDown;
        document.onmouseup = handleMouseUp;
        document.onmousemove = handleMouseMove;

    function handleKeyPress(event)
    {}
    

    var cameraDist = 4.236;

    function zoom( delta )
    {
//         if ( g_eyeRadius >= delta )
//             g_eyeRadius = g_eyeRadius - delta;
        if ( cameraDist - delta >= 1.0 )
        {
            cameraDist = cameraDist - delta;
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
    var worldRotation = new Float32Array(16);
    var viewProjection = new Float32Array(16);
    var fourDRotation = new Float32Array(16);
    var worldViewProjection = new Float32Array(16);
    var viewInverse = new Float32Array(16);
    var viewProjectionInverse = new Float32Array(16);
    var mouseRotationInverse = new Float32Array(16);
    var eyePosition = new Float32Array(3);
    var target = new Float32Array(3);
    var up = new Float32Array([0,1,0]);
    var lightWorldPos = new Float32Array(3);
    var v3t0 = new Float32Array(3);
    var v3t1 = new Float32Array(3);
    var v3t2 = new Float32Array(3);
    var v3t3 = new Float32Array(3);
    var m4t0 = new Float32Array(16);
    var m4t1 = new Float32Array(16);
    var m4t2 = new Float32Array(16);
    var m4t3 = new Float32Array(16);
    var zero4 = new Float32Array(4);
    var one4 = new Float32Array([1,1,1,1]);

    function degToRad(degrees) {
        return degrees * Math.PI / 180;
    }

    var mouseDown = false;
    var lastMouseX = null;
    var lastMouseY = null;
    
    var mouseRotationMatrix = mat4.create();
    mat4.identity(mouseRotationMatrix);

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
        var newRotationMatrix = mat4.create();
        mat4.identity(newRotationMatrix);
        mat4.rotate(newRotationMatrix, degToRad(deltaX / 3), [0, 1, 0]);
        
        var deltaY = newY - lastMouseY;
        mat4.rotate(newRotationMatrix, degToRad(deltaY / 3), [-1, 0, 0]);
        
        mat4.multiply( newRotationMatrix, mouseRotationMatrix, mouseRotationMatrix );
        
//         var swapXW = mat4.create( new Float32Array([0,0,0,1,0,1,0,0,0,0,1,0,1,0,0,0]) );
//         mat4 .multiply( swapXW, mouseRotationMatrix, fourDRotation );
        
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
        var request = new XMLHttpRequest();
        request.open( "GET", modelName + ".json" );
        request.onreadystatechange = function () {
            if (request.readyState == 4) {
                var foo = 35;
               handleLoadedScene( JSON.parse( request.responseText ) );
            }
        }
        request.send();

        var fsrequest = new XMLHttpRequest();
        fsrequest .open( "GET", "clif4d-fragment-shader.glsl" );
        fsrequest .onreadystatechange = function () {
            if ( fsrequest .readyState == 4 ) {
                handleFragmentShader( fsrequest .responseText );
            }
        }
        fsrequest .send();

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
            scene .background = [ 0.6, 0.6, 0.6 ];
		}
		
        scene .uniforms = {
            worldViewProjection: worldViewProjection,
            fourDRotation: fourDRotation,
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
        var geometry = {
            position : positions,
            indices : indices,
        };
    
        var model = new tdl.models.Model( scene .program, geometry, null, gl.LINES );
    
        scene .render = function ()
        {
            for ( var uniform in scene .uniforms ) {
                scene .program .setUniform( uniform, scene .uniforms[uniform] );
            }
            model .drawPrep();
            model .draw();
            // Set the alpha to 255.
            gl .colorMask( false, false, false, true );
            gl .clearColor( 0, 0, 0, 1 );
            gl .clear( gl.COLOR_BUFFER_BIT );
        }
    }
  
    function modelIsReady()
    {
        return scene && scene .render;
    }

    function render()
    {
        renderBegin( -1 );
        scene .render();
        if ( stereoView )
        {
            renderBegin( 1 );
            scene .render();
        }
    }

  function renderBegin(eye)
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

    eyePosition = [ 0, 0, -g_eyeRadius];
    if ( stereoView )
    {
        eyePosition = [ eye * g_eyeRadius * 0.03, 0, -g_eyeRadius];
        target = [ 0, 0, -g_eyeRadius * 0.2 ];
    }

    m4 .lookAt( view, eyePosition, target, up );
    m4 .mul( viewProjection, view, projection );

    // compute shared matrices
    m4 .translation( m4t0, [0, 0, 0] );
    m4 .mul( worldRotation, m4t0, mouseRotationMatrix );
    m4 .mul( worldViewProjection, worldRotation, viewProjection );

    m4 .translation( fourDRotation, [0, 0, 0] );
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
