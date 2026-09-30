import test from "node:test";
import assert from "node:assert/strict";
import { OrthographicCamera, Vector3 } from "three";
import { createCameraNavigation } from "../src/camera-navigation.js";

test("keyboard panning preserves the camera, normalizes aliases and diagonals, and releases input safely", () => {
  const window = new EventTarget();
  const document = Object.assign(new EventTarget(), {
    defaultView: window,
    body: {},
    hidden: false,
    querySelector: () => null,
  });
  const element = { ownerDocument: document };
  document.activeElement = element;
  const camera = new OrthographicCamera(-100, 100, 75, -75);
  camera.position.set(125, 160, 175);
  let rotation = 0;
  const zooms = [];
  const controls = {
    target: new Vector3(0, 4, 0),
    rotateLeft: (angle) => (rotation += angle),
  };
  camera.lookAt(controls.target);
  const originalOffset = camera.position.clone().sub(controls.target);
  let moves = 0;
  const navigation = createCameraNavigation(
    element,
    camera,
    controls,
    () => moves++,
    (amount) => zooms.push(amount),
  );
  function key(type, name, options = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { key: name, ...options });
    window.dispatchEvent(event);
    return event;
  }
  function travel(names) {
    navigation.clear();
    for (const name of names)
      assert.equal(key("keydown", name).defaultPrevented, true);
    const start = controls.target.clone();
    for (let i = 0; i < 60; i++) navigation.update(1 / 60);
    for (const name of names) key("keyup", name);
    return controls.target.clone().sub(start);
  }
  const up = travel(["ArrowUp"]);
  assert.ok(up.distanceTo(travel(["W"])) < 1e-8);
  assert.ok(Math.abs(up.length() - travel(["w", "d"]).length()) < 1e-8);
  assert.ok(up.distanceTo(travel(["w", "ArrowUp"])) < 1e-8);
  assert.ok(travel(["ArrowUp", "w", "s"]).length() < 1e-8);
  assert.ok(travel(["a", "d"]).length() < 1e-8);
  assert.ok(travel(["ArrowLeft"]).distanceTo(travel(["a"])) < 1e-8);
  assert.ok(travel(["ArrowDown"]).distanceTo(travel(["s"])) < 1e-8);
  assert.ok(travel(["ArrowRight"]).distanceTo(travel(["d"])) < 1e-8);
  assert.ok(
    camera.position.clone().sub(controls.target).distanceTo(originalOffset) <
      1e-8,
  );
  assert.equal(controls.target.y, 4);
  assert.equal(camera.zoom, 1);
  assert.ok(moves > 0);

  let stopped = controls.target.clone();
  navigation.update(1 / 60);
  assert.deepEqual(controls.target, stopped, "key release stops immediately");
  for (const release of [
    () => window.dispatchEvent(new Event("blur")),
    () => document.dispatchEvent(new Event("focusin")),
    () => document.dispatchEvent(new Event("visibilitychange")),
    () => navigation.clear(),
  ]) {
    key("keydown", "w");
    stopped = controls.target.clone();
    release();
    navigation.update(1 / 60);
    assert.deepEqual(controls.target, stopped);
  }
  document.activeElement = {}; // Any UI control keeps its native keyboard behavior.
  assert.equal(key("keydown", "ArrowDown").defaultPrevented, false);
  navigation.update(1 / 60);
  document.activeElement = element;
  document.querySelector = () => ({}); // Open help/dialog.
  assert.equal(key("keydown", "w").defaultPrevented, false);
  navigation.update(1 / 60);
  document.querySelector = () => null;
  for (const modifier of ["altKey", "ctrlKey", "metaKey", "isComposing"]) {
    assert.equal(
      key("keydown", "a", { [modifier]: true }).defaultPrevented,
      false,
    );
  }
  assert.equal(key("keydown", "Tab").defaultPrevented, false);
  assert.deepEqual(controls.target, stopped);
  key("keydown", "d");
  assert.ok(
    controls.target.distanceTo(stopped) > 0,
    "a tap moves before any animation frame",
  );
  stopped = controls.target.clone();
  key("keydown", "d", { repeat: true });
  assert.deepEqual(
    controls.target,
    stopped,
    "key repeat does not add extra nudges",
  );
  key("keyup", "d");
  navigation.update(1 / 60);
  assert.deepEqual(controls.target, stopped, "tap release stops movement");
  for (const name of ["+", "=", "-", "_"]) {
    assert.equal(key("keydown", name).defaultPrevented, true);
    key("keyup", name);
  }
  assert.deepEqual(zooms, [1.2, 1.2, 1 / 1.2, 1 / 1.2]);
  assert.equal(key("keydown", "+", { metaKey: true }).defaultPrevented, false);
  assert.equal(zooms.length, 4, "browser zoom shortcut is untouched");
  key("keydown", "q");
  const startRotation = rotation;
  navigation.update(1 / 60);
  assert.ok(rotation > startRotation);
  key("keydown", "e");
  const opposingRotation = rotation;
  navigation.update(1 / 60);
  assert.equal(rotation, opposingRotation, "opposing rotation keys cancel");
  key("keyup", "q");
  navigation.update(1 / 60);
  assert.ok(rotation < opposingRotation);
  key("keyup", "e");
  const releasedRotation = rotation;
  navigation.update(1 / 60);
  assert.equal(rotation, releasedRotation);
  navigation.dispose();
  assert.equal(key("keydown", "ArrowRight").defaultPrevented, false);
  navigation.update(1 / 60);
  assert.deepEqual(
    controls.target,
    stopped,
    "disposal removes listeners and held input",
  );
});
