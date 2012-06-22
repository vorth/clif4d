var Clif4d = Clif4d || {};

Clif4d.CliffordTorus = function()
{
    scene = {};
    scene.shape = {};
    scene.shape.points = [];
    scene.shape.indices = [];
    scene.shape.colors = [];

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
            scene.shape.points.push( [ r1 * Math.cos(angle1), r1 * Math.sin(angle1), r2 * Math.cos(angle2), r2 * Math.sin(angle2) ] );
            scene.shape.colors.push( [ 0.0, 0.8, 0.0, 1.0 ] );
            {
                if (i > 0)
                    scene.shape.indices.push( [ (i - 1) * n1 + j, i * n1 + j ] );
                else
                    scene.shape.indices.push( [ j, (n2 - 1) * n1 + j ] );
            }
            angle2 = angle2 + angleInc2;
        }
        angle1 = angle1 + angleInc1;
    }

    var current = scene.shape.points.length;

    angle1 = 0;
    for (var i = 0; i < n1; i++)
    {
        var angle2 = 0;
        for (var j = 0; j < n2; j++)
        {
            scene.shape.points.push( [ r1 * Math.cos(angle1), r1 * Math.sin(angle1), r2 * Math.cos(angle2), r2 * Math.sin(angle2) ] );
            scene.shape.colors.push( [ 0.8, 0.0, 0.0, 1.0 ] );
            {
                if (j > 0)
                    scene.shape.indices.push( [ current + i * n1 + j - 1, current + i * n1 + j ] );
                else
                    scene.shape.indices.push( [ current + i * n1, current + i * n1 + n2 - 1 ] );
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

    current = scene.shape.points.length;

    angle1 = 0;
    for( var i=0; i<n1; i++ )
    {
        scene.shape.points.push( [ r1 * Math.cos(angle1), r1 * Math.sin(angle1), 0, 0 ] );
        scene.shape.colors.push( [ 0.4, 0, 0.8, 1 ] );
        var idx1 = i;
        var idx2 = i == n1-1 ? 0 : i+1;
        scene.shape.indices.push( [idx1+current, idx2+current] );
        angle1 = angle1 + angleInc1;
    }

    current = scene.shape.points.length;

    angle2 = 0;
    for( var j=0; j<n2; j++ )
    {
        scene.shape.points.push( [ 0, 0, r2 * Math.cos(angle2), r2 * Math.sin(angle2) ] );
        scene.shape.colors.push( [ 0, 0.4, 0.8, 1 ] );
        var idx1 = j;
        var idx2 = j == n2-1 ? 0 : j+1;
        scene.shape.indices.push( [idx1+current, idx2+current] );
        angle2 = angle2 + angleInc2;
    }

    return scene;
}