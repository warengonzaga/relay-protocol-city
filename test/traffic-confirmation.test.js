import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { fixture, transfer } from "./traffic-fixture.js";
import { groundRoute } from "../src/routes.js";
import { createDemoTransfers } from "../src/activity.js";

test("trains animate only confirmed success, stay eligible after pending, and disappear on authoritative failure", (t) => {
  const f = fixture(t);
  const request = transfer(70, { kind: "train", stage: "fill" });
  for (const stage of ["origin", "gate", "fill", "failed", "refunded"]) {
    f.traffic.setData([{ ...request, stage }], "live");
    f.tick(10);
    assert.equal(f.traffic.count, 0);
    assert.equal(f.traffic.stats.queued, 0);
  }
  f.traffic.setData([{ ...request, stage: "complete" }], "live");
  f.until(
    () => f.phase(request.id) === "rail-travel",
    "the same request becomes eligible after confirmed completion",
  );
  f.traffic.setData([{ ...request, stage: "failed" }], "live");
  assert.equal(f.traffic.count, 0);
  assert.equal(f.traffic.stats.queued, 0);
  assert.deepEqual(f.traffic.stats.rails, [false, false]);
  const next = transfer(71, { kind: "train", stage: "complete" });
  f.traffic.setData([next, { ...request, stage: "complete" }], "live", true);
  f.tick(1);
  assert.equal(f.traffic.stats.queued, 1);
  f.traffic.setData([{ ...next, stage: "failed" }], "live");
  assert.equal(
    f.traffic.stats.queued,
    0,
    "a failed queued train is removed too",
  );
  f.traffic.setData([next], "live");
  assert.equal(
    f.traffic.stats.queued,
    1,
    "a subsequent success is not lost to deduplication",
  );
  const demoTrains = createDemoTransfers().filter(
    (trip) => trip.kind === "train",
  );
  assert.ok(demoTrains.length > 0);
  assert.ok(demoTrains.every((trip) => trip.stage === "complete"));
  f.traffic.setData(demoTrains, "demo", true);
  f.tick(1);
  assert.ok(
    f.traffic.count > 0,
    "successful illustrative trains still animate",
  );
});

test("destination confirmation uses the toll-side bay, releases only on success, and sends later failures to destination police", (t) => {
  const f = fixture(t);
  let number = 400;
  for (const kind of ["pedestrian", "car"])
    for (const destinationChainId of [1, 8453])
      for (const outcome of ["complete", "failed", "refunded"]) {
        const request = transfer(number++, {
          kind,
          destinationChainId,
          originChainId: destinationChainId === 1 ? 8453 : 1,
          stage: "fill",
          blocked: false,
        });
        const route = groundRoute(request);
        f.traffic.setData([request], "live", true);
        f.until(
          () => f.phase(request.id) === "arrival-wait",
          "traveler reaches destination inspection bay",
          180,
        );
        const held = f.root(request.id).position.clone();
        assert.ok(held.distanceTo(route.destinationHold.getPointAt(1)) < 0.001);
        assert.ok(Math.abs(held.z - route.destination.district.roadZ) >= 9);
        assert.equal(
          f.traffic.inspect(request.id).stopped,
          false,
          "API confirmation wait is not a traffic-light stop",
        );
        f.traffic.setData([], "live");
        f.traffic.releasePending();
        f.tick(20);
        assert.equal(f.phase(request.id), "arrival-wait");
        assert.ok(f.root(request.id).position.distanceTo(held) < 0.001);
        f.traffic.setData([{ ...request, stage: outcome }], "live");
        f.until(
          () =>
            f.phase(request.id) ===
            (outcome === "complete" ? "destination-rejoin" : "board"),
          "authoritative status resolves destination wait",
        );
        if (outcome !== "complete")
          f.until(
            () => f.phase(request.id) === "police",
            "later failure boards destination escort or tow",
          );
        const root = f.root(request.id);
        const finish =
          outcome === "complete"
            ? route.onward.getPointAt(1)
            : route.destinationPolice.getPointAt(1);
        f.until(
          () => !f.phase(request.id),
          "resolved traveler finishes without blocking the bay",
          180,
        );
        assert.ok(root.position.distanceTo(finish) < 0.001);
      }
});

test("destination bay overflow stays tracked while confirmed traffic passes and the queue drains after success", (t) => {
  const f = fixture(t);
  const pending = [430, 431, 432].map((id) => transfer(id, { stage: "fill" }));
  const completed = transfer(433, { stage: "complete" });
  f.traffic.setData([completed, ...pending.toReversed()], "live");
  f.until(
    () => f.phase(pending[0].id) === "arrival-wait",
    "first traveler reaches destination bay",
  );
  f.until(
    () => !f.phase(completed.id),
    "completed traffic passes the occupied bay",
    150,
  );
  assert.equal(f.traffic.count, 1);
  assert.equal(f.traffic.stats.queued, 2);
  assert.deepEqual(
    new Set(f.traffic.trackedIds),
    new Set(pending.map((request) => request.id)),
  );
  f.traffic.setData(
    pending.map((request) => ({ ...request, stage: "complete" })),
    "live",
  );
  f.until(
    () => f.traffic.count === 0 && f.traffic.stats.queued === 0,
    "all confirmed requests drain",
    180,
  );
});

test("the destination-confirmation demo waits at the bay and only its release control confirms it", (t) => {
  const f = fixture(t);
  const request = transfer(440, {
    kind: "pedestrian",
    stage: "fill",
    demoScenario: "destination-pending",
  });
  f.traffic.setData([request], "demo");
  f.until(
    () => f.phase(request.id) === "arrival-wait",
    "demo enters destination bay",
  );
  f.tick(20);
  assert.equal(f.phase(request.id), "arrival-wait");
  f.traffic.releasePending();
  f.until(
    () => f.phase(request.id) === "destination-rejoin",
    "demo confirmation rejoins",
  );
  assert.equal(f.traffic.inspect(request.id).transfer.stage, "complete");
  assert.deepEqual(f.traffic.trackedIds, []);
});

test("unresolved local trips reserve the border bay without changing their API stage", (t) => {
  const f = fixture(t);
  const requests = [445, 446].map((id) =>
    transfer(id, {
      kind: "pedestrian",
      destinationChainId: 8453,
      stage: "gate",
    }),
  );
  f.traffic.setData(requests.toReversed(), "live");
  f.until(
    () => f.phase(requests[0].id) === "arrival-wait",
    "local swap reaches the reserved border bay",
    180,
  );
  assert.equal(f.traffic.count, 1);
  assert.equal(f.traffic.stats.queued, 1);
  assert.equal(f.traffic.inspect(requests[0].id).transfer.stage, "gate");
  assert.ok(
    f
      .root(requests[0].id)
      .position.distanceTo(
        groundRoute(requests[0]).destinationHold.getPointAt(1),
      ) < 0.001,
  );
  f.traffic.setData(
    requests.map((request) => ({ ...request, stage: "complete" })),
    "live",
  );
  f.until(
    () => f.traffic.count === 0 && f.traffic.stats.queued === 0,
    "confirmed local requests finish",
    180,
  );
});

test("focused districts hide airplanes without losing their activity or stopping their simulation", (t) => {
  const f = fixture(t);
  const request = transfer(450, { kind: "airplane", stage: "fill" });
  f.traffic.setData([request], "live");
  f.tick(1);
  const root = f.root(request.id);
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshBasicMaterial(),
  );
  body.userData.owned = true;
  root.add(body);
  f.scene.updateMatrixWorld(true);
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 30);
  camera.position.copy(root.position).add(new THREE.Vector3(0, 0, 10));
  camera.lookAt(root.position);
  camera.updateMatrixWorld();
  const pick = () =>
    f.traffic.pick(
      50,
      50,
      { left: 0, top: 0, width: 100, height: 100 },
      camera,
    );
  assert.equal(pick(), true);
  const start = root.position.clone();
  f.traffic.setFilter("1");
  assert.equal(root.visible, false);
  assert.equal(
    pick(),
    false,
    "hidden airplane geometry cannot open an inspector",
  );
  f.tick(1);
  assert.equal(root.visible, false);
  assert.ok(root.position.distanceTo(start) > 0);
  assert.deepEqual(f.traffic.trackedIds, [request.id]);
  assert.equal(f.traffic.flyover(request), false);
  f.traffic.setFilter("all");
  assert.equal(root.visible, true);
});

test("walkers and runners pass through nearby NPCs in either direction", (t) => {
  const f = fixture(t);
  for (const durationSeconds of [null, 2])
    for (const opposite of [false, true]) {
      const first = transfer(460, {
        kind: "pedestrian",
        stage: "complete",
        durationSeconds,
      });
      const other = {
        ...first,
        id: transfer(461).id,
        ...(opposite ? { originChainId: 1, destinationChainId: 8453 } : {}),
      };
      f.traffic.setData([other, first], "live", true);
      f.until(() => f.traffic.count === 2, "both NPCs spawn");
      const root = f.root(first.id);
      const before = root.position.clone();
      const heading = new THREE.Vector3(
        Math.sin(root.rotation.y),
        0,
        Math.cos(root.rotation.y),
      );
      f.root(other.id).position.copy(before).addScaledVector(heading, 0.5);
      f.tick(0.01);
      assert.equal(f.traffic.inspect(first.id).stopped, false);
      assert.ok(
        root.position.distanceTo(before) > 0,
        "nearby NPCs never stop a pedestrian",
      );
    }
});
