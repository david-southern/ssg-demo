import * as THREE from 'three';

export interface Vector3 {
    X: number;
    Y: number;
    Z: number;
}

export class Constants {
    public static OneAU = 1.496e11;
    public static SolarMass = 1.989e30;
    public static SolarRadius = 6.960e8;
    public static EarthMass = 5.974e24;
    public static EarthRadius = 6.378e6;

    public static AsAU = (meters: number) => meters / Constants.OneAU;
}

export class Utils {
    public static DumpVec(vec: THREE.Vector2 | THREE.Vector3): string {
        return (vec instanceof THREE.Vector2) ? `(${vec.x}, ${vec.y})` : `(${vec.x}, ${vec.y}, ${vec.z})`;
    }

    public static clampDegrees(angle: number): number {
        let retval = angle % 360;
        if (retval < 0) {
            retval += 360;
        }
        return retval;
    }

    public static setPosition(object3d: THREE.Object3D, x: number | THREE.Vector3, y?: number, z?: number) {
        if (typeof x === 'number') {
            object3d.position.x = x;
            object3d.position.y = y ?? 0;
            object3d.position.z = z ?? 0;
        } else {
            object3d.position.x = x.x;
            object3d.position.y = x.y;
            object3d.position.z = x.z;
        }
    }

    public static degreesToRadians(degrees: number) {
        return (degrees / 180) * Math.PI;
    }

    /**
     * Normalize a planetary radius with 1 = EarthRadius
     * @param rawRadius
     */
    public static normalizePlanetaryRadius(rawRadius: number): number {
        return rawRadius / Constants.EarthRadius;
    }

    /**
     * Normalize a orbital radius with 1 = One AU
     * @param rawRadius
     */
    public static normalizeOrbitalRadius(rawRadius: number): number {
        return rawRadius / Constants.OneAU;
    }

    /**
     * Normalize a planetary mass with 1 = EarthMass
     * @param rawMass
     */
    public static normalizePlanetaryMass(rawMass: number): number {
        return rawMass / Constants.EarthMass;
    }

    public static planetMaterial(color: string) {
        return new THREE.MeshLambertMaterial({ color });
    }

    public static starMaterial(color: string) {
        return new THREE.MeshBasicMaterial({ color });
        // return new THREE.MeshLambertMaterial({ emissive: color });
    }

    public static orbitalMaterial(color: string) {
        return new THREE.LineBasicMaterial({ color });
    }

    public static buildOrbitalEllipse(x: number, y: number, xRadius: number, yRadius: number): THREE.EllipseCurve {
        const startAngle = 0;
        const endAngle = 2 * Math.PI;
        const clockwiseDirection = false;

        return new THREE.EllipseCurve(x, y, xRadius, yRadius, startAngle, endAngle, clockwiseDirection, 0);
    }

    public static buildOrbitalMesh(x: number, y: number, z: number, curve: THREE.EllipseCurve, color: string) {
        const points = curve.getPoints(250);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);

        // Create the final object to add to the scene
        const ellipse = new THREE.Line(geometry, Utils.orbitalMaterial(color));
        Utils.setPosition(ellipse, x, y, z);

        return ellipse;
    }

    public static buildPlanet(x: number, y: number, z: number, radius: number, color: string) {
        const geometry = new THREE.SphereGeometry(radius, 32, 16);
        const sphere = new THREE.Mesh(geometry, Utils.planetMaterial(color));
        Utils.setPosition(sphere, x, y, z);

        return sphere;
    }

    public static buildStar(x: number, y: number, z: number, radius: number, color: string) {
        const starGroup = new THREE.Group();

        const pointLight = new THREE.PointLight(color, 1);
        starGroup.add(pointLight)

        const geometry = new THREE.SphereGeometry(radius, 32, 16);
        const sphere = new THREE.Mesh(geometry, Utils.starMaterial(color));
        Utils.setPosition(sphere, x, y, z);

        starGroup.add(sphere);

        return starGroup;
    }

    public static buildGrid(size: number, divisions: number, centerColor: string, lineColor: string) {
        const gridHelper = new THREE.GridHelper(size, divisions, centerColor, lineColor);
        gridHelper.rotation.x = Utils.degreesToRadians(90);
        gridHelper.renderOrder = -1;

        return gridHelper;
    }

    public static buildPolarGrid(radius: number, sectors: number, rings: number, divisions: number,
        color1: string, color2: string) {

        const gridHelper = new THREE.PolarGridHelper(radius, sectors, rings, divisions, color1, color2);
        gridHelper.rotation.x = Utils.degreesToRadians(90);
        gridHelper.renderOrder = -1;

        return gridHelper;
    }

    /**
     * Returns the totalSeconds as a string in the form of `3.438 days` where the units are the largest unit (up to
     * centuries) that results in a value greater than one.
     * @param totalSeconds 
     * @returns 
     */
    public static humanTime(totalSeconds: number): string {
        // Yes, I know about Humanizr, but they don't have this format...
        let scaleFactors = [
            { factor: 60, unit: "minute" },
            { factor: 60, unit: "hour" },
            { factor: 24, unit: "day" },
            { factor: 365, unit: "year" },
            { factor: 10, unit: "decade" },
            { factor: 10, unit: "century" }
        ];

        let retTime = totalSeconds;
        let retUnit = "seconds";

        const nextScale = (factor: number, newUnit: string): boolean => {
            if (retTime > factor) {
                retTime /= factor;
                retUnit = newUnit;
                return true;
            }
            return false;
        }

        for (const nextFactor of scaleFactors) {
            if (!nextScale(nextFactor.factor, nextFactor.unit)) {
                break;
            }
        }

        return `${retTime.toFixed(3)} ${retUnit}${(retTime == 1) ? '' : 's'}`;
    }

    public static  async downloadFileFromStream(fileName: string, contentStreamReference: any) {
        const arrayBuffer = await contentStreamReference.arrayBuffer();
        const blob = new Blob([arrayBuffer]);
        const url = URL.createObjectURL(blob);
        const anchorElement = document.createElement('a');
        anchorElement.href = url;
        anchorElement.download = fileName ?? '';
        anchorElement.click();
        anchorElement.remove();
        URL.revokeObjectURL(url);
    }
}