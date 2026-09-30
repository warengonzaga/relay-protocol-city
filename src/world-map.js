import * as THREE from "three";

export const GROUND = 0.6;
export const RAIL_HEIGHT = 7.2;
export const ROAD_SEGMENTS = [],
  JUNCTIONS = [];
export const SIGNAL_JUNCTIONS = [];
export const CITY_BOUNDS = {};
export const RAIL_POINTS = [];
export const DISTRICTS = [
  8453, 1, 792703809, 42161, 10, 137, 56, 43114, 8253038, 130, 999, 59144,
].map((id) => ({ id }));
export const OTHER_DISTRICT = { id: 0 };
let configured = false;

function sizeDistrict(district, left, width, z, side = "west") {
  const x = left + width / 2;
  Object.assign(district, {
    x,
    z,
    width,
    height: 56,
    bounds: { left, right: left + width, top: z - 28, bottom: z + 28 },
    roadZ: z + 12,
    loop: {
      left: left + 10,
      right: left + width - 10,
      top: z - 14,
      bottom: z + 12,
    },
    station: { x, z: z + 22 },
    gate: { x: side === "west" ? left : left + width, z: z + 12, side },
    bay: { x: side === "west" ? left + 5 : left + width - 5, z: z + 3 },
    walkBay: { x: side === "west" ? left + 5 : left + width - 5, z: z - 1 },
    police: {
      x: x - 14,
      z: z + 22,
      garage: { x: x - 14, z: z + 18.5 },
      road: { x: x - 14, z: z + 12 },
    },
  });
}

// Broad angled shoulders shape each territory without occupying the public corridors.
function buildTerritories() {
  for (const [index, district] of [...DISTRICTS, OTHER_DISTRICT].entries()) {
    const { left, right } = district.bounds,
      z = district.z;
    const inset = 8 + (index % 3) * 3;
    district.polygon = [
      { x: left + inset, z: z - 38 - (index % 6) },
      { x: right - 8, z: z - 43 + (index % 5) },
      { x: right, z: z - 29 },
      { x: right, z: z + 30 },
      { x: right - inset, z: z + 38 + (index % 6) },
      { x: left + 8, z: z + 43 - (index % 5) },
      { x: left, z: z + 30 },
      { x: left, z: z - 29 },
    ];
    district.polygonBounds = {
      left,
      right,
      top: Math.min(...district.polygon.map((v) => v.z)),
      bottom: Math.max(...district.polygon.map((v) => v.z)),
    };
    district.height =
      district.polygonBounds.bottom - district.polygonBounds.top;
    district.gates = [
      { x: left, z: district.roadZ, side: "west" },
      { x: right, z: district.roadZ, side: "east" },
    ];
  }
}

function layout(counts = new Map()) {
  const maximum = Math.max(
    1,
    ...DISTRICTS.map(({ id }) => counts.get(id) || 0),
  );
  for (let row = 0; row < 3; row++) {
    let left = -80;
    for (const district of DISTRICTS.slice(row * 4, row * 4 + 4)) {
      const count = Math.max(0, counts.get(district.id) || 0);
      const width = 44 + 28 * Math.sqrt(count / maximum);
      sizeDistrict(district, left, width, (row - 1) * 104);
      district.activityCount = count;
      left += width + 26;
    }
  }
  sizeDistrict(OTHER_DISTRICT, -145, 39, 0, "east");
  OTHER_DISTRICT.station.x = OTHER_DISTRICT.x + 8.5;
  buildTerritories();
  const right = Math.max(...DISTRICTS.map((d) => d.bounds.right));
  const neutralLeft = OTHER_DISTRICT.bounds.left - 13;
  Object.assign(CITY_BOUNDS, {
    left: neutralLeft - 16,
    right: right + 29,
    top: -174,
    bottom: 174,
    minX: neutralLeft - 16,
    maxX: right + 29,
    minZ: -174,
    maxZ: 174,
  });
  const streets = new Map();
  const addStreet = (x1, z1, x2, z2, neutral = false) =>
    streets.set(`${x1}:${z1}:${x2}:${z2}`, { x1, z1, x2, z2, neutral });
  for (const z of [-156, -52, 52, 156])
    addStreet(neutralLeft, z, right + 13, z, true);
  for (const d of [...DISTRICTS, OTHER_DISTRICT]) {
    const r = d.loop,
      { left, right } = d.bounds;
    addStreet(left, d.roadZ, right, d.roadZ);
    addStreet(r.left, r.top, r.right, r.top);
    addStreet(r.left, r.top, r.left, r.bottom);
    addStreet(r.right, r.top, r.right, r.bottom);
    addStreet(left - 13, d.roadZ, left, d.roadZ, true);
    addStreet(right, d.roadZ, right + 13, d.roadZ, true);
    addStreet(left - 13, d.z - 52, left - 13, d.z + 52, true);
    addStreet(right + 13, d.z - 52, right + 13, d.z + 52, true);
  }
  ROAD_SEGMENTS.splice(0, ROAD_SEGMENTS.length, ...streets.values());
  const points = new Map();
  const add = (x, z) => points.set(`${x}:${z}`, { x, z });
  for (const s of ROAD_SEGMENTS) {
    add(s.x1, s.z1);
    add(s.x2, s.z2);
    if (s.z1 !== s.z2) continue;
    for (const v of ROAD_SEGMENTS) {
      if (v.x1 !== v.x2) continue;
      if (v.x1 >= s.x1 && v.x1 <= s.x2 && s.z1 >= v.z1 && s.z1 <= v.z2)
        add(v.x1, s.z1);
    }
  }
  JUNCTIONS.splice(0, JUNCTIONS.length, ...points.values());
  SIGNAL_JUNCTIONS.splice(
    0,
    SIGNAL_JUNCTIONS.length,
    ...JUNCTIONS.filter(({ x, z }) => {
      const directions = new Set();
      for (const s of ROAD_SEGMENTS) {
        if (
          s.z1 === s.z2 &&
          Math.abs(z - s.z1) < 0.001 &&
          x >= s.x1 &&
          x <= s.x2
        ) {
          if (x > s.x1 + 0.001) directions.add("west");
          if (x < s.x2 - 0.001) directions.add("east");
        }
        if (
          s.x1 === s.x2 &&
          Math.abs(x - s.x1) < 0.001 &&
          z >= s.z1 &&
          z <= s.z2
        ) {
          if (z > s.z1 + 0.001) directions.add("north");
          if (z < s.z2 - 0.001) directions.add("south");
        }
      }
      return directions.size >= 3;
    }),
  );
  // One shared centerline positions the tracks, stations, and supporting gantries.
  RAIL_POINTS.splice(
    0,
    RAIL_POINTS.length,
    [0, -145],
    [neutralLeft - 8, -145],
    [neutralLeft - 8, -82],
    [right + 21, -82],
    [right + 21, 22],
    [neutralLeft - 8, 22],
    [neutralLeft - 8, 126],
    [right + 25, 126],
    [right + 25, -145],
  );
}

// Freeze the first observed sample; changing the ground under active journeys is misleading.
export function configureDistricts(transfers = [], chainCounts = null) {
  if (configured) return false;
  const counts = new Map();
  if (chainCounts) {
    for (const [id, count] of Object.entries(chainCounts))
      if (Number.isFinite(Number(count)) && Number(count) >= 0)
        counts.set(Number(id), Number(count));
  } else {
    const seen = new Set();
    for (const transfer of transfers) {
      if (transfer.id && seen.has(transfer.id)) continue;
      if (transfer.id) seen.add(transfer.id);
      for (const id of new Set([
        Number(transfer.originChainId),
        Number(transfer.destinationChainId),
      ]))
        counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  layout(counts);
  railCurves.clear();
  stationProgress.clear();
  configured = true;
  return true;
}
export function getDistrictBounds() {
  return { ...CITY_BOUNDS };
}
export function getDistrictAt(x, z) {
  return (
    [...DISTRICTS, OTHER_DISTRICT].find(({ polygon }) => {
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const a = polygon[i],
          b = polygon[j];
        const cross = (x - a.x) * (b.z - a.z) - (z - a.z) * (b.x - a.x);
        if (
          Math.abs(cross) < 0.00001 &&
          x >= Math.min(a.x, b.x) &&
          x <= Math.max(a.x, b.x) &&
          z >= Math.min(a.z, b.z) &&
          z <= Math.max(a.z, b.z)
        )
          return true;
        if (
          a.z > z !== b.z > z &&
          x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x
        )
          inside = !inside;
      }
      return inside;
    }) ?? null
  );
}
export function getDistrict(id) {
  return (
    DISTRICTS.find((district) => district.id === Number(id)) ?? OTHER_DISTRICT
  );
}
const appSlots = new Map(DISTRICTS.map((district) => [district.id, new Map()]));
export function registerApps(transfers) {
  for (const transfer of transfers) {
    if (transfer.app?.kind !== "integrator") continue;
    for (const id of [transfer.originChainId, transfer.destinationChainId]) {
      const slots = appSlots.get(Number(id));
      if (!slots || slots.has(transfer.app.key) || slots.size >= 2) continue;
      // ponytail: two dedicated towers per district; overflow shares a clearly named commons.
      slots.set(transfer.app.key, { ...transfer.app, slot: slots.size });
    }
  }
}
export function getDistrictApps(id) {
  return [...(appSlots.get(id)?.values() ?? [])];
}
function address(district, type, dx, dz, roadZ, side, app) {
  const x = district.x + dx,
    z = district.z + dz;
  const driveX = x + (type === "house" ? (dx < 0 ? 3 : -3) : 0);
  return {
    x,
    z,
    type,
    district,
    app,
    sidewalkSide: side,
    door: { x, z: z - side * 3.2 },
    garage: { x: driveX, z: z - side * 3.5 },
    sidewalk: { x: driveX, z: roadZ + side * 4.7 },
    road: { x: driveX, z: roadZ },
  };
}
export function getTowerAddress(chainId, slot) {
  const district = getDistrict(chainId);
  return address(
    district,
    "integrator",
    slot === 0 ? -5 : 5,
    -24,
    district.loop.top,
    -1,
    { kind: "integrator" },
  );
}
export function getAddress(
  chainId,
  app = { kind: "unknown" },
  role = "origin",
) {
  const district = getDistrict(chainId);
  const assigned = appSlots.get(district.id)?.get(app.key);
  if (district.id && app.kind === "relay")
    return address(
      district,
      "house",
      role === "destination" ? 5 : -5,
      -3,
      district.roadZ,
      -1,
      app,
    );
  if (district.id && app.kind === "integrator" && assigned)
    return { ...getTowerAddress(chainId, assigned.slot), app };
  return address(
    district,
    "commons",
    district.id ? 14 : 7,
    22,
    district.roadZ,
    1,
    app,
  );
}
export function getGate(chainId, pedestrian = false) {
  const d = getDistrict(chainId);
  return { ...d.gate, z: d.roadZ - (pedestrian ? 4.7 : 0) };
}
export function getSignalState(seconds, axis) {
  const phase = ((seconds % 18) + 18) % 18;
  if (axis === "x") return phase < 7 ? "green" : phase < 9 ? "yellow" : "red";
  return phase < 9 ? "red" : phase < 16 ? "green" : "yellow";
}
layout();
const railCurves = new Map();

export function createRailCurve(lane = 0) {
  if (railCurves.has(lane)) return railCurves.get(lane);
  const offset = lane === 2 ? 0 : lane === 0 ? -1.35 : 1.35;
  const points = RAIL_POINTS.map(([x, z], index, all) => {
    const previous = all[(index - 1 + all.length) % all.length];
    const next = all[(index + 1) % all.length];
    const incoming = new THREE.Vector2(
      x - previous[0],
      z - previous[1],
    ).normalize();
    const outgoing = new THREE.Vector2(next[0] - x, next[1] - z).normalize();
    const normal = new THREE.Vector2(
      -incoming.y - outgoing.y,
      incoming.x + outgoing.x,
    );
    const denominator = 1 + incoming.dot(outgoing);
    return new THREE.Vector3(
      x + (normal.x * offset) / denominator,
      RAIL_HEIGHT,
      z + (normal.y * offset) / denominator,
    );
  });
  const curve = new THREE.CurvePath();
  let last = points[0];
  for (let index = 1; index < points.length; index++) {
    const corner = points[index];
    const previous = points[index - 1];
    const next = points[(index + 1) % points.length];
    const inDirection = corner.clone().sub(previous).normalize();
    const outDirection = next.clone().sub(corner).normalize();
    const before = corner.clone().addScaledVector(inDirection, -7);
    const after = corner.clone().addScaledVector(outDirection, 7);
    curve.add(new THREE.LineCurve3(last, before));
    curve.add(new THREE.QuadraticBezierCurve3(before, corner, after));
    last = after;
  }
  curve.add(new THREE.LineCurve3(last, points[0]));
  curve.arcLengthDivisions = 2000;
  railCurves.set(lane, curve);
  return curve;
}

const stationProgress = new Map();
export function getStationProgress(chainId, lane = 0) {
  const district = getDistrict(chainId);
  const key = `${district.id}:${lane}`;
  if (stationProgress.has(key)) return stationProgress.get(key);
  const curve = createRailCurve(lane);
  const station = new THREE.Vector3(
    district.station.x,
    RAIL_HEIGHT,
    district.station.z,
  );
  let best = 0,
    distance = Infinity;
  for (let index = 0; index <= 2000; index++) {
    const progress = index / 2000;
    const delta = curve.getPointAt(progress).distanceToSquared(station);
    if (delta < distance) {
      distance = delta;
      best = progress;
    }
  }
  stationProgress.set(key, best);
  return best;
}
