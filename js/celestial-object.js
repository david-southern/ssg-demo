export class CelestialObject {
    constructor(partialObj) {
        Object.assign(this, partialObj);
        this.ChildObjects = [];
        for (const childPartial of partialObj.ChildObjects) {
            const childObject = new CelestialObject(childPartial);
            childObject.ParentObject = this;
            this.ChildObjects.push(childObject);
        }
    }
}
//# sourceMappingURL=celestial-object.js.map