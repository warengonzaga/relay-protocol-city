import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { fixture, transfer } from "./traffic-fixture.js";
import { groundRoute } from "../src/routes.js";
import { createDemoTransfers } from "../src/activity.js";
import { createPolice, disposeTraveler } from "../src/travelers.js";
import {
  DISTRICTS,
  getDistrictAt,
  getInspectionCapacity,
  getInspectionBay,
} from "../src/world-map.js";

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
  const capacity = Math.min(
    getInspectionCapacity(8453),
    getInspectionCapacity(1),
  );
  const pending = Array.from({ length: capacity + 1 }, (_, index) =>
    transfer(430 + index, { stage: "fill" }),
  );
  const completed = transfer(4343, { stage: "complete" });
  f.traffic.setData([completed, ...pending.toReversed()], "live");
  f.until(
    () =>
      pending
        .slice(0, capacity)
        .every((request) => f.phase(request.id) === "arrival-wait"),
    "travelers reach distinct destination bays",
  );
  f.until(
    () => !f.phase(completed.id),
    "completed traffic passes the occupied bay",
    150,
  );
  assert.equal(f.traffic.count, capacity);
  assert.equal(f.traffic.stats.queued, 1);
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

test("all eight destination-demo travelers hold in separate bays and their release drains the checkpoint", (t) => {
  const f = fixture(t);
  const requests = createDemoTransfers(8, "destination-pending");
  assert.equal(
    requests.filter((request) => request.originChainId === 8453).length,
    4,
  );
  assert.equal(
    requests.filter((request) => request.kind === "pedestrian").length,
    4,
  );
  f.traffic.setData(requests, "demo");
  f.until(
    () => requests.every((request) => f.phase(request.id) === "arrival-wait"),
    "incoming and local demo travelers occupy all eight bays",
    240,
  );
  const positions = requests.map((request) =>
    f.root(request.id).position.clone(),
  );
  assert.equal(
    new Set(positions.map((point) => `${point.x}:${point.z}`)).size,
    8,
  );
  f.tick(20);
  for (const [index, request] of requests.entries()) {
    assert.equal(f.phase(request.id), "arrival-wait");
    assert.ok(f.root(request.id).position.distanceTo(positions[index]) < 0.001);
  }
  f.traffic.setData([], "demo");
  f.traffic.releasePending();
  f.tick();
  assert.ok(
    requests.every(
      (request) => f.traffic.inspect(request.id).transfer.stage === "complete",
    ),
  );
  f.until(
    () => f.traffic.count === 0,
    "released demo travelers all finish",
    240,
  );
  assert.deepEqual(f.traffic.trackedIds, []);
});

test("the larger checkpoint parks multiple cars and NPCs in stable separate slots and reuses vacated slots", (t) => {
  const f = fixture(t);
  const requests = ["car", "pedestrian"].flatMap((kind, group) =>
    Array.from(
      { length: getInspectionCapacity(1, kind === "pedestrian") + 1 },
      (_, index) =>
        transfer(5000 + group * 20 + index, {
          kind,
          originChainId: 1,
          destinationChainId: 1,
          stage: "fill",
        }),
    ),
  );
  const capacity = getInspectionCapacity(1) + getInspectionCapacity(1, true);
  f.traffic.setData(requests.toReversed(), "live");
  f.until(
    () => f.traffic.stats.gates === capacity,
    "both authored pools fill without blocking each other",
    240,
  );
  assert.equal(f.traffic.count, capacity);
  assert.equal(f.traffic.stats.queued, 2);
  const held = new Map(
    requests
      .filter((request) => f.phase(request.id) === "arrival-wait")
      .map((request) => [request.id, f.root(request.id).position.clone()]),
  );
  assert.equal(
    new Set([...held.values()].map((point) => `${point.x}:${point.z}`)).size,
    capacity,
  );
  for (const request of requests.filter((request) => held.has(request.id))) {
    const walking = request.kind === "pedestrian";
    assert.ok(
      Array.from({ length: getInspectionCapacity(1, walking) }, (_, slot) =>
        getInspectionBay(1, walking, slot),
      ).some(
        (bay) =>
          Math.hypot(
            bay.x - held.get(request.id).x,
            bay.z - held.get(request.id).z,
          ) < 0.001,
      ),
    );
  }
  f.traffic.setData(requests, "live");
  f.tick(10);
  for (const [id, point] of held)
    assert.ok(
      f.root(id).position.distanceTo(point) < 0.001,
      "polls never move an occupied slot",
    );
  const released = requests.find(
    (request) => request.kind === "pedestrian" && held.has(request.id),
  );
  const waiting = requests.find(
    (request) => request.kind === "pedestrian" && !held.has(request.id),
  );
  f.traffic.setData([{ ...released, stage: "complete" }], "live");
  f.until(
    () => f.phase(waiting.id) === "arrival-wait",
    "overflow uses the pedestrian slot after it clears",
    240,
  );
  assert.ok(
    f.root(waiting.id).position.distanceTo(held.get(released.id)) < 0.001,
  );
  const escorted = requests.find(
    (request) =>
      request.kind === "pedestrian" &&
      held.has(request.id) &&
      request.id !== released.id,
  );
  f.traffic.setData([{ ...escorted, stage: "failed", blocked: false }], "live");
  f.until(
    () => f.phase(escorted.id) === "police",
    "failed walker boards a police escort",
  );
  f.until(
    () => !f.phase(escorted.id),
    "escort clears the aisle between occupied car spaces",
    180,
  );
  for (const request of requests.filter(
    (request) => request.kind === "car" && held.has(request.id),
  )) {
    assert.equal(f.phase(request.id), "arrival-wait");
    assert.ok(
      f.root(request.id).position.distanceTo(held.get(request.id)) < 0.001,
    );
  }
  const failed = requests.find(
    (request) => request.kind === "car" && held.has(request.id),
  );
  const queuedCar = requests.find(
    (request) => request.kind === "car" && !held.has(request.id),
  );
  f.traffic.setData([{ ...failed, stage: "failed", blocked: false }], "live");
  f.until(
    () => f.phase(failed.id) === "police",
    "failed parked car boards a tow truck",
  );
  f.until(
    () => f.phase(queuedCar.id) === "arrival-wait",
    "overflow uses the vehicle slot after the escort clears it",
    240,
  );
  assert.ok(
    f.root(queuedCar.id).position.distanceTo(held.get(failed.id)) < 0.001,
  );
  f.traffic.setData(
    requests.map((request) => ({
      ...request,
      stage: [failed.id, escorted.id].includes(request.id)
        ? "failed"
        : "complete",
    })),
    "live",
  );
  f.until(
    () => f.traffic.count === 0 && f.traffic.stats.queued === 0,
    "all resolved trips drain from the checkpoint",
    240,
  );
});

test("unresolved local trips reserve the border bay without changing their API stage", (t) => {
  const f = fixture(t);
  const capacity = getInspectionCapacity(8453, true);
  const requests = Array.from({ length: capacity + 1 }, (_, index) =>
    transfer(445 + index, {
      kind: "pedestrian",
      destinationChainId: 8453,
      stage: "gate",
    }),
  );
  f.traffic.setData(requests.toReversed(), "live");
  f.until(
    () =>
      requests
        .slice(0, capacity)
        .every((request) => f.phase(request.id) === "arrival-wait"),
    "local swaps reach their reserved border bays",
    180,
  );
  assert.equal(f.traffic.count, capacity);
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

test("a released car lets an entering car clear the shared checkpoint aisle before departing", (t) => {
  const f = fixture(t);
  const first = transfer(5400, {
    originChainId: 1,
    destinationChainId: 1,
    stage: "fill",
  });
  const second = transfer(5401, {
    originChainId: 1,
    destinationChainId: 1,
    stage: "fill",
  });
  f.traffic.setData([first], "live");
  f.until(() => f.phase(first.id) === "arrival-wait", "first car parks", 180);
  f.traffic.setData([second], "live");
  f.until(
    () => f.phase(second.id) === "destination-entry",
    "second car enters the aisle",
    180,
  );
  const parked = f.root(first.id).position.clone();
  f.traffic.setData([{ ...first, stage: "complete" }], "live");
  f.tick(0.2);
  assert.equal(f.phase(first.id), "arrival-wait");
  assert.ok(f.root(first.id).position.distanceTo(parked) < 0.001);
  f.until(
    () => f.phase(second.id) === "arrival-wait",
    "entering car parks without meeting an opposing exit",
  );
  f.until(
    () => !f.phase(first.id),
    "released car then clears the aisle and finishes",
    180,
  );
  f.traffic.setData([{ ...second, stage: "complete" }], "live");
  f.until(
    () => f.traffic.count === 0,
    "both cars drain after confirmation",
    180,
  );
});

test("police pickup and the full tow rig stay inside every district during the first aisle turn", (t) => {
  fixture(t);
  const manifest = JSON.parse(
    readFileSync(new URL("../public/models/manifest.json", import.meta.url)),
  ).models;
  const models = {
    create(key, size, axis) {
      const dimensions = manifest[key].size;
      const scale = size / dimensions[{ x: 0, y: 1, z: 2 }[axis]];
      const root = new THREE.Group();
      root.userData.height = dimensions[1] * scale;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(...dimensions.map((value) => value * scale)),
        new THREE.MeshBasicMaterial(),
      );
      mesh.position.y = root.userData.height / 2;
      mesh.userData.owned = true;
      root.add(mesh);
      return root;
    },
  };
  for (const district of DISTRICTS)
    for (const kind of ["pedestrian", "car", "bus"])
      for (
        let slot = 0;
        slot < getInspectionCapacity(district.id, kind === "pedestrian");
        slot++
      ) {
        const request = transfer(5500 + slot, {
          originChainId: district.id,
          destinationChainId: district.id,
          kind,
        });
        const route = groundRoute(request, {
          destinationSlot: slot,
        }).destinationPolice;
        const police = createPolice(models, request, new THREE.Group());
        for (let distance = 0; distance <= 12; distance += 0.5) {
          const progress = distance / route.getLength();
          police.root.position.copy(route.getPointAt(progress));
          const tangent = route.getTangentAt(progress);
          police.root.rotation.y = Math.atan2(tangent.x, tangent.z);
          police.root.updateMatrixWorld(true);
          police.root.traverse((node) => {
            if (!node.isMesh) return;
            node.geometry.computeBoundingBox();
            const { min, max } = node.geometry.boundingBox;
            for (const x of [min.x, max.x])
              for (const y of [min.y, max.y])
                for (const z of [min.z, max.z]) {
                  const corner = new THREE.Vector3(x, y, z).applyMatrix4(
                    node.matrixWorld,
                  );
                  assert.equal(
                    getDistrictAt(corner.x, corner.z),
                    district,
                    `${kind} pickup in ${district.id} slot ${slot} must keep its full footprint inside at ${corner.x},${corner.z}`,
                  );
                }
          });
        }
        disposeTraveler(police);
      }
});

test("simultaneous failures in Base's opposite checkpoint pools clear without opposing police deadlock", (t) => {
  const f = fixture(t);
  const requests = ["car", "pedestrian"].flatMap((kind, group) =>
    Array.from({ length: 3 }, (_, index) =>
      transfer(15000 + group * 100 + index, {
        originChainId: 8453,
        destinationChainId: 8453,
        kind,
        stage: "fill",
      }),
    ),
  );
  for (const outcome of [
    { car: "failed", blocked: false },
    { car: "failed", blocked: true },
    { car: "complete", blocked: false },
  ]) {
    f.traffic.setData(requests.toReversed(), "live", true);
    f.until(() => f.traffic.stats.gates === 4, "both Base pools fill", 240);
    assert.equal(f.traffic.stats.queued, 2);
    f.traffic.setData(
      requests.map((request) => ({
        ...request,
        stage: request.kind === "car" ? outcome.car : "failed",
        blocked: outcome.blocked,
      })),
      "live",
    );
    f.until(
      () => f.traffic.count === 0 && f.traffic.stats.queued === 0,
      "confirmed cars, police and tow trucks from both sides finish, including the overflow",
      300,
    );
  }
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
