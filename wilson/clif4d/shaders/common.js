export const commonGlsl = /* glsl */ `
//
// View Helpers
// http://jamie-wong.com/2016/07/15/ray-marching-signed-distance-functions/
// 
//

/**
 * Return the normalized direction to march in from the eye point for a single pixel.
 * 
 * fieldOfView: vertical field of view in degrees
 * size: resolution of the output image
 * fragCoord: the x,y coordinate of the pixel in the output image
 */
vec3 rayDirection(float fieldOfView, vec2 size, vec2 fragCoord) {
    vec2 xy = fragCoord - size / 2.0;
    float z = size.y / tan(radians(fieldOfView) / 2.0);
    return normalize(vec3(xy, -z));
}

/**
 * Return a transform matrix that will transform a ray from view space
 * to world coordinates, given the eye point, the camera target, and an up vector.
 *
 * This assumes that the center of the camera is aligned with the negative z axis in
 * view space when calculating the ray marching direction. See rayDirection.
 */
mat3 viewMatrix(vec3 eye, vec3 center, vec3 up) {
    // Based on gluLookAt man page
    vec3 f = normalize(center - eye);
    vec3 s = normalize(cross(f, up));
    vec3 u = cross(s, f);
    return mat3(s, u, -f);
}

//
// CSG Helpers
// http://jamie-wong.com/2016/07/15/ray-marching-signed-distance-functions/
//

/**
 * Constructive solid geometry intersection operation on SDF-calculated distances.
 */
float intersectSDF(float distA, float distB) {
    return max(distA, distB);
}

/**
 * Constructive solid geometry union operation on SDF-calculated distances.
 */
float unionSDF(float distA, float distB) {
    return min(distA, distB);
}

/**
 * Constructive solid geometry difference operation on SDF-calculated distances.
 */
float differenceSDF(float distA, float distB) {
    return max(distA, -distB);
}

//
// Color functions
//

#define pi 3.14159265359
#define twopi 6.28318530718
#define e_ 2.71828182846

// From https://www.shadertoy.com/view/ldtGDn
vec3 hsv2rgb (vec3 hsv) 
{ 
    // from HSV to RGB color vector
	hsv.yz = clamp (hsv.yz, 0.0, 1.0);
	return hsv.z*(0.63*hsv.y*(cos(twopi*(hsv.x + vec3(0.0, 2.0/3.0, 1.0/3.0))) - 1.0) + 1.0);
}

//
// Functions for working with hyperbolic geometry.
//

// Convert from a euclidean value in the UHS model to a hyperbolic dist 
float UHStoH( float e )
{
	// Zero is at e = 1.
    return log( e ); 
}

float HtoUHS( float h )
{
 	return pow( e_, h );    
}

//
// Misc
//

vec2 Rotate2(in vec2 p, in float t) {
  return p * cos(-t) + vec2(p.y, -p.x) * sin(-t);
}

mat3 rotateX(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(1, 0, 0),
        vec3(0, c, -s),
        vec3(0, s, c)
    );
}

mat3 rotateY(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, 0, s),
        vec3(0, 1, 0),
        vec3(-s, 0, c)
    );
}

mat3 rotateZ(float theta) {
    float c = cos(theta);
    float s = sin(theta);
    return mat3(
        vec3(c, -s, 0),
        vec3(s, c, 0),
        vec3(0, 0, 1)
    );
}

vec4 R3toS3( vec3 p )
{
    //if( Infinity.IsInfinite( p ) )
    //    return new Vector3D( 0, 0, 0, 1 );

    float dotVal = dot( p, p );
    return vec4(
        2. * p.x / ( dotVal + 1. ),
        2. * p.y / ( dotVal + 1. ),
        2. * p.z / ( dotVal + 1. ),
        ( dotVal - 1. ) / ( dotVal + 1. ) );
}

vec3 S3toR3( vec4 p )
{
    float w = p.w;
    //if( Tolerance.Equal( w, 1 ) )
    //    return Vector3D.DneVector();

    return vec3(
        p.x / ( 1. - w ),
        p.y / ( 1. - w ),
        p.z / ( 1. - w ) );
}

// 4D -> 3D projection.
vec3 ProjectTo3D( vec4 p, float cameraDist )
{
    float denominator = cameraDist - p.w;
    //if( Tolerance.Zero( denominator ) )
    //    denominator = 0;

    // Make points with a negative denominator invalid.
    if( denominator < 0. )
        denominator = 0.;

    vec3 result = vec3( 
        p.x * cameraDist / denominator,
        p.y * cameraDist / denominator,
        p.z * cameraDist / denominator );
    return result;
}

/// Returns a matrix which will rotate in a coordinate plane by an angle in radians.
/// WebGL1 forbids dynamic matrix indexing, so we enumerate all valid (c1,c2) pairs.
mat4 MatrixToRotateinCoordinatePlane( float angle, int c1, int c2 )
{
    float c = cos( angle );
    float s = sin( angle );
    mat4 result = mat4( 1.0 );
    if      ( c1 == 0 && c2 == 1 ) { result[0][0]=c; result[0][1]=-s; result[1][0]=s; result[1][1]=c; }
    else if ( c1 == 0 && c2 == 2 ) { result[0][0]=c; result[0][2]=-s; result[2][0]=s; result[2][2]=c; }
    else if ( c1 == 0 && c2 == 3 ) { result[0][0]=c; result[0][3]=-s; result[3][0]=s; result[3][3]=c; }
    else if ( c1 == 1 && c2 == 2 ) { result[1][1]=c; result[1][2]=-s; result[2][1]=s; result[2][2]=c; }
    else if ( c1 == 1 && c2 == 3 ) { result[1][1]=c; result[1][3]=-s; result[3][1]=s; result[3][3]=c; }
    else if ( c1 == 2 && c2 == 3 ) { result[2][2]=c; result[2][3]=-s; result[3][2]=s; result[3][3]=c; }
    return result;
}


/// <summary>
/// Barycentric coords to Cartesian
/// http://stackoverflow.com/questions/11262391/from-barycentric-to-cartesian
/// </summary>
vec4 BaryToCartesian( vec4 t1, vec4 t2, vec4 t3, vec3 bary )
{
    return bary.x * t1 + bary.y * t2 + bary.z * t3;
}

void CircleFrom3Points( vec4 v1, vec4 v2, vec4 v3, 
	out vec4 center, out float radius )
{
    // Circumcenter/Circumradius of triangle (circle from 3 points)
    // http://mathworld.wolfram.com/Circumcenter.html
    // http://mathworld.wolfram.com/Circumradius.html
    // http://mathworld.wolfram.com/BarycentricCoordinates.html

    // side lengths and their squares
    float a = length( v3 - v2 );	// Opposite v1
    float b = length( v1 - v3 );	// Opposite v2
    float c = length( v2 - v1 );	// Opposite v3
    float a2 = a * a;
    float b2 = b * b;
    float c2 = c * c;

    vec3 circumCenterBary = vec3(
        a2 * ( b2 + c2 - a2 ),
        b2 * ( c2 + a2 - b2 ),
        c2 * ( a2 + b2 - c2 ) );
    circumCenterBary /= (circumCenterBary.x + circumCenterBary.y + circumCenterBary.z);	// Normalize.
    center = BaryToCartesian( v1, v2, v3, circumCenterBary );

    float s = (a + b + c) / 2.; // semiperimeter
    radius = a * b * c / ( 4. * sqrt( s * ( a + b - s ) * ( a + c - s ) * ( b + c - s ) ) );
}

void Mod( inout float f, float size )
{
	f = mod( f + size*0.5, size ) - size*0.5;
}

// Repeat a square grid in two dimensions
void Mod2D( inout vec2 p, vec2 size ) 
{
	p = mod( p + size*0.5, size ) - size*0.5;
}

// Used to make a spherical grid in two dimensions
// One pole is at the origin and the other at infinity.
void Mod2DPolar( inout vec2 p, vec2 size )
{
	float phase = atan( p.y, p.x );
    float modulus = UHStoH( length( p ) );
    Mod( phase, size.y );
    Mod( modulus, size.x );
    //modulus = HtoUHS( modulus );
    //p = vec2( modulus*sin(phase), modulus*cos(phase) );
    p = vec2( modulus, phase );
}

float Smoothed( float f, float maximum )
{
    return (maximum / 2.0) * (-cos( pi * f ) + 1.);
}

//
// Complex number operations
//

vec2 C_Conj( vec2 c )
{
	return vec2( c.x, -c.y );
}

vec2 C_Mult( vec2 a, vec2 b )
{
	return vec2( a.x * b.x - a.y * b.y, a.y * b.x + a.x * b.y );
}

float C_MagSquared( vec2 c )
{
	return c.x * c.x + c.y * c.y;
}

vec2 C_Div( vec2 a, vec2 b )
{
	return C_Mult( a, C_Conj( b ) ) / C_MagSquared( b );
}

vec2 C_Inv( vec2 c )
{
	return C_Conj( c ) / C_MagSquared( c );
}

// https://math.stackexchange.com/a/44410/300001
vec2 C_Sqrt( vec2 c )
{
    float r2 = C_MagSquared( c );
    float sqrtR = sqrt( sqrt( r2 ) );
    float theta = atan( c.y, c.x );
	return vec2( cos( theta / 2. ), sin( theta / 2. ) ) * sqrtR;
}

//
// Quaternion operations
//

float Q_MagSquared( vec4 q )
{
	return dot( q, q );
}

vec4 Q_Mult( vec4 a, vec4 b )
{
    return vec4(
        a.x*b.x - a.y*b.y - a.z*b.z - a.w*b.w,
        a.x*b.y + a.y*b.x + a.z*b.w - a.w*b.z,
        a.x*b.z - a.y*b.w + a.z*b.x + a.w*b.y,
        a.x*b.w + a.y*b.z - a.z*b.y + a.w*b.x );
}

vec4 Q_Div( vec4 a, vec4 b )
{
    float magSquared = Q_MagSquared( b );
    vec4 bInv = vec4( b.x / magSquared, -b.y / magSquared, -b.z / magSquared, -b.w / magSquared );
    return Q_Mult( a, bInv );
}
			

//
// Mobius transformations
//

struct Mobius
{
	vec2 A;
	vec2 B;
	vec2 C;
	vec2 D;
};

Mobius M_Isometry( /*Geometry g,*/ float angle, vec2 P )
{
    // As Don notes in the hypebolic case:
    // Any isometry of the Poincare disk can be expressed as a complex function of z of the form:
    // (T*z + P)/(1 + conj(P)*T*z), where T and P are complex numbers, |P| < 1 and |T| = 1.
    // This indicates a rotation by T around the origin followed by moving the origin to P (and -P to the origin).
    // 
    // I figured out that the other cases can be handled with simple variations of the C coefficients.
    vec2 T = vec2( cos( angle ), sin( angle ) );
    
    Mobius result;
    result.A = T;
    result.B = P;
    result.D = vec2( 1, 0 );

    /*switch( g )
    {
        case Geometry.Spherical:
        {*/
            result.C = C_Mult( C_Mult( C_Conj( P ), T ), vec2( -1, 0 ) );
            /*break;
        }
        case Geometry.Euclidean:
        {
            C = 0;
            break;
        }
        case Geometry.Hyperbolic:
        {
            C = Complex.Conjugate( P ) * T;
            break;
        }
    }*/
    
 	return result;
}

    
Mobius M_Elliptic()
{
    Mobius result;
    /*
    // To the origin.
    Mobius origin = new Mobius();
    origin.Isometry( g, 0, fixedPlus * -1 );

    // Rotate.
    Mobius rotate = new Mobius();
    rotate.Isometry( g, angle, new Complex() );

    // Conjugate.
    this = origin.Inverse() * rotate * origin;
	*/
    return result;
}
    
Mobius M_Scale( in Mobius m, vec2 s )
{
	Mobius result;
	result.A = C_Mult( m.A, s );
	result.B = C_Mult( m.B, s );
	result.C = C_Mult( m.C, s );
	result.D = C_Mult( m.D, s );
	return result;
}

Mobius M_Normalize( in Mobius m )
{
	// See Visual Complex Analysis, p150
	vec2 k = C_Inv( C_Sqrt( m.A * m.D - m.B * m.C ) );
	return M_Scale( m, k );
}

Mobius M_Mult( in Mobius a, in Mobius b )
{
	Mobius result;
	result.A = C_Mult( a.A, b.A ) + C_Mult( a.B, b.C );
	result.B = C_Mult( a.A, b.B ) + C_Mult( a.B, b.D );
	result.C = C_Mult( a.C, b.A ) + C_Mult( a.D, b.C );
	result.D = C_Mult( a.C, b.B ) + C_Mult( a.D, b.D );
	return M_Normalize( result );
}

vec2 M_Apply( in Mobius m, in vec2 z )
{
	return C_Div( C_Mult( m.A, z ) + m.B, C_Mult( m.C, z ) + m.D );
}

// Apply to a quaternion.
vec4 M_Apply( in Mobius m, in vec4 q )
{
    vec4 a = vec4( m.A, 0., 0. );
    vec4 b = vec4( m.B, 0., 0. );
    vec4 c = vec4( m.C, 0., 0. );
    vec4 d = vec4( m.D, 0., 0. );
	return Q_Div( Q_Mult( a, q ) + b, Q_Mult( c, q ) + d ); 
}
`;
