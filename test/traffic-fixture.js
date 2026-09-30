import assert from "node:assert/strict";
import * as THREE from "three";
import { createTraffic } from "../src/traffic.js";

const noop = () => {};
export const transfer = (number, changes = {}) => ({
  id: `0x${number.toString(16).padStart(64, "0")}`,
  originChainId: 8453,
  destinationChainId: 1,
  kind: "car",
  amountUsd: 500,
  stage: "gate",
  status: "pending",
  app: { kind: "relay", key: "relay", name: "Relay" },
  ...changes,
});

export function fixture(t, onSelect = noop) {
  const previousDocument = globalThis.document;
  const context = Object.fromEntries(
    [
      "beginPath",
      "roundRect",
      "fill",
      "arc",
      "moveTo",
      "lineTo",
      "closePath",
      "stroke",
      "fillText",
      "fillRect",
    ].map((key) => [key, noop]),
  );
  context.createRadialGradient = () => ({ addColorStop: noop });
  globalThis.document = {
    createElement: () => ({ getContext: () => context }),
  };
  const created = [];
  const models = {
    create(key) {
      const root = new THREE.Group();
      root.userData.height = 2;
      root.userData.modelKey = key;
      created.push(root);
      return root;
    },
  };
  const scene = new THREE.Scene();
  let elapsed = 0;
  let pendingDistricts = [];
  const traffic = createTraffic(
    scene,
    models,
    {
      updateSignals(seconds, pending) {
        elapsed = seconds;
        pendingDistricts = pending;
      },
    },
    onSelect,
  );
  t.after(() => {
    traffic.dispose();
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  });
  const tick = (seconds = 0.1) => {
    for (let remaining = seconds; remaining > 0.000001; remaining -= 0.1) {
      traffic.update(Math.min(0.1, remaining));
    }
  };
  const until = (predicate, message, seconds = 90) => {
    for (let step = 0; step < seconds * 10 && !predicate(); step++) tick();
    assert.ok(predicate(), message);
  };
  return {
    traffic,
    scene,
    created,
    tick,
    until,
    root: (id) =>
      scene.children[0]?.children.find(
        (root) => root.userData.transfer?.id === id,
      ),
    phase: (id) => traffic.inspect(id)?.phase,
    get elapsed() {
      return elapsed;
    },
    get pendingDistricts() {
      return pendingDistricts;
    },
  };
}
