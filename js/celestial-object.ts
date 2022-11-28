import * as THREE from 'three';

export class CelestialObject {
    Name?: string;
    ParentObject?: CelestialObject;
    ParentName?: string;
    ChildDepth: number = 0;
    SystemOrder: number = 0;
    IsStar: boolean = false;
    IsSelected: boolean = false;
    ChildObjects: CelestialObject[] = [];
    OrbitalSemiMajorAxis: number = 0;
    OrbitalEccentricity: number = 0;
    // OrbitalSemiMinorAxis: number = 0;
    // OrbitalPerigee: number = 0;
    OrbitalVelocity: number = 0;
    InitialOrbitalAngle: number = 0;
    ObjectRadius: number = 0;
    OrbitalInclination: number = 0;
    PhaseAngle: number = 0;
    ObjectColor: string = null!;
    OrbitalColor: string = null!;

    RingInnerRadius?: number;
    RingWidth?: number;
    RingDensity?: number;
    RingColor?: string;


    Obj3D?: THREE.Object3D;

    constructor(partialObj: Partial<CelestialObject>) {
        if (partialObj) {
            Object.assign(this, partialObj);
            this.ChildObjects = [];

            if (partialObj.ChildObjects && partialObj.ChildObjects.length > 0) {
                for (const childPartial of partialObj.ChildObjects) {
                    const childObject = new CelestialObject(childPartial);
                    childObject.ParentObject = this;
                    this.ChildObjects.push(childObject);
                }
            }
        }
    }
}
