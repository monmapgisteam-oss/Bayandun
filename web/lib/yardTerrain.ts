// Terrain levels for horizontal 3D building foundations. All elevations are metres.
import { toLL } from "./proj.ts";
import type { XY } from "./plan.ts";

export type TerrainSample = { z: number; resolution: number };
export type TerrainLevel = { base: number; min: number; max: number; resolution: number; relief: number };
export type TerrainRecord = { id: string; group: string; samples: readonly TerrainSample[] };

/** Highest sampled ground forms the model's origin plane; it is already absolute elevation. */
export function terrainLevel(samples: readonly TerrainSample[]): TerrainLevel {
  if (!samples.length) throw new Error("Terrain samples are empty.");
  let min = Infinity, max = -Infinity, resolution = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample.z) || sample.z === -999999) throw new Error("Terrain elevation is missing or invalid.");
    if (!Number.isFinite(sample.resolution) || sample.resolution < 0) throw new Error("Terrain sample resolution is missing or invalid.");
    min = Math.min(min, sample.z);
    max = Math.max(max, sample.z);
    resolution = Math.max(resolution, sample.resolution);
  }
  return { base: max, min, max, resolution, relief: max - min };
}

/** House wings and an attached garage share one level plane; detached buildings use their own group. */
export function levelBuildingGroups(records: readonly TerrainRecord[]): Map<string, TerrainLevel> {
  const groups = new Map<string, TerrainLevel>(), ids = new Set<string>();
  for (const record of records) {
    if (!record.id || !record.group) throw new Error("Building id and terrain group must be specified.");
    if (ids.has(record.id)) throw new Error(`Duplicate building id: ${record.id}`);
    ids.add(record.id);
    const level = terrainLevel(record.samples), previous = groups.get(record.group);
    if (!previous) groups.set(record.group, level);
    else {
      const min = Math.min(previous.min, level.min), max = Math.max(previous.max, level.max);
      groups.set(record.group, { base: max, min, max, resolution: Math.max(previous.resolution, level.resolution), relief: max - min });
    }
  }
  return new Map(records.map(record => [record.id, { ...groups.get(record.group)! }]));
}

/** True clockwise bearing of glTF -Z (building back), with +Z facing out toward the street. */
export function trueTerrainHeading(center: XY, inward: XY): number {
  if (![...center, ...inward].every(Number.isFinite)) throw new Error("Building heading coordinates must be finite.");
  const length = Math.hypot(...inward);
  if (!length) throw new Error("Building inward direction must be nonzero.");
  const target: XY = [center[0] + inward[0] / length * 10, center[1] + inward[1] / length * 10];
  const [lon0, lat0] = toLL(center), [lon1, lat1] = toLL(target), radians = Math.PI / 180;
  if (![lon0, lat0, lon1, lat1].every(Number.isFinite)) throw new Error("Building heading could not be projected.");
  const phi0 = lat0 * radians, phi1 = lat1 * radians, delta = (lon1 - lon0) * radians;
  const y = Math.sin(delta) * Math.cos(phi1);
  const x = Math.cos(phi0) * Math.sin(phi1) - Math.sin(phi0) * Math.cos(phi1) * Math.cos(delta);
  return (Math.atan2(y, x) / radians + 360) % 360;
}
