import * as THREE from "three";
import { getChain } from "./activity.js";
import {
  getAddress,
  getDistrict,
  getGate,
  createRailCurve,
  getStationProgress,
  GROUND,
  ROAD_X,
  ROAD_Z,
} from "./world-map.js";

export function roundedPath(points, radius = 1.1) {
  const vertices = points
    .map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)))
    .filter((p, i, all) => !i || p.distanceTo(all[i - 1]) > 0.001);
  if (vertices.length < 2)
    vertices.push(vertices[0].clone().add(new THREE.Vector3(0.01, 0, 0)));
  const path = new THREE.CurvePath();
  let from = vertices[0];
  for (let i = 1; i < vertices.length - 1; i++) {
    const p = vertices[i],
      a = p.distanceTo(vertices[i - 1]),
      b = p.distanceTo(vertices[i + 1]);
    const r = Math.min(radius, a / 3, b / 3);
    const before = p.clone().lerp(vertices[i - 1], r / a),
      after = p.clone().lerp(vertices[i + 1], r / b);
    path.add(new THREE.LineCurve3(from, before));
    path.add(new THREE.QuadraticBezierCurve3(before, p, after));
    from = after;
  }
  path.add(new THREE.LineCurve3(from, vertices.at(-1)));
  path.arcLengthDivisions = 500;
  return path;
}

export function groundRoute(transfer) {
  const walking = transfer.kind === "pedestrian";
  const origin = getAddress(transfer.originChainId, transfer.app);
  const sameChain = transfer.originChainId === transfer.destinationChainId;
  const destination = sameChain
    ? origin
    : getAddress(transfer.destinationChainId, transfer.app, "destination");
  const y = GROUND + (walking ? 0.4 : 0.23);
  const start = walking ? origin.door : origin.garage;
  const finish = walking ? destination.door : destination.garage;
  const from = walking
    ? origin.sidewalk
    : { x: origin.road.x, z: origin.road.z + 1.6 };
  const gate = { ...getGate(transfer.originChainId, walking), z: from.z };
  const point = (p) => [p.x, y, p.z];
  const depart = roundedPath([
    point(start),
    [from.x, y, start.z],
    point(from),
    point(gate),
  ]);
  const district = origin.district;
  let streets;
  let arrival;
  if (walking) {
    // Pavements have no directional lane: always return on the destination's side.
    // Crossing a street happens at its junction, never at a private driveway.
    const east = district.id ? district.x + 16.3 : -83.7;
    arrival = destination.sidewalk;
    streets = sameChain
      ? [
          [east, y, from.z],
          [east, y, district.z - 16.3],
          [district.x - (district.id ? 16.3 : 10), y, district.z - 16.3],
          [district.x - (district.id ? 16.3 : 10), y, from.z],
        ]
      : [
          [east, y, from.z],
          [east, y, arrival.z],
        ];
  } else {
    // Right-hand lanes: eastbound/southbound sit south/west of each road center.
    const eastRoad = district.id ? district.x + 20 : -80;
    if (sameChain) {
      arrival = from;
      if (district.id) {
        streets = [
          [eastRoad + 1.6, y, from.z],
          [eastRoad + 1.6, y, district.z - 22.6],
          [district.x - 21.6, y, district.z - 22.6],
          [district.x - 21.6, y, from.z],
        ];
      } else {
        // The neutral hub uses the adjoining intersection to turn back home.
        streets = [
          [eastRoad + 1.6, y, from.z],
          [eastRoad + 1.6, y, from.z - 3.2],
          [origin.road.x, y, from.z - 3.2],
        ];
        arrival = { x: origin.road.x, z: from.z - 3.2 };
      }
    } else {
      const northbound = destination.district.z <= district.z;
      const verticalX = eastRoad + (northbound ? 1.6 : -1.6);
      const eastbound = destination.road.x >= verticalX;
      arrival = {
        x: destination.road.x,
        z: destination.road.z + (eastbound ? 1.6 : -1.6),
      };
      streets = [
        [verticalX, y, from.z],
        [verticalX, y, arrival.z],
      ];
    }
  }
  const onward = roundedPath([
    point(gate),
    ...streets,
    point(arrival),
    [arrival.x, y, finish.z],
    point(finish),
  ]);
  const police = district.police;
  const roadY = GROUND + 0.23;
  const eastRoad = district.id ? district.x + 20 : -80;
  // Pickup can begin on the pavement; the escort then uses the road's return lane.
  const policeRoute = roundedPath([
    [gate.x, roadY, gate.z],
    [gate.x, roadY, origin.road.z + 1.6],
    [eastRoad + 1.6, roadY, origin.road.z + 1.6],
    [eastRoad + 1.6, roadY, origin.road.z - 1.6],
    [police.road.x, roadY, origin.road.z - 1.6],
    [police.garage.x, roadY, police.garage.z],
  ]);
  return { depart, onward, police: policeRoute, origin, destination, gate };
}

export function reversePath(curve, progress = 1) {
  const points = Array.from({ length: 50 }, (_, i) =>
    curve.getPointAt(progress * (1 - i / 49)),
  );
  return roundedPath(points, 0);
}

export function flightRoute(transfer) {
  const bearing = (id) =>
    ((getChain(id).flightBearing ?? Number(id) % 360) * Math.PI) / 180;
  const a = bearing(transfer.originChainId),
    b = bearing(transfer.destinationChainId);
  const start = new THREE.Vector3(Math.sin(a) * 145, 34, -Math.cos(a) * 145);
  const end = new THREE.Vector3(Math.sin(b) * 145, 34, -Math.cos(b) * 145);
  if (transfer.originChainId === transfer.destinationChainId) {
    return new THREE.CubicBezierCurve3(
      start,
      new THREE.Vector3(-100, 40, 65),
      new THREE.Vector3(100, 40, 65),
      end,
    );
  }
  return new THREE.QuadraticBezierCurve3(
    start,
    new THREE.Vector3(0, 45, 0),
    end,
  );
}

const wrap = (n) => ((n % 1) + 1) % 1;
export function trainPlan(transfer, fixedLane) {
  const forward = wrap(
    getStationProgress(transfer.destinationChainId, 0) -
      getStationProgress(transfer.originChainId, 0),
  );
  const lane = fixedLane ?? (forward <= 0.5 ? 0 : 1);
  const direction = lane === 0 ? 1 : -1;
  const curve = createRailCurve(lane);
  const origin = wrap(
    getStationProgress(transfer.originChainId, lane) * direction,
  );
  const destination =
    origin +
    (wrap(
      getStationProgress(transfer.destinationChainId, lane) * direction -
        origin,
    ) || 1);
  const exit = Math.ceil(destination + 0.0001);
  return {
    lane,
    curve,
    direction,
    origin,
    destination,
    exit,
    length: curve.getLength(),
    at: (distance) => curve.getPointAt(wrap(distance * direction)),
    tangent: (distance) =>
      curve.getTangentAt(wrap(distance * direction)).multiplyScalar(direction),
  };
}

export function movementSpeed(transfer) {
  if (transfer.kind === "pedestrian") {
    const run =
      transfer.originChainId === transfer.destinationChainId ||
      (transfer.durationSeconds > 0 && transfer.durationSeconds <= 15);
    return {
      units: run ? 7 : 3.8,
      animation: run ? "sprint" : "walk",
      label: run ? "Running" : "Walking",
    };
  }
  return {
    units:
      { car: 12, bus: 10, truck: 9, train: 36, airplane: 29 }[transfer.kind] ??
      8,
    animation: null,
  };
}

// Cars turn at a junction into a return lane; reversing their old path would
// face the checkpoint queue head-on and deadlock both directions.
export function roadReturnRoute(transfer, position, heading, toGate = false) {
  const address = getAddress(transfer.originChainId, transfer.app);
  const gate = getGate(transfer.originChainId);
  const finish = toGate
    ? { x: gate.x, z: address.road.z + 1.6 }
    : address.garage;
  const nearest = (values, value) =>
    values.reduce((a, b) =>
      Math.abs(a - value) < Math.abs(b - value) ? a : b,
    );
  const next = (values, value, direction) => {
    const ahead = values.filter((v) => (v - value) * direction > 2);
    return ahead.length ? nearest(ahead, value) : nearest(values, value);
  };
  const y = GROUND + 0.23;
  let junctionX, junctionZ;
  const points = [[position.x, y, position.z]];
  if (Math.abs(heading.x) >= Math.abs(heading.z)) {
    junctionX = next(ROAD_X, position.x, Math.sign(heading.x) || 1);
    junctionZ = nearest(ROAD_Z, position.z);
    points.push([junctionX, y, position.z]);
  } else {
    junctionX = nearest(ROAD_X, position.x);
    junctionZ = next(ROAD_Z, position.z, Math.sign(heading.z) || 1);
    points.push([position.x, y, junctionZ]);
  }
  const north = address.road.z <= junctionZ;
  const laneX = junctionX + (north ? 1.6 : -1.6);
  const targetX = toGate ? gate.x : address.road.x;
  const laneZ = address.road.z + (targetX >= laneX ? 1.6 : -1.6);
  points.push(
    [laneX, y, junctionZ],
    [laneX, y, laneZ],
    [targetX, y, laneZ],
    [finish.x, y, finish.z],
  );
  return roundedPath(points);
}
