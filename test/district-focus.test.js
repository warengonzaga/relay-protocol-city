import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createDistrictFocus } from "../src/district-focus.js";
import { DISTRICTS, getDistrictAt, createRailCurve } from "../src/world-map.js";

test("district focus clips the authored border, gate, railway and shadows, then restores the overview", () => {
  const renderer = { localClippingEnabled: false };
  const scene = new THREE.Scene();
  let previousCalls = 0;
  const previousRender = () => previousCalls++;
  scene.onBeforeRender = previousRender;
  const material = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
  const focus = createDistrictFocus(renderer, scene);
  const visible = (point) =>
    focus.planes.every((plane) => plane.distanceToPoint(point) >= -1e-7);

  for (const district of DISTRICTS) {
    const planes = focus.focus(district);
    assert.equal(focus.planes, planes);
    assert.equal(planes.length, district.polygon.length);
    assert.equal(renderer.localClippingEnabled, true);
    assert.equal(material.clippingPlanes, planes);
    assert.equal(material.clipShadows, true);
    for (const vertex of district.polygon) {
      assert.ok(
        visible(new THREE.Vector3(vertex.x, 0, vertex.z)),
        "every authored vertex lies inside all planes, so the polygon is convex",
      );
    }
    // Cross-check the actual map's point-in-polygon result, including at flight height.
    for (let x = -180; x <= 190; x += 5)
      for (let z = -110; z <= 90; z += 5)
        for (const y of [-5, 0, 50])
          assert.equal(
            visible(new THREE.Vector3(x, y, z)),
            getDistrictAt(x, z)?.id === district.id,
          );
    const gate = district.gate;
    assert.ok(visible(new THREE.Vector3(gate.x, 0, gate.z)));
    assert.equal(
      visible(
        new THREE.Vector3(gate.x + gate.outward.x, 0, gate.z + gate.outward.z),
      ),
      false,
      "the road ends immediately beyond the toll gate",
    );
    const rail = createRailCurve(2);
    let retained = 0;
    let cut = 0;
    for (let index = 0; index <= 1000; index++) {
      const point = rail.getPointAt(index / 1000);
      const inside = getDistrictAt(point.x, point.z)?.id === district.id;
      assert.equal(visible(point), inside);
      if (inside) retained++;
      else cut++;
    }
    assert.ok(
      retained > 0 && cut > 0,
      "railway is cut at the district boundary",
    );
    // Winding changes must not invert the focused territory.
    focus.focus({ ...district, polygon: [...district.polygon].reverse() });
    assert.ok(visible(new THREE.Vector3(district.x, 0, district.z)));
  }

  const lateMaterial = new THREE.MeshStandardMaterial();
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(), [lateMaterial]));
  scene.onBeforeRender();
  assert.equal(previousCalls, 1);
  assert.equal(lateMaterial.clippingPlanes, focus.planes);
  assert.equal(
    lateMaterial.clipShadows,
    true,
    "new travelers have clipped shadows too",
  );
  focus.focus(null);
  assert.equal(renderer.localClippingEnabled, false);
  assert.equal(focus.planes.length, 0);
  assert.equal(material.clippingPlanes.length, 0);
  assert.equal(lateMaterial.clipShadows, false);
  assert.ok(visible(new THREE.Vector3(1000, 0, 1000)));
  focus.dispose();
  assert.equal(scene.onBeforeRender, previousRender);
});
