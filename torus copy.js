var Clif4d = Clif4d || {};

Clif4d.CliffordTorus = function()
{
    scene = {};
    scene.shape = {};
    scene.shape.points = [];
    scene.shape.indices = [];
    
    function oneTorus( n, orientation, shape )
    {
        var n1 = orientation? n : n*6
        var n2 = orientation? n*6 : n
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
                shape.points.push([r1 * Math.cos(angle1), r1 * Math.sin(angle1), r2 * Math.cos(angle2), r2 * Math.sin(angle2)]);
                if( orientation )
                {
                    if (j > 0)
                        shape.indices.push([i * n1 + j - 1, i * n1 + j]);
                    else
                        shape.indices.push([i * n1, i * n1 + n2 - 1]);
                }
                else
                {
                    if (i > 0)
                        shape.indices.push([(i - 1) * n1 + j, i * n1 + j]);
                    else
                        shape.indices.push([j, (n2 - 1) * n1 + j]);
                }
                angle2 = angle2 + angleInc2;
            }
            angle1 = angle1 + angleInc1;
        }
    }
    
    oneTorus( 50, 0, scene.shape )
    oneTorus( 50, 1, scene.shape )

    return scene;
}