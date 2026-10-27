import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPlan, DEFAULT_PARAMS, area, inter, inside } from "../lib/plan.ts";
import { HOUSE_TYPES, yardOf, yardRoadMarks } from "../lib/parcelYards.ts";
import { communitySpaces } from "../lib/communitySpaces.ts";

const boundaries = JSON.parse(readFileSync(new URL("../public/data/site_boundary.geojson", import.meta.url), "utf8"));
for (const feature of boundaries.features.filter(f => /хувилбар [12]$/.test(f.properties.name))) {
  const pr = feature.properties;
  const plan = runPlan([[pr.utm49]], { ...DEFAULT_PARAMS, angle: pr.angle, anchor: pr.anchor, rows: pr.rows, localW: pr.localW, minLotRatio: 1, mix: null, lotW: 40, lotD: 50, lotsPerBlock: 4, publicLots: 0 });
  test(`${pr.name}: every yard faces its street and fits its parcel`, () => {
    for (const [i, lot] of plan.lots.entries()) {
      const type = HOUSE_TYPES[i % HOUSE_TYPES.length];
      const yard = yardOf(lot.id, lot.poly, plan.streets, type);
      assert.ok(yard, lot.id);
      assert.ok(Math.abs(yard.frame.W - 40) < .01, `${lot.id}: 40 m street frontage`);
      assert.ok(Math.abs(yard.frame.D - 50) < .01, `${lot.id}: 50 m depth`);
      assert.equal(yard.cars.length, 1);
      assert.ok(Math.abs(lot.area - 2000) < 1, `${lot.id}: 2,000 m² parcel`);
      const car = yard.cars[0];
      const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
      assert.ok(Math.abs(length(car[0], car[1]) - 1.8) < .001, "car is 1.8 m wide");
      assert.ok(Math.abs(length(car[1], car[2]) - 4.5) < .001, "car is 4.5 m long");
      assert.ok(Math.abs(area([[car]]) - 8.1) < .02, "car footprint is 8.1 m²");
      assert.ok(yard.houseArea > 12 * area([[car]]), "house footprint is over 12 times the car footprint");
      assert.deepEqual(yard.nums.map(q => q.n).sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 9, 10]);
      for (const item of [...yard.parts, ...yard.roofs, ...yard.foliage, ...yard.bldgs]) {
        const poly = [[item.r]];
        assert.ok(item.r.every(p => inside(p, lot.poly)), `${lot.id}: ${item.k} stays inside fence`);
        if (area(poly) > .6) assert.ok(area(poly) - area(inter(poly, lot.poly)) < .05, `${lot.id}: ${item.k} contained area`);
      }
      for (let i = 0; i < yard.bldgs.length; i++) for (let j = i + 1; j < yard.bldgs.length; j++) {
        assert.ok(area(inter([[yard.bldgs[i].r]], [[yard.bldgs[j].r]])) < .01, `${lot.id}: buildings do not overlap`);
      }
      assert.ok(Math.abs(yard.houseArea - (type.w * type.d - (type.shape === "l" ? 16 : 0))) < .05);
    }
  });
  test(`${pr.name}: all six house types have valid garage access`, () => {
    const lot = plan.lots[0];
    for (const template of HOUSE_TYPES) for (const garageType of ["attached", "detached", "open"]) {
      const type = { ...template, garage: garageType };
      const yard = yardOf(lot.id, lot.poly, plan.streets, type);
      const houses = yard.bldgs.filter(b => b.k === "house"), garage = yard.bldgs.find(b => b.k === "parking");
      for (let i = 0; i < yard.bldgs.length; i++) for (let j = i + 1; j < yard.bldgs.length; j++) assert.ok(area(inter([[yard.bldgs[i].r]], [[yard.bldgs[j].r]])) < .01, `${type.id}: buildings separate`);
      if (type.garage === "open") {
        assert.equal(garage, undefined);
        assert.equal(yard.garageArea, 0);
      } else {
        assert.ok(garage);
        assert.ok(Math.abs(yard.garageArea - 31.5) < .05);
        assert.ok(yard.garageArea > 3.8 * area([[yard.cars[0]]]), "garage footprint is clearly larger than the car");
        if (type.garage === "attached") {
          const depth = p => (p[0] - yard.frame.A[0]) * yard.frame.n[0] + (p[1] - yard.frame.A[1]) * yard.frame.n[1];
          assert.ok(Math.abs(Math.max(...garage.r.map(depth)) - Math.min(...houses.flatMap(b => b.r.map(depth)))) < .01, "attached garage shares front wall");
        } else for (const h of houses) assert.ok(Math.min(...h.r.flatMap(a => garage.r.map(b => Math.hypot(a[0] - b[0], a[1] - b[1])))) > 2, "detached garage has a gap");
      }
      for (const car of yard.cars) for (const b of yard.bldgs) assert.ok(area(inter([[car]], [[b.r]])) < .01, `${type.id}: apron clear of buildings`);
      assert.equal(yard.cars.length, 1, `${type.id}: one car per household`);
      const bay = yard.parts.find(p => p.k === "parking");
      assert.ok(Math.abs(area([[bay.r]]) - 15.4) < .05, "single parking bay is 2.8 × 5.5 m");
      assert.ok(yard.cars[0].every(p => inside(p, [[bay.r]])), "car fits inside its parking bay");
      for (const roof of yard.roofs.filter(p => p.k === "parking" && p.role !== "car")) {
        if (garage) assert.ok(area([[roof.r]]) - area(inter([[roof.r]], [[garage.r]])) < .03, "garage roof details stay on its footprint");
      }
      assert.ok(!JSON.stringify(yard.parts).includes('"water"'));
    }
  });
  test(`${pr.name}: road markings stay inside streets`, () => {
    const yards = plan.lots.map((l, i) => yardOf(l.id, l.poly, plan.streets, HOUSE_TYPES[i % HOUSE_TYPES.length]));
    const marks = yardRoadMarks(yards, plan.streets);
    assert.ok(marks.length > yards.length);
    for (const r of marks) for (const p of r) assert.ok(inside(p, plan.streets));
  });
  // Хөлбөмбөг, сагсан бөмбөг, амрах талбай (02 «Айл бүрт»): ногоон үлдэгдэлд багтвал л тавина, багтсан нь ногоон дотроо
  test(`${pr.name}: community courts stay inside green land`, () => {
    const spaces = communitySpaces([plan.green], plan.params.angle);
    for (const v of spaces.venues) assert.ok(v.ring.every(p => inside(p, plan.green)), v.id);
  });
}

// 02 «Айл бүрт» хашааны хэмжээ: 700 м² (20×35, авсаархан) ба 5,000 м² (100×50, урд хашаа + тариалан)
for (const feature of boundaries.features.filter(f => /хувилбар \d$/.test(f.properties.name))) for (const [w, d, lpb] of [[20, 35, 8], [100, 50, 2]]) {
  const pr = feature.properties;
  const plan = runPlan([[pr.utm49]], { ...DEFAULT_PARAMS, angle: pr.angle, anchor: pr.anchor, rows: pr.rows, localW: pr.localW, minLotRatio: 1, mix: null, lotW: w, lotD: d, lotsPerBlock: lpb, publicLots: 0 });
  test(`${pr.name}: ${w}×${d} м хашаа — нэг машин, барилга давхцахгүй, хашаан дотроо`, () => {
    assert.ok(plan.lots.length > 0);
    for (const [i, lot] of plan.lots.entries()) {
      const yard = yardOf(lot.id, lot.poly, plan.streets, HOUSE_TYPES[i % HOUSE_TYPES.length], w);
      assert.ok(yard, lot.id);
      assert.ok(Math.abs(yard.frame.W - w) < .01 && Math.abs(yard.frame.D - d) < .01, `${lot.id}: ${w} m frontage`);
      assert.equal(yard.cars.length, 1);
      for (const b of yard.bldgs) assert.ok(area([[b.r]]) - area(inter([[b.r]], lot.poly)) < .1, `${lot.id}: ${b.k} on its plot`);
      for (const b of yard.bldgs) assert.ok(area(inter([[yard.cars[0]]], [[b.r]])) < .01, `${lot.id}: car clear of ${b.k}`);
      for (let a = 0; a < yard.bldgs.length; a++) for (let b = a + 1; b < yard.bldgs.length; b++)
        assert.ok(area(inter([[yard.bldgs[a].r]], [[yard.bldgs[b].r]])) < .05, `${lot.id}: ${yard.bldgs[a].k}/${yard.bldgs[b].k}`);
      if (w === 100) assert.ok(yard.nums.some(q => q.n === 11), `${lot.id}: field`);
    }
  });
}

test("700 м² хашаанд хүлэмж 6×4 м байна", () => {
  const pr = boundaries.features.find(f => /хувилбар 1$/.test(f.properties.name)).properties;
  const plan = runPlan([[pr.utm49]], { ...DEFAULT_PARAMS, angle: pr.angle, anchor: pr.anchor, rows: pr.rows, localW: pr.localW, minLotRatio: 1, mix: null, lotW: 20, lotD: 35, lotsPerBlock: 8, publicLots: 0 });
  for (const [i, lot] of plan.lots.entries()) {
    const yard = yardOf(lot.id, lot.poly, plan.streets, HOUSE_TYPES[i % HOUSE_TYPES.length], 20);
    const gh = yard.bldgs.filter(b => b.k === "greenhouse");
    assert.equal(gh.length, 1, lot.id);
    assert.ok(Math.abs(area([[gh[0].r]]) - 24) < .05, `${lot.id}: 24 м²`);
  }
});
