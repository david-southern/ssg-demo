import * as THREE from 'three';

export const GRID_TYPE_RECTANGULAR = 'Rectangular';
export const GRID_TYPE_POLAR = 'Polar';
export const GRID_TYPE_NONE = 'None';

export class SSGSettings {
    public AmbientLightColor = "#ff00ff";
    public AmbientLightIntensity = 1;

    public OrbitalColor = "#00ffff";

    public IncludeDirectionalLight = false;
    public DirectionalLightColor = "#00ff00";
    public DirectionalLightIntensity = 0;
    public DirectionalLightPosition = "[0, 0, 0]";
    public get DirectionalLightPositionVec3(): THREE.Vector3 {
        return new THREE.Vector3(...JSON.parse(this.DirectionalLightPosition));
    }

    public FieldOfViewDegrees = 90;

    public ViewAngleXDegrees = 0;
    public ViewAngleYDegrees = 0;
    public ViewAngleZDegrees = 0;

    public Animate = false;
    public AnimationSpeed = 0;
    public AnimationTimeScale = 0;
    public AnimationTimeScaleHuman = '';

    public GridType = GRID_TYPE_NONE;
    public GridSizeFactor = 1;
    public GridMajorDivisions = 3;
    public GridMajorColor = '#00ff00';
    public GridMinorDivisions = 3;
    public GridMinorColor = '#ff0000';

    public PlanetScale = 1;
    public StarScale = 1;

    public Zoom = 1;

    public ResetOrbitControls = false;

    constructor(partialObj: Partial<SSGSettings>) {
        if (partialObj) {
            Object.assign(this, partialObj);
        }
    }
};

// Export this so I don't have to null=check things everywhere
export const EmptySettings = new SSGSettings({});