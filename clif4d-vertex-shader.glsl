
uniform mat4 worldViewProjection;
uniform mat4 torusRotation;
uniform mat4 generalRotation;
uniform float cameraDist;

attribute vec4 position;

void main()
{
    vec4 position3d = position * generalRotation * torusRotation;
    float denom = cameraDist - position3d.w;
    denom = max( denom, 0.0001 );
    position3d.x = position3d.x / denom;
    position3d.y = position3d.y / denom;
    position3d.z = position3d.z / denom;
    position3d.w = 1.0;
    gl_Position = worldViewProjection * position3d;
}

