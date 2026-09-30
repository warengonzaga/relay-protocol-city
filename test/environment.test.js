import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildEnvironment } from "../src/environment.js";
import {
  DISTRICTS,
  ROAD_SEGMENTS,
  GROUND,
  getDistrictAt,
  createRailCurve,
} from "../src/world-map.js";

const manifest = JSON.parse(
  readFileSync(new URL("../public/models/manifest.json", import.meta.url)),
).models;

// Manifest-sized model stand-ins exercise the renderer's actual scaling and positioning.
const models = {
  create(key, size, axis = "y") {
    assert.ok(
      manifest[key],
      `authored model ${key} must exist in the bundled assets`,
    );
    const dimensions = manifest[key].size;
    const scale = size / dimensions[{ x: 0, y: 1, z: 2 }[axis]];
    const object = new THREE.Group();
    Object.assign(object.userData, {
      width: dimensions[0] * scale,
      height: dimensions[1] * scale,
      length: dimensions[2] * scale,
    });
    return object;
  },
};

test("authored neighborhoods render canonical lots with intact models and clear streets and railway", (t) => {
  const captions = [];
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      createElement() {
        const caption = { text: "" };
        captions.push(caption);
        const context = new Proxy(
          {
            fillText: (text) => {
              caption.text = text;
            },
          },
          {
            get: (target, key) => target[key] ?? (() => {}),
          },
        );
        return { getContext: () => context };
      },
    },
  });
  t.after(() => {
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else delete globalThis.document;
  });
  const scene = new THREE.Scene();
  const environment = buildEnvironment(scene, models);
  const buildings = environment.group.children.filter(
    (object) => object.userData.siteId,
  );
  assert.deepEqual(
    environment.labels.map((label) => label.chain.id).sort((a, b) => a - b),
    [1, 8453],
  );
  assert.equal(
    buildings.length,
    DISTRICTS.reduce((count, district) => count + district.sites.length, 0),
  );
  const ethereum = DISTRICTS.find((district) => district.id === 1);
  const base = DISTRICTS.find((district) => district.id === 8453);
  assert.ok(
    ethereum.sites.length >= base.sites.length * 3,
    "Ethereum should have a substantial authored neighborhood",
  );
  assert.ok(
    new Set(ethereum.sites.map((site) => site.model)).size >= 8,
    "Ethereum should have varied building silhouettes",
  );
  const rail = createRailCurve(2);
  const railPoints = Array.from({ length: 2001 }, (_, index) =>
    rail.getPointAt(index / 2000),
  );
  const lots = [];
  for (const building of buildings) {
    const district = DISTRICTS.find((d) => d.id === building.userData.chainId);
    const site = district.sites.find((s) => s.id === building.userData.siteId);
    assert.equal(building.position.x, site.address.x);
    assert.equal(building.position.z, site.address.z);
    assert.equal(building.position.y, GROUND + 0.22);
    assert.equal(
      building.scale.x,
      building.scale.y,
      "model proportions stay intact",
    );
    assert.equal(
      building.scale.x,
      building.scale.z,
      "model proportions stay intact",
    );
    const halfX = (building.userData.width * building.scale.x) / 2 + 0.25;
    const halfZ = (building.userData.length * building.scale.z) / 2 + 0.25;
    const x = building.position.x,
      z = building.position.z;
    assert.ok(halfX * 2 <= site.maxWidth + 0.5 + 1e-8);
    assert.ok(halfZ * 2 <= site.maxDepth + 0.5 + 1e-8);
    for (const dx of [-halfX, halfX])
      for (const dz of [-halfZ, halfZ])
        assert.equal(
          getDistrictAt(x + dx, z + dz)?.id,
          district.id,
          `${site.id} foundation stays in its territory`,
        );
    for (const road of ROAD_SEGMENTS)
      assert.equal(
        x + halfX > Math.min(road.x1, road.x2) - 5.9 &&
          x - halfX < Math.max(road.x1, road.x2) + 5.9 &&
          z + halfZ > Math.min(road.z1, road.z2) - 5.9 &&
          z - halfZ < Math.max(road.z1, road.z2) + 5.9,
        false,
        `${site.id} must leave road and sidewalks clear`,
      );
    assert.equal(
      railPoints.some(
        (point) =>
          Math.abs(point.x - x) < halfX + 3.3 &&
          Math.abs(point.z - z) < halfZ + 3.3,
      ),
      false,
      `${site.id} must leave the viaduct clear`,
    );
    for (const other of lots)
      assert.equal(
        Math.abs(other.x - x) < other.halfX + halfX &&
          Math.abs(other.z - z) < other.halfZ + halfZ,
        false,
        `${site.id} must not overlap ${other.id}`,
      );
    lots.push({ id: site.id, x, z, halfX, halfZ });
  }
  scene.updateMatrixWorld(true);
  let garageCount = 0;
  environment.group.traverse((object) => {
    const dimensions = object.geometry?.parameters;
    if (
      dimensions?.width !== 2.8 ||
      dimensions?.height !== 1.9 ||
      dimensions?.depth !== 2.1
    )
      return;
    const count = object.isInstancedMesh ? object.count : 1;
    for (let index = 0; index < count; index++) {
      const transform = new THREE.Matrix4();
      if (object.isInstancedMesh) object.getMatrixAt(index, transform);
      transform.premultiply(object.matrixWorld);
      const bounds = new THREE.Box3(
        new THREE.Vector3(-1.4, -0.95, -1.05),
        new THREE.Vector3(1.4, 0.95, 1.05),
      ).applyMatrix4(transform);
      for (const road of ROAD_SEGMENTS)
        assert.equal(
          bounds.max.x > Math.min(road.x1, road.x2) - 5.9 &&
            bounds.min.x < Math.max(road.x1, road.x2) + 5.9 &&
            bounds.max.z > Math.min(road.z1, road.z2) - 5.9 &&
            bounds.min.z < Math.max(road.z1, road.z2) + 5.9,
          false,
          `garage at ${bounds.getCenter(new THREE.Vector3()).toArray()} must keep sidewalks clear`,
        );
      garageCount++;
    }
  });
  assert.equal(
    garageCount,
    DISTRICTS.flatMap((district) => district.sites).filter(
      (site) => site.address.garage,
    ).length,
  );
  assert.equal(
    captions.filter((caption) => caption.text === "RELAY").length,
    2,
    "each district has one checkpoint",
  );
  assert.equal(
    captions.filter((caption) => caption.text === "App building").length,
    6,
    "only dedicated app sites receive app labels",
  );
  environment.setApps(
    Array.from({ length: 5 }, (_, index) => ({
      originChainId: 1,
      destinationChainId: 8453,
      app: {
        kind: "integrator",
        key: `test-app-${index}`,
        name: `Observed app ${index}`,
      },
    })),
  );
  assert.equal(
    captions.filter((caption) => caption.text.startsWith("Observed app"))
      .length,
    6,
  );
  const geometries = new Set(),
    materials = new Set();
  scene.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => {
    material.map?.dispose();
    material.dispose();
  });
});
