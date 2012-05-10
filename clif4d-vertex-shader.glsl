
uniform mat4 worldViewProjection;
uniform mat4 fourDRotation;
uniform float cameraDist;

attribute vec4 position;

void main()
{
    vec4 position3d = fourDRotation * position;
    float denom = cameraDist - position .w;
    denom = max( denom, 0.0001 );
    position3d .x = position .x / denom;
    position3d .y = position .y / denom;
    position3d .z = position .z / denom;
    position3d .w = 1.0;
    gl_Position = worldViewProjection * position3d;
}

