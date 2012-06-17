var Clif4d = Clif4d || {};
Clif4d.Matrix = Clif4d.Matrix || {};

Clif4d.Matrix.Zero = function()
{
    return [
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    ];
};

// NOTE: The tdl function for this is broken!
Clif4d.Matrix.GetRow = function( m, i )
{
    var r = [];
    for( var j=0; j<4; j++ )
        r[j] = m[i*4 + j];
    return r;
}

Clif4d.Matrix.SetRow = function( m, i, v )
{
    for( var j=0; j<4; j++ )
        m[i*4+j] = v[j];
}

Clif4d.Matrix.GrahamSchmidt = function( m )
{
    var result = m;
    for( var i=0; i<4; i++ )
    {
        for( var j=0; j<i; j++ )
        {
            var iVec = Clif4d.Matrix.GetRow( m, i );
            var jVec = Clif4d.Matrix.GetRow( m, j );
            iVec = tdl.math.subVector( iVec, tdl.math.mulScalarVector(
                tdl.math.dot( iVec, jVec ), jVec ) );
            Clif4d.Matrix.SetRow( result, i, iVec );
        }

        var normalized = tdl.math.normalize( Clif4d.Matrix.GetRow( result, i ) );
        Clif4d.Matrix.SetRow( result, i, normalized );
    }

    return result;
}

Clif4d.RotationHandler4D = function()
{
    this.ViewMatrix = tdl.math.matrix4.identity();

    // Access to the current view matrix.
    this.Current4dView = function()
    {
        return this.ViewMatrix;
    }

    // Handles updating our rotation matrices based on mouse dragging.
    // dx/dy are the actual displacements of the mouse.
    // the remaining parameters are booleans, and  control which type of rotation is applied.
    this.MouseDragged = function( dx, dy, xz_yz, xw_yw, xy_zw )
    {
        spinDelta = Clif4d.Matrix.Zero();

        // Sensitivity/direction.
        dx *= 0.012;
        dy *= 0.012;

        if( xz_yz )
        {
            spinDelta[0*4 + 2] += dx;
            spinDelta[2*4 + 0] -= dx;

            spinDelta[1*4 + 2] += dy;
            spinDelta[2*4 + 1] -= dy;
        }

        if( xw_yw )
        {
            spinDelta[0*4 + 3] -= dx;
            spinDelta[3*4 + 0] += dx;

            spinDelta[1*4 + 3] -= dy;
            spinDelta[3*4 + 1] += dy;
        }

        if( xy_zw )
        {
            spinDelta[0*4 + 1] += dx;
            spinDelta[1*4 + 0] -= dx;

            spinDelta[3*4 + 2] -= dy;
            spinDelta[2*4 + 3] += dy;
        }

        this.ApplySpinDelta( spinDelta );
    }
    
    this.ApplySpinDelta = function( spinDelta )
    {
        var delta = tdl.math.addVector( tdl.math.matrix4.identity(), spinDelta );
        delta = Clif4d.Matrix.GrahamSchmidt( delta );
        this.ViewMatrix = tdl.math.matrix4.mul( delta, this.ViewMatrix );
        this.ViewMatrix = Clif4d.Matrix.GrahamSchmidt( this.ViewMatrix );
    }
}