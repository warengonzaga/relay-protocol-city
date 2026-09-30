import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { buildRailway } from "../src/railway.js";
import {
  GROUND,
  RAIL_HEIGHT,
  DISTRICTS,
  ROAD_SEGMENTS,
  createRailCurve,
  getStationProgress,
  getDistrictAt,
} from "../src/world-map.js";

function checkRailGeometry() {
  const group = new THREE.Group();
  const boxes = [];
  const signs = [];
  const surface = new THREE.MeshStandardMaterial();
  buildRailway({
    group,
    material: () => surface,
    sign: (...values) => signs.push(values),
    box(x, y, z, width, height, depth, color) {
      const object = new THREE.Object3D();
      object.position.set(x, y, z);
      boxes.push({ object, width, height, depth, color });
      return object;
    },
  });
  const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-6, message);
  const insideDistrict = (piece, district) => {
    for (const x of [-piece.width / 2, piece.width / 2])
      for (const z of [-piece.depth / 2, piece.depth / 2]) {
        const corner = new THREE.Vector3(x, 0, z)
          .applyEuler(piece.object.rotation)
          .add(piece.object.position);
        assert.equal(
          getDistrictAt(corner.x, corner.z)?.id,
          district.id,
          "station and access corners must belong to their actual territory polygon",
        );
      }
  };
  const beams = boxes.filter((box) => box.width === 6.6 && box.depth === 0.85);
  const columns = boxes.filter((box) => box.width === 0.6 && box.depth === 0.6);
  assert.ok(beams.length > 0);
  assert.equal(columns.length, beams.length * 2);
  for (const beam of beams)
    close(
      beam.object.position.y + beam.height / 2,
      RAIL_HEIGHT - 0.2,
      "crossbeam top must touch the deck underside",
    );
  for (const column of columns) {
    close(
      column.object.position.y - column.height / 2,
      GROUND,
      "support must touch the ground",
    );
    close(
      column.object.position.y + column.height / 2,
      beams[0].object.position.y - beams[0].height / 2,
      "column top must touch its crossbeam",
    );
  }
  const decks = group.children.filter(
    (object) => object.geometry?.type === "BufferGeometry",
  );
  assert.equal(decks.length, 2);
  for (const deck of decks) {
    const positions = deck.geometry.getAttribute("position");
    for (let vertex = 0; vertex < positions.count; vertex++)
      close(
        positions.getY(vertex),
        RAIL_HEIGHT - 0.2,
        "every deck vertex remains level with the supports",
      );
  }
  const platforms = boxes.filter((box) => box.width === 12 && box.depth === 8);
  const canopies = boxes.filter(
    (box) => box.width === 12.5 && box.depth === 8.3,
  );
  assert.equal(platforms.length, 2);
  for (const [index, district] of DISTRICTS.entries()) {
    const platform = platforms[index];
    insideDistrict(platform, district);
    insideDistrict(canopies[index], district);
    const center = createRailCurve(2).getPointAt(
      getStationProgress(district.id, 2),
    );
    close(
      platform.object.position.x,
      center.x,
      "station x follows its train stop",
    );
    close(
      platform.object.position.z,
      center.z,
      "station z follows its train stop",
    );
    close(
      platform.object.position.y + platform.height / 2,
      RAIL_HEIGHT - 0.25,
      "platform remains below the rails",
    );
  }
  const stairs = boxes.filter((box) => box.color === "#77758a");
  assert.equal(stairs.length, platforms.length * 13);
  for (const stair of [...stairs, ...columns]) {
    close(
      stair.object.position.y - stair.height / 2,
      GROUND,
      "stairs and supports must be grounded",
    );
    const { x, z } = stair.object.position;
    const halfX =
      (Math.abs(Math.cos(stair.object.rotation.y)) * stair.width +
        Math.abs(Math.sin(stair.object.rotation.y)) * stair.depth) /
      2;
    const halfZ =
      (Math.abs(Math.sin(stair.object.rotation.y)) * stair.width +
        Math.abs(Math.cos(stair.object.rotation.y)) * stair.depth) /
      2;
    if (stair.color === "#77758a") {
      const district = DISTRICTS[Math.floor(stairs.indexOf(stair) / 13)];
      insideDistrict(stair, district);
      assert.ok(
        x - halfX >= district.bounds.left &&
          x + halfX <= district.bounds.right &&
          z - halfZ >= district.bounds.top &&
          z + halfZ <= district.bounds.bottom,
        "stairs and landing stay inside their own district",
      );
      for (const target of DISTRICTS)
        for (const site of target.sites) {
          assert.equal(
            x + halfX > site.address.x - site.maxWidth / 2 &&
              x - halfX < site.address.x + site.maxWidth / 2 &&
              z + halfZ > site.address.z - site.maxDepth / 2 &&
              z - halfZ < site.address.z + site.maxDepth / 2,
            false,
            `station access must not overlap authored lot ${site.id}`,
          );
        }
    }
    for (const road of ROAD_SEGMENTS) {
      const overlaps =
        x + halfX > Math.min(road.x1, road.x2) - 3.5 &&
        x - halfX < Math.max(road.x1, road.x2) + 3.5 &&
        z + halfZ > Math.min(road.z1, road.z2) - 3.5 &&
        z - halfZ < Math.max(road.z1, road.z2) + 3.5;
      assert.equal(
        overlaps,
        false,
        "station stairs and supports must not extend onto rendered road asphalt",
      );
    }
  }
  assert.equal(signs.length, platforms.length + 1);
  group.traverse((object) => object.geometry?.dispose());
  surface.dispose();
}

test("authored station access clears streets and buildings and all rail supports meet their decks", () => {
  checkRailGeometry();
});
