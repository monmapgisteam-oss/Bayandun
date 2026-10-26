import test from "node:test";
import assert from "node:assert/strict";
import { communitySpaces } from "../lib/communitySpaces.ts";
import { yardAmenityModel } from "../lib/yardModels.ts";
import { area, inter, inside } from "../lib/plan.ts";

const angle = 55.5, radians = angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
const P = (x, y) => [672000 + c * x - s * y, 5459000 + s * x + c * y];
const rect = (x, y, w, d) => [[[[...P(x, y)], [...P(x + w, y)], [...P(x + w, y + d)], [...P(x, y + d)], [...P(x, y)]]]];
const sources = [rect(0, 0, 40, 50), rect(50, 0, 40, 50)];
const length = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

test("full football and basketball dimensions fit two 2,000 m² plots", () => {
  const spaces = communitySpaces(sources, angle);
  const football = spaces.venues.find(v => v.kind === "football"), basketball = spaces.venues.find(v => v.kind === "basketball"), rest = spaces.venues.find(v => v.kind === "rest");
  assert.ok(football && basketball && rest);
  assert.deepEqual([length(football.ring[0], football.ring[1]), length(football.ring[1], football.ring[2])].map(n => Math.round(n)).sort((a, b) => a - b), [20, 40]);
  assert.deepEqual([length(basketball.ring[0], basketball.ring[1]), length(basketball.ring[1], basketball.ring[2])].map(n => Math.round(n)).sort((a, b) => a - b), [15, 28]);
  assert.ok(Math.abs(area([[football.ring]]) - 800) < .02);
  assert.ok(Math.abs(area([[basketball.ring]]) - 420) < .02);
  assert.ok(sources[1].some(poly => rest.ring.every(p => inside(p, [poly]))), "rest area shares the basketball plot's free land");
  for (const surface of spaces.surfaces) assert.ok(surface.r.every(p => sources.some(m => inside(p, m))), "all runoff/paint surfaces stay inside land");
  for (const line of spaces.lines) assert.ok(line.r.every(p => sources.some(m => inside(p, m))), "all markings stay inside land");
  for (const object of spaces.objects) {
    assert.ok(sources.some(m => inside(object.p, m)), `${object.kind} stays inside land`);
    assert.ok(object.heading >= 0 && object.heading < 360);
    assert.ok(spaces.venues.some(v => v.id === object.venue));
  }
  for (let i = 0; i < spaces.venues.length; i++) for (let j = i + 1; j < spaces.venues.length; j++) assert.ok(area(inter([[spaces.venues[i].ring]], [[spaces.venues[j].ring]])) < .01, "venue footprints do not overlap");
  assert.equal(spaces.objects.filter(o => o.kind === "football-goal").length, 2);
  assert.equal(spaces.objects.filter(o => o.kind === "basketball-stand").length, 2);
  assert.equal(spaces.objects.filter(o => o.kind === "pergola").length, 1);
  assert.ok(spaces.surfaces.every(surface => surface.r.length === 5), "no circular playground footprint remains");
});

test("native football goal mouths align with the playing goal lines", () => {
  const spaces = communitySpaces(sources, angle), football = spaces.venues.find(v => v.kind === "football");
  const model = yardAmenityModel("football-goal");
  for (const goal of spaces.objects.filter(o => o.kind === "football-goal")) {
    const d = length(goal.p, football.center), inward = [(football.center[0] - goal.p[0]) / d, (football.center[1] - goal.p[1]) / d];
    const mouth = [goal.p[0] + inward[0] * model.frontPlaneOffset, goal.p[1] + inward[1] * model.frontPlaneOffset];
    assert.ok(Math.abs(d - (20 + model.frontPlaneOffset)) < 1e-6);
    assert.ok(Math.abs(length(mouth, football.center) - 20) < 1e-6);
  }
});

test("native basketball rims and backboards sit inside the court with supports outside", () => {
  const spaces = communitySpaces(sources, angle), court = spaces.venues.find(v => v.kind === "basketball");
  const model = yardAmenityModel("basketball-stand");
  for (const stand of spaces.objects.filter(o => o.kind === "basketball-stand")) {
    const d = length(stand.p, court.center), inward = [(court.center[0] - stand.p[0]) / d, (court.center[1] - stand.p[1]) / d];
    const at = offset => [stand.p[0] + inward[0] * offset, stand.p[1] + inward[1] * offset];
    assert.ok(Math.abs(length(at(model.rimOffset), court.center) - (14 - 1.575)) < 1e-6, "rim is 1.575 m inside baseline");
    assert.ok(Math.abs(length(at(model.backboardOffset), court.center) - (14 - 1.2)) < 1e-6, "backboard is 1.2 m inside baseline");
    assert.ok(Math.abs(length(at(model.supportOffset), court.center) - 15) < 1e-6, "support pole is 1 m outside baseline");
    assert.equal(model.rimHeight, 3.05);
  }
});

test("small leftover areas receive rest furniture rather than shrunken courts", () => {
  const small = rect(0, 0, 12, 12), spaces = communitySpaces([small], angle);
  assert.ok(!spaces.venues.some(v => v.kind === "football" || v.kind === "basketball"));
  assert.equal(spaces.venues.filter(v => v.kind === "rest").length, 1);
  assert.ok(spaces.objects.some(o => o.kind === "bench"));
  for (const surface of spaces.surfaces) assert.ok(surface.r.every(p => inside(p, small)));
});

test("holes and insufficient land never get covered by a playing field", () => {
  const withHole = rect(0, 0, 40, 50);
  withHole[0].push(rect(12, 12, 16, 26)[0][0].slice().reverse());
  const spaces = communitySpaces([withHole], angle);
  assert.ok(!spaces.venues.some(v => v.kind === "football"));
  for (const surface of spaces.surfaces) assert.ok(area([[surface.r]]) - area(inter([[surface.r]], withHole)) < .05);
  assert.deepEqual(communitySpaces([], angle), { surfaces: [], lines: [], venues: [], objects: [] });
  assert.throws(() => communitySpaces(sources, NaN), /finite/);
});
