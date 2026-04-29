package research;

import com.slightlyloony.jsisyphus.ATrack;
import com.slightlyloony.jsisyphus.Point;

import java.io.IOException;

/**
 * Created by IntelliJ IDEA.
 * User: mark
 * Date: 2/28/18
 * Time: 8:44 AM
 */
public class Fruit extends ATrack {
    double eraseSpace=0.0125;

    public Fruit() throws Exception {
        super("");

        trace();
    }

    protected void trace() throws IOException {
        drawSphere(0, 0, .65, 0, -.1, true, false);

        double grapeSize=.06;

        double grapeShift=1;

        drawSphere(0, 0, grapeSize, -.34+grapeShift, -.18, false, false);
        drawSphere(0, 0, grapeSize, -.4+grapeShift, -.1, false, false);
        drawSphere(0, 0, grapeSize, -.5+grapeShift, -.1, false, false);
//        drawSphereTest(0, 0, grapeSize, .48, .01, false, false);
//        drawSphereTest(0, 0, grapeSize, .51, .07, false, false);
        drawSphere(0, 0, grapeSize, -.6+grapeShift, 0, false, false);
        drawSphere(0, 0, grapeSize, -.57+grapeShift, -.12, false, false);

        go(Point.fromXY(-.675+grapeShift, -.038));
        go(Point.fromXY(-.77+grapeShift, .06));
        go(Point.fromXY(-.675+grapeShift, -.038));

        drawSphere(0, 0, grapeSize, -.68+grapeShift, -.08, false, false);
        drawSphere(0, 0, grapeSize, -.69+grapeShift, -.2, false, false);
        drawSphere(0, 0, grapeSize, -.77+grapeShift, -.17, false, false);
        drawSphere(0, 0, grapeSize, -.78+grapeShift, -.29, false, false);
        drawSphere(0, 0, grapeSize, -.67+grapeShift, -.32, false, false);
        drawSphere(0, 0, grapeSize, -.6+grapeShift, -.22, false, false);
        drawSphere(0, 0, grapeSize, -.56+grapeShift, -.34, false, false);
        drawSphere(0, 0, grapeSize, -.45+grapeShift, -.35, false, false);
        drawSphere(0, 0, grapeSize, -.51+grapeShift, -.27, false, false);
        drawSphere(0, 0, grapeSize, -.47+grapeShift, -.19, false, false);
        drawSphere(0, 0, grapeSize, -.39+grapeShift, -.25, false, false);
        drawSphere(0, 0, grapeSize, -.35+grapeShift, -.355, false, false);
        drawSphere(0, 0, grapeSize, -.29+grapeShift, -.26, false, false);
        drawSphere(0, 0, grapeSize, -.24+grapeShift, -.36, false, false);

        drawSphere(0, 0, .2, -.1, -.3, false, false);

    //    drawSphere(0, 0, .2, -.1, 0, false, true);

        dc.renderPNG( "c:\\users\\mark\\desktop\\fill.png" );
        dc.write( "c:\\users\\mark\\desktop\\fill.thr" );

        Runtime.getRuntime().exec("cmd /C start c:\\users\\mark\\desktop\\fill.png");
    }

    private void drawSphereTest(double xRot, double yRot, double size, double xShift, double yShift, boolean isBowl, boolean isBread) {
        drawSphere(xRot, yRot, size, xShift, yShift, isBowl, isBread);
        drawSphere(xRot-.2, yRot, size, xShift, yShift, isBowl, isBread);
        drawSphere(xRot, yRot, size, xShift, yShift, isBowl, isBread);
        drawSphere(xRot, yRot, size, xShift, yShift, isBowl, isBread);
        drawSphere(xRot, yRot, size, xShift, yShift, isBowl, isBread);
    }

    private void drawSphere(double xRot, double yRot, double size, double xShift, double yShift, boolean isBowl, boolean isBread){
        Point3D p = new Point3D(0, -size, 0);

        while (xRot<Math.PI/(isBowl ? 3 : 1)){
            Point3D p2 = rotX(p, xRot);
            p2 = rotY(p2, yRot);
            p2 = rotX(p2, -.4);

            Point point = Point.fromXY((isBowl ? 1.2 : 1)*p2.x/2*(p2.z+2), (isBread ? 4 : 1)*p2.y/2*(p2.z+2));

            if (isBread){
                Point3D temp = rotZ(new Point3D(point.x, point. y, 0), -.6);

                point=Point.fromXY(temp.x, temp.y);
            }

            point=Point.fromXY(point.x+xShift, point.y+yShift);

            go(point);

            xRot+=0.0000225/size;
            yRot+=.01;
        }
    }

    private double in(double x, double y){
        double r=1;

        return Math.sqrt(r*r-x*x-y*y);
    }

    private void go(Point point){
        dc.lineTo(dc.getCurrentRelativePosition().vectorTo(point));
    }

    class Point3D{
        public double x, y, z;

        public Point3D(double x, double y, double z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }
    }

    private Point3D rotX(Point3D p, double deg){
        return new Point3D(p.x, p.y*Math.cos(deg)-p.z*Math.sin(deg), p.y*Math.sin(deg) + p.z*Math.cos(deg));
    }

    private Point3D rotY(Point3D p, double deg){
        return new Point3D(p.x*Math.cos(deg) + p.z*Math.sin(deg), p.y, -p.x*Math.sin(deg)+p.z*Math.cos(deg));
    }

    private Point3D rotZ(Point3D p, double deg){
        return new Point3D(p.x * Math.cos(deg) - p.y * Math.sin(deg), p.x * Math.sin(deg) + p.y * Math.cos(deg), p.z);
    }

    public static void main(String args[]) throws Exception {
        Fruit me = new Fruit();
    }
}