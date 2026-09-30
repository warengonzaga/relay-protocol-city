import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadModels } from "./models.js";
import { buildEnvironment } from "./environment.js";
import { createTraffic } from "./traffic.js";
import { chainMark } from "./chain-marks.js";

export async function createCity(
  container,
  labelsContainer,
  onSelect,
  onError,
) {
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
  scene.background = new THREE.Color("#161616");
  const camera = new THREE.OrthographicCamera(-60, 60, 40, -40, 0.1, 600);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.enablePan = false;
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = 1.18;
  controls.minZoom = 0.6;
  controls.maxZoom = 2.4;
  controls.rotateSpeed = 0.45;
  controls.zoomSpeed = 0.65;
  scene.add(new THREE.HemisphereLight("#d9d6ff", "#222332", 2.3));
  const sunlight = new THREE.DirectionalLight("#e4dcff", 3.2);
  sunlight.position.set(-60, 130, 60);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  Object.assign(sunlight.shadow.camera, {
    left: -150,
    right: 150,
    top: 110,
    bottom: -110,
    near: 1,
    far: 300,
  });
  sunlight.shadow.normalBias = 0.035;
  sunlight.shadow.bias = -0.00015;
  sunlight.shadow.radius = 4;
  scene.add(sunlight);
  const fill = new THREE.DirectionalLight("#dee9ff", 1.2);
  fill.position.set(40, 30, -40);
  scene.add(fill);
  const models = await loadModels();
  const environment = buildEnvironment(scene, models);
  const traffic = createTraffic(scene, models, environment, onSelect);
  const labels = environment.labels.map(({ chain, position }) => {
    const element = document.createElement("div");
    element.className = "chain-label";
    const symbol = document.createElement("span");
    symbol.className = "chain-symbol";
    symbol.style.background = chain.color;
    symbol.innerHTML = chainMark(chain.id);
    const text = document.createElement("span");
    text.textContent = chain.name;
    element.append(symbol, text);
    labelsContainer.appendChild(element);
    return { element, position, chainId: chain.id };
  });
  let width = 1,
    height = 1;
  let frame;
  let previous = 0;
  let disposed = false;
  let pointerDown;
  const projection = new THREE.Vector3();
  function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    const aspect = width / height;
    const halfHeight = Math.max(64, 130 / aspect);
    camera.left = -halfHeight * aspect;
    camera.right = halfHeight * aspect;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  function reset() {
    camera.position.set(125, 160, 175);
    controls.target.set(-4, 2.5, 0);
    camera.zoom = 1;
    camera.updateProjectionMatrix();
    controls.update();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);
  resize();
  reset();
  function render(time) {
    if (disposed) return;
    const dt = previous ? Math.min((time - previous) / 1000, 0.25) : 0;
    previous = time;
    if (!document.hidden) {
      // Small physics steps keep light stops and queues stable on slower frames.
      for (let remaining = dt; remaining > 0; remaining -= 0.05)
        traffic.update(Math.min(0.05, remaining));
      controls.update();
      const sceneRect = container.getBoundingClientRect();
      const overlays = [
        ...container.parentElement.querySelectorAll(
          ".intro, .activity-panel, .scene-topbar, .simulation-controls, .trip-inspector, .info-panel, .city-operations",
        ),
      ]
        .filter((element) => !element.hidden)
        .map((element) => element.getBoundingClientRect());
      for (const label of labels) {
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
  const down = (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  };
  const up = (event) => {
    if (
      pointerDown &&
      Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) <
        5
    )
      traffic.pick(
        event.clientX,
        event.clientY,
        renderer.domElement.getBoundingClientRect(),
        camera,
      );
    pointerDown = null;
  };
  const contextLost = (event) => {
    event.preventDefault();
    onError(
      new Error("The 3D view was interrupted. Reload to restore the city."),
    );
  };
  renderer.domElement.addEventListener("pointerdown", down);
  renderer.domElement.addEventListener("pointerup", up);
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
    focusChain: (id) => {
      const label = environment.labels.find((l) => l.chain.id === Number(id));
      if (label) {
        controls.target.copy(label.position).setY(1);
        camera.zoom = 1.65;
        camera.updateProjectionMatrix();
        controls.update();
      }
    },
    setPaused: (value) => traffic.setPaused(value),
    setFilter: (value) => {
      traffic.setFilter(value);
      labels.forEach((label) => {
        label.element.style.opacity =
          value === "all" || label.chainId === Number(value) ? "1" : ".45";
      });
    },
    select: (id) => traffic.select(id),
    flyover: (transfer) => traffic.flyover(transfer),
    zoom: (amount) => {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom * amount, 0.6, 2.4);
      camera.updateProjectionMatrix();
    },
    reset,
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      traffic.dispose();
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
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
