
uniform mat4 worldViewProjection;
// Row-major array uploaded as-is, so it arrives transposed: use p * M.
uniform mat4 rotation4d;
uniform float cameraDist;

attribute vec4 position;
attribute vec4 color;

varying vec4 v_color;

void main()
{
    v_color = color;
    vec4 position3d = position * rotation4d;
    float denom = cameraDist - position3d.w;
    denom = max( denom, 0.0001 );
    position3d.x = position3d.x / denom;
    position3d.y = position3d.y / denom;
    position3d.z = position3d.z / denom;
    position3d.w = 1.0;
    gl_Position = worldViewProjection * position3d;
}

