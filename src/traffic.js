import * as THREE from "three";
import { getDistrictTrips } from "./activity.js";
import {
  groundRoute,
  roadReturnRoute,
  roundedPath,
  flightRoute,
  trainPlan,
  reversePath,
  movementSpeed,
} from "./routes.js";
import {
  GROUND,
  SIGNAL_JUNCTIONS,
  getAddress,
  getDistrict,
  getSignalState,
} from "./world-map.js";
import {
  createTraveler,
  createPolice,
  disposeTraveler,
  refreshTravelerPace,
  updatePoliceLights,
} from "./travelers.js";

const terminal = (transfer) =>
  ["complete", "failed", "refunded"].includes(transfer.stage);
const isRoadVehicle = (kind) => ["car", "bus", "truck"].includes(kind);

export function createTraffic(scene, models, environment, onSelect) {
  const group = new THREE.Group();
  scene.add(group);
  const active = [],
    seen = new Set();
  let queue = [],
    demo = [],
    mode = "demo",
    filter = "all",
    paused = false,
    reducedMotion = false;
  let elapsed = 0,
    nextSpawn = 0,
    demoIndex = 0,
    trackingOffset = 0,
    selected;
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  const matches = (t) =>
    filter === "all" ||
    t.originChainId === Number(filter) ||
    t.destinationChainId === Number(filter);
  const railBusy = (lane) => active.some((item) => item.rail?.lane === lane);

  function remove(item) {
    group.remove(item.root);
    if (item.police) {
      group.remove(item.police.root);
      disposeTraveler(item.police);
    }
    disposeTraveler(item);
    active.splice(active.indexOf(item), 1);
  }
  function clear() {
    active.slice().forEach(remove);
    queue = [];
    seen.clear();
    nextSpawn = 0;
    demoIndex = 0;
  }
  function hasCapacity(transfer) {
    if (
      active.length >= 40 ||
      active.some((item) => item.transfer.id === transfer.id)
    )
      return false;
    if (transfer.kind === "train") return !railBusy(trainPlan(transfer).lane);
    if (transfer.kind === "airplane")
      return (
        (mode === "demo" ||
          ["fill", "complete", "failed", "refunded"].includes(
            transfer.stage,
          )) &&
        active.filter((item) => item.transfer.kind === "airplane").length < 2
      );
    const walking = transfer.kind === "pedestrian";
    const address = getAddress(transfer.originChainId, transfer.app);
    // ponytail: one inspection bay per district; extra checks stay in the tracked queue.
    if (
      needsInspection({ transfer }) &&
      active.some(
        (item) =>
          getDistrict(item.transfer.originChainId).id === address.district.id &&
          !item.rail &&
          item.transfer.kind !== "airplane" &&
          (needsInspection(item) ||
            ["inspection-entry", "gate", "board", "rejoin"].includes(
              item.phase,
            )),
      )
    )
      return false;
    const entrance = walking ? address.door : address.garage;
    const start = new THREE.Vector3(
      entrance.x,
      GROUND + (walking ? 0.4 : 0.23),
      entrance.z,
    );
    return !active.some((item) => item.root.position.distanceTo(start) < 4);
  }
  function useCurve(item, curve, phase) {
    item.curve = curve;
    item.length = Math.max(0.01, curve.getLength());
    item.progress = 0;
    item.phase = phase;
    item.wait = 0;
    item.stopped = false;
  }
  function spawn(transfer) {
    if (!matches(transfer) || !hasCapacity(transfer)) return false;
    const item = {
      ...createTraveler(models, transfer),
      transfer,
      speed: movementSpeed(transfer).units,
      phase: "depart",
      wait: 0,
      age: 0,
      released: false,
    };
    if (transfer.kind === "train") {
      item.rail = trainPlan(transfer);
      item.progress = 0;
      item.phase = "rail-entry";
      item.target = item.rail.origin;
    } else if (transfer.kind === "airplane") {
      const returning =
        mode === "live" && ["failed", "refunded"].includes(transfer.stage);
      useCurve(
        item,
        flightRoute(
          returning
            ? { ...transfer, destinationChainId: transfer.originChainId }
            : transfer,
        ),
        returning ? "flight-return" : "flight",
      );
    } else {
      item.route = groundRoute(transfer);
      useCurve(item, item.route.depart, "depart");
    }
    item.label.visible ||= selected === transfer.id;
    active.push(item);
    group.add(item.root);
    position(item);
    return true;
  }
  function decision(item) {
    if (mode === "demo") {
      const scenario = item.transfer.demoScenario;
      if (scenario === "blocked") return "blocked";
      if (scenario === "failed") return "return";
      if (scenario === "pending" && !item.released) return "wait";
      return "go";
    }
    const { stage, blocked } = item.transfer;
    if (stage === "failed" || stage === "refunded")
      return blocked ? "blocked" : "return";
    return ["fill", "complete"].includes(stage) ? "go" : "wait";
  }
  function needsInspection(item) {
    const outcome = decision(item);
    return (
      outcome !== "go" &&
      (item.transfer.originChainId !== item.transfer.destinationChainId ||
        outcome !== "wait")
    );
  }
  function stopForTraffic(item) {
    if (!isRoadVehicle(item.transfer.kind) && item.phase !== "police")
      return false;
    if (item.phase === "board") return false;
    const point = item.root.position;
    const tangent = item.curve.getTangentAt(Math.min(item.progress, 0.9999));
    const axis =
      Math.abs(tangent.x) > 0.85
        ? "x"
        : Math.abs(tangent.z) > 0.85
          ? "z"
          : null;
    if (axis && getSignalState(elapsed, axis) !== "green") {
      const other = axis === "x" ? "z" : "x";
      if (
        SIGNAL_JUNCTIONS.some((junction) => {
          const ahead =
            (junction[axis] - point[axis]) * Math.sign(tangent[axis]);
          return (
            Math.abs(point[other] - junction[other]) < 3.1 &&
            ahead >= 4.1 &&
            ahead <= 7
          );
        })
      )
        return true;
    }
    // A bounded neighbor check is sufficient for forty travelers; avoid a physics engine.
    return active.some((other) => {
      if (
        other === item ||
        other.rail ||
        other.transfer.kind === "airplane" ||
        (other.transfer.kind === "pedestrian" && other.phase !== "police")
      )
        return false;
      const delta = other.root.position.clone().sub(point);
      const ahead = delta.dot(tangent);
      const lateral = delta.clone().addScaledVector(tangent, -ahead).length();
      return (
        ahead > 0.2 &&
        ahead < (item.phase === "police" ? 10 : 6.5) &&
        lateral < 1.5
      );
    });
  }
  function stopForWalker(item) {
    if (
      item.transfer.kind !== "pedestrian" ||
      !["depart", "inspection-entry", "rejoin", "onward"].includes(item.phase)
    )
      return false;
    const tangent = item.curve.getTangentAt(Math.min(item.progress, 0.9999));
    return active.some((other) => {
      if (other === item || other.transfer.kind !== "pedestrian") return false;
      const delta = other.root.position.clone().sub(item.root.position);
      const ahead = delta.dot(tangent);
      return ahead > 0.1 && ahead < 1.7 && delta.length() < 2;
    });
  }
  function position(item) {
    let point, tangent;
    if (item.rail) {
      point = item.rail.at(item.progress);
      tangent = item.rail.tangent(item.progress);
    } else {
      point = item.curve.getPointAt(Math.min(item.progress, 1));
      tangent = item.curve.getTangentAt(Math.min(item.progress, 1));
    }
    item.root.position.copy(point);
    item.root.rotation.y = Math.atan2(tangent.x, tangent.z);
    item.root.visible = matches(item.transfer);
    if (item.rail) {
      const inverse = item.root.quaternion.clone().invert();
      for (const carriage of item.carriages) {
        const behind = item.progress - carriage.distance / item.rail.length;
        carriage.root.position.copy(
          item.rail.at(behind).sub(point).applyQuaternion(inverse),
        );
        const t = item.rail.tangent(behind);
        carriage.root.rotation.y = Math.atan2(t.x, t.z) - item.root.rotation.y;
      }
      const remaining =
        Math.abs(item.target - item.progress) * item.rail.length;
      const leaving =
        item.phase === "rail-exit" ? Math.min(1, remaining / 14) : 1;
      item.root.scale.setScalar(
        Math.max(
          0.01,
          Math.min(1, (item.progress * item.rail.length) / 10, leaving),
        ),
      );
    } else if (item.phase !== "gate" && item.phase !== "board") {
      const ending = [
        "onward",
        "return",
        "police",
        "flight",
        "flight-return",
      ].includes(item.phase);
      item.root.scale.setScalar(
        Math.max(
          0.01,
          Math.min(
            1,
            item.age * 2,
            ending ? ((1 - item.progress) * item.length) / 3 : 1,
          ),
        ),
      );
    }
  }
  function boardPolice(item) {
    item.phase = "board";
    item.wait = 0;
    item.police = createPolice(models, item.transfer, item.root);
    item.police.root.position
      .copy(item.root.position)
      .add(new THREE.Vector3(1.5, 0, 0));
    item.police.root.rotation.y = -Math.PI / 2;
    group.add(item.police.root);
  }
  function updateGround(item, dt) {
    if (item.phase === "arrival-wait") {
      if (mode === "demo") {
        if (decision(item) !== "go") return;
        item.phase = "onward";
      } else if (item.transfer.stage === "complete") item.phase = "onward";
      else if (!["failed", "refunded"].includes(item.transfer.stage)) return;
    }
    if (item.phase === "board") {
      item.wait += dt;
      item.root.scale.setScalar(Math.max(0.01, 1 - item.wait / 1.8));
      if (item.wait >= 1.8) {
        group.remove(item.root);
        disposeTraveler(item);
        const police = item.police;
        item.root = police.root;
        item.label = police.label;
        item.lights = police.lights;
        item.glows = police.glows;
        item.mixer = null;
        item.police = null;
        item.speed = 11;
        useCurve(item, item.route.police, "police");
      }
      return;
    }
    if (item.phase === "gate") {
      item.wait += dt;
      const outcome = decision(item);
      if (outcome === "go") useCurve(item, item.route.resume, "rejoin");
      else if (outcome === "return")
        useCurve(item, item.route.returnFromHold, "return");
      else if (outcome === "blocked") boardPolice(item);
      return;
    }
    if (
      mode === "live" &&
      ["rejoin", "onward", "arrival-wait"].includes(item.phase) &&
      ["failed", "refunded"].includes(item.transfer.stage)
    ) {
      if (item.transfer.kind === "pedestrian")
        useCurve(
          item,
          reversePath(item.curve, item.progress),
          item.phase === "rejoin" ? "back-to-bay" : "back-to-gate",
        );
      else
        useCurve(
          item,
          roadReturnRoute(
            item.transfer,
            item.root.position,
            item.curve.getTangentAt(item.progress),
            item.transfer.blocked,
          ),
          item.transfer.blocked ? "back-to-gate" : "return",
        );
    }
    const stopped = stopForTraffic(item) || stopForWalker(item);
    if (!stopped) {
      item.progress = Math.min(
        1,
        item.progress + (dt * item.speed) / item.length,
      );
      item.mixer?.update(dt);
    }
    item.stopped = stopped;
    if (
      item.phase === "onward" &&
      (mode === "live"
        ? !terminal(item.transfer)
        : item.route.sameChain && decision(item) === "wait") &&
      item.progress >= Math.max(0.05, 1 - 3 / item.length)
    ) {
      item.progress = Math.max(0.05, 1 - 3 / item.length);
      item.phase = "arrival-wait";
      item.stopped = false;
    }
    position(item);
    if (item.progress >= 1) {
      if (item.phase === "depart" && !needsInspection(item)) {
        useCurve(item, item.route.onward, "onward");
      } else if (["depart", "back-to-gate"].includes(item.phase)) {
        useCurve(item, item.route.hold, "inspection-entry");
      } else if (["inspection-entry", "back-to-bay"].includes(item.phase)) {
        item.phase = "gate";
        item.wait = 0;
        item.stopped = false;
      } else if (item.phase === "rejoin") {
        useCurve(item, item.route.onward, "onward");
      } else remove(item);
    }
  }
  function updateTrain(item, dt) {
    if (
      mode === "live" &&
      ["rail-travel", "rail-destination"].includes(item.phase) &&
      ["failed", "refunded"].includes(item.transfer.stage)
    ) {
      item.phase = "rail-return";
      item.target =
        item.progress +
        ((((item.rail.origin - item.progress) % 1) + 1) % 1 || 1);
    }
    if (
      ["rail-origin", "rail-destination", "rail-returned"].includes(item.phase)
    ) {
      item.wait += dt;
      if (
        mode === "live" &&
        item.phase === "rail-destination" &&
        !terminal(item.transfer)
      )
        return;
      if (item.wait < 1.8) return;
      if (item.phase === "rail-origin") {
        const result = decision(item);
        if (result === "wait") return;
        item.phase = result === "go" ? "rail-travel" : "rail-exit";
        item.target =
          result === "go"
            ? item.rail.destination
            : Math.ceil(item.progress + 0.001);
      } else {
        item.phase = "rail-exit";
        item.target = Math.ceil(item.progress + 0.001);
      }
    }
    item.progress = Math.min(
      item.target,
      item.progress + (dt * item.speed) / item.rail.length,
    );
    position(item);
    if (item.progress >= item.target) {
      if (item.phase === "rail-entry") {
        item.phase = "rail-origin";
        item.wait = 0;
      } else if (item.phase === "rail-travel") {
        item.phase = "rail-destination";
        item.wait = 0;
      } else if (item.phase === "rail-return") {
        item.phase = "rail-returned";
        item.wait = 0;
      } else if (item.phase === "rail-exit") remove(item);
    }
  }

  function updateFlight(item, dt) {
    const failed = ["failed", "refunded"].includes(item.transfer.stage);
    if (mode === "live" && failed && item.phase !== "flight-return") {
      useCurve(
        item,
        new THREE.QuadraticBezierCurve3(
          item.root.position.clone(),
          flightRoute(item.transfer).getPointAt(0.5).setY(45),
          flightRoute(item.transfer).getPointAt(0),
        ),
        "flight-return",
      );
    } else if (
      mode === "live" &&
      item.phase === "flight-hold" &&
      item.transfer.stage === "complete"
    ) {
      useCurve(
        item,
        new THREE.LineCurve3(
          item.root.position.clone(),
          flightRoute(item.transfer).getPointAt(1),
        ),
        "flight-final",
      );
    }
    item.progress = Math.min(
      1,
      item.progress + (dt * item.speed) / item.length,
    );
    position(item);
    if (
      mode === "live" &&
      item.phase === "flight" &&
      !terminal(item.transfer) &&
      item.progress >= 0.8
    ) {
      const center = item.root.position.clone();
      const points = Array.from({ length: 25 }, (_, index) => {
        const angle = (index / 24) * Math.PI * 2;
        return center
          .clone()
          .add(
            new THREE.Vector3(
              (Math.cos(angle) - 1) * 10,
              0,
              Math.sin(angle) * 10,
            ),
          );
      });
      useCurve(item, roundedPath(points, 1), "flight-hold");
    } else if (item.progress >= 1) {
      if (item.phase === "flight-hold") item.progress = 0;
      else remove(item);
    }
  }

  return {
    setData(transfers, sourceMode, reset = false) {
      transfers = getDistrictTrips(transfers);
      if (sourceMode !== mode || reset) clear();
      mode = sourceMode;
      environment.setApps?.(transfers);
      if (mode === "demo") demo = transfers;
      else {
        const updates = new Map(transfers.map((t) => [t.id, t]));
        for (const item of active)
          if (updates.has(item.transfer.id)) {
            const previousTransfer = item.transfer;
            item.transfer = updates.get(item.transfer.id);
            refreshTravelerPace(item, previousTransfer);
            item.root.userData.transfer = item.transfer;
          }
        queue = queue.map((t) => updates.get(t.id) ?? t);
        for (const transfer of transfers.toReversed())
          if (!seen.has(transfer.id)) {
            seen.add(transfer.id);
            queue.push(transfer);
          }
        // ponytail: this bounded sampled city is not a firehose indexer.
        queue = queue.slice(-150);
        while (seen.size > 3000) seen.delete(seen.values().next().value);
      }
    },
    update(dt) {
      if (paused) return;
      elapsed += dt;
      environment.updateSignals?.(
        elapsed,
        active
          .filter(
            (item) =>
              ["gate", "rail-origin"].includes(item.phase) &&
              decision(item) === "wait",
          )
          .map((item) => getDistrict(item.transfer.originChainId).id),
      );
      for (const item of [...active]) {
        item.age += dt;
        if (item.rail) updateTrain(item, dt);
        else if (item.transfer.kind === "airplane") updateFlight(item, dt);
        else updateGround(item, dt);
        updatePoliceLights(item.police ?? item, elapsed, reducedMotion);
      }
      if (elapsed >= nextSpawn) {
        nextSpawn = elapsed + 0.65;
        if (mode === "demo") {
          const candidates = demo.filter(matches);
          for (let i = 0; i < candidates.length; i++)
            if (spawn(candidates[demoIndex++ % candidates.length])) break;
        } else {
          const ready = queue.findIndex((t) => matches(t) && hasCapacity(t));
          if (ready >= 0) spawn(queue.splice(ready, 1)[0]);
        }
      }
    },
    select(id) {
      selected = id;
      active.forEach((item) => {
        item.label.visible =
          item.transfer.id === id ||
          ["airplane", "train"].includes(item.transfer.kind);
      });
    },
    setFilter(value) {
      filter = value;
      active.forEach((item) => {
        item.root.visible = matches(item.transfer);
      });
    },
    setPaused(value) {
      paused = value;
    },
    setReducedMotion(value) {
      reducedMotion = value;
      active.forEach((item) =>
        updatePoliceLights(item.police ?? item, elapsed, reducedMotion),
      );
    },
    releasePending() {
      if (mode === "demo")
        active.forEach((item) => {
          item.released = true;
        });
    },
    flyover(transfer) {
      if (mode !== "demo" || !getDistrictTrips([transfer]).length) return false;
      active
        .filter((item) => item.transfer.kind === "airplane")
        .forEach(remove);
      return spawn(transfer);
    },
    inspect(id) {
      const item = active.find((item) => item.transfer.id === id);
      return item
        ? {
            transfer: item.transfer,
            phase: item.phase,
            stopped: item.stopped,
            lane: item.rail?.lane,
            speed: movementSpeed(item.transfer).label,
          }
        : null;
    },
    get trackedIds() {
      if (mode !== "live") return [];
      const ids = [
        ...new Set(
          [...active.map((item) => item.transfer), ...queue]
            .filter((t) => !terminal(t) && /^0x[a-f0-9]{64}$/i.test(t.id))
            .map((t) => t.id),
        ),
      ];
      const batch = Array.from(
        { length: Math.min(12, ids.length) },
        (_, i) => ids[(trackingOffset + i) % ids.length],
      );
      trackingOffset = ids.length
        ? (trackingOffset + batch.length) % ids.length
        : 0;
      return batch;
    },
    get stats() {
      return {
        active: active.length,
        queued:
          mode === "live"
            ? queue.length
            : demo.filter((t) => !active.some((i) => i.transfer.id === t.id))
                .length,
        gates: active.filter(
          (i) => i.phase === "gate" && decision(i) === "wait",
        ).length,
        rails: [railBusy(0), railBusy(1)],
      };
    },
    pick(x, y, rect, camera) {
      pointer.set(
        ((x - rect.left) / rect.width) * 2 - 1,
        -((y - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      for (const hit of raycaster.intersectObject(group, true)) {
        let node = hit.object;
        while (node && !node.userData.transfer) node = node.parent;
        if (node && matches(node.userData.transfer)) {
          this.select(node.userData.transfer.id);
          onSelect(node.userData.transfer);
          return true;
        }
      }
      return false;
    },
    dispose() {
      clear();
      scene.remove(group);
    },
    get count() {
      return active.length;
    },
  };
}
