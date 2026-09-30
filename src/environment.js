import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { getChain } from "./activity.js";
import { drawChainMark } from "./chain-marks.js";
import { buildRailway } from "./railway.js";
import {
  GROUND,
  DISTRICTS,
  OTHER_DISTRICT,
  CITY_BOUNDS,
  ROAD_SEGMENTS,
  JUNCTIONS,
  SIGNAL_JUNCTIONS,
  getGate,
  getAddress,
  getTowerAddress,
  getDistrictAt,
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

  const { left, right, top, bottom } = CITY_BOUNDS;
  const centerX = (left + right) / 2,
    centerZ = (top + bottom) / 2;
  const width = right - left + 18,
    depth = bottom - top + 18;
  box(centerX, -1.7, centerZ, width, 4, depth, "#1c2030", 2);
  box(centerX, 0.15, centerZ, width, 0.9, depth, "#263e38", 1.5);
  box(centerX, -3.8, centerZ, width - 6, 1.5, depth - 6, "#11141c", 1.4);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(2000, 2000),
    material("#101014"),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -4.6;
  floor.receiveShadow = true;
  scene.add(floor);

  const labels = [],
    appSigns = new Map(),
    gateLights = new Map();
  const districts = [...DISTRICTS, OTHER_DISTRICT];
  // Flat, irregular territories read as a map; streets remain part of each district.
  const drawnBorders = new Set();
  for (const district of districts) {
    const chain = district.id
      ? getChain(district.id)
      : { id: 0, name: "Other chains", color: "#9a99aa" };
    const polygon = district.polygon;
    const shape = new THREE.Shape(
      polygon.map(({ x, z }) => new THREE.Vector2(x, -z)),
    );
    const color = new THREE.Color("#293a37").lerp(
      new THREE.Color(chain.color),
      0.19,
    );
    const territory = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      material(color.getHex()),
    );
    territory.rotation.x = -Math.PI / 2;
    territory.position.y = 0.71;
    territory.receiveShadow = true;
    group.add(territory);
    for (const [index, a] of polygon.entries()) {
      const b = polygon[(index + 1) % polygon.length];
      const key = [a, b]
        .map((p) => `${p.x.toFixed(5)},${p.z.toFixed(5)}`)
        .sort()
        .join("/");
      if (drawnBorders.has(key)) continue;
      drawnBorders.add(key);
      const dx = b.x - a.x,
        dz = b.z - a.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.01) continue;
      // Clip each boundary against the road and pavement corridors, leaving true crossings open.
      const gaps = [];
      for (const road of ROAD_SEGMENTS) {
        let enter = 0,
          exit = 1;
        for (const [origin, delta, low, high] of [
          [
            a.x,
            dx,
            Math.min(road.x1, road.x2) - 6.3,
            Math.max(road.x1, road.x2) + 6.3,
          ],
          [
            a.z,
            dz,
            Math.min(road.z1, road.z2) - 6.3,
            Math.max(road.z1, road.z2) + 6.3,
          ],
        ]) {
          if (Math.abs(delta) < 1e-8) {
            if (origin < low || origin > high) {
              enter = 1;
              exit = 0;
            }
          } else {
            const near = (low - origin) / delta,
              far = (high - origin) / delta;
            enter = Math.max(enter, Math.min(near, far));
            exit = Math.min(exit, Math.max(near, far));
          }
        }
        if (enter < exit) gaps.push([enter, exit]);
      }
      const pieces = [];
      let start = 0;
      for (const [enter, exit] of gaps.sort((a, b) => a[0] - b[0])) {
        if (enter > start) pieces.push([start, enter]);
        start = Math.max(start, exit);
      }
      if (start < 1) pieces.push([start, 1]);
      for (const [start, end] of pieces) {
        const mid = (start + end) / 2;
        const edge = box(
          a.x + dx * mid,
          0.81,
          a.z + dz * mid,
          length * (end - start),
          0.09,
          0.25,
          "#aaa3b8",
        );
        edge.rotation.y = -Math.atan2(dz, dx);
      }
    }
    labels.push({
      chain,
      position: new THREE.Vector3(district.x, 5, district.z),
    });
  }

  // Pavements stop at road junctions; the crosswalks bridge the openings.
  for (const road of ROAD_SEGMENTS) {
    const horizontal = road.z1 === road.z2;
    const begin = horizontal
      ? Math.min(road.x1, road.x2)
      : Math.min(road.z1, road.z2);
    const end = horizontal
      ? Math.max(road.x1, road.x2)
      : Math.max(road.z1, road.z2);
    const across = horizontal ? road.z1 : road.x1;
    const crossings = JUNCTIONS.filter(
      (j) => Math.abs((horizontal ? j.z : j.x) - across) < 0.01,
    )
      .map((j) => (horizontal ? j.x : j.z))
      .filter((v) => v >= begin && v <= end)
      .sort((a, b) => a - b);
    const cuts = [
      begin,
      ...crossings.flatMap((v) => [
        Math.max(begin, v - 3.6),
        Math.min(end, v + 3.6),
      ]),
      end,
    ];
    for (let i = 0; i < cuts.length - 1; i += 2) {
      const length = cuts[i + 1] - cuts[i];
      if (length <= 0.1) continue;
      const at = (cuts[i] + cuts[i + 1]) / 2;
      for (const side of [-1, 1])
        box(
          horizontal ? at : across + side * 4.7,
          0.83,
          horizontal ? across + side * 4.7 : at,
          horizontal ? length : 2.4,
          0.28,
          horizontal ? 2.4 : length,
          "#727380",
          0.06,
        );
    }
    box(
      (road.x1 + road.x2) / 2,
      0.72,
      (road.z1 + road.z2) / 2,
      horizontal ? end - begin + 7 : 7,
      0.18,
      horizontal ? 7 : end - begin + 7,
      road.neutral ? "#343846" : "#252934",
    );
    for (let at = begin + 3; at < end - 2; at += 5) {
      if (crossings.some((v) => Math.abs(v - at) < 5)) continue;
      box(
        horizontal ? at : across,
        0.824,
        horizontal ? across : at,
        horizontal ? 2.1 : 0.14,
        0.025,
        horizontal ? 0.14 : 2.1,
        "#b7b9c7",
      );
    }
  }

  function driveway(address, garage = true) {
    const entrance = garage ? address.garage : address.door;
    const end = garage ? address.road : address.sidewalk;
    if (!garage && Math.abs(entrance.x - end.x) > 0.01)
      box(
        (entrance.x + end.x) / 2,
        0.84,
        entrance.z,
        Math.abs(entrance.x - end.x) + 1.25,
        0.07,
        1.25,
        "#878792",
      );
    box(
      end.x,
      0.84,
      (entrance.z + end.z) / 2,
      garage ? 2.5 : 1.25,
      0.07,
      Math.abs(entrance.z - end.z) + 0.4,
      garage ? "#4c505e" : "#878792",
    );
    if (!garage) return;
    const facing = Math.sign(end.z - entrance.z) || 1;
    box(entrance.x, 1.6, entrance.z - facing, 2.8, 1.9, 2.1, "#424657", 0.1);
    box(
      entrance.x,
      1.6,
      entrance.z + facing * 0.09,
      2.25,
      1.5,
      0.08,
      "#a0a0af",
    );
  }

  for (const [index, district] of districts.entries()) {
    const { x, z, bounds, roadZ } = district;
    const chain = district.id
      ? getChain(district.id)
      : { id: 0, name: "Other chains", color: "#9a99aa" };
    for (const role of ["origin", "destination"]) {
      const address = getAddress(district.id, { kind: "relay" }, role);
      if (!district.id && role === "destination") continue;
      place(
        role === "origin" ? "building-type-a" : "building-type-c",
        address.x,
        address.z,
        5,
        0,
        "x",
      );
      driveway(address);
      driveway(address, false);
    }
    const updates = [];
    if (district.id) {
      for (const slot of [0, 1]) {
        const address = getTowerAddress(district.id, slot);
        const height = 8 + ((index + slot) % 3) * 1.6;
        const building = place(
          ["building-g", "building-b", "building-f", "building-d"][
            (index + slot) % 4
          ],
          address.x,
          address.z,
          height,
        );
        building.scale.x *= Math.min(1, 6 / building.userData.width);
        building.scale.z *= Math.min(1, 5.7 / building.userData.length);
        box(
          address.x,
          GROUND + height + 0.18,
          address.z,
          Math.min(building.userData.width, 6),
          0.32,
          Math.min(building.userData.length, 5.7),
          chain.color,
          0.06,
          true,
        );
        driveway(address);
        driveway(address, false);
        updates.push(sign("App tower", address.x, 3.4, address.z + 3.1, 5.7));
      }
      appSigns.set(district.id, updates);
      const common = getAddress(district.id, { kind: "unknown" });
      place("building-c", common.x, common.z, 4.3);
      sign("App commons", common.x, 4.5, common.z + 2.6, 5.4);
      driveway(common);
      driveway(common, false);
    }
    const police = district.police;
    place("building-a", police.x, police.z, 4.5);
    sign("POLICE", police.x, 4.5, police.z + 2.7, 5.2);
    driveway(police);
    box(police.x - 0.6, 5.2, police.z, 0.95, 0.25, 0.6, "#548bff", 0.08, true);
    box(police.x + 0.6, 5.2, police.z, 0.95, 0.25, 0.6, "#ff505d", 0.08, true);

    // Extra width becomes actual neighborhood blocks, not an empty larger plot.
    if (bounds.right - bounds.left > 60) {
      for (const side of [-1, 1]) {
        const localX = x + side * ((bounds.right - bounds.left) / 2 - 16);
        place("building-type-c", localX, z - 3, 4.5, 0, "x");
        box(localX, 0.86, z + 3.8, 1.3, 0.06, 7.5, "#878792");
      }
    }
    for (const dx of [-4, 4])
      place("tree-small", x + dx, z + 4, 3.1, index * 0.4);
    // The broad irregular edges become small green spaces around the street core.
    let planted = 0;
    const fringe = district.polygonBounds;
    for (let parkZ = fringe.top + 5; parkZ < fringe.bottom - 3; parkZ += 9) {
      for (let parkX = fringe.left + 5; parkX < fringe.right - 3; parkX += 11) {
        if (
          planted >= 8 ||
          (parkZ > bounds.top - 3 && parkZ < bounds.bottom + 3)
        )
          continue;
        if (
          ![-2, 2].every((dx) =>
            [-2, 2].every(
              (dz) => getDistrictAt(parkX + dx, parkZ + dz)?.id === district.id,
            ),
          )
        )
          continue;
        place(
          "tree-small",
          parkX,
          parkZ,
          2.7 + (planted % 3) * 0.35,
          index + planted,
        );
        planted++;
      }
    }
    for (const dx of [-7, 7]) {
      place("light-curved", x + dx, roadZ + 5.6, 4, Math.PI);
      box(x + dx, 4.5, roadZ + 5.2, 0.45, 0.12, 0.65, "#f4d39c", 0.02, true);
    }
    const bay = district.bay;
    box(bay.x, 0.82, bay.z, 6.5, 0.11, 5.8, "#454555", 0.15);
    box(bay.x, 0.825, (bay.z + roadZ) / 2, 2.8, 0.12, roadZ - bay.z, "#454555");
    box(
      district.walkBay.x,
      0.88,
      district.walkBay.z,
      4.6,
      0.22,
      2.6,
      "#727380",
      0.1,
    );
    for (const edge of [-2.8, 2.8])
      box(bay.x + edge, 0.9, bay.z, 0.1, 0.05, 5.3, "#e6c486");
    for (const gate of district.gates) {
      for (const dz of [-6.6, 6.6])
        box(gate.x, 3.15, roadZ + dz, 0.7, 5.1, 0.7, "#878398", 0.08);
      box(gate.x, 5.85, roadZ, 0.95, 0.45, 14, chain.color, 0.1, true);
      box(
        gate.x + (gate.side === "east" ? -2 : 2),
        1.7,
        roadZ + 8,
        2.6,
        2.1,
        2.5,
        "#545265",
        0.15,
      );
      sign("RELAY", gate.x, 6.8, roadZ + 0.3, 5.6);
      const lamp = box(
        gate.x,
        5.35,
        roadZ + 6.6,
        0.52,
        0.52,
        0.52,
        "#6ddbaf",
        0.08,
        true,
      );
      if (gate.side === getGate(district.id).side)
        gateLights.set(district.id, lamp);
    }
  }

  const highway = ROAD_SEGMENTS.filter(
    (road) =>
      road.neutral && road.z1 === road.z2 && Math.abs(road.x2 - road.x1) > 100,
  ).sort((a, b) => b.z1 - a.z1)[0];
  if (highway) {
    const x = (highway.x1 + highway.x2) / 2,
      z = highway.z1 + 8;
    box(x, 1.65, z, 0.25, 2.1, 0.25, "#aaa3b8");
    sign("CITY HIGHWAY", x, 3, z, 12);
  }
  buildRailway({ group, box, material, sign });
  const signals = [];
  for (const { x, z } of SIGNAL_JUNCTIONS) {
    for (const [axis, dx, dz] of [
      ["x", -4.7, -4.7],
      ["z", 4.7, 4.7],
    ]) {
      box(x + dx, 2.2, z + dz, 0.18, 2.9, 0.18, "#858394");
      box(x + dx, 3.9, z + dz, 0.64, 1.6, 0.6, "#13141b", 0.08);
      const lamps = {};
      for (const [index, state] of ["red", "yellow", "green"].entries()) {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.19, 8, 6),
          material(
            { red: "#ff6b78", yellow: "#ffcf77", green: "#75edb3" }[state],
            true,
          ),
        );
        mesh.position.set(x + dx, 4.35 - index * 0.46, z + dz + 0.33);
        group.add(mesh);
        lamps[state] = mesh;
      }
      signals.push({ axis, lamps });
    }
  }
  for (const { x, z } of JUNCTIONS) {
    for (const direction of [-1, 1])
      for (let stripe = -2; stripe <= 2; stripe++) {
        box(
          x + stripe * 0.85,
          0.84,
          z + direction * 4.7,
          0.5,
          0.025,
          1.5,
          "#d8d5e3",
        );
        box(
          x + direction * 4.7,
          0.84,
          z + stripe * 0.85,
          1.5,
          0.025,
          0.5,
          "#d8d5e3",
        );
      }
  }
  for (const [label, x, z] of [
    ["N · 0°", centerX, top - 5],
    ["S · 180°", centerX, bottom + 5],
    ["W · 270°", left - 3, centerZ],
    ["E · 90°", right + 3, centerZ],
  ]) {
    sign(label, x, 1.8, z, 7);
  }
  function updateSignals(seconds, pending = []) {
    for (const { axis, lamps } of signals) {
      const state = getSignalState(seconds, axis);
      for (const [name, mesh] of Object.entries(lamps))
        mesh.visible = name === state;
    }
    const ids = new Set(pending);
    for (const [id, mesh] of gateLights)
      mesh.material = material(ids.has(id) ? "#ffcf77" : "#6ddbaf", true);
  }
  const batches = new Map(),
    dynamic = new Set(gateLights.values());
  for (const mesh of staticBoxes) {
    if (dynamic.has(mesh)) continue;
    const key = `${mesh.geometry.uuid}:${mesh.material.uuid}`;
    if (!batches.has(key)) batches.set(key, []);
    batches.get(key).push(mesh);
  }
  for (const meshes of batches.values()) {
    if (meshes.length < 2) continue;
    const first = meshes[0],
      instances = new THREE.InstancedMesh(
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
    updateSignals,
    setApps(transfers) {
      registerApps(transfers);
      for (const district of DISTRICTS) {
        const apps = getDistrictApps(district.id);
        appSigns
          .get(district.id)
          ?.forEach((update, index) =>
            update(apps[index]?.name ?? "App tower"),
          );
      }
    },
  };
}
