export const torusGlsl = /* glsl */ `
// Grid size.
float m_mod = 2.0 * pi / 25.;

// Time variables.
float m_timeFactor = 30.0;
float m_smoothedTime = 0.;

mat4 m_rotIsoclinic90;
mat4 m_rotZW;

float sphereSdf( vec3 p, float s )
{
  return length(p)-s;
}

float torusSdf( vec3 p, vec2 t )
{
    // https://iquilezles.org/articles/distfunctions
    vec2 q = vec2(length(p.xz)-t.x,p.y);
  	return length(q)-t.y;
} 

float planeSdf( vec3 p, vec4 n )
{
  // n must be normalized
  return dot(p,n.xyz) + n.w;
}

vec4 transform( vec3 p )
{
    vec4 p4 = m_rotZW * R3toS3( p );
    return p4;
}

// returns vector. first component is distance, second is hit torus.
vec2 cliffordSdf( vec3 samplePoint ) 
{  
    vec3 p = samplePoint;
    
	vec4 p4 = transform( p );
    p = S3toR3( p4 );
    
    float offset = .00001;
    
    // Clifford torus.
    float c = sqrt( 2. );
    float r = 1.0;

    float torus1 = torusSdf( p, vec2( c, r + offset ) );
    float torus2 = torusSdf( p, vec2( c, r - offset ) );  
    float torus = differenceSDF( torus1, torus2 );
    
    // Make the outside red and inside blue.
    float color = torus1 == max(torus1, -torus2) ? 1. : 0.;
    //torus = -torus2;
    
    //float plane = planeSdf( p, vec4( 0., 0., 1., 0. ) );
    
    float final = torus; 
    float sphere = sphereSdf( samplePoint, 4.0 );
    final = intersectSDF( sphere, torus );
    
    // Needed to make the raymarching work well.
    float scale = 0.15;
    return vec2( final * scale, color );
}

bool between( float f )
{
    float off = 0.*pi;
    float tol = ( pi / 2. ) * Smoothed( 2.*iTime / m_timeFactor, 1.0 ) - .02;
   // if( tol > pi / 2. )
   //     tol = pi / 2.;
    //tol = 0.;
    return f < tol || f > 2.*pi - tol;
}

float core( vec3 samplePoint, bool second )
{
    float r1 = .65;
    r1 = sqrt(2.)/2.;
    float r2 = sqrt( 1.0 - r1*r1 );
    vec4 p41 = vec4( r1, 0., r2, 0. ).zwxy;
	vec4 p42 = vec4( 0., r1, r2, 0. ).zwxy; 
	vec4 p43 = vec4( -r1, 0., r2, 0. ).zwxy;
    p41 = normalize( m_rotZW * p41 );
	p42 = normalize( m_rotZW * p42 );
	p43 = normalize( m_rotZW * p43 );
    
    vec3 p1 = S3toR3( p41 );
    vec3 p2 = S3toR3( p42 );
    vec3 p3 = S3toR3( p43 );
    
    //mat3 rot = rotateX( pi / 2. ) * rotateY( pi / 2. );
    
    
    vec4 c;
    float r;
    CircleFrom3Points( vec4( p1, 0. ), vec4( p2, 0. ), vec4( p3, 0. ), c, r );
    
    vec3 p_ = samplePoint;
    p_ = samplePoint;
 	
    vec4 p4 = transform( p_ );
    if( second )
        p4 *= m_rotIsoclinic90;
    p_ = S3toR3( p4 );
    
     //if( !second && length( p_ ) < r )
     //   return 0.;

// This distance seems like it is in the "wrong" world because of the transformations we've done.
    float result = torusSdf( p_, vec2( r, .05 ) );
    
        
    return result;
}

vec2 sceneSdf( vec3 samplePoint )
{
    vec2 clifford = cliffordSdf( samplePoint );
    float core1 = core( samplePoint, true );
    float core2 = core( samplePoint, false );
    
    float color = 0.;
    //float final = core2;
    //float final = unionSDF( core1, core2 );
    float final = unionSDF( unionSDF( clifford.x, core1 ), core2 );
    if( final == clifford.x )
        color = clifford.y;
    else if( final == core1 )
        color = 2.;
    else
        color = 3.;
    return vec2( final, color );
}

const int MAX_MARCHING_STEPS = 2500;
const float MIN_DIST = 0.0;
const float MAX_DIST = 20.0;
const float EPSILON = 0.001;
vec3 shortestDistanceToSurface( vec3 eye, vec3 marchingDirection, float start, float end, out vec2 p ) 
{
    float depth = start;
    float accum = 0.;
    float dist = 0.;
    for( int i = 0; i < MAX_MARCHING_STEPS; i++ ) 
    {
        vec3 current = eye + depth * marchingDirection;
        vec2 sdf = sceneSdf( current );
        dist = sdf.x;
        
        // Puncture the torus.
        /*vec4 p4 = transform( current );
        vec2 xy = vec2( atan( p4.x, p4.z ), atan( p4.y, p4.w ) );
        bool skip = false;
        if( sdf.y < 2. && between( length( xy ) ) )
        	skip = true;

        if( dist != sdf.x )
        {
            sdf.y = 2.;
            skip = false;
        }*/
        
        if( dist < EPSILON ) 
        {
            //if( skip )
            //    dist += 2.*EPSILON;
            //else    
            	return vec3( 1.0, depth, sdf.y );
        }

        depth += dist;
        if( depth >= end ) 
        {
            return vec3( 0., end, sdf.y );
        }
    }
    
    return vec3( 0., end, 0. );
}

vec3 estimateNormal(vec3 p) {
    return normalize(vec3(
        sceneSdf(vec3(p.x + EPSILON, p.y, p.z)).x - sceneSdf(vec3(p.x - EPSILON, p.y, p.z)).x,
        sceneSdf(vec3(p.x, p.y + EPSILON, p.z)).x - sceneSdf(vec3(p.x, p.y - EPSILON, p.z)).x,
        sceneSdf(vec3(p.x, p.y, p.z  + EPSILON)).x - sceneSdf(vec3(p.x, p.y, p.z - EPSILON)).x
    ));
}

vec3 phongContribForLight(vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 eye,
                          vec3 lightPos, vec3 lightIntensity) {
    vec3 N = estimateNormal(p);
    vec3 L = normalize(lightPos - p);
    vec3 V = normalize(eye - p);
    vec3 R = normalize(reflect(-L, N));
    
    float dotLN = dot(L, N);
    float dotRV = dot(R, V);
    
    if (dotLN < 0.0) {
        return lightIntensity * (k_d * dotLN);
        // Light not visible from this point on the surface
        return vec3(1.0, 0.0, 0.0);
    } 
    
    if (dotRV < 0.0) {
        // Light reflection in opposite direction as viewer, apply only diffuse
        // component
        return lightIntensity * (k_d * dotLN);
    }
    return lightIntensity * (k_d * dotLN + k_s * pow(dotRV, alpha));
}

vec3 phongIllumination(vec3 k_a, vec3 k_d, vec3 k_s, float alpha, vec3 p, vec3 eye) {
    const vec3 ambientLight = 0.5 * vec3(1.0, 1.0, 1.0);
    vec3 color = ambientLight * k_a;
    
    vec3 light1Pos = vec3(0.,0.,5.);
    vec3 light1Intensity = vec3(0.4, 0.4, 0.4);
    
    color += phongContribForLight(k_d, k_s, alpha, p, eye,
                                  light1Pos,
                                  light1Intensity);
    
    vec3 light2Pos = vec3(-1.,-2.,3.);
    vec3 light2Intensity = vec3(0.4, 0.4, 0.4);
    
    color += phongContribForLight(k_d, k_s, alpha, p, eye,
                                  light2Pos,
                                  light2Intensity);    
    return color;
}

vec4 image( in vec2 fragCoord, in vec2 res, in float time )
{
    // Per-frame variables
    m_smoothedTime = Smoothed( time / m_timeFactor, 1.0 );
    float angle = (pi/2.) * m_smoothedTime;
    m_rotIsoclinic90 = mat4(
        0.0,  1.0,  0.0,  0.0,   // column 0
       -1.0,  0.0,  0.0,  0.0,   // column 1
        0.0,  0.0,  0.0,  1.0,   // column 2
        0.0,  0.0, -1.0,  0.0    // column 3
    );
    m_rotZW = MatrixToRotateinCoordinatePlane( angle, 2, 3 );

    // Setup the view.
    vec3 viewDir = rayDirection(45.0, iResolution.xy, fragCoord);
    float t = iTime;
    vec3 eye = vec3(-2.,-4.,5.) * 2.1;
    eye *= rotateX( -angle );
    vec3 lookat = vec3( 0., 0., 0. );
    mat3 viewToWorld = viewMatrix(eye, lookat, vec3(0.0, 0.0, 1.0));    
    vec3 worldDir = viewToWorld * viewDir;
    
    // Raymarch.
    vec2 dummy;
    vec3 marchResults = shortestDistanceToSurface(eye, worldDir, MIN_DIST, MAX_DIST, dummy);

    // Color.
    vec3 color = vec3( 1.0, 1.0, 1.0 );
    if( marchResults.x > 0. )
    {   
        // The closest point on the surface to the eyepoint along the view ray
        vec3 p = eye + marchResults.y * worldDir;
        
    	vec4 p4 = transform( p );
        vec2 xy = vec2( atan( p4.x, p4.z ), atan( p4.w, p4.y ) );
        
		Mod2D( xy, vec2( m_mod, m_mod ) );
        float tol = 0.007;
        bool line = false;
		if( marchResults.z < 2. && 
           ( abs( xy.x ) < tol || abs( xy.y ) < tol ) )
            line = true;
        
        vec3 c = vec3( 0., 0., 0. );
        if( !line )
        {
            if( marchResults.z == 0. )
                c = vec3( 0.4, 0.8, 1.0 );
            else if( marchResults.z == 1. )
        		c = vec3( 1.,0.,0. );
            else if( marchResults.z == 2. )
                c = vec3( 0.,1.,0. );
            else
                c = vec3( 1.,1.,0. );
        }

        vec3 K_a = c;
        vec3 K_d = c;
        vec3 K_s = c;
        float shininess = 10.0;
        color = phongIllumination(K_a, K_d, K_s, shininess, p, eye);
    }
    
    return vec4( color, 1.0 );
}
`;
