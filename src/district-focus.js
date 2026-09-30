import { Plane, Vector3 } from "three";

export function createDistrictFocus(renderer, scene) {
  const previousRender = scene.onBeforeRender;
  const previousLocalClipping = renderer.localClippingEnabled;
  let currentDistrict = null;
  let planes = [];

  function updateMaterials() {
    scene.traverse((object) => {
      if (!object.material) return;
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material]) {
        if (material.clippingPlanes === planes) continue;
        material.clippingPlanes = planes;
        material.clipShadows = planes.length > 0;
      }
    });
  }

  // Local clipping also clips shadows; global renderer planes do not.
  function beforeRender(...args) {
    previousRender.apply(this, args);
    if (planes.length) updateMaterials();
  }
  scene.onBeforeRender = beforeRender;

  function focus(district) {
    if (district === currentDistrict) return planes;
    currentDistrict = district;
    planes = [];
    if (district) {
      const polygon = district.polygon;
      const center = polygon
        .reduce(
          (point, vertex) => point.add(new Vector3(vertex.x, 0, vertex.z)),
          new Vector3(),
        )
        .divideScalar(polygon.length);
      // Authored polygons are convex; each edge keeps its inward half-space.
      planes = polygon.map((a, index) => {
        const b = polygon[(index + 1) % polygon.length];
        const normal = new Vector3(a.z - b.z, 0, b.x - a.x).normalize();
        const plane = new Plane().setFromNormalAndCoplanarPoint(
          normal,
          new Vector3(a.x, 0, a.z),
        );
        return plane.distanceToPoint(center) < 0 ? plane.negate() : plane;
      });
    }
    renderer.localClippingEnabled = planes.length > 0;
    updateMaterials();
    return planes;
  }

  return {
    focus,
    get planes() {
      return planes;
    },
    dispose() {
      focus(null);
      renderer.localClippingEnabled = previousLocalClipping;
      if (scene.onBeforeRender === beforeRender)
        scene.onBeforeRender = previousRender;
    },
  };
}
