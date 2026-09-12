
import { createRotationHandler4D, Plane, transpose } from "../module/rotate4d.js";

// https://observablehq.com/@vorth/clif4d-a-track-torus@386
function _1(md){return(
md`# Clif4d: A Track-Torus

The rendering below is a [Clifford torus][1], a figure that
lives in four dimensions, on the 3-sphere (in fact, cutting it into two equal halves).
You can rotate the torus using a mouse drag in several ways:

 * With no key modifiers, do a normal 3D "trackball" rotation.
 * With the shift key held down, rotate in 4D, turning the torus inside-out.
 * With the alt/option key held down, rotate around a line perpendicular to the screen when dragging
    left and right, or rotate through that axis when dragging up and down, or both together.
 * With both shift and alt/option keys held down, rotate the torus around its poles.  You can rotate around the red pole dragging up and down, and around the green pole dragging left and right, or around both at once.

Since the Clifford torus is a 4D figure, we have to project to 3D to experience it (and again to 2D for your
screen).  Here we are using a [Stereographic projection][2], which maps the 3-sphere into normal 3D space plus a
single point "at infinity".  If you use the shift-drag, you can get a sense of this when you turn
the torus inside out.  See if you can find the exact halfway point, where the torus becomes a symmetric
infinite sheet with a combined bridge+tunnel at the origin.  Can you see how it divides space (and thus the
3-sphere) into two equal halves?

[1]: https://en.wikipedia.org/wiki/Clifford_torus
[2]: https://en.wikipedia.org/wiki/Stereographic_projection
`
)}

function _rotation(s3Renderer,cliffordTorus){return(
s3Renderer( cliffordTorus )
)}

function _3(md){return(
md`
## History and Plans

This rendering was first developed by myself and Roice Nelson several years ago.
[The original version][2] is still available, and it offers more mouse controls: 3D
and 4D zoom using the scroll wheel with and without the shift key, respectively.
In this notebook, we have ported the code to [three.js][3],
and we have done some refactoring to spread it over several notebook cells.

Our original intention for Clif4d was to support 4D rotation in different applications.
The Clifford torus is a perfect "trackball control" for 4D rotations.  The idea is to perform
4D rotations of some native 4D object such as the 120-cell, by first aligning the torus to get the rotation
axes you want, then "rolling" it to rotate the object.  Hopefully we'll have a demonstration of this
usage soon!  For now, the cell below displays the general 4D rotation matrix
in use by the torus view above; do some shift-option rotations, and watch the values change.

[2]: http://vzome.com/clif4d
[3]: https://threejs.org/
`
)}

function _4(rotation){return(
rotation.elements
)}

function _5(md){return(
md`
## The Code

### s3Renderer

This function creates the canvas and WebGL renderer, given a BufferGeometry
object.  We could instantiate an s3renderer with any BufferGeometry containing
data that would satisfy our vertex shader, which is to say, any geometry
that lives on S3 (the 3-sphere).

This function is a bit long and rambling.  We intend to factor out the
event handling / rotation management to clean it up a bit and make it more
reusable.
`
)}

function _s3Renderer(THREE,vertexShaderText,fragmentShaderText,width,addXyWzSpin,applySpin,addXwYwSpin,addXzYzSpin,invalidation){return(
function( geometry, canvasWidth, aspect=8/5 ) {
  
  // Standard frame already matches this renderer: x right, y up, z toward the
  // viewer (camera on +z), w the fourth axis.
  const m_rotationHandler = createRotationHandler4D({ sensitivity: 0.012 * 0.42 });
  
  const scene = new THREE.Scene();
  scene.background = new THREE.Color( 0x888888 );

  const fov = 20;
  const near = 1;
  const far = 5000;
  const camera = new THREE.PerspectiveCamera( fov, aspect, near, far );
  camera.position.z = 12;
  scene.add(camera);

  const uniforms = {
    rotation4d: { value: new THREE.Matrix4().elements },
    cameraDist: { value: 1.0 }
  };

  const material = new THREE.RawShaderMaterial( {
    uniforms,
    vertexShader: vertexShaderText,
    fragmentShader: fragmentShaderText
  } );
  
  const mesh = new THREE.LineSegments( geometry, material );
  scene.add( mesh );

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  const renderWidth = canvasWidth || width;
  renderer.setSize(renderWidth, renderWidth/aspect);
  renderer.setPixelRatio(devicePixelRatio);
    
  const element = renderer .domElement

  // Mouse position relative to the canvas, in CSS pixels.
  const canvasPixel = (clientX, clientY) => {
    const rect = element.getBoundingClientRect()
    return [ clientX - rect.left, clientY - rect.top ]
  }

  // Screen position (CSS pixels, y down) and depth of a 4D world point,
  // mirroring the vertex shader: divide by (cameraDist - w), then the camera.
  const project = (q) => {
    const denom = Math.max( uniforms.cameraDist.value - q[3], 0.0001 )
    const p = new THREE.Vector3( q[0] / denom, q[1] / denom, q[2] / denom )
    const depth = camera.position.z - p.z          // camera looks down -z
    const ndc = p.project( camera )
    const rect = element.getBoundingClientRect()
    return [ (ndc.x + 1) / 2 * rect.width, (1 - ndc.y) / 2 * rect.height, depth ]
  }

  var mouseDown = false
  var lastMouseX = null
  var lastMouseY = null

  function handleMouseDown(event)
  {
    mouseDown = true
    lastMouseX = event.clientX
    lastMouseY = event.clientY
  }

  function handleMouseUp(event)
  {
    mouseDown = false
    m_rotationHandler.release()
  }

  function handleMouseMove(event)
  {
    if (!mouseDown) {
      return
    }
    const newX = event.clientX
    const newY = event.clientY
    const dx = newX - lastMouseX
    const dy = -( newY - lastMouseY )   // screen up is positive
    const shiftDown = event.shiftKey;
    const altKey = event.altKey;

    // Same convention as the tdl and Wilson examples.  Plane.XZ carries x toward z;
    // dragging right should carry the near side (+z) toward +x, hence the negations.
    if( shiftDown && altKey ) {
      // Surface drag: the torus point under the cursor follows it.
      const last = canvasPixel( lastMouseX, lastMouseY )
      const here = canvasPixel( newX, newY )
      if( ! m_rotationHandler.getGrab() )
        m_rotationHandler.grabNearest( last[0], last[1], project )
      m_rotationHandler.dragSurface( here[0] - last[0], here[1] - last[1], project )

      element .value = m_rotationHandler.getCoreMatrix()
      element .dispatchEvent(new CustomEvent("input"));
    }
    else if( shiftDown )
      m_rotationHandler.drag( dx, Plane.XW, dy, Plane.YW );
    else if( altKey )
      m_rotationHandler.drag( -dx, Plane.XY, -dy, Plane.ZW );
    else
      m_rotationHandler.drag( -dx, Plane.XZ, -dy, Plane.YZ );

    lastMouseX = newX
    lastMouseY = newY;
  }
  
  // element .addEventListener( 'keydown', handleKeyDown, false );
  // element .addEventListener( 'keyup', handleKeyUp, false );
  element .onmousedown = handleMouseDown;
  element .onmouseup = handleMouseUp;
  element .onmousemove = handleMouseMove;

  invalidation.then(() => ( renderer.dispose()));
  
  function animate() {
    requestAnimationFrame( animate );
    // controls .update();
    
    // rotate4d.js matrices are flat row-major; three.js uniforms want column-major.
    material.uniforms.rotation4d.value = transpose( m_rotationHandler.getModelMatrix() );
    material.uniforms.cameraDist.value = 1.0
    renderer .render( scene, camera );
  }

  animate();
  renderer .render( scene, camera );
  
  // support viewof, to let this control another S3 rendering
  renderer .domElement .value = m_rotationHandler.getCoreMatrix()
  window.clif4d = { handler: m_rotationHandler, project }   // debug handle
    
  return renderer.domElement;
}
)}

function _7(md){return(
md`
### cliffordTorus

This function defines the geometry of the Clifford torus as a set of 
line segments joining points on S3, forming approximate circles.  The points are
four-dimensional, of course.

We create a three.js BufferGeometry object, since we need to send all the
vertices, indices, and colors to the vertex shader, retaining the 4-D
character of the data.
`
)}

function _cliffordTorus(THREE)
{
  const points = [];
  const indices = [];
  const colors = [];

  var n1 = 50; // use 300 to try the curvier lines bug, and uncomment the "% 6" lines below
  var n2 = 50; // 300 here, too
  var r = 1.0;
  var r1 = 0.5;
  var r2 = r - r1;
  if (r2 < 0)
      r2 = 0;

  r1 *= Math.sqrt(2);
  r2 *= Math.sqrt(2);

  var angleInc1 = 2 * Math.PI / n1;
  var angleInc2 = 2 * Math.PI / n2;

  var angle1 = 0;
  for (var i = 0; i < n1; i++)
  {
    var angle2 = 0;
    for (var j = 0; j < n2; j++)
    {
      points.push( r1 * Math.cos(angle1), r1 * Math.sin(angle1), r2 * Math.cos(angle2), r2 * Math.sin(angle2) );
      colors.push( 0.8, 0.8, 0, 1 );
      {
        if (i > 0)
          indices.push( (i - 1) * n1 + j, i * n1 + j );
        else
          indices.push( j, (n2 - 1) * n1 + j );
      }
      angle2 = angle2 + angleInc2;
    }
    angle1 = angle1 + angleInc1;
  }

  var current = points.length / 4;

  angle1 = 0;
  for (var i = 0; i < n1; i++)
  {
    var angle2 = 0;
    for (var j = 0; j < n2; j++)
    {
      points.push( r1 * Math.cos(angle1), r1 * Math.sin(angle1), r2 * Math.cos(angle2), r2 * Math.sin(angle2) );
      colors.push( 0, 0.7, 1, 1 );
      {
        if (j > 0)
          indices.push( current + i * n1 + j - 1, current + i * n1 + j );
        else
          indices.push( current + i * n1, current + i * n1 + n2 - 1 );
      }
      angle2 = angle2 + angleInc2;
    }
    angle1 = angle1 + angleInc1;
  }

  //
  // Add in the control lines.
  // We will do this as a separate shape (when the capability is added in).
  //

  r1 = r2 = 1;
  n1 = n2 = 500;
  angleInc1 = 2 * Math.PI / n1;
  angleInc2 = 2 * Math.PI / n2;

  current = points.length / 4;

  angle1 = 0;
  for( var i=0; i<n1; i++ )
  {
    points.push( r1 * Math.cos(angle1), r1 * Math.sin(angle1), 0, 0 );
    colors.push( 0.9, 0.0, 0.0, 1.0 );
    var idx1 = i;
    var idx2 = i == n1-1 ? 0 : i+1;
    indices.push( idx1+current, idx2+current );
    angle1 = angle1 + angleInc1;
  }

  current = points.length / 4;

  angle2 = 0;
  for( var j=0; j<n2; j++ )
  {
    points.push( 0, 0, r2 * Math.cos(angle2), r2 * Math.sin(angle2) );
    colors.push( 0.0, 0.8, 0.0, 1.0 );
    var idx1 = j;
    var idx2 = j == n2-1 ? 0 : j+1;
    indices.push( idx1+current, idx2+current );
    angle2 = angle2 + angleInc2;
  }

  const geometry = new THREE.BufferGeometry();

  geometry .setIndex( indices );
  geometry .addAttribute( 'position4', new THREE.Float32BufferAttribute( points, 4 ) );
  geometry .addAttribute( 'color', new THREE.Float32BufferAttribute( colors, 4 ) );
  geometry .computeBoundingSphere();

  return geometry;
}


function _matrixRow(THREE){return(
function( m, i )
{
    const offset = 4*i
    const row = m .elements .slice( offset, offset+4 )
    return new THREE.Vector4(...row)
}
)}

function _matrixSetRow(){return(
function( m, i, v )
{
    for( var j=0; j<4; j++ )
        m .elements[ i*4 + j ] = v.getComponent(j);
}
)}

function _gramSchmidt(matrixRow,matrixSetRow){return(
function( m )
{
    const result = m;
    // Code in this function assumes row-major order of the elements
    for( var i=0; i<4; i++ )
    {
        for( var j=0; j<i; j++ )
        {
            const iVec = matrixRow( m, i )
            const jVec = matrixRow( m, j )
            const newRow = iVec .sub( jVec .multiplyScalar( iVec .dot( jVec ) ) )
            matrixSetRow( result, i, newRow )
        }

        const normalized = matrixRow( result, i ) .normalize()
        matrixSetRow( result, i, normalized )
    }

    return result;
}
)}

function _applySpin(gramSchmidt){return(
function( spinDelta, matrix )
{
  spinDelta = gramSchmidt( spinDelta )
  spinDelta .multiply( matrix )
  return gramSchmidt( spinDelta )
}
)}

function _addXyWzSpin(X,Y,W,Z){return(
function( dx, dy, spinDelta )
{
    spinDelta.elements[X*4 + Y] += dx;
    spinDelta.elements[Y*4 + X] -= dx;

    spinDelta.elements[W*4 + Z] -= dy;
    spinDelta.elements[Z*4 + W] += dy;
}
)}

function _addXwYwSpin(X,W,Y){return(
function( dx, dy, spinDelta )
{
    spinDelta.elements[X*4 + W] -= dx;
    spinDelta.elements[W*4 + X] += dx;

    spinDelta.elements[Y*4 + W] += dy;
    spinDelta.elements[W*4 + Y] -= dy;
}
)}

function _addXzYzSpin(X,Z,Y){return(
function( dx, dy, spinDelta )
{
    spinDelta.elements[X*4 + Z] += dx;
    spinDelta.elements[Z*4 + X] -= dx;

    spinDelta.elements[Y*4 + Z] -= dy;
    spinDelta.elements[Z*4 + Y] += dy;
}
)}

function _X(){return(
0
)}

function _Y(){return(
1
)}

function _Z(){return(
2
)}

function _W(){return(
3
)}

function _20(md){return(
md`
## GLSL Shaders

Normally, three.js programs use a standard shader to render 3D geometry
to your 2D screen.  Our vertex shader is a bit odd, since it first performs
some 4D rotations, then does a stereographic projection to 3D, and
finally does the usual perspective projection to screen coordinates.

Our fragment shader is completely boring.

Although it is probably unnecessary, we use a three.js RawShaderMaterial
rather than a ShaderMaterial, just to have more precise control over the shader.
Note that three.js is passing the modelViewMatrix and projectionMatrix
uniforms for us, since those are part of its standard set.

Note we are passing the 4D camera distance, though it never changes
at the moment.  If we implement the shift-scroll mechanism to change the
4D to 3D projection, it will start changing.
`
)}

function _fragmentShaderText(){return(
`
#ifdef GL_ES
precision highp float;
#endif

varying vec4 v_color;

void main()
{
    gl_FragColor = v_color;
}
`
)}

function _vertexShaderText(){return(
`
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat4 rotation4d;   // column-major upload, so M * p
uniform float cameraDist;

attribute vec4 position4;
attribute vec4 color;

varying vec4 v_color;

vec4 projectTo3d( vec4 arg )
{
    vec4 result;
    float denom = cameraDist - arg.w;
    denom = max( denom, 0.0001 );
    result.x = arg.x / denom;
    result.y = arg.y / denom;
    result.z = arg.z / denom;
    result.w = 1.0;
    return result;
}

void main()
{
    v_color = color;
    vec4 position4dWorld = rotation4d * position4;
    vec4 position3d = projectTo3d( position4dWorld );
    gl_Position = projectionMatrix * modelViewMatrix * position3d;
}
`
)}

async function _THREE(require)
{
  const THREE = window.THREE = await require("three@0.96/build/three.js");
  return THREE;
}


export default function define(runtime, observer) {
  const main = runtime.module();
  main.variable(observer()).define(["md"], _1);
  main.variable(observer("viewof rotation")).define("viewof rotation", ["s3Renderer","cliffordTorus"], _rotation);
  main.variable(observer("rotation")).define("rotation", ["Generators", "viewof rotation"], (G, _) => G.input(_));
  main.variable(observer()).define(["md"], _3);
  main.variable(observer()).define(["rotation"], _4);
  main.variable(observer()).define(["md"], _5);
  main.variable(observer("s3Renderer")).define("s3Renderer", ["THREE","vertexShaderText","fragmentShaderText","width","addXyWzSpin","applySpin","addXwYwSpin","addXzYzSpin","invalidation"], _s3Renderer);
  main.variable(observer()).define(["md"], _7);
  main.variable(observer("cliffordTorus")).define("cliffordTorus", ["THREE"], _cliffordTorus);
  main.variable(observer("matrixRow")).define("matrixRow", ["THREE"], _matrixRow);
  main.variable(observer("matrixSetRow")).define("matrixSetRow", _matrixSetRow);
  main.variable(observer("gramSchmidt")).define("gramSchmidt", ["matrixRow","matrixSetRow"], _gramSchmidt);
  main.variable(observer("applySpin")).define("applySpin", ["gramSchmidt"], _applySpin);
  main.variable(observer("addXyWzSpin")).define("addXyWzSpin", ["X","Y","W","Z"], _addXyWzSpin);
  main.variable(observer("addXwYwSpin")).define("addXwYwSpin", ["X","W","Y"], _addXwYwSpin);
  main.variable(observer("addXzYzSpin")).define("addXzYzSpin", ["X","Z","Y"], _addXzYzSpin);
  main.variable(observer("X")).define("X", _X);
  main.variable(observer("Y")).define("Y", _Y);
  main.variable(observer("Z")).define("Z", _Z);
  main.variable(observer("W")).define("W", _W);
  main.variable(observer()).define(["md"], _20);
  main.variable(observer("fragmentShaderText")).define("fragmentShaderText", _fragmentShaderText);
  main.variable(observer("vertexShaderText")).define("vertexShaderText", _vertexShaderText);
  main.variable(observer("THREE")).define("THREE", ["require"], _THREE);
  return main;
}
