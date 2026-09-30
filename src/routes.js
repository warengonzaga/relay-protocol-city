import * as THREE from "three";
import { getChain } from "./activity.js";
import {
  getAddress,
  getDistrict,
  getGate,
  createRailCurve,
  getStationProgress,
  GROUND,
  ROAD_SEGMENTS,
  JUNCTIONS,
  getDistrictAt,
  getDistrictBounds,
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

const key = (p) => `${p.x.toFixed(5)}:${p.z.toFixed(5)}`;
const onStreet = (p, s) =>
  Math.abs(s.x1 === s.x2 ? p.x - s.x1 : p.z - s.z1) < 0.001 &&
  p.x >= Math.min(s.x1, s.x2) - 0.001 &&
  p.x <= Math.max(s.x1, s.x2) + 0.001 &&
  p.z >= Math.min(s.z1, s.z2) - 0.001 &&
  p.z <= Math.max(s.z1, s.z2) + 0.001;

// The small street graph uses only the authored, rendered road segments.
function streetNodes(from, to, neutralOnly = false) {
  if (key(from) === key(to)) return [from];
  const nodes = new Map([...JUNCTIONS, from, to].map((p) => [key(p), p]));
  const edges = new Map([...nodes.keys()].map((id) => [id, new Map()]));
  for (const segment of ROAD_SEGMENTS) {
    if (neutralOnly && !segment.neutral) continue;
    const axis = segment.x1 === segment.x2 ? "z" : "x";
    const points = [...nodes.values()]
      .filter((p) => onStreet(p, segment))
      .sort((a, b) => a[axis] - b[axis]);
    for (let i = 1; i < points.length; i++) {
      const a = key(points[i - 1]),
        b = key(points[i]);
      const distance = points[i][axis] - points[i - 1][axis];
      edges.get(a).set(b, distance);
      edges.get(b).set(a, distance);
    }
  }
  const start = key(from),
    target = key(to),
    distance = new Map([[start, 0]]),
    previous = new Map();
  const pending = new Set(nodes.keys());
  while (pending.size) {
    let current = null;
    for (const id of pending)
      if (
        current === null ||
        (distance.get(id) ?? Infinity) < (distance.get(current) ?? Infinity)
      )
        current = id;
    if (!Number.isFinite(distance.get(current)))
      throw new Error("A city address is outside its rendered street network");
    if (current === target) break;
    pending.delete(current);
    for (const [next, length] of edges.get(current)) {
      const total = distance.get(current) + length;
      if (total < (distance.get(next) ?? Infinity)) {
        distance.set(next, total);
        previous.set(next, current);
      }
    }
  }
  const result = [nodes.get(target)];
  for (let id = target; id !== start; ) {
    id = previous.get(id);
    result.unshift(nodes.get(id));
  }
  return result;
}
function viaStreets(...stops) {
  return stops
    .slice(1)
    .reduce(
      (points, stop, i) => [...points, ...streetNodes(stops[i], stop).slice(1)],
      [stops[0]],
    );
}
function lanePoints(nodes, y) {
  if (nodes.length < 2) return [];
  const directions = nodes.slice(1).map((point, i) => ({
    x: Math.sign(point.x - nodes[i].x),
    z: Math.sign(point.z - nodes[i].z),
  }));
  const offset = (point, direction) => [
    point.x - direction.z * 1.6,
    y,
    point.z + direction.x * 1.6,
  ];
  const points = [offset(nodes[0], directions[0])];
  for (let i = 1; i < nodes.length - 1; i++) {
    const before = directions[i - 1],
      after = directions[i],
      point = nodes[i];
    if (before.x * after.x + before.z * after.z === 0) {
      // Meet the lane centerlines at their intersection. Segment-end connectors
      // double back at inside corners and make followers look like opposing traffic.
      points.push([
        point.x - (before.z + after.z) * 1.6,
        y,
        point.z + (before.x + after.x) * 1.6,
      ]);
    } else {
      points.push(offset(point, before));
      if (before.x !== after.x || before.z !== after.z)
        points.push(offset(point, after));
    }
  }
  points.push(offset(nodes.at(-1), directions.at(-1)));
  return points;
}

function pavementPoints(nodes, y) {
  return nodes.map((p, i) => {
    const before = nodes[i - 1] ?? nodes[i + 1],
      after = nodes[i + 1] ?? nodes[i - 1];
    const vertical =
      (before && Math.abs(p.z - before.z) > 0.001) ||
      (after && Math.abs(p.z - after.z) > 0.001);
    const horizontal =
      (before && Math.abs(p.x - before.x) > 0.001) ||
      (after && Math.abs(p.x - after.x) > 0.001);
    return [p.x + (vertical ? 4.7 : 0), y, p.z - (horizontal ? 4.7 : 0)];
  });
}
function pedestrianAccess(address, y) {
  const points = [
    [address.door.x, y, address.door.z],
    [address.sidewalk.x, y, address.door.z],
    [address.sidewalk.x, y, address.sidewalk.z],
  ];
  let road = address.road;
  if (address.sidewalkSide > 0) {
    const junction = JUNCTIONS.filter(
      (p) =>
        Math.abs(p.z - address.road.z) < 0.001 &&
        getDistrictAt(p.x, p.z) === address.district &&
        ROAD_SEGMENTS.some(
          (s) =>
            s.x1 === s.x2 && Math.abs(s.x1 - p.x) < 0.001 && onStreet(p, s),
        ),
    ).sort((a, b) => Math.abs(a.x - road.x) - Math.abs(b.x - road.x))[0];
    const x = junction.x + 4.7;
    points.push(
      [x, y, address.sidewalk.z],
      [x, y, address.road.z - 4.7],
      [road.x, y, address.road.z - 4.7],
    );
  }
  return { points, road };
}
const checkpoint = (transfer) => {
  const d = getDistrict(transfer.originChainId),
    sameChain = transfer.originChainId === transfer.destinationChainId;
  return {
    x: sameChain
      ? d.loop.left
      : d.gate.x + (d.gate.side === "west" ? 4.5 : -4.5),
    z: d.roadZ,
  };
};
function fromBayTo(address, bay, approach, y) {
  const streets = lanePoints(streetNodes(approach, address.road), y);
  if (!streets.length) streets.push([address.road.x, y, address.road.z + 1.6]);
  return roundedPath([
    [bay.x, y, bay.z],
    [approach.x, y, bay.z],
    ...streets,
    [address.garage.x, y, address.garage.z],
  ]);
}

export function groundRoute(transfer) {
  const walking = transfer.kind === "pedestrian";
  const origin = getAddress(transfer.originChainId, transfer.app);
  const sameChain = transfer.originChainId === transfer.destinationChainId;
  const destination = sameChain
    ? origin
    : getAddress(transfer.destinationChainId, transfer.app, "destination");
  if (!origin.district.visible || !destination.district.visible)
    throw new Error("This trip is outside the authored city");
  const district = origin.district,
    center = checkpoint(transfer),
    y = GROUND + (walking ? 0.4 : 0.23);
  const access = walking ? pedestrianAccess(origin, y) : null;
  const arrival = walking ? pedestrianAccess(destination, y) : null;
  const departNodes = streetNodes(walking ? access.road : origin.road, center);
  const departStreets = walking
    ? pavementPoints(departNodes, y)
    : lanePoints(departNodes, y);
  const start = walking ? origin.door : origin.garage;
  if (walking && sameChain && departStreets.length)
    departStreets[departStreets.length - 1] = [
      center.x + 4.7,
      y,
      center.z - 4.7,
    ];
  if (!departStreets.length)
    departStreets.push([center.x, y, center.z - (walking ? 4.7 : 1.6)]);
  const depart = roundedPath(
    walking
      ? [...access.points, ...departStreets]
      : [[start.x, y, start.z], ...departStreets],
  );
  const end = depart.getPointAt(1),
    gate = { x: end.x, z: end.z };
  const border = getGate(transfer.originChainId, walking);
  let onwardNodes;
  if (sameChain) {
    onwardNodes = viaStreets(
      ...district.localTour,
      walking ? access.road : origin.road,
    );
  } else {
    const exit = district.gate,
      entry = destination.district.gate;
    onwardNodes = [
      ...streetNodes(center, exit),
      ...streetNodes(exit, entry, true).slice(1),
      ...streetNodes(entry, walking ? arrival.road : destination.road).slice(1),
    ];
  }
  const onwardStreets = walking
    ? pavementPoints(onwardNodes, y)
    : lanePoints(onwardNodes, y);
  if (walking && sameChain && onwardStreets.length)
    onwardStreets[0][2] = gate.z;
  const finish = walking ? destination.door : destination.garage;
  const onward = roundedPath([
    [gate.x, y, gate.z],
    ...onwardStreets,
    ...(walking ? arrival.points.slice().reverse() : [[finish.x, y, finish.z]]),
  ]);
  const bay = walking ? district.walkBay : district.bay;
  const inspectionCenter = {
    x: district.gate.x + (district.gate.side === "west" ? 4.5 : -4.5),
    z: district.roadZ,
  };
  const holdingStreets = sameChain
    ? (walking ? pavementPoints : lanePoints)(
        streetNodes(center, inspectionCenter),
        y,
      )
    : [];
  if (walking && sameChain && holdingStreets.length)
    holdingStreets[0] = [gate.x, y, gate.z];
  const hold = roundedPath(
    [
      [gate.x, y, gate.z],
      ...holdingStreets,
      [inspectionCenter.x, y, bay.z],
      [bay.x, y, bay.z],
    ],
    0.6,
  );
  const resume = reversePath(hold);
  const returnFromHold = walking
    ? new THREE.CurvePath()
    : fromBayTo(origin, bay, inspectionCenter, y);
  if (walking) {
    returnFromHold.add(resume);
    returnFromHold.add(reversePath(depart));
  }
  const police = fromBayTo(
    district.police,
    bay,
    inspectionCenter,
    GROUND + 0.23,
  );
  return {
    depart,
    onward,
    hold,
    resume,
    returnFromHold,
    police,
    origin,
    destination,
    gate,
    border,
    bay,
    sameChain,
  };
}

export function reversePath(curve, progress = 1) {
  // Preserve the traveled curve exactly; chord resampling cuts corners on long returns.
  const reversed = new THREE.Curve();
  reversed.getPoint = reversed.getPointAt = (t, target) =>
    curve.getPointAt(progress * (1 - t), target);
  reversed.getTangent = reversed.getTangentAt = (t, target) =>
    curve.getTangentAt(progress * (1 - t), target).negate();
  reversed.getLength = () => curve.getLength() * progress;
  return reversed;
}

export function flightBearing(chainId) {
  return (
    ((getChain(chainId).flightBearing ?? Number(chainId) % 360) + 360) % 360
  );
}
export function flightRoute(transfer) {
  // Stable variation keeps a failed request's return point identical after status updates.
  let hash = 2166136261;
  for (const character of String(
    transfer.id ?? `${transfer.originChainId}:${transfer.destinationChainId}`,
  ))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  const destination =
    (flightBearing(transfer.destinationChainId) * Math.PI) / 180;
  const entry = ((hash % 360) * Math.PI) / 180;
  const bounds = getDistrictBounds();
  const center = new THREE.Vector3(
    (bounds.minX + bounds.maxX) / 2,
    37,
    (bounds.minZ + bounds.maxZ) / 2,
  );
  const radius =
    Math.hypot(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2 + 20;
  const start = center
    .clone()
    .add(
      new THREE.Vector3(Math.sin(entry) * radius, 0, -Math.cos(entry) * radius),
    );
  const end = center
    .clone()
    .add(
      new THREE.Vector3(
        Math.sin(destination) * radius,
        0,
        -Math.cos(destination) * radius,
      ),
    );
  return new THREE.CubicBezierCurve3(
    start,
    start.clone().lerp(center, 0.75).setY(47),
    end.clone().lerp(center, 0.75).setY(47),
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

// Continue to the next actual junction before taking a legal return lane.
export function roadReturnRoute(transfer, position, heading, toGate = false) {
  const address = getAddress(transfer.originChainId, transfer.app),
    y = GROUND + 0.23;
  const target = toGate ? checkpoint(transfer) : address.road;
  let nearest,
    best = Infinity;
  for (const segment of ROAD_SEGMENTS) {
    const point = {
      x: Math.max(segment.x1, Math.min(segment.x2, position.x)),
      z: Math.max(segment.z1, Math.min(segment.z2, position.z)),
    };
    const distance = Math.hypot(point.x - position.x, point.z - position.z);
    if (distance < best) {
      best = distance;
      nearest = { point, segment };
    }
  }
  const { point, segment } = nearest;
  const axis = segment.x1 === segment.x2 ? "z" : "x";
  const direction = Math.sign(heading[axis]) || 1;
  const ahead = JUNCTIONS.filter(
    (p) => onStreet(p, segment) && (p[axis] - point[axis]) * direction > 0.5,
  ).sort(
    (a, b) => Math.abs(a[axis] - point[axis]) - Math.abs(b[axis] - point[axis]),
  )[0];
  const lead = ahead ? streetNodes(point, ahead, segment.neutral) : [point];
  const junction = lead.at(-1),
    owner = getDistrictAt(junction.x, junction.z);
  let nodes;
  if (owner?.id === address.district.id)
    nodes = [...lead, ...streetNodes(junction, target).slice(1)];
  else {
    const exit = owner ? owner.gate : junction;
    const entry = address.district.gate;
    nodes = [
      ...lead,
      ...streetNodes(junction, exit).slice(1),
      ...streetNodes(exit, entry, true).slice(1),
      ...streetNodes(entry, target).slice(1),
    ];
  }
  const streets = lanePoints(nodes, y);
  const departureLane = toGate
    ? lanePoints(streetNodes(address.road, target), y).at(-1)
    : null;
  const finish = toGate
    ? {
        x: departureLane?.[0] ?? target.x,
        z: departureLane?.[2] ?? target.z - 1.6,
      }
    : address.garage;

  return roundedPath([
    [position.x, y, position.z],
    ...streets,
    [finish.x, y, finish.z],
  ]);
}
