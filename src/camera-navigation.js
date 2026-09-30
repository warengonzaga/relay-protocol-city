import { Vector3 } from "three";

const navigationKeys = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "w",
  "a",
  "s",
  "d",
  "q",
  "e",
]);

export function createCameraNavigation(
  element,
  camera,
  controls,
  onMove,
  zoom,
) {
  const document = element.ownerDocument;
  const window = document.defaultView;
  const keys = new Set();
  const right = new Vector3();
  const forward = new Vector3();
  const offset = new Vector3();
  const listeners = new AbortController();
  const clear = () => keys.clear();
  const keyName = (event) =>
    event.key.length === 1 ? event.key.toLowerCase() : event.key;
  const canMove = () =>
    !document.hidden &&
    [document.body, element].includes(document.activeElement) &&
    !document.querySelector(
      '.info-panel:not([hidden]), [role="dialog"]:not([hidden])',
    );
  window.addEventListener(
    "keydown",
    (event) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.isComposing ||
        !canMove()
      ) {
        clear();
        return;
      }
      const key = keyName(event);
      if (event.defaultPrevented) return;
      if (["+", "=", "-", "_"].includes(key)) {
        event.preventDefault();
        zoom(key === "+" || key === "=" ? 1.2 : 1 / 1.2);
        return;
      }
      if (!navigationKeys.has(key)) return;
      event.preventDefault();
      const wasHeld = keys.has(key);
      keys.add(key);
      // Fast taps can begin and end between animation frames.
      if (!wasHeld) update(1 / 60);
    },
    { signal: listeners.signal },
  );
  window.addEventListener("keyup", (event) => keys.delete(keyName(event)), {
    signal: listeners.signal,
  });
  window.addEventListener("blur", clear, { signal: listeners.signal });
  document.addEventListener("visibilitychange", clear, {
    signal: listeners.signal,
  });
  document.addEventListener("focusin", clear, { signal: listeners.signal });

  function update(dt) {
    if (!canMove()) clear();
    // Aliases should not double speed when an arrow and its letter are held together.
    const x =
      Number(keys.has("ArrowRight") || keys.has("d")) -
      Number(keys.has("ArrowLeft") || keys.has("a"));
    const y =
      Number(keys.has("ArrowUp") || keys.has("w")) -
      Number(keys.has("ArrowDown") || keys.has("s"));
    const rotation = Number(keys.has("q")) - Number(keys.has("e"));
    if ((!x && !y && !rotation) || dt <= 0) return;
    onMove();
    if (rotation) controls.rotateLeft(rotation * 1.2 * Math.min(dt, 0.05));
    if (!x && !y) return;
    camera.updateMatrixWorld();
    right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    forward.crossVectors(camera.up, right).normalize();
    offset
      .copy(right)
      .multiplyScalar(x)
      .addScaledVector(forward, y)
      .normalize();
    // A constant screen pace stays manageable at every zoom level.
    offset.multiplyScalar(
      ((camera.top - camera.bottom) / camera.zoom) * 0.65 * Math.min(dt, 0.05),
    );
    camera.position.add(offset);
    controls.target.add(offset);
  }
  return {
    clear,
    update,
    dispose() {
      clear();
      listeners.abort();
    },
  };
}
