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

        pointLight.castShadow = true;
        pointLight.shadow.mapSize.width = 512; // default
        pointLight.shadow.mapSize.height = 512; // default
        pointLight.shadow.camera.near = 0.5; // default
        pointLight.shadow.camera.far = 500; // default        

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
        class ScaleFactor {
            public factor: number = null!;
            public unit: string = null!;
            public singularSuffix?: string;
            public pluralSuffix?: string;
        }

        // Yes, I know about Humanizr, but they don't have this format...
        let scaleFactors: ScaleFactor[] = [
            { factor: 60, unit: "minute" },
            { factor: 60, unit: "hour" },
            { factor: 24, unit: "day" },
            { factor: 365, unit: "year" },
            { factor: 10, unit: "decade" },
            { factor: 10, unit: "centur", singularSuffix: "y", pluralSuffix: "ies" }
        ];

        let sign = totalSeconds < 0 ? "-" : "";
        let retTime = Math.abs(totalSeconds);
        let retUnit = "second";
        let singularSuffix = "";
        let pluralSuffix = "s";

        const checkScale = (scale: ScaleFactor): boolean => {
            if (retTime > scale.factor) {
                retTime /= scale.factor;
                retUnit = scale.unit;
                singularSuffix = scale.singularSuffix ?? singularSuffix;
                pluralSuffix = scale.pluralSuffix ?? pluralSuffix;
                return true;
            }
            return false;
        }

        for (const nextFactor of scaleFactors) {
            if (!checkScale(nextFactor)) {
                break;
            }
        }

        return `${retTime.toFixed(3)} ${retUnit}${(Utils.FloatEQ(retTime, 1, 0.0005)) ? singularSuffix : pluralSuffix}`;
    }

    public static async downloadFileFromStream(fileName: string, contentStreamReference: any) {
        const arrayBuffer = await contentStreamReference.arrayBuffer();
        const blob = new Blob([arrayBuffer]);
        Utils.downloadFileFromBlob(fileName, arrayBuffer);
    }

    public static async downloadFileFromBlob(fileName: string, blob: Blob) {
        const url = URL.createObjectURL(blob);
        const anchorElement = document.createElement('a');
        anchorElement.href = url;
        anchorElement.download = fileName ?? '';
        anchorElement.click();
        anchorElement.remove();
        URL.revokeObjectURL(url);
    }

    /**
     * Tests if value1 and value2 are exactly the same float value, or if either is Infinite or Nan, then if they are
     * both the same Infinite or Nan value.
     */
    private static SimpleFloatEQ(value1: number, value2: number): boolean {
        if (typeof value1 !== 'number' || typeof value2 !== 'number') {
            return false;
        }

        if (!Number.isFinite(value1) || !Number.isFinite(value2)) {
            return value1 === value2;
        }

        return false;
    }

    /**
     * Return an appropriate divisor for the FloatXX methods.  The divisor will always be positive.
     */
    public static FloatEQDivisor(value1: number, value2: number): number {
        // Handle zero to avoid division by zero
        let divisor = Math.max(value1, value2);
        if (divisor === 0) {
            divisor = Math.min(value1, value2);
        }

        return divisor < 0 ? -divisor : divisor;
    }

    // From the .Net Single docs: https://learn.microsoft.com/en-us/dotnet/api/system.single?view=net-6.0
    // Single.Epsilon is sometimes used as an absolute measure of the distance between two Single values when
    // testing for equality. However, Single.Epsilon measures the smallest possible value that can be added to, or
    // subtracted from, a Single whose value is zero. For most positive and negative Single values, the value of
    // Single.Epsilon is too small to be detected. Therefore, except for values that are zero, we do not recommend
    // its use in tests for equality.
    public static FloatingPointEqualityEpsilon = Number.EPSILON * 100;

    public static FloatEQ(value1: number, value2: number, epsilon = Utils.FloatingPointEqualityEpsilon): boolean {
        if (Utils.SimpleFloatEQ(value1, value2)) {
            return true;
        }

        const divisor = Utils.FloatEQDivisor(value1, value2);

        return Math.abs(value1 - value2) / divisor <= epsilon;
    }

    public static FloatNE(value1: number, value2: number, epsilon = Utils.FloatingPointEqualityEpsilon): boolean {
        return !Utils.FloatEQ(value1, value2, epsilon);
    }

    public static FloatLT(value1: number, value2: number, epsilon = Utils.FloatingPointEqualityEpsilon): boolean {
        if (Utils.SimpleFloatEQ(value1, value2)) {
            return false;
        }

        const divisor = Utils.FloatEQDivisor(value1, value2);

        return (value1 - value2) / divisor < -epsilon;
    }

    public static FloatGT(value1: number, value2: number, epsilon = Utils.FloatingPointEqualityEpsilon): boolean {
        if (Utils.SimpleFloatEQ(value1, value2)) {
            return false;
        }

        const divisor = Utils.FloatEQDivisor(value1, value2);


        return (value1 - value2) / divisor > epsilon;
    }


    public static FloatLE(value1: number, value2: number, epsilon = Utils.FloatingPointEqualityEpsilon): boolean {
        return Utils.SimpleFloatEQ(value1, value2) || Utils.FloatLT(value1, value2, -epsilon);
    }

    public static FloatGE(value1: number, value2: number, epsilon = Utils.FloatingPointEqualityEpsilon): boolean {
        return Utils.SimpleFloatEQ(value1, value2) || Utils.FloatGT(value1, value2, -epsilon);
    }
}