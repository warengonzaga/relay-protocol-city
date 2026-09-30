import * as THREE from "three";

export const GROUND = 0.6;
export const ROAD_X = [-80, -40, 0, 40, 80];
export const ROAD_Z = [-63, -21, 21, 63];
export const RAIL_HEIGHT = 5.2;
export const DISTRICTS = [
  8453, 1, 792703809, 42161, 10, 137, 56, 43114, 8253038, 130, 999, 59144,
].map((id, index) => {
  const x = [-60, -20, 20, 60][index % 4];
  const z = [-42, 0, 42][Math.floor(index / 4)];
  return {
    id,
    x,
    z,
    station: { x, z: z + 14 },
    police: {
      x: x - 12,
      z: z + 5,
      garage: { x: x - 12, z: z + 9 },
      road: { x: x - 12, z: z + 21 },
    },
  };
});
export const OTHER_DISTRICT = {
  id: 0,
  x: -107,
  z: 0,
  station: { x: -84, z: 14 },
  police: {
    x: -108,
    z: 5,
    garage: { x: -108, z: 9 },
    road: { x: -108, z: 21 },
  },
};
const appSlots = new Map(DISTRICTS.map((district) => [district.id, new Map()]));

export function getDistrict(id) {
  return (
    DISTRICTS.find((district) => district.id === Number(id)) ?? OTHER_DISTRICT
  );
}

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

export function getAddress(
  chainId,
  app = { kind: "unknown" },
  role = "origin",
) {
  const district = getDistrict(chainId);
  let type = "commons";
  let dx = 12,
    dz = 4,
    driveX = 12;
  const assigned = appSlots.get(district.id)?.get(app.key);
  if (district.id && app.kind === "relay") {
    type = "house";
    dx = role === "destination" ? 12 : -12;
    dz = -8;
    driveX = role === "destination" ? 15 : -15;
  } else if (district.id && app.kind === "integrator" && assigned) {
    type = "integrator";
    dx = assigned.slot === 0 ? -5 : 5;
    dz = -6;
    driveX = assigned.slot === 0 ? -8 : 8;
  }
  const x = district.x + dx;
  const z = district.z + dz;
  return {
    x,
    z,
    type,
    district,
    app,
    door: { x, z: z + 3.2 },
    garage: { x: district.x + driveX, z: z + 3.5 },
    sidewalk: { x: district.x + driveX, z: district.z + 16.3 },
    road: { x: district.x + driveX, z: district.z + 21 },
  };
}

export function getGate(chainId, pedestrian = false) {
  const district = getDistrict(chainId);
  return { x: district.x + 14.5, z: district.z + (pedestrian ? 16.3 : 21) };
}

export function getSignalState(seconds, axis) {
  const phase = ((seconds % 18) + 18) % 18;
  if (axis === "x") return phase < 7 ? "green" : phase < 9 ? "yellow" : "red";
  return phase < 9 ? "red" : phase < 16 ? "green" : "yellow";
}

// A continuous serpent serves every station before returning through the rear tunnel.
export const RAIL_POINTS = [
  [0, -68],
  [-90, -68],
  [-90, -28],
  [92, -28],
  [92, 14],
  [-90, 14],
  [-90, 56],
  [104, 56],
  [104, -68],
];
const railCurves = new Map();

export function createRailCurve(lane = 0) {
  if (railCurves.has(lane)) return railCurves.get(lane);
  const offset = lane === 0 ? -1.35 : 1.35;
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
