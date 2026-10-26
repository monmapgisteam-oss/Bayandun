import test from "node:test";
import assert from "node:assert/strict";
import { terrainLevel, levelBuildingGroups, trueTerrainHeading } from "../lib/yardTerrain.ts";
import { toUtm } from "../lib/proj.ts";

test("flat terrain preserves the absolute ground elevation", () => {
  const level = terrainLevel([{ z: 1234.5, resolution: 24 }, { z: 1234.5, resolution: 24 }]);
  assert.deepEqual(level, { base: 1234.5, min: 1234.5, max: 1234.5, resolution: 24, relief: 0 });
});

test("sloping terrain uses its highest sample and reports the coarsest DEM cell", () => {
  const level = terrainLevel([{ z: 102.1, resolution: 12 }, { z: 104.8, resolution: 24 }, { z: 103.3, resolution: 12 }]);
  assert.equal(level.base, 104.8);
  assert.equal(level.min, 102.1);
  assert.equal(level.max, 104.8);
  assert.equal(level.resolution, 24);
  assert.ok(Math.abs(level.relief - 2.7) < 1e-10);
});

test("house wings and attached garage share a plane while detached buildings remain independent", () => {
  const levels = levelBuildingGroups([
    { id: "house-main", group: "house", samples: [{ z: 102, resolution: 24 }, { z: 103, resolution: 24 }] },
    { id: "house-wing", group: "house", samples: [{ z: 101, resolution: 12 }] },
    { id: "attached-garage", group: "house", samples: [{ z: 105, resolution: 30 }] },
    { id: "shed", group: "shed", samples: [{ z: 99, resolution: 12 }, { z: 100, resolution: 12 }] },
  ]);
  for (const id of ["house-main", "house-wing", "attached-garage"]) {
    assert.deepEqual(levels.get(id), { base: 105, min: 101, max: 105, relief: 4, resolution: 30 });
  }
  assert.deepEqual(levels.get("shed"), { base: 100, min: 99, max: 100, relief: 1, resolution: 12 });
});

test("altitude is applied once and height differences survive vertical translation", () => {
  const samples = [{ z: 400.25, resolution: 24 }, { z: 402.75, resolution: 24 }];
  const ground = terrainLevel(samples), moved = terrainLevel(samples.map(s => ({ ...s, z: s.z + 1000 })));
  assert.equal(moved.base - ground.base, 1000);
  assert.equal(moved.relief, ground.relief);
  assert.equal(ground.base + 6.5, 409.25, "6.5 m model top is absolute ground plus its own full height");
});

test("missing elevations and unusable sample resolution reject instead of manufacturing a ground level", () => {
  assert.throws(() => terrainLevel([]), /empty/);
  for (const z of [NaN, Infinity, -Infinity, -999999]) assert.throws(() => terrainLevel([{ z, resolution: 24 }]), /elevation/);
  for (const resolution of [NaN, Infinity, -1]) assert.throws(() => terrainLevel([{ z: 100, resolution }]), /resolution/);
  assert.equal(terrainLevel([{ z: 0, resolution: 0 }]).base, 0);
  assert.equal(terrainLevel([{ z: -12, resolution: 24 }]).base, -12);
  assert.throws(() => levelBuildingGroups([{ id: "bad", group: "house", samples: [] }]), /empty/);
  assert.throws(() => levelBuildingGroups([{ id: "same", group: "a", samples: [{ z: 1, resolution: 24 }] }, { id: "same", group: "b", samples: [{ z: 2, resolution: 24 }] }]), /Duplicate/);
});

const circularError = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
test("true heading accounts for UTM convergence at Bayandun", () => {
  const center = toUtm([113.3672, 49.2594]);
  const heading = trueTerrainHeading(center, [0, 1]);
  assert.ok(heading >= 0 && heading < 360);
  assert.ok(circularError(heading, 0) > 1 && circularError(heading, 0) < 3, "UTM grid north differs from true north at this longitude");
  assert.ok(circularError(heading, trueTerrainHeading(center, [0, 9])) < 1e-9, "direction magnitude does not change orientation");
});

test("projected true north and east directions map back to geographic headings", () => {
  const center = toUtm([113.3672, 49.2594]);
  const north = toUtm([113.3672, 49.2595]), east = toUtm([113.3673, 49.2594]);
  assert.ok(circularError(trueTerrainHeading(center, [north[0] - center[0], north[1] - center[1]]), 0) < .001);
  assert.ok(circularError(trueTerrainHeading(center, [east[0] - center[0], east[1] - center[1]]), 90) < .001);
  assert.throws(() => trueTerrainHeading(center, [0, 0]), /nonzero/);
  assert.throws(() => trueTerrainHeading(center, [NaN, 1]), /finite/);
});
