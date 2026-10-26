// «8 га-д систем өөрөө» төлөвлөгчийн шалгалт: node --experimental-strip-types --test scripts/soum.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runSoum, SOUM_DEFAULT } from "../lib/soumPlan.ts";
import { area, inter } from "../lib/plan.ts";

const fc = JSON.parse(readFileSync(new URL("../public/data/site_boundary.geojson", import.meta.url), "utf8"));
const sd = JSON.parse(readFileSync(new URL("../lib/siteData.json", import.meta.url), "utf8"));
for (const f of fc.features.filter((f) => /хувилбар/.test(f.properties.name))) for (const pop of [60, 150]) test(`${f.properties.name} · ${pop} хүн`, () => {
  const p = f.properties, site = [[p.utm49]];
  const t = performance.now();
  const sp = runSoum(site, { ...SOUM_DEFAULT, pop }, { angle: p.angle, anchor: p.anchor, localW: p.localW }, sd.road);
  console.log(f.properties.name, pop, (performance.now() - t).toFixed(0), "ms", sp.cand.map((c) => `${c.plot}/${c.rows}:${c.hh}${c.ok ? "✓" : ""}`).join(" "));
  console.log("  chosen", sp.chosen.plot, sp.chosen.rows, Object.fromEntries(Object.entries(sp.metrics).map(([k, v]) => [k, Math.round(v)])));
  console.log("  zones", sp.zones.map((z) => `${z.k}:${Math.round(z.area)}`).join(" "), "bld", sp.buildings.length, "checks", sp.checks.map((c) => `${c.label}=${c.ok}`).join("; "));
  assert.ok(sp.metrics.hh > 10);
  assert.equal(sp.yards.length, sp.plots.length, "every residential plot has a complete yard");
  assert.equal(sp.metrics.plot, 2000, "default automatic layout uses 2,000 m² plots");
  assert.equal(sp.metrics.cars, sp.metrics.hh, "one car per household");
  for (const k of ["kinder", "shop", "eng"]) {
    assert.equal(sp.facLots[k].length, 0, `${k}: no land reserved`);
    assert.ok(!sp.zones.some(z => z.k === k), `${k}: no facility zone`);
    assert.ok(!sp.buildings.some(b => b.k === k), `${k}: no facility building`);
  }
  assert.equal(sp.plots.length + sp.facLots.park.length, sp.plan.lots.length, "all plots outside the playground become residential yards");
  assert.equal(new Set(sp.yards.map(y => y.houseType.id)).size, 6, "automatic layout mixes all six house types");
  for (const yard of sp.yards) {
    const plot = sp.plots.find(l => l.id === yard.id);
    assert.ok(Math.abs(plot.area - 2000) < 1);
    assert.equal(yard.cars.length, 1);
    assert.ok(Math.abs(area([[yard.cars[0]]]) - 8.1) < .03, "car has its real metre footprint");
    if (yard.houseType.garage !== "open") assert.ok(Math.abs(yard.garageArea - 31.5) < .03, "garage is 4.5 × 7 m");
    for (const b of yard.bldgs) assert.ok(area([[b.r]]) - area(inter([[b.r]], plot.poly)) < .1, `${yard.id}: building stays on its own plot`);
    for (const car of yard.cars) for (const b of yard.bldgs) assert.ok(area(inter([[car]], [[b.r]])) < .01, `${yard.id}: car does not overlap a building`);
    assert.ok(!yard.nums.some(q => q.n === 8), "water tank is absent");
  }
  assert.ok(Math.abs(sp.metrics.houseGfa - sp.yards.reduce((sum, y) => sum + y.houseArea * y.houseType.floors, 0)) < .1, "house totals use the same geometry as the map");
  for (const b of sp.buildings) assert.ok(area(inter([[b.r]], sp.plan.site)) > area([[b.r]]) - 1, `${b.k} ${b.plot} хил дотор`);
});
