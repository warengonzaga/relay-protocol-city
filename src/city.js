import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadModels } from "./models.js";
import { buildEnvironment } from "./environment.js";
import { createTraffic } from "./traffic.js";
import { chainMark } from "./chain-marks.js";
import { createCameraNavigation } from "./camera-navigation.js";
import { createDistrictFocus } from "./district-focus.js";
import {
  GROUND,
  getDistrictAt,
  getDistrict,
  getDistrictBounds,
} from "./world-map.js";

export async function createCity(
  container,
  labelsContainer,
  onSelect,
  onError,
  options = {},
) {
  const bounds = getDistrictBounds();
  const worldDiagonal = Math.hypot(
    bounds.maxX - bounds.minX,
    bounds.maxZ - bounds.minZ,
  );
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const districtFocus = createDistrictFocus(renderer, scene);
  scene.background = new THREE.Color("#161616");
  const camera = new THREE.OrthographicCamera(
    -60,
    60,
    40,
    -40,
    0.1,
    Math.max(600, worldDiagonal + 400),
  );
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !options.reducedMotion;
  controls.dampingFactor = 0.075;
  controls.enablePan = true;
  controls.screenSpacePanning = false;
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "City map");
  renderer.domElement.setAttribute("aria-describedby", "navigation-hint");
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = 1.18;
  controls.minZoom = 0.6;
  controls.maxZoom = 2.4;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.65;
  scene.add(new THREE.HemisphereLight("#d9d6ff", "#222332", 2.3));
  const sunlight = new THREE.DirectionalLight("#e4dcff", 3.2);
  sunlight.target.position.set(
    (bounds.minX + bounds.maxX) / 2,
    0,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  sunlight.position
    .set(-60, 130, 60)
    .normalize()
    .multiplyScalar(worldDiagonal / 2 + 100)
    .add(sunlight.target.position);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  const shadowCamera = sunlight.shadow.camera;
  shadowCamera.position.copy(sunlight.position);
  shadowCamera.lookAt(sunlight.target.position);
  shadowCamera.updateMatrixWorld();
  // Fit in light space so a larger map stays covered without wasting shadow resolution.
  const shadowBounds = new THREE.Box3(
    new THREE.Vector3(bounds.minX, -5, bounds.minZ),
    new THREE.Vector3(bounds.maxX, 55, bounds.maxZ),
  ).applyMatrix4(shadowCamera.matrixWorldInverse);
  Object.assign(sunlight.shadow.camera, {
    left: shadowBounds.min.x - 5,
    right: shadowBounds.max.x + 5,
    top: shadowBounds.max.y + 5,
    bottom: shadowBounds.min.y - 5,
    near: Math.max(1, -shadowBounds.max.z - 5),
    far: -shadowBounds.min.z + 5,
  });
  shadowCamera.updateProjectionMatrix();
  sunlight.shadow.normalBias = 0.035;
  sunlight.shadow.bias = -0.00015;
  sunlight.shadow.radius = 4;
  scene.add(sunlight, sunlight.target);
  const fill = new THREE.DirectionalLight("#dee9ff", 1.2);
  fill.position.set(40, 30, -40);
  scene.add(fill);
  const models = await loadModels();
  const environment = buildEnvironment(scene, models);
  const traffic = createTraffic(scene, models, environment, onSelect);
  traffic.setReducedMotion(Boolean(options.reducedMotion));
  const labels = environment.labels.map(({ chain, position }) => {
    const element = document.createElement("button");
    element.type = "button";
    element.setAttribute("aria-label", `Focus ${chain.name} district`);
    element.className = "chain-label";
    element.style.visibility = "hidden";
    const symbol = document.createElement("span");
    symbol.className = "chain-symbol";
    symbol.style.background = chain.color;
    symbol.innerHTML = chainMark(chain.id);
    const text = document.createElement("span");
    text.textContent = chain.name;
    element.append(symbol, text);
    element.addEventListener("click", () => {
      options.onFocusDistrict?.(chain.id);
      renderer.domElement.focus({ preventScroll: true });
    });
    element.addEventListener("pointerleave", () => {
      hoverPoint = null;
      visibleChainId = null;
    });
    labelsContainer.appendChild(element);
    return { element, position, chainId: chain.id };
  });
  let width = 1,
    height = 1;
  let frame;
  let previous = 0;
  let disposed = false;
  let pointerDown;
  let focusedDistrict = null;
  let cameraTransition = null;
  let reducedMotion = Boolean(options.reducedMotion);
  let hoverPoint = null;
  let visibleChainId = null;
  const navigation = createCameraNavigation(
    renderer.domElement,
    camera,
    controls,
    () => {
      cameraTransition = null;
      hoverPoint = null;
      visibleChainId = null;
    },
    zoom,
  );
  const projection = new THREE.Vector3();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -GROUND);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPoint = new THREE.Vector3();
  function resize() {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    const area = focusedDistrict?.polygonBounds ?? bounds;
    const left = area.left ?? area.minX,
      right = area.right ?? area.maxX;
    const top = area.top ?? area.minZ,
      bottom = area.bottom ?? area.maxZ;
    camera.updateMatrixWorld();
    let halfWidth = 0,
      halfHeight = 0;
    for (const x of [left, right])
      for (const z of [top, bottom])
        for (const y of [GROUND, 30]) {
          projection.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          halfWidth = Math.max(halfWidth, Math.abs(projection.x));
          halfHeight = Math.max(halfHeight, Math.abs(projection.y));
        }
    const narrow = width <= 760;
    const inset = narrow
      ? { left: 16, right: 16, top: 155, bottom: 165 }
      : { left: 340, right: 32, top: 115, bottom: 92 };
    const usableWidth = Math.max(
      width * 0.45,
      width - inset.left - inset.right,
    );
    const usableHeight = Math.max(
      height * 0.36,
      height - inset.top - inset.bottom,
    );
    const scale =
      (focusedDistrict ? (narrow ? 1 : 0.57) : 1) *
      Math.max(
        (halfWidth * 2 + 10) / usableWidth,
        (halfHeight * 2 + 10) / usableHeight,
      );
    const centerX = (inset.left + width - inset.right) / 2;
    const centerY = (inset.top + height - inset.bottom) / 2;
    camera.left = -centerX * scale;
    camera.right = (width - centerX) * scale;
    camera.top = centerY * scale;
    camera.bottom = -(height - centerY) * scale;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  function frameDistrict(district, animate = true) {
    navigation.clear();
    const previousView = {
      position: camera.position.clone(),
      target: controls.target.clone(),
      left: camera.left,
      right: camera.right,
      top: camera.top,
      bottom: camera.bottom,
      zoom: camera.zoom,
    };
    focusedDistrict = district;
    districtFocus.focus(district);
    const area = district?.polygonBounds ?? bounds;
    const centerX = ((area.left ?? area.minX) + (area.right ?? area.maxX)) / 2;
    const centerZ = ((area.top ?? area.minZ) + (area.bottom ?? area.maxZ)) / 2;
    camera.position.set(centerX + 125, 160, centerZ + 175);
    controls.target.set(centerX, 4, centerZ);
    camera.zoom = 1;
    hoverPoint = null;
    visibleChainId = null;
    controls.update();
    resize();
    if (animate && !reducedMotion) {
      cameraTransition = {
        start: performance.now(),
        from: previousView,
        to: {
          position: camera.position.clone(),
          target: controls.target.clone(),
          left: camera.left,
          right: camera.right,
          top: camera.top,
          bottom: camera.bottom,
          zoom: 1,
        },
      };
      camera.position.copy(previousView.position);
      controls.target.copy(previousView.target);
      for (const key of ["left", "right", "top", "bottom", "zoom"])
        camera[key] = previousView[key];
      camera.updateProjectionMatrix();
    } else cameraTransition = null;
  }
  function reset() {
    frameDistrict(null);
  }
  function zoom(amount) {
    cameraTransition = null;
    camera.zoom = THREE.MathUtils.clamp(camera.zoom * amount, 0.6, 2.4);
    camera.updateProjectionMatrix();
  }
  function focusChain(id) {
    const district = getDistrict(Number(id));
    if (district?.id) frameDistrict(district);
  }
  const resizeObserver = new ResizeObserver(() =>
    frameDistrict(focusedDistrict, false),
  );
  resizeObserver.observe(container);
  resize();
  frameDistrict(null, false);
  function render(time) {
    if (disposed) return;
    const dt = previous ? Math.min((time - previous) / 1000, 0.25) : 0;
    previous = time;
    if (!document.hidden) {
      // Small physics steps keep light stops and queues stable on slower frames.
      for (let remaining = dt; remaining > 0; remaining -= 0.05)
        traffic.update(Math.min(0.05, remaining));
      navigation.update(dt);
      if (cameraTransition) {
        const progress = Math.min(1, (time - cameraTransition.start) / 460);
        const eased = 1 - (1 - progress) ** 3;
        const { from, to } = cameraTransition;
        camera.position.lerpVectors(from.position, to.position, eased);
        controls.target.lerpVectors(from.target, to.target, eased);
        for (const key of ["left", "right", "top", "bottom", "zoom"])
          camera[key] = THREE.MathUtils.lerp(from[key], to[key], eased);
        camera.updateProjectionMatrix();
        if (progress === 1) cameraTransition = null;
      }
      controls.update();
      if (hoverPoint)
        visibleChainId = districtAtPointer(hoverPoint)?.id ?? null;
      const sceneRect = container.getBoundingClientRect();
      const overlays = [
        ...container.parentElement.querySelectorAll(
          ".intro, .activity-panel, .scene-topbar, .simulation-controls, .trip-inspector, .info-panel, .city-operations",
        ),
      ]
        .filter((element) => !element.hidden)
        .map((element) => element.getBoundingClientRect());
      for (const label of labels) {
        if (
          label.chainId !== visibleChainId ||
          (focusedDistrict && label.chainId !== focusedDistrict.id)
        ) {
          label.element.style.visibility = "hidden";
          continue;
        }
        projection.copy(label.position).project(camera);
        const x = (projection.x * 0.5 + 0.5) * width + sceneRect.left;
        const y = (-projection.y * 0.5 + 0.5) * height + sceneRect.top;
        const covered = overlays.some(
          (rect) =>
            x + 55 > rect.left &&
            x - 55 < rect.right &&
            y > rect.top &&
            y - 34 < rect.bottom,
        );
        label.element.style.transform = `translate(${(projection.x * 0.5 + 0.5) * width}px,${(-projection.y * 0.5 + 0.5) * height}px) translate(-50%,-100%)`;
        label.element.style.visibility =
          projection.z > 1 || projection.z < -1 || covered
            ? "hidden"
            : "visible";
      }
      renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(render);
  }
  function districtAtPointer(point) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((point.x - rect.left) / rect.width) * 2 - 1,
      -((point.y - rect.top) / rect.height) * 2 + 1,
    );
    if (Math.abs(pointer.x) > 1 || Math.abs(pointer.y) > 1) return null;
    raycaster.setFromCamera(pointer, camera);
    const district = raycaster.ray.intersectPlane(groundPlane, groundPoint)
      ? getDistrictAt(groundPoint.x, groundPoint.z)
      : null;
    return !focusedDistrict || district?.id === focusedDistrict.id
      ? district
      : null;
  }
  const down = (event) => {
    renderer.domElement.focus({ preventScroll: true });
    cameraTransition = null;
    hoverPoint = null;
    visibleChainId = null;
    pointerDown =
      event.isPrimary && event.button === 0
        ? {
            x: event.clientX,
            y: event.clientY,
            id: event.pointerId,
            dragged: false,
          }
        : null;
  };
  const move = (event) => {
    if (pointerDown) {
      if (
        Math.hypot(
          event.clientX - pointerDown.x,
          event.clientY - pointerDown.y,
        ) >= 5
      )
        pointerDown.dragged = true;
      return;
    }
    if (event.pointerType !== "touch" && !event.buttons)
      hoverPoint = { x: event.clientX, y: event.clientY };
  };
  const up = (event) => {
    if (
      pointerDown &&
      pointerDown.id === event.pointerId &&
      !pointerDown.dragged &&
      Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <
        5
    ) {
      const picked = traffic.pick(
        event.clientX,
        event.clientY,
        renderer.domElement.getBoundingClientRect(),
        camera,
        districtFocus.planes,
      );
      if (!picked) {
        const point = { x: event.clientX, y: event.clientY };
        const district = districtAtPointer(point);
        visibleChainId = null;
        if (district) options.onFocusDistrict?.(district.id);
        else if (focusedDistrict) options.onFocusDistrict?.("all");
        else if (event.pointerType !== "touch") hoverPoint = point;
      }
    }
    pointerDown = null;
  };
  const cancel = () => {
    pointerDown = null;
    hoverPoint = null;
    visibleChainId = null;
  };
  const leave = (event) => {
    if (event.relatedTarget?.closest?.(".chain-label")) return;
    // Touch emits pointerleave after a completed tap; keep its one revealed label.
    if (event.pointerType !== "touch") cancel();
  };
  const contextLost = (event) => {
    event.preventDefault();
    onError(
      new Error("The 3D view was interrupted. Reload to restore the city."),
    );
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointermove", move);
  renderer.domElement.addEventListener("pointerup", up);
  renderer.domElement.addEventListener("pointerleave", leave);
  renderer.domElement.addEventListener("pointercancel", cancel);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  frame = requestAnimationFrame(render);
  return {
    setData: (transfers, mode, reset) =>
      traffic.setData(transfers, mode, reset),
    inspect: (id) => traffic.inspect(id),
    releasePending: () => traffic.releasePending(),
    get stats() {
      return traffic.stats;
    },
    get trackedIds() {
      return traffic.trackedIds;
    },
    focusChain,
    setPaused: (value) => traffic.setPaused(value),
    setReducedMotion: (value) => {
      reducedMotion = value;
      cameraTransition = null;
      controls.enableDamping = !value;
      traffic.setReducedMotion(value);
    },
    setFilter: (value) => {
      traffic.setFilter(value);
      hoverPoint = null;
      visibleChainId = value === "all" ? null : Number(value);
    },
    select: (id) => traffic.select(id),
    flyover: (transfer) => traffic.flyover(transfer),
    zoom,
    reset,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      navigation.dispose();
      districtFocus.dispose();
      controls.dispose();
      traffic.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("pointercancel", cancel);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      scene.traverse((node) => {
        if (node.isMesh) {
          node.geometry.dispose();
          for (const material of Array.isArray(node.material)
            ? node.material
            : [node.material]) {
            material.map?.dispose();
            material.dispose();
          }
        }
      });
      models.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labelsContainer.replaceChildren();
    },
  };
}
