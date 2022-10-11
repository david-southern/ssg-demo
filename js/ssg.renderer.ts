import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { Scene, Vector2, Vector3 } from 'three';

import { CelestialObject } from './celestial-object';
// import { OrbitControls } from './OrbitControls';
import { Logger, SSGSystemFilter } from './ssg.logger';
import { GRID_TYPE_RECTANGULAR, GRID_TYPE_NONE, GRID_TYPE_POLAR, SSGSettings, EmptySettings } from './ssg.settings';
import { Constants, Utils } from './ssg.utils';

const DEFAULT_FOV = 70;
const DEFAULT_ASPECT = 1.61;
const DEFAULT_ORBITAL_COLOR = '#999999';

// I modeled all the planetary data in actual units, but those numbers are huge, and hard to track while debugging.
// Scale everything down to 'smallish' numbers internally.
const CoordsScale = Constants.OneAU;

class Orbiter {
    constructor(
        public threeObject: THREE.Object3D,
        public orbitCurve: THREE.EllipseCurve,
        public initialAngle: number,
        public angVelDegPerSecond: number,
    ) {
        this.currentAngle = initialAngle;
    }

    private currentAngle: number;

    public updatePosition(elapsedSeconds: number) {
        this.currentAngle += (this.angVelDegPerSecond * elapsedSeconds);
        this.currentAngle = Utils.clampDegrees(this.currentAngle);

        const objectPosition = new Vector2();
        this.orbitCurve.getPointAt(this.currentAngle / 360, objectPosition);
        Utils.setPosition(this.threeObject, objectPosition.x, objectPosition.y, 0);
    }
}

type SettingsCB = (settings: SSGSettings) => void;

class SettingsManagerImpl {
    public CurrentSettings: SSGSettings = EmptySettings;
    public PrevSettings: SSGSettings = EmptySettings;;

    private settingsCallbacks: SettingsCB[] = [];

    public publishSettings(newSettings: SSGSettings) {
        this.PrevSettings = this.CurrentSettings;
        this.CurrentSettings = newSettings;

        for (const nextCB of this.settingsCallbacks) {
            nextCB(newSettings);
        }
    }

    public subscribeSettings = (settingsCB: SettingsCB) => {
        if (settingsCB) {
            this.settingsCallbacks.push(settingsCB);
        }
    };

    public clearSettingsSubscriptions = () => {
        this.settingsCallbacks = [];
    }
};

const SettingsManager = new SettingsManagerImpl();

export class SSGRenderer {
    // private ssgSettings: SSGSettings = null!;

    private canvasElement: HTMLElement = null!;
    private systemTimeElement: HTMLElement = null!;

    private canvasWidth: number = null!;
    private canvasHeight: number = null!;
    private canvasAspect: number = null!;

    private systemScene: THREE.Scene;
    private gridScene: THREE.Scene;
    private camera: THREE.PerspectiveCamera;
    private ambientLight: THREE.AmbientLight;
    private directionalLight: THREE.DirectionalLight;
    private orbitControls: OrbitControls = null!;
    private renderer: THREE.WebGLRenderer;
    private systemGroup: THREE.Object3D = null!;
    private orbiters: Orbiter[] = [];
    private gridGroup: THREE.Object3D = null!;
    private loader: THREE.TextureLoader;
    private cachedBGImage?: any;
    private lastBGUrl?: string;
    private lastBGSettings?: string;
    private lookAtTarget?: THREE.Group;


    private solarSystem: CelestialObject = null!;
    private actualStartTime?: number;
    private lastActualTime?: number;
    private simTime?: number;

    constructor() {
        this.systemScene = new THREE.Scene();
        this.gridScene = new THREE.Scene();
        this.systemScene.name = 'SSG-root';
        this.ambientLight = new THREE.AmbientLight();
        this.systemScene.add(this.ambientLight);
        this.directionalLight = new THREE.DirectionalLight();
        this.camera = new THREE.PerspectiveCamera(DEFAULT_FOV, DEFAULT_ASPECT);
        this.renderer = new THREE.WebGLRenderer();
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap; // default THREE.PCFShadowMap

        this.loader = new THREE.TextureLoader();

        this.getNextAnimationFrame();
    }

    private safeGetElement(elementId: string): HTMLElement {
        const checkElement = document.getElementById(elementId);

        if (!checkElement) {
            throw new Error(`SSG element Id '${elementId}' did not select any DOM element`);
        }

        return checkElement;
    }

    public initialize(canvasDivId: string) {
        this.canvasElement = this.safeGetElement(canvasDivId);
        this.systemTimeElement = this.safeGetElement("systemTime");

        this.canvasWidth = this.canvasElement.offsetWidth;
        this.canvasHeight = this.canvasElement.offsetHeight;
        this.canvasAspect = this.canvasWidth / this.canvasHeight;

        var rect = this.canvasElement.getBoundingClientRect();

        Logger.info(SSGSystemFilter.Initialization, `Initializing SSG render with:`);
        Logger.info(SSGSystemFilter.Initialization, `    window @(${rect.left}, ${rect.top}), size: (${this.canvasWidth} x ${this.canvasHeight}), aspect: ${this.canvasAspect}`);

        this.camera.aspect = this.canvasAspect;
        this.camera.updateProjectionMatrix();

        // We want the grid to render behind everything else.  We will manage the renderers clearing manually to achieve this.
        this.renderer.autoClear = false;
        this.renderer.setSize(this.canvasWidth, this.canvasHeight);

        this.orbitControls = new OrbitControls(this.camera, this.renderer.domElement);

        this.canvasElement.appendChild(this.renderer.domElement);
    }

    public render(solarSystemJson: string, settingsJson: string) {
        const solarSystemPartial = JSON.parse(solarSystemJson);

        this.solarSystem = new CelestialObject(solarSystemPartial);

        Logger.info(SSGSystemFilter.RenderSettings, "SSG.render: System: ", this.solarSystem);

        SettingsManager.clearSettingsSubscriptions();

        this.actualStartTime = this.lastActualTime = this.simTime = undefined;

        if (this.systemGroup) {
            this.systemScene.remove(this.systemGroup);
        }
        if (this.gridGroup) {
            this.gridScene.remove(this.gridGroup);
        }

        SettingsManager.subscribeSettings(async (settings: SSGSettings) => {
            this.lookAtTarget = undefined;
            this.camera.fov = settings.FieldOfViewDegrees;
            this.camera.updateProjectionMatrix();

            if (settings.BackgroundImage && settings.BackgroundImage.URL) {
                if (settings.BackgroundImage.URL.startsWith('#')) {
                    this.gridScene.background = new THREE.Color(settings.BackgroundImage.URL);
                    return;
                }

                const Jimp = (window as any).Jimp;

                if (this.lastBGUrl != settings.BackgroundImage.URL) {
                    this.cachedBGImage = await Jimp.read(settings.BackgroundImage.URL);
                    this.lastBGUrl = settings.BackgroundImage.URL;
                }

                const newBGSettings = `${settings.BackgroundImage.Contrast}:`
                    + `${settings.BackgroundImage.Brightness}:`
                    + `${settings.BackgroundImage.Lighten}:`
                    + `${settings.BackgroundImage.Darken}:`
                    + `${settings.BackgroundImage.Blur}`;

                if (newBGSettings != this.lastBGSettings) {
                    this.lastBGSettings = newBGSettings;

                    const bgImage = this.cachedBGImage.clone();

                    const colorArgs: any[] = [];

                    if (settings.BackgroundImage.Contrast != 0) {
                        colorArgs.push({ apply: 'desaturate', params: [settings.BackgroundImage.Contrast] });
                    }
                    if (settings.BackgroundImage.Brightness != 0) {
                        colorArgs.push({ apply: 'brighten', params: [settings.BackgroundImage.Brightness] });
                    }
                    if (settings.BackgroundImage.Lighten != 0) {
                        colorArgs.push({ apply: 'lighten', params: [settings.BackgroundImage.Lighten] });
                    }
                    if (settings.BackgroundImage.Darken != 0) {
                        colorArgs.push({ apply: 'darken', params: [settings.BackgroundImage.Darken] });
                    }

                    if (colorArgs.length) {
                        bgImage.color(colorArgs);
                    }

                    if (settings.BackgroundImage.Blur != 0) {
                        bgImage.blur(settings.BackgroundImage.Blur);
                    }

                    const url = await bgImage.getBase64Async(Jimp.MIME_JPEG);
                    this.gridScene.background = this.loader.load(url);
                }
            }
        })

        const newSettings = new SSGSettings(JSON.parse(settingsJson));
        Logger.info(SSGSystemFilter.RenderSettings, "SSG.render: Settings: ", newSettings);

        SettingsManager.subscribeSettings((settings: SSGSettings) => {
            this.ambientLight.color = new THREE.Color(settings.AmbientLightColor);
        });

        SettingsManager.subscribeSettings((settings: SSGSettings) => {
            // It is safe to remove a child that you don't have, but not safe to add a child twice.  Remove the
            // light here before adding it so that I don't have to track whether the light has been added or not.
            this.systemScene.remove(this.directionalLight);

            if (settings.IncludeDirectionalLight) {
                this.systemScene.add(this.directionalLight);
            }

            this.directionalLight.color = new THREE.Color(settings.DirectionalLightColor);
            this.directionalLight.intensity = settings.DirectionalLightIntensity;
            Utils.setPosition(this.directionalLight, settings.DirectionalLightPositionVec3);
        });

        this.orbiters = [];
        this.systemGroup = this.buildSolarSystem(this.solarSystem);
        this.gridGroup = new THREE.Group();
        this.gridGroup.name = 'SSG-system-grid';

        SettingsManager.subscribeSettings((settings: SSGSettings) => {
            while (this.gridGroup.children.length > 0) {
                this.gridGroup.remove(this.gridGroup.children[0]);
            }

            if (!settings.GridType || settings.GridType === GRID_TYPE_NONE) {
                return;
            }

            const boundingBox = new THREE.Box3();
            boundingBox.setFromObject(this.systemGroup);

            const gridSize = Math.max(boundingBox.max.x - boundingBox.min.x, boundingBox.max.y - boundingBox.min.y)
                * settings.GridSizeFactor;

            let gridMesh;

            if (settings.GridType == GRID_TYPE_RECTANGULAR) {
                gridMesh = Utils.buildGrid(gridSize, settings.GridMajorDivisions,
                    settings.GridMajorColor, settings.GridMinorColor);
            }

            if (settings.GridType == GRID_TYPE_POLAR) {
                gridMesh = Utils.buildPolarGrid(gridSize / 2,
                    settings.GridMinorDivisions, settings.GridMajorDivisions, 64,
                    settings.GridMajorColor, settings.GridMinorColor);
            }

            if (gridMesh) {
                this.gridGroup.add(gridMesh);
            }
        });

        SettingsManager.subscribeSettings((settings: SSGSettings) => {
            // It is easier to rotate the top-level sceneGroup than to try and reposition the camera. Unfortunately I don't
            // understand 3D math well enough to get the rotation I want in one go, but separate rotations seem to work well
            // enough.

            this.gridGroup.setRotationFromAxisAngle(new Vector3(0, 0, 1), Utils.degreesToRadians(settings.ViewAngleZDegrees));
            this.gridGroup.setRotationFromAxisAngle(new Vector3(0, 1, 0), Utils.degreesToRadians(settings.ViewAngleYDegrees));
            this.gridGroup.setRotationFromAxisAngle(new Vector3(1, 0, 0), Utils.degreesToRadians(settings.ViewAngleXDegrees));

            this.systemGroup.setRotationFromAxisAngle(new Vector3(0, 0, 1), Utils.degreesToRadians(settings.ViewAngleZDegrees));
            this.systemGroup.setRotationFromAxisAngle(new Vector3(0, 1, 0), Utils.degreesToRadians(settings.ViewAngleYDegrees));
            this.systemGroup.setRotationFromAxisAngle(new Vector3(1, 0, 0), Utils.degreesToRadians(settings.ViewAngleXDegrees));
        });

        this.systemScene.add(this.systemGroup);
        this.gridScene.add(this.gridGroup);

        Logger.info(SSGSystemFilter.ModelBuilding, `Ready to fix camera to scene`);

        // We need all the changes to the scene pushed before fitting the camera, so publish here
        SettingsManager.publishSettings(newSettings)

        if (newSettings.ResetOrbitControls) {
            console.log("Resetting orbital controls!")
            this.orbitControls.reset();
            newSettings.ResetOrbitControls = false;
        }

        // Fit the camera before applying zoom, otherwise the camera will be fit to the zoomed scene, which is no good
        this.fitCameraToObject();

        SettingsManager.subscribeSettings((settings: SSGSettings) => {
            this.gridGroup.scale.x = settings.Zoom;
            this.gridGroup.scale.y = settings.Zoom;
            this.gridGroup.scale.z = settings.Zoom;

            this.systemGroup.scale.x = settings.Zoom;
            this.systemGroup.scale.y = settings.Zoom;
            this.systemGroup.scale.z = settings.Zoom;
        });

        // And publish once more to get the zoom updated
        SettingsManager.publishSettings(newSettings)

        Logger.info(SSGSystemFilter.RenderDiagnostics, `SSG System: `, this.systemGroup);
        Logger.info(SSGSystemFilter.RenderDiagnostics, `SSG Scene: `, this.systemScene);
        Logger.info(SSGSystemFilter.RenderDiagnostics, `SSG Grid: `, this.gridGroup);
        Logger.info(SSGSystemFilter.RenderDiagnostics, `SSG Camera: `, this.camera);

        if (Logger.wouldLog(SSGSystemFilter.ExportDiagnostics)) {
            Logger.info(SSGSystemFilter.ExportDiagnostics, 'Scene.JSON export: ', JSON.stringify(this.systemScene.toJSON()));
        }
    }

    public updateSettings(settingsJson: string) {
        const newSettings = new SSGSettings(JSON.parse(settingsJson));

        Logger.info(SSGSystemFilter.RenderSettings, "updateSettings: Settings: ", newSettings);

        if (newSettings.ResetOrbitControls) {
            console.log("Resetting orbital controls!")
            this.orbitControls.reset();
            newSettings.ResetOrbitControls = false;
        }

        SettingsManager.publishSettings(newSettings);
    }

    private getNextAnimationFrame() {
        requestAnimationFrame((animationTime: DOMHighResTimeStamp) => { this.updateAnimation(animationTime); });
    }

    private nextTimeDiags = 0;

    private updateAnimation(actualMillis: number) {
        let showDiags = false;

        const actualTime = actualMillis / 1000;

        if (this.actualStartTime === undefined) {
            this.actualStartTime = actualTime;
        }

        if (this.lastActualTime === undefined) {
            this.lastActualTime = actualTime;
        }

        if (this.simTime === undefined) {
            this.simTime = 0;
        }

        let speedScale = 0;

        if (Utils.FloatNE(SettingsManager.CurrentSettings.AnimationSpeed, 0)) {
            speedScale = SettingsManager.CurrentSettings.AnimationTimeScale;
        }

        const actualSimTime = (actualTime - this.actualStartTime)
        let actualElapsedSeconds = actualTime - this.lastActualTime;
        this.lastActualTime = actualTime;
        let simElapsedSeconds = actualElapsedSeconds * speedScale;
        this.simTime += simElapsedSeconds;

        if (this.systemTimeElement) {
            this.systemTimeElement.innerText = 'System Time: ' + Utils.humanTime(this.simTime);
        }

        if (Date.now() > this.nextTimeDiags) {
            showDiags = true;
            let diagsString = `Anim: SpeedScale: ${SettingsManager.CurrentSettings.AnimationTimeScale}`;
            diagsString += ` (${SettingsManager.CurrentSettings.AnimationTimeScaleHuman})`;
            diagsString += `, Clock: Actual: ${Utils.humanTime(actualSimTime)}, Sim: ${Utils.humanTime(this.simTime)}`;
            diagsString += `, Frame: Actual: ${Utils.humanTime(actualElapsedSeconds)}, Sim: ${Utils.humanTime(simElapsedSeconds)}`;
            Logger.info(SSGSystemFilter.TimingDiagnostics, diagsString);
            this.nextTimeDiags = Date.now() + 1000;
        }

        for (const nextOrbiter of this.orbiters) {
            nextOrbiter.updatePosition(simElapsedSeconds);
        }

        if (this.lookAtTarget) {
            const lookAtVec = new THREE.Vector3();
            this.lookAtTarget.getWorldPosition(lookAtVec);
            if (this.orbitControls) {
                // set camera to rotate around the target
                this.orbitControls.target = lookAtVec;
                this.orbitControls.update();
            }
            // this.camera.lookAt(lookAtVec);
            // this.camera.updateProjectionMatrix();

            if (showDiags) {
                Logger.info(SSGSystemFilter.Always, `Look At: ${Utils.DumpVec(lookAtVec)}`);
            }
        }

        // Clear buffers
        this.renderer.clear();
        this.renderer.render(this.gridScene, this.camera);
        // clear depth buffer
        this.renderer.clearDepth();
        this.renderer.render(this.systemScene, this.camera);

        if (SettingsManager.CurrentSettings.DownloadImage) {
            SettingsManager.CurrentSettings.DownloadImage = false;
            const imgData = this.renderer.domElement.toBlob((imageBlob) => {
                if (imageBlob) {
                    Utils.downloadFileFromBlob('system-image.png', imageBlob);
                }
            });
        }

        this.getNextAnimationFrame();
    }

    private fitCameraToObject() {
        const offset = 1.05;

        const boundingBox = new THREE.Box3();

        // get bounding box of object - this will be used to setup controls and camera
        boundingBox.setFromObject(this.systemScene);

        Logger.info(SSGSystemFilter.RenderDiagnostics, `fitCamera: Object boundingBox: min: ${Utils.DumpVec(boundingBox.min)}, max: ${Utils.DumpVec(boundingBox.max)}`);

        const center = new THREE.Vector3();
        const size = new THREE.Vector3();

        boundingBox.getCenter(center);
        boundingBox.getSize(size);

        Logger.info(SSGSystemFilter.RenderDiagnostics, `fitCamera: Object boundingBox: center: ${Utils.DumpVec(center)}, size: ${Utils.DumpVec(size)}`);

        // get the max side of the bounding box (fits to width OR height as needed )
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);

        let ySize = Math.max(size.y, size.x / this.canvasAspect);

        let cameraYDistance = Math.abs(ySize / 2 / Math.tan(fov / 2));
        cameraYDistance *= offset; // zoom out a little so that objects don't fill the screen

        const cameraDistance = cameraYDistance;

        const minZ = boundingBox.min.z;
        const cameraToFarEdge = (minZ < 0) ? -minZ + cameraDistance : cameraDistance - minZ;

        Logger.info(SSGSystemFilter.RenderDiagnostics, `New camera params: Z: ${cameraDistance}, FAR: ${cameraToFarEdge * 3}`);

        this.camera.position.z = cameraDistance;
        this.camera.far = cameraToFarEdge * 3;
        this.camera.updateProjectionMatrix();

        if (this.orbitControls) {
            // prevent camera from zooming out far enough to create far plane cutoff
            this.orbitControls.maxDistance = cameraToFarEdge * 2;
            this.orbitControls.saveState();

            // set camera to rotate around the target
            const lookAtVec = new Vector3(0, 0, 0);
            if (this.lookAtTarget) {
                this.lookAtTarget.getWorldPosition(lookAtVec);
            }
            this.orbitControls.target = lookAtVec;
            const lookAtName = this.lookAtTarget?.name ?? 'center';
            Logger.info(SSGSystemFilter.Always, `Look at: ${lookAtName} (${Utils.DumpVec(this.orbitControls.target)})`);

            this.orbitControls.update();
        }
    };

    private buildSolarSystem(rootObject: CelestialObject): THREE.Group {
        const sceneGroup = new THREE.Group();
        sceneGroup.name = `${rootObject.Name}-root`;

        const majorAxis = rootObject.OrbitalSemiMajorAxis / CoordsScale;
        const minorAxis = rootObject.OrbitalSemiMinorAxis / CoordsScale;
        const perigee = rootObject.OrbitalPerigee / CoordsScale;

        let objectGroup = new THREE.Group();
        objectGroup.name = `${rootObject.Name}-obj-geom`;

        if (majorAxis > 0) {
            const orbitCurve = Utils.buildOrbitalEllipse(0, 0, majorAxis, minorAxis);

            if (rootObject.OrbitalColor !== 'none') {
                const orbitObject = Utils.buildOrbitalMesh(0, 0, 0, orbitCurve, rootObject.OrbitalColor ?? DEFAULT_ORBITAL_COLOR);
                orbitObject.name = `${rootObject.Name}-orbit-geom`;
                sceneGroup.add(orbitObject);
            }

            if (objectGroup) {
                const planetOrbiter = new Orbiter(objectGroup, orbitCurve, rootObject.InitialOrbitalAngle, rootObject.OrbitalVelocity);
                planetOrbiter.updatePosition(0);
                this.orbiters.push(planetOrbiter);
            }
        }

        SettingsManager.subscribeSettings((settings: SSGSettings) => {
            if (rootObject.Name == settings.LookAt) {
                this.lookAtTarget = objectGroup;
                Logger.info(SSGSystemFilter.RenderSettings, `Looking At '${settings.LookAt}'`);
            }

            if (rootObject.Obj3D) {
                objectGroup.remove(rootObject.Obj3D);
                rootObject.Obj3D = undefined;
            }

            if (rootObject.ObjectRadius > 0) {
                let planetaryRadius = rootObject.ObjectRadius / CoordsScale;

                if (rootObject.IsStar) {
                    planetaryRadius *= settings.StarScale;
                    rootObject.Obj3D = Utils.buildStar(0, 0, 0, planetaryRadius, rootObject.ObjectColor);
                } else {
                    planetaryRadius *= settings.PlanetScale;
                    rootObject.Obj3D = Utils.buildPlanet(0, 0, 0, planetaryRadius, rootObject.ObjectColor);
                }

                Logger.info(SSGSystemFilter.ModelBuilding, `Building '${rootObject.Name}' with radius ${planetaryRadius} and orbit: ${majorAxis}/${minorAxis}`);
            } else {
                const ringInnerRadius = rootObject.RingInnerRadius ?? 0;
                const ringWidth = rootObject.RingWidth ?? 0.5;
                const ringThickness = 0.001;
                const ringDensity = Math.max(Math.min(rootObject.RingDensity ?? 0.001, 1), 0);
                const ringColor = rootObject.RingColor ?? 'none';

                if (ringInnerRadius > 0 && ringColor != 'none' && rootObject.ParentObject) {
                    // If the parent object is a planet, make it cast shadows so the rings look correct.
                    if (rootObject.ParentObject && !rootObject.ParentObject.IsStar && rootObject.ParentObject.Obj3D) {
                        (rootObject.ParentObject.Obj3D as any).castShadow = true; //default is false
                    }


                    let planetaryRadius = rootObject.ParentObject.ObjectRadius *
                        (rootObject.ParentObject.IsStar ? settings.StarScale : settings.PlanetScale);
                    planetaryRadius /= CoordsScale;

                    const ringGeomInnerRadius = ringInnerRadius * planetaryRadius;
                    const ringGeomWidth = ringWidth * planetaryRadius;
                    const ringGeomOuterRadius = ringGeomInnerRadius + ringGeomWidth;
                    const ringGeomThickness = ringGeomWidth * ringThickness;

                    Logger.info(SSGSystemFilter.ModelBuilding, `Building '${rootObject.Name}' ring system with radius ${ringInnerRadius}, width: ${ringWidth}, thickness: ${ringThickness}`);
                    Logger.info(SSGSystemFilter.ModelBuilding, `    effective ring dimensions: inner ${ringGeomInnerRadius}, width: ${ringGeomWidth}, outer: ${ringGeomOuterRadius}, thick: ${ringGeomThickness}`);

                    const extrudeSettings = { curveSegments: 32, depth: ringGeomThickness, bevelEnabled: false };

                    const outerRing = new THREE.Shape()
                        .absarc(0, 0, ringGeomOuterRadius, 0, Math.PI * 2, false);

                    const holePath = new THREE.Path()
                        .absarc(0, 0, ringGeomInnerRadius, 0, Math.PI * 2, true);

                    outerRing.holes.push(holePath);

                    const ringGeometry = new THREE.ExtrudeGeometry(outerRing, extrudeSettings);
                    // const ringMaterial = Utils.planetMaterial(ringColor)
                    const ringMaterial = this.ringMaterialTextured(ringColor, ringDensity);
                    const edgeMaterial = new THREE.MeshLambertMaterial({ color: '#000000' });

                    const ringMesh = new THREE.Mesh(ringGeometry, [ringMaterial, edgeMaterial]);
                    ringMesh.receiveShadow = true;
                    Utils.setPosition(ringMesh, 0, 0, -ringGeomThickness / 2);

                    rootObject.Obj3D = ringMesh;
                }
            }

            if (rootObject.Obj3D) {
                objectGroup.add(rootObject.Obj3D);
            }
        });

        sceneGroup.add(objectGroup);

        if (perigee != 0) {
            sceneGroup.position.x = perigee;
        }

        if (rootObject.PhaseAngle != 0) {
            sceneGroup.rotation.order = "ZYX";
            sceneGroup.rotation.z = Utils.degreesToRadians(rootObject.PhaseAngle);
        }

        if (rootObject.OrbitalInclination != 0) {
            sceneGroup.rotation.y = Utils.degreesToRadians(rootObject.OrbitalInclination);
        }

        for (const childObj of rootObject.ChildObjects) {
            const childGroup = this.buildSolarSystem(childObj);
            objectGroup.add(childGroup);
        }

        return sceneGroup;
    }

    private ringMaterialTextured(ringColor: string, density: number = 0.1, chunkSize: number = 5) {
        const width = 512;
        const height = 512;

        const size = width * height;
        const byteSize = size * 4;
        const data = new Uint8Array(byteSize);

        let stride = 0;

        while (stride < byteSize) {
            const c = (Math.random() < density) ? 255 : 0;
            data[stride++] = c;
            data[stride++] = c;
            data[stride++] = c;
            data[stride++] = 255;
        }
        /*
                let chunkCount = size * density;
        
                for (let chunk = 0; chunk < chunkCount; chunk++) {
                    const x = Math.random() * width;
                    const y = Math.random() * height;
                    const radius = (Math.random() * 0.5 + 0.5) * chunkSize;
        
                    let stride = y * width * 4 + x * 4;
        
                    for (let dy = 0; dy < radius; dy++) {
                        for (let dx = 0; dx < radius * 4; dx++) {
                            if (stride >= byteSize) {
                                stride -= byteSize;
                            }
                            data[stride++] = 255;
                        }
                        stride += width * 4;
                    }
        
                }
        */
        // used the buffer to create a DataTexture

        const texture = new THREE.DataTexture(data, width, height);
        texture.needsUpdate = true;

        // // create a texture loader.
        // const textureLoader = new THREE.TextureLoader();

        // // load a texture
        // const texture = textureLoader.load(
        //     'images/ring-texture.png',
        // );

        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // texture.repeat.set(4, 4);

        // create a "standard" material using
        // return new THREE.MeshStandardMaterial({ color: 'purple' });
        // return new THREE.MeshStandardMaterial({ alphaMap: texture, color: ringColor, transparent: true });
        return new THREE.MeshLambertMaterial({ alphaMap: texture, color: ringColor, transparent: true });
        //return new THREE.MeshLambertMaterial({ color: 'purple' });
    }


    private buildTestScene(): THREE.Group {
        const sceneGroup = new THREE.Group();
        const origin = Utils.buildPlanet(0, 0, 0, 50, '#ffff00');
        sceneGroup.add(origin);

        const redMaj = 600;
        const redMin = 550;

        const greenMaj = 1200;
        const greenMin = 1000;

        const blueMaj = 500;

        const redCurve = Utils.buildOrbitalEllipse(0, 0, redMaj, redMin);

        sceneGroup.add(
            Utils.buildPlanet(redMaj, 0, 0, 30, '#ff0000'),
            Utils.buildPlanet(-redMaj, 0, 0, 30, '#770000'),
            Utils.buildOrbitalMesh(0, 0, 0, redCurve, '#ff0000'),
            Utils.buildPlanet(0, greenMin, 0, 30, '#00ff00'),
            Utils.buildPlanet(0, -greenMin, 0, 30, '#007700'),
            Utils.buildPlanet(0, 0, blueMaj, 30, '#0000ff'),
            Utils.buildPlanet(0, 0, -blueMaj, 30, '#000077'),
        );

        return sceneGroup;
    }
}
