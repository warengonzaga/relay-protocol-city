import * as THREE from "three";
import { CITY_CHAIN_IDS, ETHEREUM_INTEGRATORS } from "./activity.js";
import { DISTRICT_LAYOUTS } from "./district-layout.js";

export const GROUND = 0.6;
export const RAIL_HEIGHT = 7.2;
export const ROAD_SEGMENTS = [],
  JUNCTIONS = [];
export const SIGNAL_JUNCTIONS = [];
export const CITY_BOUNDS = {};
export const RAIL_POINTS = [];
export const DISTRICTS = CITY_CHAIN_IDS.map((id) => ({ id }));
// Unsupported chains have no displayed geography and must never be aliased onto a district.
export const OTHER_DISTRICT = { id: 0, visible: false, x: -10000, z: -10000 };

function layout() {
  for (const district of DISTRICTS) {
    const plan = DISTRICT_LAYOUTS[district.id];
    Object.assign(district, plan, { visible: true });
    district.width = plan.bounds.right - plan.bounds.left;
    district.height = plan.bounds.bottom - plan.bounds.top;
    district.polygonBounds = {
      left: Math.min(...plan.polygon.map((p) => p.x)),
      right: Math.max(...plan.polygon.map((p) => p.x)),
      top: Math.min(...plan.polygon.map((p) => p.z)),
      bottom: Math.max(...plan.polygon.map((p) => p.z)),
    };
    district.gates = [district.gate];
    district.sites = plan.sites.map((site) => {
      if (site.role === "scenery")
        return { ...site, address: { x: site.x, z: site.z, type: "scenery" } };
      const type = site.model.startsWith("building-type") ? "house" : site.role;
      const ports = address(
        district,
        type,
        site.x - district.x,
        site.z - district.z,
        site.roadZ,
        site.side,
        { kind: site.role },
        site.maxDepth,
      );
      delete ports.district;
      ports.siteId = site.id;
      ports.hasGarage = site.garage !== false;
      return { ...site, address: ports };
    });
    district.police = district.sites.find(
      (site) => site.role === "police",
    ).address;
    district.busTerminal = district.sites.find(
      (site) => site.role === "bus-terminal",
    )?.address;
  }
  Object.assign(CITY_BOUNDS, {
    left: -176,
    right: 186,
    top: -106,
    bottom: 86,
    minX: -176,
    maxX: 186,
    minZ: -106,
    maxZ: 86,
  });
  ROAD_SEGMENTS.splice(
    0,
    ROAD_SEGMENTS.length,
    ...DISTRICTS.flatMap((d) =>
      d.localRoads.map(([x1, z1, x2, z2]) => ({
        x1,
        z1,
        x2,
        z2,
        neutral: false,
      })),
    ),
    { x1: 20, z1: 0, x2: 68, z2: 0, neutral: true },
  );
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
  // A single elevated spine serves both authored station platforms.
  RAIL_POINTS.splice(
    0,
    RAIL_POINTS.length,
    [5, -88],
    [-160, -88],
    [-160, 42],
    [170, 42],
    [170, -88],
  );
}

export function getDistrictBounds() {
  return { ...CITY_BOUNDS };
}
export function getDistrictAt(x, z) {
  return (
    DISTRICTS.find(({ polygon }) => {
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
const appSlots = new Map(
  DISTRICTS.map((district) => [
    district.id,
    new Map(
      district.id === 1
        ? ETHEREUM_INTEGRATORS.map((app, slot) => [app.key, { ...app, slot }])
        : [],
    ),
  ]),
);
export function registerApps(transfers) {
  for (const transfer of transfers) {
    if (transfer.app?.kind !== "integrator") continue;
    for (const id of [transfer.originChainId, transfer.destinationChainId]) {
      const slots = appSlots.get(Number(id));
      if (
        !slots ||
        slots.has(transfer.app.key) ||
        slots.size >=
          getDistrict(id).sites.filter((site) => site.role === "integrator")
            .length
      )
        continue;
      // Ethereum's ranked skyline is fixed; Base accepts observed apps until its own design pass.
      slots.set(transfer.app.key, { ...transfer.app, slot: slots.size });
    }
  }
}
export function getDistrictApps(id) {
  return [...(appSlots.get(id)?.values() ?? [])];
}
function address(district, type, dx, dz, roadZ, side, app, depth = 5.8) {
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
    door: { x, z: z - side * (depth / 2 + 0.3) },
    garage: { x: driveX, z: z - side * (depth / 2 + 2.3) },
    sidewalk: { x: driveX, z: roadZ + side * 4.7 },
    road: { x: driveX, z: roadZ },
  };
}
export function getTowerAddress(chainId, slot) {
  const district = getDistrict(chainId);
  const site = district.sites?.find(
    (site) => site.role === "integrator" && site.slot === slot,
  );
  return site ? { ...site.address, district } : null;
}
export function getAddress(
  chainId,
  app = { kind: "unknown" },
  role = "origin",
) {
  const district = getDistrict(chainId);
  if (!district.visible)
    return { x: district.x, z: district.z, district, app, type: "unmapped" };
  const assigned = appSlots.get(district.id)?.get(app.key);
  if (app.kind === "integrator" && assigned)
    return { ...getTowerAddress(chainId, assigned.slot), app };
  const site =
    app.kind === "relay"
      ? district.sites.find(
          (site) => site.role === "relay" && site.endpoint === role,
        )
      : district.sites.find((site) => site.role === "commons");
  return { ...site.address, district, app };
}
// Stable across refreshes so updates and returns keep the same house and route.
export function requestSeed(transfer) {
  let hash = 2166136261;
  for (const character of String(
    transfer.id ?? `${transfer.originChainId}:${transfer.destinationChainId}`,
  ))
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  return hash;
}

export function getJourneyAddress(transfer, role = "origin") {
  if (transfer.originChainId === transfer.destinationChainId) role = "origin";
  const chainId =
    role === "origin" ? transfer.originChainId : transfer.destinationChainId;
  const district = getDistrict(chainId);
  if (!district.visible) return getAddress(chainId, transfer.app, role);
  if (transfer.kind === "bus") {
    if (!district.busTerminal)
      throw new Error("District bus terminal is missing");
    return { ...district.busTerminal, district, app: transfer.app };
  }
  if (transfer.app?.kind !== "relay")
    return getAddress(chainId, transfer.app, role);
  const walking = transfer.kind === "pedestrian";
  const homes = district.sites.filter(
    (site) =>
      site.role === "relay" &&
      (walking ? site.garage === false : site.garage !== false),
  );
  if (!homes.length)
    throw new Error("District is missing the requested home type");
  const index =
    (requestSeed(transfer) + (role === "destination" ? 1 : 0)) % homes.length;
  return { ...homes[index].address, district, app: transfer.app };
}

export function getGate(chainId, pedestrian = false) {
  const d = getDistrict(chainId);
  return { ...d.gate, z: d.roadZ - (pedestrian ? 4.7 : 0) };
}
export function getInspectionCapacity(chainId, walking = false) {
  return (
    getDistrict(chainId).checkpoint?.[walking ? "pedestrian" : "vehicle"]
      ?.length ?? 0
  );
}
export function getInspectionBay(chainId, walking = false, slot = 0) {
  const bay =
    getDistrict(chainId).checkpoint?.[walking ? "pedestrian" : "vehicle"]?.[
      slot
    ];
  if (!bay) throw new RangeError("The requested inspection bay does not exist");
  return bay;
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
