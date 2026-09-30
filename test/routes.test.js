import test from "node:test";
import assert from "node:assert/strict";
import {
  DISTRICTS,
  ROAD_SEGMENTS,
  JUNCTIONS,
  SIGNAL_JUNCTIONS,
  getDistrictAt,
  getDistrictBounds,
  createRailCurve,
  getAddress,
  getTowerAddress,
  getDistrictApps,
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
import { ETHEREUM_INTEGRATORS } from "../src/activity.js";

const relay = { key: "relay", name: "Relay", kind: "relay" };
const integrators = [
  ...ETHEREUM_INTEGRATORS,
  { key: "opensea", name: "OpenSea", kind: "integrator" },
];
const initialEthereumApps = getDistrictApps(1);
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

test("the authored city has a detailed Ethereum neighborhood and compact Base connection", () => {
  assert.deepEqual(
    DISTRICTS.map((d) => d.id),
    [1, 8453],
  );
  const eth = getDistrict(1),
    base = getDistrict(8453);
  const streetLength = (d) =>
    d.localRoads.reduce(
      (sum, [x1, z1, x2, z2]) => sum + Math.hypot(x2 - x1, z2 - z1),
      0,
    );
  assert.ok(streetLength(eth) > streetLength(base) * 2);
  assert.ok(eth.sites.length >= 24);
  assert.equal(eth.sites.filter((s) => s.role === "integrator").length, 5);
  assert.equal(base.sites.filter((s) => s.role === "integrator").length, 1);
  for (const d of DISTRICTS) {
    assert.equal(getDistrictAt(d.x, d.z), d);
    assert.equal(
      d.gates.length,
      1,
      "one gate serves both arrival and departure",
    );
    assert.ok(d.roadZ > d.bounds.top + 5 && d.roadZ < d.bounds.bottom - 5);
    assert.ok(d.loop.left > d.bounds.left && d.loop.right < d.bounds.right);
    for (const site of d.sites) {
      assert.equal(getDistrictAt(site.address.x, site.address.z), d);
      for (const x of [site.x - site.maxWidth / 2, site.x + site.maxWidth / 2])
        for (const z of [
          site.z - site.maxDepth / 2,
          site.z + site.maxDepth / 2,
        ])
          assert.equal(
            getDistrictAt(x, z),
            d,
            `${site.id} footprint leaves district`,
          );
      if (site.role === "scenery") continue;
      const port = site.address;
      assert.ok(
        ROAD_SEGMENTS.some(
          (s) =>
            s.z1 === s.z2 &&
            s.z1 === port.road.z &&
            port.road.x >= s.x1 &&
            port.road.x <= s.x2,
        ),
        `${site.id} driveway must meet a real street`,
      );
    }
  }
  assert.equal(getDistrictAt(999, 999), null);
  assert.ok(SIGNAL_JUNCTIONS.length < JUNCTIONS.length);
  assert.ok(SIGNAL_JUNCTIONS.every((j) => JUNCTIONS.includes(j)));
  const bounds = getDistrictBounds();
  assert.ok(bounds.minX < eth.bounds.left && bounds.maxX > base.bounds.right);
});

test("irregular territories leave the shared highways and their sidewalks unowned", () => {
  for (const d of DISTRICTS) {
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
    for (const origin of DISTRICTS)
      for (const destination of DISTRICTS) {
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

test("walking routes and late reversals stay on marked junction sidewalks", () => {
  registerApps(
    integrators.map((app) => ({
      app,
      originChainId: 1,
      destinationChainId: 8453,
    })),
  );
  for (const app of [relay, ...integrators, { kind: "unknown" }])
    for (const variant of [0, 1])
      for (const origin of DISTRICTS)
        for (const destination of DISTRICTS) {
          const route = groundRoute({
            id: `local-${variant}`,
            originChainId: origin.id,
            destinationChainId: destination.id,
            app,
            kind: "pedestrian",
          });
          const curves = [
            route.depart,
            route.onward,
            route.hold,
            route.returnFromHold,
          ];
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
                  .distanceTo(route.onward.getPointAt(progress * (1 - t))) <
                  1e-9,
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

test("cars use right-hand lanes on the authored street network", () => {
  for (const app of [relay, ...integrators, { kind: "unknown" }])
    for (const variant of [0, 1])
      for (const origin of DISTRICTS)
        for (const destination of DISTRICTS) {
          const transfer = {
            id: `local-${variant}`,
            originChainId: origin.id,
            destinationChainId: destination.id,
            app,
            kind: "car",
          };
          const route = groundRoute(transfer);
          const lateReturn = roadReturnRoute(
            transfer,
            route.onward.getPointAt(0.65),
            route.onward.getTangentAt(0.65),
            true,
          );
          assert.ok(
            lateReturn.getPointAt(1).distanceTo(route.hold.getPointAt(0)) <
              0.001,
            "blocked returns must meet the inspection route without a teleport",
          );
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
  for (const d of DISTRICTS) {
    for (const kind of ["pedestrian", "car"]) {
      const transfer = {
        originChainId: d.id,
        destinationChainId: d.id === 1 ? 8453 : 1,
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

test("ranked Ethereum parcels stay fixed across sample order while other apps use commons and unknown chains stay unmapped", () => {
  const apps = integrators;
  const ranking = ETHEREUM_INTEGRATORS.map(({ key, name }) => ({ key, name }));
  assert.deepEqual(
    initialEthereumApps.map(({ key, name }) => ({ key, name })),
    ranking,
    "ranked parcels exist before any activity sample registers apps",
  );
  assert.deepEqual(
    getDistrictApps(1).map(({ key, name }) => ({ key, name })),
    ranking,
  );
  registerApps(
    apps
      .toReversed()
      .map((app) => ({ app, originChainId: 1, destinationChainId: 8453 })),
  );
  assert.deepEqual(
    getDistrictApps(1).map(({ key, name }) => ({ key, name })),
    ranking,
  );
  for (let slot = 0; slot < 5; slot++) {
    const address = getAddress(1, apps[slot]),
      tower = getTowerAddress(1, slot);
    assert.equal(address.type, "integrator");
    assert.equal(address.x, tower.x);
    assert.equal(address.z, tower.z);
  }
  assert.equal(getAddress(1, apps[5]).type, "commons");
  const observed = getDistrictApps(8453)[0];
  assert.equal(getAddress(8453, observed).type, "integrator");
  assert.equal(
    getAddress(
      8453,
      apps.find((app) => app.key !== observed.key),
    ).type,
    "commons",
  );
  assert.equal(getAddress(8453, { kind: "unknown" }).type, "commons");
  assert.equal(getDistrict(999999999).visible, false);
  assert.equal(getAddress(999999999, relay).type, "unmapped");
  assert.throws(
    () =>
      groundRoute({
        originChainId: 999999999,
        destinationChainId: 1,
        kind: "car",
        app: relay,
      }),
    /outside the authored city/,
  );
  const route = groundRoute({
    originChainId: 8453,
    destinationChainId: 1,
    app: apps[0],
    kind: "car",
  });
  assert.equal(route.origin.app.key, apps[0].key);
  assert.equal(route.destination.app.key, apps[0].key);
  assert.equal(
    getAddress(1, apps[5]).app.key,
    "opensea",
    "commons retains attribution without inventing a dedicated OpenSea tower",
  );
  const police = route.police.getPointAt(1);
  close(police.x, route.origin.district.police.garage.x, "police x");
  close(police.z, route.origin.district.police.garage.z, "police z");
});

test("destination inspection paths meet the onward route exactly and end at the destination bay and police station", () => {
  for (const kind of ["pedestrian", "car"])
    for (const origin of DISTRICTS)
      for (const destination of DISTRICTS) {
        const route = groundRoute({
          originChainId: origin.id,
          destinationChainId: destination.id,
          kind,
          app: relay,
        });
        const junction = route.onward.getPointAt(route.destinationProgress);
        assert.ok(
          junction.distanceTo(route.destinationHold.getPointAt(0)) < 0.001,
        );
        assert.ok(
          junction.distanceTo(route.destinationResume.getPointAt(1)) < 0.001,
        );
        const held = route.destinationHold.getPointAt(1);
        close(held.x, route.destinationBay.x, "destination bay x");
        close(held.z, route.destinationBay.z, "destination bay z");
        assert.ok(Math.abs(held.z - destination.roadZ) >= 9);
        assert.ok(held.distanceTo(route.destinationPolice.getPointAt(0)) < 0.2);
        for (const curve of [
          route.destinationHold,
          route.destinationResume,
          route.destinationPolice,
        ])
          for (const { point } of sample(curve, 60))
            assert.equal(getDistrictAt(point.x, point.z), destination);
        const police = route.destinationPolice.getPointAt(1);
        close(police.x, destination.police.garage.x, "destination police x");
        close(police.z, destination.police.garage.z, "destination police z");
      }
});

test("bus journeys and failed returns use terminals while Relay and attributed travelers use their own parcels", () => {
  registerApps([
    { app: integrators[0], originChainId: 1, destinationChainId: 8453 },
  ]);
  const sourceSite = (address) =>
    address.district.sites.find(
      (site) => site.address.x === address.x && site.address.z === address.z,
    );
  for (const origin of DISTRICTS)
    for (const destination of DISTRICTS)
      for (const app of [relay, integrators[0]])
        for (const kind of ["pedestrian", "car", "bus"]) {
          const transfer = {
            id: "parcel-route",
            originChainId: origin.id,
            destinationChainId: destination.id,
            kind,
            app,
          };
          const route = groundRoute(transfer);
          for (const address of [route.origin, route.destination]) {
            const site = sourceSite(address);
            assert.ok(site);
            assert.equal(
              site.role,
              kind === "bus"
                ? "bus-terminal"
                : app === relay
                  ? "relay"
                  : "integrator",
            );
            if (kind !== "bus" && app === relay)
              assert.equal(
                site.garage !== false,
                kind === "car",
                "Relay walkers use houses without garages; cars use garage houses",
              );
            if (kind !== "bus" && app !== relay)
              assert.equal(address.app.key, app.key);
          }
          const start =
            kind === "pedestrian" ? route.origin.door : route.origin.garage;
          const end =
            kind === "pedestrian"
              ? route.destination.door
              : route.destination.garage;
          close(route.depart.getPointAt(0).x, start.x, "departure x");
          close(route.depart.getPointAt(0).z, start.z, "departure z");
          close(route.onward.getPointAt(1).x, end.x, "destination x");
          close(route.onward.getPointAt(1).z, end.z, "destination z");
          assert.ok(
            route.returnFromHold
              .getPointAt(1)
              .distanceTo(route.depart.getPointAt(0)) < 0.001,
          );
          if (origin === destination)
            assert.ok(
              route.depart
                .getPointAt(0)
                .distanceTo(route.onward.getPointAt(1)) < 0.001,
            );
          if (kind === "bus") {
            const returned = roadReturnRoute(
              transfer,
              route.onward.getPointAt(0.5),
              route.onward.getTangentAt(0.5),
            );
            close(
              returned.getPointAt(1).x,
              start.x,
              "late bus return terminal x",
            );
            close(
              returned.getPointAt(1).z,
              start.z,
              "late bus return terminal z",
            );
          }
        }
});

test("same-chain requests choose stable varied local loops and return to their exact starting parcel", () => {
  for (const district of DISTRICTS)
    for (const kind of ["pedestrian", "car"]) {
      const paths = new Set();
      for (let index = 0; index < 6; index++) {
        const transfer = {
          id: `local-${index}`,
          originChainId: district.id,
          destinationChainId: district.id,
          kind,
          app: integrators[0],
        };
        const route = groundRoute(transfer);
        const repeat = groundRoute({ ...transfer, stage: "complete" });
        paths.add(
          route.onward
            .getPointAt(0.2)
            .toArray()
            .map((n) => n.toFixed(2))
            .join(","),
        );
        assert.ok(
          route.depart.getPointAt(0).distanceTo(route.onward.getPointAt(1)) <
            0.001,
        );
        for (const progress of [0, 0.2, 0.7, 1])
          assert.ok(
            route.onward
              .getPointAt(progress)
              .distanceTo(repeat.onward.getPointAt(progress)) < 0.001,
            "API status changes must not change the local loop",
          );
        for (const { point } of sample(route.onward, 100))
          assert.equal(getDistrictAt(point.x, point.z), district);
      }
      assert.equal(paths.size, 2, "both authored loop directions must be used");
    }
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
        { originChainId: district.id, destinationChainId: 1 },
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
  const transfer = { originChainId: 8453, destinationChainId: 1 };
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
      destinationChainId: 1,
    };
    const flight = flightRoute(transfer),
      sameId = flightRoute({ ...transfer, stage: "failed" });
    entries.add(flight.getPoint(0).x.toFixed(2));
    assert.ok(flight.getPoint(0).distanceTo(sameId.getPoint(0)) < 0.001);
    const angle = (flightBearing(transfer.destinationChainId) * Math.PI) / 180;
    close(
      flight.getPoint(1).x,
      centerX + Math.sin(angle) * radius,
      "bearing x",
    );
    close(
      flight.getPoint(1).z,
      centerZ - Math.cos(angle) * radius,
      "bearing z",
    );
  }
  assert.ok(entries.size > 12);

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
      destinationChainId: 8453,
      durationSeconds: 8,
    }).animation,
    "sprint",
  );
  assert.equal(
    movementSpeed({
      kind: "pedestrian",
      originChainId: 1,
      destinationChainId: 8453,
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
