// Төлөвлөлтийн хөдөлгүүрийн шалгалт: node --experimental-strip-types --test scripts/plan.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPlan, DEFAULT_PARAMS, area, inter, corners } from "../lib/plan.ts";

const fc = JSON.parse(readFileSync(new URL("../public/data/site_boundary.geojson", import.meta.url), "utf8"));
const site = [[fc.features[0].properties.utm49]];

for (const perimW of [0, 8]) test(`8 га хил, хүрээний гудамж ${perimW} м`, () => {
  const t = performance.now();
  const pl = runPlan(site, { ...DEFAULT_PARAMS, perimW });
  const m = pl.metrics;
  console.log(`perimW=${perimW}`, (performance.now() - t).toFixed(0), "ms", { res: m.resCount, avg: m.avgLot.toFixed(0), resHa: (m.res / 1e4).toFixed(2), st: (m.streets / 1e4).toFixed(2), gr: (m.green / 1e4).toFixed(2), pub: m.pub.toFixed(0), ox: pl.params.ox.toFixed(1), oy: pl.params.oy.toFixed(1) }, pl.warnings);
  assert.ok(Math.abs(m.site - 80000) < 5, "талбай 8 га");
  assert.ok(Math.abs(m.closure) < 2, "баланс таарна");
  assert.ok(m.resCount > 10);
  // Нэгж талбарууд хоорондоо давхцахгүй, хилээс гарахгүй
  for (let i = 0; i < pl.lots.length; i++) {
    assert.ok(area(inter(pl.lots[i].poly, pl.site)) > pl.lots[i].area - 1, `${pl.lots[i].id} хил дотор`);
    for (let j = i + 1; j < pl.lots.length; j++) assert.ok(area(inter(pl.lots[i].poly, pl.lots[j].poly)) < 0.5, `${pl.lots[i].id}/${pl.lots[j].id} давхцал`);
  }
  for (const l of pl.lots) assert.ok(corners(l.poly).length >= 3);
});
