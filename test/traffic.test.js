import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { fixture, transfer } from "./traffic-fixture.js";
import { flightRoute, groundRoute } from "../src/routes.js";
import { SIGNAL_JUNCTIONS, getSignalState } from "../src/world-map.js";
import { createDemoTransfers } from "../src/activity.js";
import { refreshTravelerPace } from "../src/travelers.js";

test("picking skips clipped world-space hits but still selects visible travelers behind them", (t) => {
  const selected = [];
  const f = fixture(t, (request) => selected.push(request.id));
  const near = transfer(230);
  const far = transfer(231, { originChainId: 1, destinationChainId: 8453 });
  f.traffic.setData([near, far], "live");
  f.tick(1);
  for (const [request, z] of [
    [near, 0],
    [far, -5],
  ]) {
    const root = f.root(request.id);
    assert.ok(root);
    root.position.set(20, 0, z);
    root.quaternion.identity();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2, 2, 2),
      new THREE.MeshBasicMaterial(),
    );
    body.userData.owned = true;
    root.add(body);
  }
  f.scene.updateMatrixWorld(true);
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, 0.1, 30);
  camera.position.set(20, 0, 10);
  camera.lookAt(20, 0, 0);
  camera.updateMatrixWorld();
  const rect = { left: 0, top: 0, width: 100, height: 100 };
  const pick = (planes) => f.traffic.pick(50, 50, rect, camera, planes);
  const boundary = new THREE.Plane(new THREE.Vector3(1, 0, 0), -20);
  const clipNear = new THREE.Plane(new THREE.Vector3(0, 0, -1), -2);
  const clipBoth = new THREE.Plane(new THREE.Vector3(1, 0, 0), -21);
  assert.equal(pick(), true);
  assert.equal(selected.at(-1), near.id, "overview selects the nearest hit");
  assert.equal(pick([boundary]), true);
  assert.equal(selected.at(-1), near.id, "points on the border remain visible");
  assert.equal(pick([boundary, clipNear]), true);
  assert.equal(
    selected.at(-1),
    far.id,
    "a clipped foreground hit does not occlude picking",
  );
  assert.equal(pick([boundary, clipBoth]), false);
  assert.equal(
    selected.length,
    3,
    "fully clipped geometry cannot open an inspector",
  );
  assert.equal(pick(), true);
  assert.equal(
    selected.at(-1),
    near.id,
    "returning to overview restores picking",
  );
});

test("opposing trains share separate lanes and a third waits until its tunnel is clear", (t) => {
  const f = fixture(t);
  const first = transfer(1, { kind: "train", stage: "complete" });
  const opposite = transfer(2, {
    kind: "train",
    stage: "complete",
    originChainId: 1,
    destinationChainId: 8453,
  });
  const queued = transfer(3, { kind: "train", stage: "complete" });
  f.traffic.setData([queued, opposite, first], "live");
  f.tick(1);
  assert.equal(f.traffic.count, 2);
  assert.notEqual(
    f.traffic.inspect(first.id).lane,
    f.traffic.inspect(opposite.id).lane,
  );
  assert.deepEqual(f.traffic.stats.rails, [true, true]);
  assert.equal(f.traffic.stats.queued, 1);
  f.until(
    () =>
      f.phase(first.id) === "rail-origin" &&
      f.phase(opposite.id) === "rail-origin",
    "both trains must reach their origin stations",
  );
  assert.equal(f.traffic.stats.queued, 1);
  f.until(
    () => f.phase(first.id) === "rail-exit",
    "confirmed train must leave its destination station",
  );
  assert.equal(
    f.phase(queued.id),
    undefined,
    "the shared lane stays occupied until the train reaches its tunnel",
  );
  f.until(
    () => Boolean(f.phase(queued.id)),
    "the queued train must survive polling and spawn when its lane clears",
  );
  assert.equal(f.phase(first.id), undefined);
  assert.equal(
    f.created.filter(
      (root) => root.userData.modelKey === "train-electric-city-a",
    ).length,
    3,
  );
  f.traffic.setData(
    [queued, opposite, { ...first, stage: "complete" }],
    "live",
  );
  f.tick(3);
  assert.equal(
    f.traffic.stats.queued,
    0,
    "repeated samples must not enqueue a second traveler for an existing ID",
  );
});

test("live pending travelers cannot be released by elapsed time, missing updates, or demo controls", (t) => {
  const f = fixture(t);
  const pending = transfer(10);
  f.traffic.setData([pending], "live");
  f.until(
    () => f.phase(pending.id) === "gate",
    "pending traveler must reach its origin gate",
  );
  const root = f.root(pending.id);
  const stoppedAt = root.position.clone();
  f.traffic.setData([], "live");
  f.traffic.releasePending();
  assert.equal(f.traffic.flyover(transfer(11, { kind: "airplane" })), false);
  f.tick(120);
  assert.equal(f.phase(pending.id), "gate");
  assert.equal(root.position.distanceTo(stoppedAt), 0);
  assert.deepEqual(f.traffic.trackedIds, [pending.id]);

  const completed = { ...pending, stage: "complete", status: "success" };
  f.traffic.setData([completed, completed], "live");
  f.until(
    () => f.phase(pending.id) === "onward",
    "only the same request's confirmed success releases its gate",
  );
  assert.equal(
    f.root(pending.id),
    root,
    "the status update must reuse the existing traveler",
  );
  assert.equal(root.userData.transfer.stage, "complete");
  assert.equal(f.traffic.stats.queued, 0);
  f.until(
    () => f.traffic.count === 0,
    "the confirmed traveler must eventually arrive and be removed",
  );
  f.traffic.setData([completed], "live");
  f.tick(2);
  assert.equal(
    f.traffic.count,
    0,
    "a repeated completed sample must not replay a live request",
  );
});

test("live failures return from the checkpoint and from partway along the onward route", (t) => {
  const f = fixture(t);
  const request = transfer(20, { kind: "pedestrian" });
  f.traffic.setData([request], "live");
  f.until(() => f.phase(request.id) === "gate", "walker must reach its gate");
  const root = f.root(request.id);
  const origin = groundRoute(request).depart.getPointAt(0);
  f.traffic.setData(
    [{ ...request, stage: "failed", status: "failure" }],
    "live",
  );
  f.until(
    () => f.phase(request.id) === "return",
    "failed traveler must return toward its origin",
  );
  f.until(
    () => f.traffic.count === 0,
    "failed traveler must finish the return journey",
  );
  assert.ok(root.position.distanceTo(origin) < 0.01);

  const later = transfer(21, { kind: "pedestrian", stage: "fill" });
  f.traffic.setData([later], "live");
  f.until(
    () => f.phase(later.id) === "onward",
    "confirmed fill must release the traveler",
  );
  f.tick(2);
  const laterRoot = f.root(later.id);
  f.traffic.setData(
    [{ ...later, stage: "refunded", status: "refund" }],
    "live",
  );
  f.until(
    () => f.phase(later.id) === "back-to-gate",
    "failure after departure must reverse the traveled onward segment",
  );
  f.until(
    () => f.phase(later.id) === "return",
    "the traveler must return through its origin checkpoint",
  );
  f.until(
    () => f.traffic.count === 0,
    "refunded traveler must finish back at its origin",
  );
  assert.ok(
    laterRoot.position.distanceTo(groundRoute(later).depart.getPointAt(0)) <
      0.01,
  );
});

test("blocked pedestrians and cars board police, end at the station, and dispose owned resources", (t) => {
  const f = fixture(t);
  for (const [number, kind] of [
    [30, "pedestrian"],
    [31, "car"],
  ]) {
    const request = transfer(number, { kind });
    f.traffic.setData([request], "live", true);
    f.until(
      () => f.phase(request.id) === "gate",
      "traveler must reach its gate before police arrive",
    );
    const original = f.root(request.id);
    const originalLabel = original.children.find(
      (node) => node.userData.transient,
    );
    let labelDisposals = 0;
    originalLabel.material.addEventListener("dispose", () => labelDisposals++);
    f.traffic.setData([{ ...request, stage: "failed", blocked: true }], "live");
    f.until(
      () => f.phase(request.id) === "board",
      "blocked traveler must board a police vehicle",
    );
    assert.equal(f.scene.children[0].children.length, 2);
    f.until(
      () => f.phase(request.id) === "police",
      "police must leave after boarding",
    );
    assert.equal(
      labelDisposals,
      1,
      "the replaced traveler's label must be disposed exactly once",
    );
    assert.equal(f.scene.children[0].children.length, 1);
    const police = f.root(request.id);
    let ownedDisposals = 0;
    let ownedResources = 0;
    police.traverse((node) => {
      if (node.userData.owned) {
        ownedResources += 2;
        node.geometry.addEventListener("dispose", () => ownedDisposals++);
        node.material.addEventListener("dispose", () => ownedDisposals++);
      }
    });
    assert.ok(
      ownedResources >= 4,
      "police must have two independently flashing lights",
    );
    f.until(
      () => f.traffic.count === 0,
      "police must reach their station and leave the scene",
    );
    assert.ok(
      police.position.distanceTo(groundRoute(request).police.getPointAt(1)) <
        0.01,
    );
    assert.equal(ownedDisposals, ownedResources);
    assert.equal(f.scene.children[0].children.length, 0);
    assert.equal(labelDisposals, 1);
  }
});

test("demo pending travelers are explicit, untracked, and released only by the demo control", (t) => {
  const f = fixture(t);
  const demo = transfer(40, { id: "demo-pending", demoScenario: "pending" });
  f.traffic.setData([demo], "demo");
  f.until(
    () => f.phase(demo.id) === "gate",
    "demo traveler must reach its gate",
  );
  f.tick(40);
  assert.equal(f.phase(demo.id), "gate");
  assert.deepEqual(f.traffic.trackedIds, []);
  f.traffic.releasePending();
  f.until(
    () => f.phase(demo.id) === "onward",
    "the demo control must release its pending scenario",
  );
  assert.deepEqual(f.traffic.trackedIds, []);
});

test("confirmed trips pass the border without checkpoint dwell in live and demo modes", (t) => {
  const f = fixture(t);
  for (const [index, kind] of ["pedestrian", "car"].entries()) {
    for (const mode of ["live", "demo"]) {
      const request = transfer(300 + index, {
        kind,
        stage: "complete",
        demoScenario: "success",
      });
      f.traffic.setData([request], mode, true);
      f.until(
        () => Boolean(f.phase(request.id)),
        "confirmed traveler must spawn",
      );
      f.until(() => {
        assert.ok(
          !["gate", "inspection-entry", "rejoin"].includes(f.phase(request.id)),
          "confirmed trips must stay in the through lane",
        );
        return f.phase(request.id) === "onward";
      }, "confirmed traveler must pass its border directly");
    }
  }
});

test("a pending border check does not trap a confirmed trip in the through lane", (t) => {
  const f = fixture(t);
  for (const [index, kind] of ["pedestrian", "car"].entries()) {
    const pending = transfer(310 + index * 2, { kind, originChainId: 8453 });
    const confirmed = transfer(311 + index * 2, {
      kind,
      originChainId: 8453,
      stage: "complete",
    });
    const checks = [
      transfer(1300 + index * 2, { kind, originChainId: 8453 }),
      pending,
    ];
    f.traffic.setData(checks, "live", true);
    f.until(
      () => f.phase(pending.id) === "gate",
      "pending traveler must enter its inspection bay",
    );
    const stoppedAt = f.root(pending.id).position.clone();
    f.traffic.setData([confirmed, ...checks], "live");
    f.until(
      () => Boolean(f.phase(confirmed.id)),
      "confirmed traveler must spawn behind the pending request",
    );
    f.until(
      () => !f.phase(confirmed.id),
      "confirmed traveler must reach its destination while the other check stays pending",
      150,
    );
    assert.equal(f.phase(pending.id), "gate");
    assert.ok(f.root(pending.id).position.distanceTo(stoppedAt) < 0.001);
    assert.equal(
      f.traffic.stats.queued,
      1,
      "the extra pending check must not block confirmed requests later in the queue",
    );
  }
});

test("same-chain travel stays inside the district and waits for destination confirmation without a toll stop", (t) => {
  const f = fixture(t);
  const request = transfer(320, {
    kind: "pedestrian",
    destinationChainId: 8453,
  });
  f.traffic.setData([request], "live");
  f.until(() => {
    assert.ok(
      !["gate", "inspection-entry"].includes(f.phase(request.id)),
      "same-chain travel must not enter a border checkpoint",
    );
    return f.phase(request.id) === "arrival-wait";
  }, "unconfirmed same-chain request must wait before entering home");
  f.tick(20);
  assert.equal(f.phase(request.id), "arrival-wait");
  f.traffic.setData([{ ...request, stage: "complete" }], "live");
  f.until(
    () => !f.phase(request.id),
    "same-chain traveler must enter home after confirmation",
  );
});

test("police sirens glow during pickup, freeze on pause, and stay steady with reduced motion", (t) => {
  const f = fixture(t);
  const request = transfer(330, {
    kind: "pedestrian",
    stage: "failed",
    blocked: true,
  });
  f.traffic.setData([request], "live");
  f.until(
    () => f.phase(request.id) === "board",
    "blocked traveler must be picked up",
  );
  const police = f.created.find((root) => root.userData.modelKey === "sedan");
  const glows = police.children.filter(
    (node) =>
      node.isSprite && node.material.blending === THREE.AdditiveBlending,
  );
  assert.equal(glows.length, 2);
  const opacity = () => glows.map((glow) => glow.material.opacity);
  const initial = opacity();
  f.tick(0.2);
  assert.notDeepEqual(
    opacity(),
    initial,
    "siren must animate while boarding, before the escort begins",
  );
  f.traffic.setPaused(true);
  const paused = opacity();
  f.tick(1);
  assert.deepEqual(opacity(), paused);
  f.traffic.setReducedMotion(true);
  const steady = opacity();
  assert.equal(
    steady[0],
    steady[1],
    "both colors remain visible under reduced motion",
  );
  f.traffic.setPaused(false);
  f.tick(0.5);
  assert.deepEqual(
    opacity(),
    steady,
    "resuming travel must not resume flashing under reduced motion",
  );
  let texturesDisposed = 0;
  glows.forEach((glow) =>
    glow.material.map.addEventListener("dispose", () => texturesDisposed++),
  );
  f.until(() => !f.phase(request.id), "police escort must finish");
  assert.equal(texturesDisposed, 2);
});

test("road travelers stop at red lights and resume under the same world signal clock", (t) => {
  const f = fixture(t);
  const request = transfer(50, { stage: "complete" });
  f.traffic.setData([request], "live");
  f.until(() => Boolean(f.root(request.id)), "car must spawn");
  const root = f.root(request.id);
  let previous = root.position.clone();
  let direction = new THREE.Vector3();
  f.until(() => {
    const moved = root.position.clone().sub(previous);
    if (moved.length() > 0.01) direction.copy(moved).normalize();
    previous.copy(root.position);
    return f.traffic.inspect(request.id)?.stopped;
  }, "a lone car must stop for a non-green signal");
  const axis = Math.abs(direction.x) > Math.abs(direction.z) ? "x" : "z";
  assert.notEqual(getSignalState(f.elapsed, axis), "green");
  const crossAxis = axis === "x" ? "z" : "x";
  assert.ok(
    SIGNAL_JUNCTIONS.some((junction) => {
      const ahead =
        (junction[axis] - root.position[axis]) * Math.sign(direction[axis]);
      return (
        ahead >= 4.1 &&
        ahead <= 7 &&
        Math.abs(junction[crossAxis] - root.position[crossAxis]) < 3.1
      );
    }),
    "a red-light stop must belong to a real T/cross intersection",
  );
  const stoppedAt = root.position.clone();
  f.tick(0.1);
  assert.ok(root.position.distanceTo(stoppedAt) < 0.0001);
  f.until(
    () => root.position.distanceTo(stoppedAt) > 0.01,
    "car must resume when its signal turns green",
    20,
  );
  assert.equal(getSignalState(f.elapsed, axis), "green");
  for (let seconds = -18; seconds < 54; seconds += 0.1) {
    assert.ok(
      !(
        getSignalState(seconds, "x") === "green" &&
        getSignalState(seconds, "z") === "green"
      ),
    );
  }
});

test("pending airplanes remain queued and airborne failures return to their original entry", (t) => {
  const f = fixture(t);
  const request = transfer(60, { kind: "airplane" });
  f.traffic.setData([request], "live");
  f.tick(30);
  assert.equal(
    f.traffic.count,
    0,
    "pending backend state must not animate a completed flight",
  );
  assert.equal(f.traffic.stats.queued, 1);
  assert.deepEqual(f.traffic.trackedIds, [request.id]);
  f.traffic.setData([], "live");
  f.tick(30);
  assert.equal(f.traffic.stats.queued, 1);
  f.traffic.setData([{ ...request, stage: "fill" }], "live");
  f.until(
    () => Boolean(f.root(request.id)),
    "confirmed fill must release the queued airplane",
  );
  const root = f.root(request.id);
  const entry = root.position.clone();
  f.tick(2);
  assert.ok(root.position.distanceTo(entry) > 20);
  f.traffic.setData([{ ...request, stage: "failed" }], "live");
  f.until(
    () => f.traffic.count === 0,
    "failed airborne request must finish its return flight",
  );
  assert.ok(
    root.position.distanceTo(entry) < 0.01,
    "failure must end at the origin entry, not the destination bearing",
  );
});

test("bounded request tracking rotates across active and queued unresolved IDs", (t) => {
  const f = fixture(t);
  const requests = Array.from({ length: 25 }, (_, index) =>
    transfer(100 + index, { kind: "train" }),
  );
  f.traffic.setData(requests, "live");
  f.tick(1);
  const tracked = new Set();
  for (let poll = 0; poll < 3; poll++) {
    const ids = f.traffic.trackedIds;
    assert.ok(ids.length <= 12);
    assert.equal(new Set(ids).size, ids.length);
    ids.forEach((id) => tracked.add(id));
  }
  assert.deepEqual(
    tracked,
    new Set(requests.map((request) => request.id)),
    "queue position must not starve exact-ID status refreshes",
  );
});

test("checks sharing an origin remain tracked off the through lane and drain after confirmed releases", (t) => {
  const f = fixture(t);
  const requests = [80, 81, 82].map((number) =>
    transfer(number, { originChainId: 8453 }),
  );
  f.traffic.setData(requests, "live");
  f.until(
    () => f.traffic.stats.gates >= 1,
    "the lead car must reach its gate without a following-car deadlock",
  );
  f.tick(30);
  assert.equal(f.traffic.count, 1);
  assert.equal(f.traffic.stats.gates, 1);
  assert.equal(
    f.traffic.stats.queued,
    2,
    "additional checks must not form a tail across the through lane",
  );
  assert.deepEqual(
    new Set(f.traffic.trackedIds),
    new Set(requests.map((request) => request.id)),
  );
  f.traffic.setData(
    requests.map((request) => ({ ...request, stage: "complete" })),
    "live",
  );
  f.until(
    () => f.traffic.count === 0 && f.traffic.stats.queued === 0,
    "releasing every request must drain the same-origin queue",
    150,
  );
});

test("unsupported chains are ignored at the traffic boundary without wrong-district aliases", (t) => {
  const f = fixture(t);
  const requests = [10001, 10002].map((originChainId, index) =>
    transfer(340 + index, { originChainId }),
  );
  f.traffic.setData(requests, "live");
  f.tick(5);
  assert.equal(f.traffic.count, 0);
  assert.equal(f.traffic.stats.queued, 0);
  assert.deepEqual(f.traffic.trackedIds, []);
  f.traffic.setData([...requests, transfer(342)], "live");
  f.until(
    () => f.traffic.stats.gates === 1,
    "a supported request must still reach its real district",
  );
  f.tick();
  assert.deepEqual(f.pendingDistricts, [8453]);
  f.traffic.setData(requests, "demo", true);
  assert.equal(
    f.traffic.flyover(
      transfer(343, { originChainId: 10001, kind: "airplane" }),
    ),
    false,
  );
  f.tick(5);
  assert.equal(f.traffic.count, 0);
});

test("the shipped pending demo reaches its checkpoints with mixed cars and walkers", (t) => {
  const f = fixture(t);
  const requests = createDemoTransfers("pending");
  f.traffic.setData(requests, "demo");
  f.until(
    () => f.traffic.stats.gates >= 1,
    "the actual pending demo must reach a checkpoint",
  );
  f.tick(60);
  assert.equal(
    f.traffic.count + f.traffic.stats.queued,
    requests.length,
    "every pending fixture must remain represented or queued",
  );
  assert.ok(f.traffic.stats.gates >= 1);
});

test("a failed lead car returns without trapping the following origin queue", (t) => {
  const f = fixture(t);
  const requests = [90, 91, 92].map((number) =>
    transfer(number, { originChainId: 8453 }),
  );
  f.traffic.setData(requests, "live");
  f.until(
    () => f.traffic.stats.gates >= 1,
    "the lead car must reach the checkpoint",
  );
  f.tick(20);
  const lead = requests.find((request) => f.phase(request.id) === "gate");
  f.traffic.setData(
    requests.map((request) => ({
      ...request,
      stage: request.id === lead.id ? "failed" : "complete",
    })),
    "live",
  );
  f.until(
    () => f.traffic.count === 0,
    "the failed car and following successful cars must all finish",
    150,
  );
});

test("a car failing after departure avoids the lane occupied by its followers", (t) => {
  const f = fixture(t);
  const requests = [95, 96, 97].map((number) =>
    transfer(number, { originChainId: 8453 }),
  );
  f.traffic.setData(requests, "live");
  f.until(
    () => f.traffic.stats.gates >= 1,
    "the lead car must reach the checkpoint",
  );
  f.tick(20);
  const lead = requests.find((request) => f.phase(request.id) === "gate");
  f.traffic.setData(
    requests.map((request) => ({ ...request, stage: "fill" })),
    "live",
  );
  f.until(
    () => f.phase(lead.id) === "onward",
    "the lead car must depart its gate",
  );
  f.tick(2);
  f.traffic.setData(
    requests.map((request) => ({
      ...request,
      stage: request.id === lead.id ? "failed" : "complete",
    })),
    "live",
  );
  f.until(
    () => f.traffic.count === 0,
    "a mid-route failure must not trap following successful cars",
    150,
  );
});

test("unconfirmed fills stay tracked after travel until the backend confirms completion", (t) => {
  const f = fixture(t);
  for (const [index, kind] of ["pedestrian", "car", "airplane"].entries()) {
    const request = transfer(200 + index, { kind, stage: "fill" });
    f.traffic.setData([request], "live", true);
    f.tick(120);
    assert.equal(
      f.traffic.count,
      1,
      `${kind} must not disappear while its destination transaction remains unconfirmed`,
    );
    assert.deepEqual(f.traffic.trackedIds, [request.id]);
    f.traffic.setData([], "live");
    f.tick(10);
    assert.deepEqual(
      f.traffic.trackedIds,
      [request.id],
      "missing refreshes must not turn a submitted fill into completion",
    );
    f.traffic.setData(
      [{ ...request, stage: "complete", status: "success" }],
      "live",
    );
    f.until(
      () => f.traffic.count === 0,
      `${kind} must finish after backend-confirmed completion`,
    );
  }
});

test("an airplane awaiting destination confirmation still returns to its origin after failure", (t) => {
  const f = fixture(t);
  const request = transfer(210, { kind: "airplane", stage: "fill" });
  f.traffic.setData([request], "live", true);
  f.tick(120);
  const root = f.root(request.id);
  assert.ok(root, "airplane remains represented before the late failure");
  f.traffic.setData(
    [{ ...request, stage: "failed", status: "failure" }],
    "live",
  );
  const origin = flightRoute(request).getPointAt(0);
  let passedOrigin = false;
  f.until(
    () => {
      if (root.position.distanceTo(origin) < 4) passedOrigin = true;
      return f.traffic.count === 0;
    },
    "airplane returns after a failure while awaiting confirmation",
    120,
  );
  assert.ok(
    passedOrigin,
    "airplane returns to its origin after the late failure",
  );
});

test("same-ID timing updates change physical pace and animation without changing police speed", (t) => {
  const f = fixture(t);
  const walking = transfer(220, { kind: "pedestrian", durationSeconds: null });
  const running = { ...walking, durationSeconds: 2 };
  f.traffic.setData([walking], "live");
  f.tick(2);
  const root = f.root(walking.id);
  const distanceTraveled = () => {
    let distance = 0;
    for (let step = 0; step < 20; step++) {
      const before = root.position.clone();
      f.tick(0.025);
      distance += root.position.distanceTo(before);
    }
    return distance;
  };
  assert.ok(Math.abs(distanceTraveled() - 1.9) < 0.05);
  f.traffic.setData([running], "live");
  assert.equal(f.traffic.inspect(walking.id).speed, "Running");
  assert.ok(Math.abs(distanceTraveled() - 3.5) < 0.05);

  const walk = new THREE.AnimationClip("walk", 1, []);
  const sprint = new THREE.AnimationClip("sprint", 1, []);
  root.userData.clips = [walk, sprint];
  const mixer = new THREE.AnimationMixer(root);
  const oldAction = mixer.clipAction(walk).play();
  const item = { root, mixer, transfer: running, phase: "onward", speed: 3.8 };
  refreshTravelerPace(item, walking);
  assert.equal(oldAction.isRunning(), false);
  assert.equal(mixer.clipAction(sprint).isRunning(), true);
  assert.equal(item.speed, 7);
  mixer.update(0.2);
  refreshTravelerPace(item, running);
  assert.equal(
    mixer.clipAction(sprint).time,
    0.2,
    "repeated same-ID polling must not restart the animation",
  );
  item.phase = "police";
  item.speed = 11;
  item.transfer = walking;
  refreshTravelerPace(item, running);
  assert.equal(
    item.speed,
    11,
    "a carried pedestrian must not set the police vehicle's speed",
  );
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
});
