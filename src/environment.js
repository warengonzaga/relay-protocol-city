import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { getChain } from "./activity.js";
import { drawChainMark } from "./chain-marks.js";
import {
  GROUND,
  DISTRICTS,
  OTHER_DISTRICT,
  ROAD_X,
  ROAD_Z,
  RAIL_HEIGHT,
  createRailCurve,
  getGate,
  getAddress,
  getDistrictApps,
  registerApps,
  getSignalState,
} from "./world-map.js";
export { GROUND, DISTRICTS } from "./world-map.js";

export function buildEnvironment(scene, models) {
  const group = new THREE.Group();
  scene.add(group);
  const materials = new Map();
  const boxGeometry = new Map();
  const staticBoxes = [];
  function material(color, luminous = false) {
    const key = `${color}:${luminous}`;
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.85,
          emissive: luminous ? color : "#000000",
          emissiveIntensity: luminous ? 0.65 : 0,
        }),
      );
    return materials.get(key);
  }
  function box(
    x,
    y,
    z,
    width,
    height,
    depth,
    color,
    round = 0,
    luminous = false,
  ) {
    const shape = `${width}:${height}:${depth}:${round}`;
    if (!boxGeometry.has(shape))
      boxGeometry.set(
        shape,
        round
          ? new RoundedBoxGeometry(width, height, depth, 2, round)
          : new THREE.BoxGeometry(width, height, depth),
      );
    const mesh = new THREE.Mesh(
      boxGeometry.get(shape),
      material(color, luminous),
    );
    staticBoxes.push(mesh);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  }
  function place(key, x, z, size, rotation = 0, axis = "y", y = GROUND) {
    const object = models.create(key, size, axis);
    object.position.set(x, y, z);
    object.rotation.y = rotation;
    group.add(object);
    return object;
  }
  function sign(text, x, y, z, width = 7, chain = null) {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 112;
    const context = canvas.getContext("2d");
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(width, (width * 112) / 512),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    group.add(mesh);
    const update = (value) => {
      context.fillStyle = "#17191f";
      context.fillRect(0, 0, 512, 112);
      if (chain) drawChainMark(context, chain.id, 52, 56, 30, chain.color);
      context.fillStyle = "#f5f3ff";
      context.font = `600 ${value.length > 18 ? 27 : 36}px sans-serif`;
      context.textAlign = chain ? "left" : "center";
      context.textBaseline = "middle";
      context.fillText(value, chain ? 100 : 256, 57, chain ? 395 : 486);
      texture.needsUpdate = true;
    };
    update(text);
    return update;
  }

  // The ground remains a physical miniature; dusk materials keep colored roofs legible.
  box(-2, -1.7, -1, 238, 4, 160, "#1c2030", 2);
  box(-2, 0.15, -1, 238, 0.9, 160, "#263e38", 1.5);
  box(-2, -3.8, -1, 231, 1.5, 153, "#11141c", 1.4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    material("#101014"),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.6;
  floor.receiveShadow = true;
  scene.add(floor);

  for (const x of ROAD_X) box(x, 0.7, 0, 7, 0.2, 137, "#252934");
  for (const z of ROAD_Z) box(0, 0.71, z, 167, 0.2, 7, "#252934");
  box(-96, 0.7, 21, 32, 0.2, 7, "#252934");
  for (const z of ROAD_Z)
    for (let x = -77; x < 80; x += 5) {
      if (!ROAD_X.some((crossing) => Math.abs(crossing - x) < 5))
        box(x, 0.84, z, 2.1, 0.035, 0.15, "#b3b5c2");
    }
  for (const x of ROAD_X)
    for (let z = -59; z < 63; z += 5) {
      if (!ROAD_Z.some((crossing) => Math.abs(crossing - z) < 5))
        box(x, 0.84, z, 0.15, 0.035, 2.1, "#b3b5c2");
    }
  const labels = [];
  const appSigns = new Map();
  const gateLights = new Map();
  for (const [index, district] of DISTRICTS.entries()) {
    const chain = getChain(district.id);
    const { x, z } = district;
    box(x, 0.74, z, 33, 0.28, 33, "#37443f", 0.8);
    // Continuous four-sided pavements keep pedestrians out of both traffic lanes.
    for (const dx of [-16.3, 16.3])
      box(x + dx, 0.87, z, 2.4, 0.3, 35, "#6b6c77", 0.12);
    for (const dz of [-16.3, 16.3])
      box(x, 0.88, z + dz, 35, 0.3, 2.4, "#6b6c77", 0.12);
    for (const dx of [-17.8, 17.8])
      box(x + dx, 1, z, 0.13, 0.08, 35.4, chain.color, 0, true);
    for (const dz of [-17.8, 17.8])
      box(x, 1, z + dz, 35.4, 0.08, 0.13, chain.color, 0, true);
    sign(`${chain.name} District`, x, 2.1, z - 16, 11, chain);
    labels.push({ chain, position: new THREE.Vector3(x, 3.5, z - 16.5) });

    // Relay has homes; observed integrators receive their own persistent labeled towers.
    for (const role of ["origin", "destination"]) {
      const address = getAddress(district.id, { kind: "relay" }, role);
      place(
        role === "origin" ? "building-type-a" : "building-type-c",
        address.x,
        address.z,
        5.4,
        0,
        "x",
      );
      box(
        address.garage.x,
        1.7,
        address.garage.z - 0.8,
        2.9,
        2,
        3.2,
        "#424657",
        0.12,
      );
      box(
        address.garage.x,
        1.7,
        address.garage.z + 0.82,
        2.3,
        1.6,
        0.08,
        "#a0a0af",
      );
      box(address.garage.x, 0.93, z + 7.5, 2.4, 0.08, 19, "#60616d");
    }
    const updateSigns = [];
    for (const [slot, dx] of [-5, 5].entries()) {
      const height = 8.5 + ((index + slot) % 3) * 2.2;
      const building = place(
        ["building-g", "building-b", "building-f", "building-d"][
          (index + slot) % 4
        ],
        x + dx,
        z - 6,
        height,
      );
      building.scale.x = Math.min(1, 6 / building.userData.width);
      building.scale.z = Math.min(1, 5.8 / building.userData.length);
      const width = Math.min(building.userData.width, 6);
      box(
        x + dx,
        height + 0.85,
        z - 6,
        width,
        0.35,
        Math.min(building.userData.length, 5),
        chain.color,
        0.1,
        true,
      );
      const driveX = x + (slot === 0 ? -8 : 8);
      box(driveX, 0.92, z + 8, 2.4, 0.08, 19, "#60616d");
      box(driveX, 1.5, z - 3.5, 2.4, 1.7, 2.2, "#424657", 0.1);
      box(driveX, 1.5, z - 2.35, 2, 1.5, 0.08, "#979aa8");
      updateSigns.push(sign("App tower", x + dx, 3.6, z - 2.2, 5.9));
    }
    appSigns.set(district.id, updateSigns);
    place("building-c", x + 12, z + 4, 4.2, 0, "x");
    sign("App commons", x + 12, 3.3, z + 7, 5.4);
    box(x + 12, 0.93, z + 13, 2.2, 0.08, 12, "#60616d");
    // A clearly identified police station belongs to every district.
    place("building-a", x - 12, z + 5, 4.2, 0, "x");
    sign("POLICE", x - 12, 3.9, z + 8.1, 4.9);
    box(x - 13, 7.1, z + 5, 1.6, 0.35, 0.7, "#77a4ff", 0.08, true);
    box(x - 11, 7.1, z + 5, 1.6, 0.35, 0.7, "#f27283", 0.08, true);
    box(x - 12, 0.93, z + 14, 2.5, 0.08, 11, "#60616d");

    const station = district.station;
    box(station.x, 4.72, station.z, 12, 0.65, 7.7, "#53536a", 0.2);
    for (const dx of [-5, 5])
      for (const dz of [-3.3, 3.3])
        box(station.x + dx, 6.5, station.z + dz, 0.23, 3.2, 0.23, "#9791a9");
    box(station.x, 8.2, station.z, 12.5, 0.36, 8, chain.color, 0.2);
    sign(`${chain.name} Station`, station.x, 7.5, station.z + 4.05, 10, chain);
    for (let step = 0; step < 6; step++)
      box(
        station.x + 1.5,
        1.1 + (5 - step) * 0.58,
        station.z - 4.2 - step * 0.5,
        2.5,
        0.4,
        0.55,
        "#77758a",
      );

    const gate = getGate(district.id);
    // The arch crosses the road and sidewalk; its signal reflects pending checks.
    for (const gateZ of [gate.z - 7, gate.z + 4])
      box(gate.x, 3, gateZ, 0.8, 4.6, 0.8, "#858196", 0.1);
    box(gate.x, 5.35, gate.z - 1.5, 1.2, 0.55, 12, "#a88fff", 0.15);
    sign("RELAY CHECKPOINT", gate.x, 4.65, gate.z - 1.5, 7);
    const lamp = box(
      gate.x,
      4.5,
      gate.z + 3.6,
      0.5,
      0.5,
      0.5,
      "#6ddbaf",
      0.08,
      true,
    );
    gateLights.set(district.id, lamp);
    // Small parks and warm lamps establish a lived-in city after dark.
    for (const dx of [-15, 15]) {
      place(
        "tree-small",
        x + dx / 8,
        z + 3,
        3.2 + (index % 2) * 0.5,
        index * 0.4,
      );
      place("light-curved", x + dx * 1.13, z + 12, 4.5, Math.PI);
      box(x + dx * 1.13, 4.75, z + 11.6, 0.5, 0.12, 0.7, "#f4d39c", 0.03, true);
    }
  }

  // Unmapped chains have a neutral hub, never a falsely labeled chain district.
  const otherAddress = getAddress(0);
  box(-105, 0.76, 0, 24, 0.3, 35, "#444651", 0.5);
  place("building-d", otherAddress.x, otherAddress.z, 8);
  sign("Other chains / app hub", otherAddress.x, 5.4, otherAddress.z + 4, 11);
  box(otherAddress.road.x, 0.93, 13, 2.4, 0.08, 17, "#60616d");
  labels.push({
    chain: { id: 0, name: "Other chains", color: "#9a99aa" },
    position: new THREE.Vector3(-101, 11, 3),
  });

  // The neutral interchange has its own access paths and a shared rail stop.
  for (const x of [-117, -83.7]) box(x, 0.88, 0, 2.4, 0.3, 35, "#6b6c77", 0.1);
  for (const z of [-16.3, 16.3])
    box(-100.35, 0.88, z, 35.7, 0.3, 2.4, "#6b6c77", 0.1);
  place("building-a", -108, 5, 4.2, 0, "x");
  sign("POLICE", -108, 3.9, 8.1, 4.9);
  box(-108, 0.93, 14, 2.5, 0.08, 11, "#60616d");
  box(-84, 4.72, 14, 7.5, 0.65, 7.7, "#53536a", 0.2);
  for (const x of [-87, -81])
    for (const z of [10.7, 17.3]) box(x, 6.5, z, 0.23, 3.2, 0.23, "#9791a9");
  box(-84, 8.2, 14, 8, 0.36, 8, "#9a99aa", 0.2);
  sign("Interchange", -84, 7.5, 18.05, 7.5);
  const otherGate = getGate(0);
  for (const z of [14, 25])
    box(otherGate.x, 3, z, 0.8, 4.6, 0.8, "#858196", 0.1);
  box(otherGate.x, 5.35, 19.5, 1.2, 0.55, 12, "#a88fff", 0.15);

  buildRailway();
  const signals = [];
  for (const x of ROAD_X)
    for (const z of ROAD_Z) {
      for (const [axis, dx, dz] of [
        ["x", -4.7, -4.7],
        ["z", 4.7, 4.7],
      ]) {
        box(x + dx, 2.5, z + dz, 0.2, 3.5, 0.2, "#858394");
        box(x + dx, 4.4, z + dz, 0.72, 1.8, 0.62, "#13141b", 0.1);
        const lamps = {};
        for (const [index, state] of ["red", "yellow", "green"].entries()) {
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 6),
            material(
              { red: "#ff6b78", yellow: "#ffcf77", green: "#75edb3" }[state],
              true,
            ),
          );
          mesh.position.set(x + dx, 4.95 - index * 0.52, z + dz + 0.34);
          group.add(mesh);
          lamps[state] = mesh;
        }
        signals.push({ axis, lamps });
      }
      for (const direction of [-1, 1])
        for (let stripe = -2; stripe <= 2; stripe++)
          box(
            x + stripe * 0.85,
            0.86,
            z + direction * 5,
            0.5,
            0.03,
            1.5,
            "#d8d5e3",
          );
    }

  for (const x of ROAD_X)
    for (const z of ROAD_Z) {
      for (const direction of [-1, 1])
        for (let stripe = -2; stripe <= 2; stripe++)
          box(
            x + direction * 3.7,
            0.86,
            z + stripe * 0.85,
            1.5,
            0.03,
            0.5,
            "#d8d5e3",
          );
    }

  function buildRailway() {
    for (const lane of [0, 1]) {
      const curve = createRailCurve(lane);
      const positions = [];
      const indices = [];
      const sections = 650;
      for (let index = 0; index <= sections; index++) {
        const point = curve.getPointAt(index / sections);
        const tangent = curve.getTangentAt(index / sections);
        for (const side of [-1, 1])
          positions.push(
            point.x - tangent.z * side * 1.17,
            point.y - 0.2,
            point.z + tangent.x * side * 1.17,
          );
        if (index < sections) {
          const vertex = index * 2;
          indices.push(
            vertex,
            vertex + 1,
            vertex + 2,
            vertex + 1,
            vertex + 3,
            vertex + 2,
          );
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(positions, 3),
      );
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const deck = new THREE.Mesh(geometry, material("#545369"));
      deck.receiveShadow = true;
      group.add(deck);
      const sleeperCount = Math.ceil(curve.getLength() / 2);
      const sleepers = new THREE.InstancedMesh(
        new THREE.BoxGeometry(2.15, 0.1, 0.27),
        material("#8b8298"),
        sleeperCount,
      );
      const matrix = new THREE.Matrix4();
      const rotation = new THREE.Quaternion();
      for (let index = 0; index < sleeperCount; index++) {
        const progress = index / sleeperCount;
        const point = curve.getPointAt(progress);
        point.y -= 0.12;
        const tangent = curve.getTangentAt(progress);
        rotation.setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.atan2(tangent.x, tangent.z),
        );
        matrix.compose(point, rotation, new THREE.Vector3(1, 1, 1));
        sleepers.setMatrixAt(index, matrix);
      }
      group.add(sleepers);
      for (const side of [-1, 1]) {
        const rail = new THREE.Curve();
        rail.getPoint = (t, target = new THREE.Vector3()) => {
          const point = curve.getPointAt(t);
          const tangent = curve.getTangentAt(t);
          return target.set(
            point.x - tangent.z * side * 0.7,
            RAIL_HEIGHT,
            point.z + tangent.x * side * 0.7,
          );
        };
        group.add(
          new THREE.Mesh(
            new THREE.TubeGeometry(rail, 1000, 0.075, 4, false),
            material("#bab6ca"),
          ),
        );
      }
      for (let distance = 0; distance < curve.getLength(); distance += 19) {
        const point = curve.getPointAt(distance / curve.getLength());
        box(point.x, 2.6, point.z, 0.65, 4.2, 0.65, "#545369");
      }
    }
    // Both independent lines enter this covered yard before removal and respawn.
    box(0, 8.5, -68, 17, 0.8, 10, "#49415e", 0.35);
    box(0, 5.8, -73, 17, 5.7, 0.8, "#49415e", 0.2);
    box(0, 5.8, -63, 17, 5.7, 0.8, "#49415e", 0.2);
    sign("RELAY RAIL YARD", 0, 9.8, -63, 13);
    for (const x of [-8.5, 8.5])
      box(x, 8.2, -68, 0.15, 0.2, 9.5, "#aa8df6", 0, true);
  }

  function updateSignals(seconds, pending = []) {
    for (const { axis, lamps } of signals) {
      const state = getSignalState(seconds, axis);
      for (const [name, mesh] of Object.entries(lamps))
        mesh.visible = name === state;
    }
    const pendingIds = new Set(pending);
    for (const [id, mesh] of gateLights)
      mesh.material = material(
        pendingIds.has(id) ? "#ffcf77" : "#6ddbaf",
        true,
      );
  }
  // Repeated pavements, sleepers, road paint, and posts share a single draw call per shape.
  const batches = new Map();
  const dynamic = new Set(gateLights.values());
  for (const mesh of staticBoxes) {
    if (dynamic.has(mesh)) continue;
    const key = `${mesh.geometry.uuid}:${mesh.material.uuid}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0];
    const instances = new THREE.InstancedMesh(
      first.geometry,
      first.material,
      meshes.length,
    );
    meshes.forEach((mesh, index) => {
      mesh.updateMatrix();
      instances.setMatrixAt(index, mesh.matrix);
      group.remove(mesh);
    });
    instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = instances.receiveShadow = true;
    group.add(instances);
  }
  updateSignals(0);
  return {
    group,
    labels,
    terminals: new Map(
      [...DISTRICTS, OTHER_DISTRICT].map((district) => [
        district.id || "other",
        { x: district.x, z: district.z + 16.3, roadX: district.x + 20 },
      ]),
    ),
    setApps(transfers) {
      registerApps(transfers);
      for (const district of DISTRICTS) {
        const apps = getDistrictApps(district.id);
        appSigns
          .get(district.id)
          .forEach((update, index) => update(apps[index]?.name ?? "App tower"));
      }
    },
    updateSignals,
  };
}
