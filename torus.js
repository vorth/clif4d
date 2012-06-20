var Clif4d = Clif4d || {};

Clif4d.CliffordTorus = function()
{
    scene = {};
    scene.shape = {};
    scene.shape.points = [];
    scene.shape.indices = [];

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
            scene.shape.points.push([r1 * Math.cos(angle1), r1 * Math.sin(angle1), r2 * Math.cos(angle2), r2 * Math.sin(angle2)]);
//            if( j % 6 == 0 )
            {
                if (j > 0)
                    scene.shape.indices.push([i * n1 + j - 1, i * n1 + j]);
                else
                    scene.shape.indices.push([i * n1, i * n1 + n2 - 1]);
            }
//            if ( i % 6 == 0 )
            {
                if (i > 0)
                    scene.shape.indices.push([(i - 1) * n1 + j, i * n1 + j]);
                else
                    scene.shape.indices.push([j, (n2 - 1) * n1 + j]);
            }
            angle2 = angle2 + angleInc2;
        }
        angle1 = angle1 + angleInc1;
    }

    return scene;
}