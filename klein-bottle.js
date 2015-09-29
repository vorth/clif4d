var Clif4d = Clif4d || {};

// https://en.wikipedia.org/wiki/Klein_bottle#4-D_non-intersecting
Clif4d.KleinBottle = function()
{
    /*//scene = {};
    scene.shape = {};
    scene.shape.points = [];
    scene.shape.indices = [];
    scene.shape.colors = [];*/

    var n1 = 50; // use 300 to try the curvier lines bug, and uncomment the "% 6" lines below
    var n2 = 50; // 300 here, too
    var r = 0.5;
	var p = 0.5;
	var e = 0.0;

	r *= Math.sqrt(2);
    p *= Math.sqrt(2);
	
    var angleInc1 = 2 * Math.PI / n1;
    var angleInc2 = 2 * Math.PI / n2;

	var current = scene.shape.points.length;
	
    var angle1 = 0;
    for (var i = 0; i < n1; i++)
    {
        var angle2 = 0;
        for (var j = 0; j < n2; j++)
        {
            scene.shape.points.push( [ 
				r * ( Math.cos(angle1/2)*Math.cos(angle2) - Math.sin(angle1/2)*Math.sin(2*angle2) ),
				r * ( Math.sin(angle1/2)*Math.cos(angle2) + Math.cos(angle1/2)*Math.sin(2*angle2) ),		
				p * Math.cos(angle1) * ( 1 + e*Math.sin(angle2) ),
				p * Math.sin(angle1) * ( 1 + e*Math.sin(angle2) ) ] );
            scene.shape.colors.push( [ 0.8, 0.0, 0.0, 1.0 ] );
            {
                if (i > 0)
                    scene.shape.indices.push( [ current + (i - 1) * n1 + j, current + i * n1 + j ] );
                else
                    scene.shape.indices.push( [ current + j, current + (n2 - 1) * n1 + (n2/2 - j) ] );	// Don't understand this...
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
            scene.shape.points.push( [ 
				r * ( Math.cos(angle1/2)*Math.cos(angle2) - Math.sin(angle1/2)*Math.sin(2*angle2) ),
				r * ( Math.sin(angle1/2)*Math.cos(angle2) + Math.cos(angle1/2)*Math.sin(2*angle2) ),		
				p * Math.cos(angle1) * ( 1 + e*Math.sin(angle2) ),
				p * Math.sin(angle1) * ( 1 + e*Math.sin(angle2) ) ] );
            scene.shape.colors.push( [ 0.8, 0.0, 0.8, 1.0 ] );
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

    return scene;
}