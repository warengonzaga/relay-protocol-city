import * as THREE from "three";
import { getChain } from "./activity.js";
import {
  GROUND,
  DISTRICTS,
  OTHER_DISTRICT,
  RAIL_HEIGHT,
  RAIL_POINTS,
  ROAD_SEGMENTS,
  createRailCurve,
  getStationProgress,
} from "./world-map.js";

export function buildRailway({ group, box, material, sign }) {
  const up = new THREE.Vector3(0, 1, 0);
  const unitScale = new THREE.Vector3(1, 1, 1);
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
          RAIL_HEIGHT - 0.2,
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
      point.y = RAIL_HEIGHT - 0.12;
      const tangent = curve.getTangentAt(progress);
      rotation.setFromAxisAngle(up, Math.atan2(tangent.x, tangent.z));
      matrix.compose(point, rotation, unitScale);
      sleepers.setMatrixAt(index, matrix);
    }
    sleepers.receiveShadow = true;
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
  }

  // Each gantry is centered on the same route as both rails, including bends.
  const centerCurve = createRailCurve(2);
  const beamHeight = 0.4;
  const beamTop = RAIL_HEIGHT - 0.2;
  const columnTop = beamTop - beamHeight;
  for (let distance = 0; distance < centerCurve.getLength(); distance += 19) {
    const progress = distance / centerCurve.getLength();
    const point = centerCurve.getPointAt(progress);
    const tangent = centerCurve.getTangentAt(progress);
    const angle = Math.atan2(tangent.x, tangent.z);
    const columns = [-1, 1].map((side) => ({
      x: point.x - tangent.z * side * 2.95,
      z: point.z + tangent.x * side * 2.95,
    }));
    const clearance =
      3.5 + 0.3 * (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)));
    // Road crossings are bridge spans; their supports stay outside the asphalt.
    if (
      columns.some((column) =>
        ROAD_SEGMENTS.some(
          (road) =>
            column.x > Math.min(road.x1, road.x2) - clearance &&
            column.x < Math.max(road.x1, road.x2) + clearance &&
            column.z > Math.min(road.z1, road.z2) - clearance &&
            column.z < Math.max(road.z1, road.z2) + clearance,
        ),
      )
    )
      continue;
    const beam = box(
      point.x,
      beamTop - beamHeight / 2,
      point.z,
      6.6,
      beamHeight,
      0.85,
      "#626174",
    );
    beam.rotation.y = angle;
    for (const location of columns) {
      const column = box(
        location.x,
        (GROUND + columnTop) / 2,
        location.z,
        0.6,
        columnTop - GROUND,
        0.6,
        "#545369",
      );
      column.rotation.y = angle;
    }
  }

  for (const district of [...DISTRICTS, OTHER_DISTRICT]) {
    const chain = district.id
      ? getChain(district.id)
      : { id: 0, name: "Interchange", color: "#9a99aa" };
    const progress = getStationProgress(district.id, 2);
    const center = centerCurve.getPointAt(progress);
    const tangent = centerCurve.getTangentAt(progress);
    if (tangent.x < 0) tangent.negate();
    const angle = Math.atan2(-tangent.z, tangent.x);
    // All station frames face south, away from the district avenue to the north.
    const local = (x, z) => ({
      x: center.x + Math.cos(angle) * x + Math.sin(angle) * z,
      z: center.z - Math.sin(angle) * x + Math.cos(angle) * z,
    });
    const stationBox = (x, y, z, width, height, depth, color, round = 0) => {
      const point = local(x, z);
      const mesh = box(point.x, y, point.z, width, height, depth, color, round);
      mesh.rotation.y = angle;
      return mesh;
    };
    const platformTop = RAIL_HEIGHT - 0.25;
    const canopyBottom = RAIL_HEIGHT + 3;
    stationBox(0, platformTop - 0.3, 0, 12, 0.6, 8, "#53536a", 0.16);
    for (const x of [-5, 5])
      for (const z of [-3.6, 3.6])
        stationBox(
          x,
          (GROUND + canopyBottom) / 2,
          z,
          0.3,
          canopyBottom - GROUND,
          0.3,
          "#9791a9",
        );
    stationBox(0, canopyBottom + 0.18, 0, 12.5, 0.36, 8.3, chain.color, 0.18);
    const title = local(0, 4.18);
    // All row stops face south; the neutral stop is also placed on a row straight.
    sign(
      district.id ? `${chain.name} Station` : "Interchange",
      title.x,
      canopyBottom - 0.65,
      title.z,
      10,
      district.id ? chain : null,
    );
    const stairDirection =
      district.bounds.right - center.x >= center.x - district.bounds.left
        ? 1
        : -1;
    const landingHeight = platformTop - GROUND;
    // The flight runs along the platform, leaving both the avenue and next district clear.
    stationBox(
      stairDirection * 4.8,
      GROUND + landingHeight / 2,
      4.8,
      2,
      landingHeight,
      1.6,
      "#77758a",
    );
    for (let step = 0; step < 12; step++) {
      const height = ((platformTop - GROUND) * (12 - step)) / 12;
      stationBox(
        stairDirection * (6.1 + step * 0.6),
        GROUND + height / 2,
        4.8,
        0.6,
        height,
        1.6,
        "#77758a",
      );
    }
  }

  // Both lines disappear inside this covered yard; the tunnel follows its route anchor.
  const [tunnelX, tunnelZ] = RAIL_POINTS[0];
  const tunnelRoof = RAIL_HEIGHT + 3.2;
  box(tunnelX, tunnelRoof + 0.4, tunnelZ, 17, 0.8, 10, "#49415e", 0.35);
  for (const side of [-1, 1])
    box(
      tunnelX,
      (GROUND + tunnelRoof) / 2,
      tunnelZ + side * 4.8,
      17,
      tunnelRoof - GROUND,
      0.8,
      "#49415e",
      0.2,
    );
  sign("RELAY RAIL YARD", tunnelX, tunnelRoof + 1.35, tunnelZ + 5.22, 13);
  for (const side of [-1, 1])
    box(
      tunnelX + side * 8.5,
      tunnelRoof - 0.15,
      tunnelZ,
      0.15,
      0.2,
      9.5,
      "#aa8df6",
      0,
      true,
    );
}
