import test from "node:test";
import assert from "node:assert/strict";
import {
  DISTRICTS,
  ROAD_SEGMENTS,
  JUNCTIONS,
  OTHER_DISTRICT,
  SIGNAL_JUNCTIONS,
  configureDistricts,
  getDistrictAt,
  getDistrictBounds,
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
  flightBearing,
  roadReturnRoute,
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

test("district areas follow unique chain touches across all rows and freeze until reload", () => {
  const transfers = [
    ...Array.from({ length: 24 }, (_, i) => ({
      id: `eth-${i}`,
      originChainId: 1,
      destinationChainId: 1,
    })),
    ...Array.from({ length: 6 }, (_, i) => ({
      id: `base-bnb-${i}`,
      originChainId: 8453,
      destinationChainId: 56,
    })),
  ];
  assert.equal(configureDistricts([...transfers, transfers[0]]), true);
  assert.equal(
    getDistrict(1).activityCount,
    24,
    "same-chain touches and repeated IDs count once",
  );
  assert.equal(getDistrict(56).activityCount, 6);
  assert.equal(
    getDistrict(8453).width,
    getDistrict(56).width,
    "equal activity means equal core width across rows",
  );
  assert.ok(getDistrict(1).width > getDistrict(56).width);
  const before = JSON.stringify(DISTRICTS);
  assert.equal(configureDistricts([], { 56: 999 }), false);
  assert.equal(JSON.stringify(DISTRICTS), before);
  for (const d of [...DISTRICTS, OTHER_DISTRICT]) {
    assert.equal(getDistrictAt(d.x, d.z), d);
    assert.ok(d.roadZ > d.bounds.top + 5 && d.roadZ < d.bounds.bottom - 5);
    assert.ok(d.loop.left > d.bounds.left && d.loop.right < d.bounds.right);
  }
  assert.equal(getDistrictAt(999, 999), null);
  assert.ok(SIGNAL_JUNCTIONS.length < JUNCTIONS.length);
  assert.ok(SIGNAL_JUNCTIONS.every((j) => JUNCTIONS.includes(j)));
  const bounds = getDistrictBounds();
  assert.ok(
    bounds.minX < OTHER_DISTRICT.bounds.left &&
      bounds.maxX > Math.max(...DISTRICTS.map((d) => d.bounds.right)),
  );
});

test("irregular territories leave the shared highways and their sidewalks unowned", () => {
  for (const d of [...DISTRICTS, OTHER_DISTRICT]) {
    assert.ok(d.polygon.length >= 6);
    assert.ok(
      d.polygon.filter(
        (p, i, all) =>
          p.x !== all[(i + 1) % all.length].x &&
          p.z !== all[(i + 1) % all.length].z,
      ).length >= 4,
    );
    assert.equal(
      getDistrictAt(d.bounds.left + 0.5, d.polygonBounds.top + 0.5),
      null,
      "cut corners must not behave like bounding rectangles",
    );
    for (const x of [d.bounds.left + 0.1, d.x, d.bounds.right - 0.1])
      for (const z of [d.bounds.top + 0.1, d.z, d.bounds.bottom - 0.1])
        assert.equal(
          getDistrictAt(x, z),
          d,
          "street/building core stays inside its territory",
        );
    for (const gate of d.gates) {
      assert.equal(getDistrictAt(gate.x, gate.z), d);
      assert.equal(
        getDistrictAt(gate.x + (gate.side === "west" ? -0.1 : 0.1), gate.z),
        null,
        "each gate crosses straight into the public road",
      );
    }
  }
  for (const s of ROAD_SEGMENTS.filter((s) => s.neutral)) {
    const horizontal = s.z1 === s.z2;
    for (let step = 1; step < 20; step++)
      for (const side of [-4.7, 0, 4.7]) {
        const x = s.x1 + ((s.x2 - s.x1) * step) / 20 + (horizontal ? 0 : side);
        const z = s.z1 + ((s.z2 - s.z1) * step) / 20 + (horizontal ? side : 0);
        assert.equal(
          getDistrictAt(x, z),
          null,
          `neutral road or sidewalk belongs to a district at ${x},${z}`,
        );
      }
  }
});

test("cross-chain trips and failed returns use neutral roads without entering a third district", () => {
  for (const kind of ["pedestrian", "car"])
    for (const origin of [...DISTRICTS, OTHER_DISTRICT])
      for (const destination of [...DISTRICTS, OTHER_DISTRICT]) {
        const transfer = {
          originChainId: origin.id,
          destinationChainId: destination.id,
          app: relay,
          kind,
        };
        const route = groundRoute(transfer);
        const curves = [
          route.depart,
          route.onward,
          route.hold,
          route.returnFromHold,
        ];
        if (kind === "car" && origin !== destination)
          for (const progress of [0.2, 0.65, 0.98])
            curves.push(
              roadReturnRoute(
                transfer,
                route.onward.getPointAt(progress),
                route.onward.getTangentAt(progress),
              ),
            );
        let usesNeutral = false;
        for (const curve of curves)
          for (const { point: p } of sample(
            curve,
            Math.ceil(curve.getLength() / 2),
          )) {
            const owner = getDistrictAt(p.x, p.z);
            if (!owner) usesNeutral = true;
            assert.ok(
              !owner || owner === origin || owner === destination,
              `${origin.id} to ${destination.id} ${kind} entered unrelated ${owner?.id} at ${p.x},${p.z}`,
            );
            if (origin === destination)
              assert.equal(
                owner,
                origin,
                "same-chain trips stay inside their own polygon",
              );
          }
        if (origin !== destination)
          assert.ok(
            usesNeutral,
            "cross-chain movement must use the public corridors",
          );
      }
});

test("every district route returns home for swaps and reaches the correct cross-chain address", () => {
  for (const kind of ["pedestrian", "car"])
    for (const origin of [...DISTRICTS, OTHER_DISTRICT])
      for (const destination of [...DISTRICTS, OTHER_DISTRICT]) {
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

test("walking routes and late reversals stay on marked junction sidewalks", () => {
  const integrator = { key: "opensea", kind: "integrator", name: "OpenSea" };
  registerApps(
    DISTRICTS.map((d) => ({
      app: integrator,
      originChainId: d.id,
      destinationChainId: 56,
    })),
  );
  for (const app of [relay, integrator, { kind: "unknown" }])
    for (const origin of [...DISTRICTS, OTHER_DISTRICT])
      for (const destination of [...DISTRICTS, OTHER_DISTRICT]) {
        const route = groundRoute({
          originChainId: origin.id,
          destinationChainId: destination.id,
          app,
          kind: "pedestrian",
        });
        const curves = [route.onward];
        for (const progress of [0.2, 0.65, 0.98]) {
          const reversed = reversePath(route.onward, progress);
          close(
            reversed.getLength(),
            route.onward.getLength() * progress,
            "partial return length",
          );
          for (const t of [0, 0.17, 0.63, 1]) {
            assert.ok(
              reversed
                .getPointAt(t)
                .distanceTo(route.onward.getPointAt(progress * (1 - t))) < 1e-9,
              "returns must preserve original pavement geometry exactly",
            );
            assert.ok(
              reversed.getPoint(t).distanceTo(reversed.getPointAt(t)) < 1e-9,
            );
            assert.ok(
              reversed
                .getTangentAt(t)
                .dot(route.onward.getTangentAt(progress * (1 - t))) < -0.999,
            );
          }
          curves.push(reversed);
        }
        for (const curve of curves)
          for (const { point: p } of sample(curve)) {
            const owner = getDistrictAt(p.x, p.z);
            assert.ok(
              !owner || owner === origin || owner === destination,
              "walking returns must not enter a third district",
            );
            for (const s of ROAD_SEGMENTS) {
              const horizontal = s.z1 === s.z2;
              const across = horizontal
                ? Math.abs(p.z - s.z1)
                : Math.abs(p.x - s.x1);
              const along = horizontal ? p.x : p.z;
              if (
                across >= 3.35 ||
                along < (horizontal ? s.x1 : s.z1) ||
                along > (horizontal ? s.x2 : s.z2)
              )
                continue;
              assert.ok(
                JUNCTIONS.some((j) =>
                  horizontal
                    ? Math.abs(j.z - s.z1) < 0.001 &&
                      Math.abs(Math.abs(p.x - j.x) - 4.7) < 1.2
                    : Math.abs(j.x - s.x1) < 0.001 &&
                      Math.abs(Math.abs(p.z - j.z) - 4.7) < 1.2,
                ),
                `off-crosswalk at ${p.x},${p.z}`,
              );
            }
          }
      }
});

test("cars use right-hand lanes on the rendered variable-width street network", () => {
  for (const app of [
    relay,
    { key: "opensea", kind: "integrator" },
    { kind: "unknown" },
  ])
    for (const origin of [...DISTRICTS, OTHER_DISTRICT])
      for (const destination of [...DISTRICTS, OTHER_DISTRICT]) {
        const route = groundRoute({
          originChainId: origin.id,
          destinationChainId: destination.id,
          app,
          kind: "car",
        });
        for (const { point: p, tangent: t } of sample(route.onward, 150)) {
          if (
            JUNCTIONS.some(
              (j) => Math.abs(p.x - j.x) < 5 && Math.abs(p.z - j.z) < 5,
            )
          )
            continue;
          for (const s of ROAD_SEGMENTS) {
            if (
              s.z1 === s.z2 &&
              p.x > s.x1 &&
              p.x < s.x2 &&
              Math.abs(p.z - s.z1) < 2 &&
              Math.abs(t.x) > 0.999
            )
              assert.equal(Math.sign(t.x), Math.sign(p.z - s.z1));
            if (
              s.x1 === s.x2 &&
              p.z > s.z1 &&
              p.z < s.z2 &&
              Math.abs(p.x - s.x1) < 2 &&
              Math.abs(t.z) > 0.999
            )
              assert.equal(Math.sign(t.z), -Math.sign(p.x - s.x1));
          }
        }
      }
});

test("only onward routes cross origin borders and inspection bays clear the through lane", () => {
  for (const d of [...DISTRICTS, OTHER_DISTRICT]) {
    for (const kind of ["pedestrian", "car"]) {
      const transfer = {
        originChainId: d.id,
        destinationChainId: d.id === 56 ? 8453 : 56,
        app: relay,
        kind,
      };
      const route = groundRoute(transfer);
      for (const curve of [route.depart, route.hold, route.returnFromHold]) {
        for (const { point: p } of sample(curve, 60))
          assert.ok(
            p.x >= d.bounds.left - 0.01 &&
              p.x <= d.bounds.right + 0.01 &&
              p.z >= d.bounds.top - 0.01 &&
              p.z <= d.bounds.bottom + 0.01,
            `pre-fill route escaped ${d.id}`,
          );
      }
      assert.ok(Math.abs(route.bay.z - d.roadZ) >= 9);
      assert.ok(
        route.hold.getPointAt(0).distanceTo(route.depart.getPointAt(1)) < 0.001,
      );
      assert.ok(
        route.resume.getPointAt(1).distanceTo(route.onward.getPointAt(0)) <
          0.001,
      );
      assert.ok(
        route.returnFromHold
          .getPointAt(1)
          .distanceTo(route.depart.getPointAt(0)) < 0.001,
      );
      assert.ok(
        route.police.getPointAt(0).distanceTo(route.hold.getPointAt(1)) < 0.2,
      );
      assert.ok(
        sample(route.onward).some(({ point: p }) =>
          d.gate.side === "west" ? p.x < d.bounds.left : p.x > d.bounds.right,
        ),
      );
      if (kind === "car") {
        const returnPath = roadReturnRoute(
          transfer,
          route.onward.getPointAt(0.4),
          route.onward.getTangentAt(0.4),
          true,
        );
        assert.ok(
          returnPath.getPointAt(1).distanceTo(route.depart.getPointAt(1)) <
            0.001,
        );
      }
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

test("flights vary their entry per request while preserving the destination bearing and failure entry", () => {
  const entries = new Set();
  const bounds = getDistrictBounds();
  const centerX = (bounds.minX + bounds.maxX) / 2,
    centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const radius =
    Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 20;
  for (let i = 0; i < 20; i++) {
    const transfer = {
      id: `flight-${i}`,
      originChainId: 8453,
      destinationChainId: 56,
    };
    const flight = flightRoute(transfer),
      sameId = flightRoute({ ...transfer, stage: "failed" });
    entries.add(flight.getPoint(0).x.toFixed(2));
    assert.ok(flight.getPoint(0).distanceTo(sameId.getPoint(0)) < 0.001);
    close(flight.getPoint(1).x, centerX, "south x");
    close(flight.getPoint(1).z, centerZ + radius, "south edge");
  }
  assert.ok(entries.size > 12);
  assert.equal(flightBearing(56), 180);
  for (const d of DISTRICTS) {
    const flight = flightRoute({
      id: "same-chain-flight",
      originChainId: d.id,
      destinationChainId: d.id,
    });
    const end = flight.getPoint(1),
      bearing = (flightBearing(d.id) * Math.PI) / 180;
    close(end.x, centerX + Math.sin(bearing) * radius, "destination bearing x");
    close(end.z, centerZ - Math.cos(bearing) * radius, "destination bearing z");
  }
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
