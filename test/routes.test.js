import test from "node:test";
import assert from "node:assert/strict";
import {
  DISTRICTS,
  ROAD_X,
  ROAD_Z,
  createRailCurve,
  getAddress,
  getDistrict,
  getStationProgress,
  getSignalState,
  registerApps,
} from "../src/world-map.js";
import {
  groundRoute,
  flightRoute,
  trainPlan,
  movementSpeed,
  reversePath,
} from "../src/routes.js";

const relay = { key: "relay", name: "Relay", kind: "relay" };
const close = (actual, expected, message) =>
  assert.ok(
    Math.abs(actual - expected) < 0.02,
    `${message}: ${actual} vs ${expected}`,
  );
const sample = (curve, count = 250) =>
  Array.from({ length: count + 1 }, (_, index) => ({
    point: curve.getPointAt(index / count),
    tangent: curve.getTangentAt(index / count),
  }));

test("every district route returns home for swaps and reaches the correct cross-chain address", () => {
  for (const kind of ["pedestrian", "car"])
    for (const origin of DISTRICTS)
      for (const destination of DISTRICTS) {
        const route = groundRoute({
          originChainId: origin.id,
          destinationChainId: destination.id,
          app: relay,
          kind,
        });
        const start = route.depart.getPointAt(0),
          end = route.onward.getPointAt(1);
        const target =
          kind === "pedestrian"
            ? route.destination.door
            : route.destination.garage;
        close(end.x, target.x, "arrival x");
        close(end.z, target.z, "arrival z");
        assert.ok(
          route.depart.getPointAt(1).distanceTo(route.onward.getPointAt(0)) <
            0.001,
        );
        if (origin.id === destination.id)
          assert.ok(start.distanceTo(end) < 0.001);
        for (const { point } of sample(route.onward, 40))
          assert.ok([point.x, point.y, point.z].every(Number.isFinite));
        const home = reversePath(route.depart).getPointAt(1);
        assert.ok(home.distanceTo(start) < 0.001);
      }
});

test("walking routes cross roads only on junction crosswalks, including westbound arrivals", () => {
  for (const origin of DISTRICTS)
    for (const destination of DISTRICTS) {
      const route = groundRoute({
        originChainId: origin.id,
        destinationChainId: destination.id,
        app: relay,
        kind: "pedestrian",
      });
      for (const { point: p } of sample(route.onward)) {
        const inVerticalRoad = ROAD_X.some((x) => Math.abs(p.x - x) < 3.35);
        const inHorizontalRoad = ROAD_Z.some((z) => Math.abs(p.z - z) < 3.35);
        if (inVerticalRoad)
          assert.ok(
            ROAD_Z.some((z) => Math.abs(Math.abs(p.z - z) - 4.7) < 1.2),
            `off-crosswalk vertical road at ${p.x},${p.z}`,
          );
        if (inHorizontalRoad)
          assert.ok(
            ROAD_X.some((x) => Math.abs(Math.abs(p.x - x) - 3.7) < 1.2),
            `off-crosswalk horizontal road at ${p.x},${p.z}`,
          );
      }
    }
});

test("cars use right-hand lanes between intersections", () => {
  for (const origin of DISTRICTS)
    for (const destination of DISTRICTS) {
      const route = groundRoute({
        originChainId: origin.id,
        destinationChainId: destination.id,
        app: relay,
        kind: "car",
      });
      for (const { point: p, tangent: t } of sample(route.onward, 150)) {
        const roadZ = ROAD_Z.find((z) => Math.abs(p.z - z) < 2);
        const roadX = ROAD_X.find((x) => Math.abs(p.x - x) < 2);
        if (
          roadZ !== undefined &&
          Math.abs(t.x) > 0.999 &&
          !ROAD_X.some((x) => Math.abs(p.x - x) < 5)
        )
          assert.equal(Math.sign(t.x), Math.sign(p.z - roadZ));
        if (
          roadX !== undefined &&
          Math.abs(t.z) > 0.999 &&
          !ROAD_Z.some((z) => Math.abs(p.z - z) < 5)
        )
          assert.equal(Math.sign(t.z), -Math.sign(p.x - roadX));
      }
    }
});

test("integrator slots do not mislabel overflow and unknown chains use the neutral hub", () => {
  const apps = ["opensea", "test-app-b", "test-app-c"].map((key) => ({
    key,
    name: key,
    kind: "integrator",
  }));
  registerApps(
    apps.map((app) => ({ app, originChainId: 8453, destinationChainId: 56 })),
  );
  const a = getAddress(8453, apps[0]),
    b = getAddress(8453, apps[1]),
    c = getAddress(8453, apps[2]);
  assert.equal(a.type, "integrator");
  assert.equal(b.type, "integrator");
  assert.notEqual(a.x, b.x);
  assert.equal(c.type, "commons");
  assert.equal(
    getAddress(8453, { key: "unknown", kind: "unknown" }).type,
    "commons",
  );
  assert.equal(getDistrict(999999999).id, 0);
  assert.notEqual(getDistrict(999999999).x, getDistrict(8453).x);
  const route = groundRoute({
    originChainId: 8453,
    destinationChainId: 56,
    app: apps[0],
    kind: "car",
  });
  assert.equal(route.origin.app.key, "opensea");
  assert.equal(route.destination.app.key, "opensea");
  const police = route.police.getPointAt(1);
  close(police.x, route.origin.district.police.garage.x, "police x");
  close(police.z, route.origin.district.police.garage.z, "police z");
});

test("twin railway loops serve every station and return to their tunnel in opposite directions", () => {
  for (const lane of [0, 1]) {
    const curve = createRailCurve(lane);
    assert.ok(curve.getPointAt(0).distanceTo(curve.getPointAt(1)) < 0.001);
    for (const { point } of sample(curve))
      assert.ok([point.x, point.y, point.z].every(Number.isFinite));
    for (const district of DISTRICTS) {
      const station = curve.getPointAt(getStationProgress(district.id, lane));
      assert.ok(Math.abs(station.x - district.station.x) < 1);
      assert.ok(Math.abs(station.z - district.station.z) < 2);
      const plan = trainPlan(
        { originChainId: district.id, destinationChainId: 56 },
        lane,
      );
      assert.ok(
        plan.origin >= 0 &&
          plan.destination > plan.origin &&
          plan.exit > plan.destination,
      );
      assert.ok(plan.at(plan.exit).distanceTo(plan.at(0)) < 0.001);
    }
  }
  const transfer = { originChainId: 8453, destinationChainId: 56 };
  const north = trainPlan(transfer, 0),
    south = trainPlan(transfer, 1);
  assert.equal(north.direction, -south.direction);
  assert.ok(north.at(0).distanceTo(south.at(0)) > 2);
});

test("Base-to-BNB flights follow north-to-south bearings and speed uses available timing", () => {
  const flight = flightRoute({ originChainId: 8453, destinationChainId: 56 });
  close(flight.getPoint(0).x, 0, "north x");
  assert.ok(flight.getPoint(0).z < -140);
  assert.ok(flight.getPoint(1).z > 140);
  assert.equal(
    movementSpeed({
      kind: "pedestrian",
      originChainId: 1,
      destinationChainId: 1,
    }).animation,
    "sprint",
  );
  assert.equal(
    movementSpeed({
      kind: "pedestrian",
      originChainId: 1,
      destinationChainId: 56,
      durationSeconds: 8,
    }).animation,
    "sprint",
  );
  assert.equal(
    movementSpeed({
      kind: "pedestrian",
      originChainId: 1,
      destinationChainId: 56,
      durationSeconds: null,
    }).animation,
    "walk",
  );
  for (let seconds = 0; seconds < 36; seconds += 0.25)
    assert.ok(
      !(
        getSignalState(seconds, "x") === "green" &&
        getSignalState(seconds, "z") === "green"
      ),
    );
});
