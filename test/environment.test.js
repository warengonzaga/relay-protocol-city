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
        return { getContext: () => context, caption };
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
    ethereum.sites.length >= 45,
    "Ethereum has densely authored building clusters",
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
  const rankedHeights = [];
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
    if (district.id === 1 && site.role === "integrator")
      rankedHeights[site.slot] = building.userData.height * building.scale.y;
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
  assert.deepEqual(
    rankedHeights,
    [28, 24, 20, 16, 12],
    "ranked towers keep descending heights after uniform model fitting",
  );
  for (const district of DISTRICTS) {
    const homes = district.sites.filter((site) => site.role === "relay");
    assert.ok(
      homes.some((site) => site.garage === false) &&
        homes.some((site) => site.garage !== false),
      "each district has separate walking and driving homes",
    );
    assert.equal(
      district.sites.filter((site) => site.role === "bus-terminal").length,
      1,
    );
    for (const park of district.parks) {
      for (const lot of lots)
        assert.equal(
          Math.abs(lot.x - park.x) < lot.halfX + park.width / 2 &&
            Math.abs(lot.z - park.z) < lot.halfZ + park.depth / 2,
          false,
          "grass pockets leave the building foundations clear",
        );
      for (const road of ROAD_SEGMENTS)
        assert.equal(
          park.x + park.width / 2 > Math.min(road.x1, road.x2) - 5.9 &&
            park.x - park.width / 2 < Math.max(road.x1, road.x2) + 5.9 &&
            park.z + park.depth / 2 > Math.min(road.z1, road.z2) - 5.9 &&
            park.z - park.depth / 2 < Math.max(road.z1, road.z2) + 5.9,
          false,
          "grass pockets leave roads and sidewalks clear",
        );
    }
  }
  scene.updateMatrixWorld(true);
  let garageCount = 0;
  let gateFixtureCount = 0;
  let busApronCount = 0;
  const pavement = [],
    crosswalks = [];
  environment.group.traverse((object) => {
    const dimensions = object.geometry?.parameters;
    if (!object.geometry) return;
    const garage =
      dimensions?.width === 2.8 &&
      dimensions?.height === 1.9 &&
      dimensions?.depth === 2.1;
    const busApron =
      dimensions?.width === 12 &&
      dimensions?.height === 0.12 &&
      dimensions?.depth === 6.2;
    const gateFixture =
      object.material?.map?.image?.caption?.text === "RELAY" ||
      [
        [0.7, 5.1, 0.7],
        [0.95, 0.45, 14],
        [2.6, 2.1, 2.5],
        [0.52, 0.52, 0.52],
      ].some(
        ([width, height, depth]) =>
          dimensions?.width === width &&
          dimensions?.height === height &&
          dimensions?.depth === depth,
      );
    const color = object.material?.color?.getHexString();
    const roadDetail = color === "727380" || color === "d8d5e3";
    if (!garage && !gateFixture && !roadDetail && !busApron) return;
    object.geometry.computeBoundingBox();
    const count = object.isInstancedMesh ? object.count : 1;
    for (let index = 0; index < count; index++) {
      const transform = new THREE.Matrix4();
      if (object.isInstancedMesh) object.getMatrixAt(index, transform);
      transform.premultiply(object.matrixWorld);
      const bounds = object.geometry.boundingBox
        .clone()
        .applyMatrix4(transform);
      if (gateFixture) {
        const district = DISTRICTS.find(
          (d) =>
            Math.abs(bounds.getCenter(new THREE.Vector3()).x - d.gate.x) < 4,
        );
        assert.ok(district, "gate fixture belongs to a border checkpoint");
        for (const x of [bounds.min.x, bounds.max.x])
          for (const z of [bounds.min.z, bounds.max.z])
            assert.equal(
              getDistrictAt(x, z)?.id,
              district.id,
              "the entire gate, including its sign, survives district clipping",
            );
        gateFixtureCount++;
      }
      if (color === "727380") pavement.push(bounds);
      if (color === "d8d5e3")
        crosswalks.push(bounds.getCenter(new THREE.Vector3()));
      if (!garage && !busApron) continue;
      for (const road of ROAD_SEGMENTS)
        assert.equal(
          bounds.max.x > Math.min(road.x1, road.x2) - 5.9 &&
            bounds.min.x < Math.max(road.x1, road.x2) + 5.9 &&
            bounds.max.z > Math.min(road.z1, road.z2) - 5.9 &&
            bounds.min.z < Math.max(road.z1, road.z2) + 5.9,
          false,
          `garage or bus apron at ${bounds.getCenter(new THREE.Vector3()).toArray()} must keep sidewalks clear`,
        );
      if (garage) garageCount++;
      if (busApron) busApronCount++;
    }
  });
  assert.equal(gateFixtureCount, DISTRICTS.length * 6);
  assert.equal(busApronCount, DISTRICTS.length);
  for (const [x, z, h, v] of [
    [-122, -42, 1, 1],
    [2, -42, -1, 1],
    [-122, 54, 1, -1],
    [2, 54, -1, -1],
  ]) {
    assert.equal(
      crosswalks.some((p) => Math.abs(p.x - x) < 6 && Math.abs(p.z - z) < 6),
      false,
      "road bends have no crossing stripes on nonexistent arms",
    );
    for (let step = -4; step <= 4; step++)
      for (const point of [
        new THREE.Vector3(x + h * step, 0.83, z - v * 4.7),
        new THREE.Vector3(x - h * 4.7, 0.83, z + v * step),
      ])
        assert.ok(
          pavement.some((bounds) => bounds.containsPoint(point)),
          "the outer sidewalk stays continuous around every L bend",
        );
    assert.ok(
      pavement.some((bounds) =>
        bounds.containsPoint(new THREE.Vector3(x + h * 4.7, 0.83, z + v * 4.7)),
      ),
      "the inner sidewalk corner stays connected",
    );
  }
  assert.equal(
    crosswalks.filter((p) => Math.abs(p.x + 60) < 6 && Math.abs(p.z) < 6)
      .length,
    20,
    "four-way crossings retain four crosswalks",
  );
  assert.equal(
    crosswalks.filter((p) => Math.abs(p.x + 60) < 6 && Math.abs(p.z + 42) < 6)
      .length,
    15,
    "T junctions have only their three actual crosswalks",
  );
  for (const [x, z, dx, dz] of [
    [-60, -42, 0, -1],
    [-60, 54, 0, 1],
    [-122, 0, -1, 0],
    [2, 28, 1, 0],
  ]) {
    for (let step = -4; step <= 4; step++)
      assert.ok(
        pavement.some((bounds) =>
          bounds.containsPoint(
            new THREE.Vector3(
              x + dx * 4.7 + dz * step,
              0.83,
              z + dz * 4.7 + dx * step,
            ),
          ),
        ),
        "the unused arm of every T orientation has a continuous raised sidewalk",
      );
    assert.equal(
      crosswalks.some(
        (p) =>
          Math.abs(p.x - x - dx * 4.7) < 2 && Math.abs(p.z - z - dz * 4.7) < 2,
      ),
      false,
      "the closed arm has no crosswalk",
    );
  }
  assert.equal(
    garageCount,
    DISTRICTS.flatMap((district) => district.sites).filter(
      (site) =>
        site.address.garage &&
        site.garage !== false &&
        site.role !== "bus-terminal",
    ).length,
  );
  assert.equal(
    captions.filter((caption) => caption.text === "RELAY").length,
    2,
    "each district has one checkpoint",
  );
  assert.equal(
    captions.filter((caption) => caption.text === "App building").length,
    1,
    "only Base's unassigned app building needs a placeholder",
  );
  for (const name of ["Fun", "LI.FI", "Fomo", "MetaMask", "OKX"])
    assert.equal(
      captions.filter((caption) => caption.text === name).length,
      1,
      "ranked integrators have name-only signs from the first frame",
    );
  assert.equal(
    captions.filter((caption) => caption.text === "Bus terminal").length,
    2,
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
    1,
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
