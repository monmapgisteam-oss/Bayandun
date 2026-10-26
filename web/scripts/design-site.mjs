// 8 га-ийн төлөвлөлтийн хилийг сонгох: шороон замаас баруун тийш, замыг даган, одоо байгаа нэгж талбараас зайтай.
// Замын чиглэлтэй тэгш өнцөгтийг (өргөн W, урд хил s0) хувилбараар хайж, хилээр тайрсны дараа яг 8 га болгоно;
// бөөрөнхий хэлбэртэй хувилбаруудаас хамгийн олон бүтэн нэгж талбартайг сонгоно. Ажиллуулах: node scripts/design-site.mjs
import { readFileSync, writeFileSync } from "node:fs";
import proj4 from "proj4";
import { runPlan, DEFAULT_PARAMS, area, inter, diff, union, edgeBand, inside } from "../lib/plan.ts";

const TARGET = 80000, ROAD_HALF = 12, PARCEL_GAP = 10, MIN_IN_SKETCH = 0.75, MAX_ASPECT = 1.3; // ТААМАГЛАЛ: замын тэнхлэгээс 12 м, нэгж талбараас 10 м
const P = proj4("EPSG:4326", "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs");
const root = new URL("../../", import.meta.url);
const { road, sketch } = JSON.parse(readFileSync(new URL("data/sketch3_inputs.json", root), "utf8"));
const sketch1 = JSON.parse(readFileSync(new URL("data/site_boundary.geojson", root), "utf8")).features.find((f) => /^Хэрэглэгчийн ноорог( 1)?$/.test(f.properties.name));
const eg = JSON.parse(readFileSync(new URL("web/public/data/egazar_parcels.geojson", root), "utf8"));

const close = (r) => [...r, r[0]];
const sk = [[close(sketch)]], skA = area(sk);
const sc = sketch.reduce((s, q) => [s[0] + q[0] / sketch.length, s[1] + q[1] / sketch.length], [0, 0]);

// Замын зурвас (шугамын буфер) ба замаас баруун тал
const lineBand = (pts, w) => union(pts.slice(1).map((b, i) => {
  const a = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (-(b[1] - a[1]) / L) * w, ny = ((b[0] - a[0]) / L) * w;
  return [[[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]]];
}).concat(pts.map((a) => [[close(Array.from({ length: 12 }, (_, k) => [a[0] + w * Math.cos((k * Math.PI) / 6), a[1] + w * Math.sin((k * Math.PI) / 6)]))]])));
const west = [[close([...road, [road.at(-1)[0] - 3000, road.at(-1)[1]], [road[0][0] - 3000, road[0][1]]])]];
const parcels = eg.features.map((f) => [[f.geometry.coordinates[0].map((q) => P.forward(q))]]).filter((m) => Math.hypot(m[0][0][0][0] - sc[0], m[0][0][0][1] - sc[1]) < 900);
const blocked = union([lineBand(road, ROAD_HALF), ...parcels.map((m) => union([m, edgeBand(m, PARCEL_GAP)]))]);
const allowed = diff(west, blocked);

// Замын шугамын хүрээ: n = хойд чиглэл (замын дагуу), w = баруун тийш перпендикуляр
const r0 = road[1], r1 = road.at(-2), dl = Math.hypot(r1[0] - r0[0], r1[1] - r0[1]);
let n = [(r0[0] - r1[0]) / dl, (r0[1] - r1[1]) / dl]; if (n[1] < 0) n = [-n[0], -n[1]];
const w = [-n[1], n[0]]; // n-ийг 90° цагийн эсрэг эргүүлэхэд баруун
const south = sketch.reduce((a, q) => (q[1] < a[1] ? q : a));
const t = (south[0] - r0[0]) * n[0] + (south[1] - r0[1]) * n[1], O = [r0[0] + n[0] * t, r0[1] + n[1] * t];
const at = (u, v) => [O[0] + n[0] * u + w[0] * v, O[1] + n[1] * u + w[1] * v];
const biggest = (m) => (m.length > 1 ? [m.reduce((a, p) => (area([p]) > area([a]) ? p : a))] : m);
const siteOf = (W, s0, H) => biggest(inter([[[at(s0, 0), at(s0, W), at(s0 + H, W), at(s0 + H, 0), at(s0, 0)]]], allowed));
function solveH(W, s0) {
  let lo = 20, hi = 1200;
  if (area(siteOf(W, s0, hi)) < TARGET) return null;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; area(siteOf(W, s0, mid)) < TARGET ? (lo = mid) : (hi = mid); }
  return hi;
}

const roadDeg = (Math.atan2(n[1], n[0]) * 180) / Math.PI;
const ANGLES = { "замд перпендикуляр": ((roadDeg + 90) % 180 + 180) % 180, "замтай зэрэгцээ": ((roadDeg % 180) + 180) % 180 };
const results = [];
const hCache = new Map();
for (const [kind, angle] of Object.entries(ANGLES)) for (const lpb of [3, 4, 5, 6]) for (let W = 150; W <= 380; W += 10) for (let s0 = -80; s0 <= 120; s0 += 20) {
  const key = `${W}/${s0}`;
  if (!hCache.has(key)) hCache.set(key, solveH(W, s0));
  const H = hCache.get(key);
  if (!H) continue;
  const site = siteOf(W, s0, H), inSk = area(inter(site, sk)) / area(site);
  if (inSk < MIN_IN_SKETCH) continue;
  const pl = runPlan(site, { ...DEFAULT_PARAMS, angle, lotsPerBlock: lpb });
  const res = pl.lots.filter((l) => l.use === "res"), full = res.filter((l) => !l.trimmed).length;
  // Хэлбэр бөөрөнхий (урт/өргөн ≤ MAX_ASPECT) байх; гудамж бүр шороон замд шууд залгагдах (перпендикуляр) хувилбарыг давуу үзнэ
  const aspect = Math.max(H, W - ROAD_HALF) / Math.min(H, W - ROAD_HALF);
  if (aspect > MAX_ASPECT) continue;
  results.push({ kind, angle, lpb, W, s0, H, site, inSk, lots: res.length, full, green: pl.metrics.green, streets: pl.metrics.streets,
    score: full * 10 + res.length * 4 + inSk * 20 - pl.metrics.green / 1000 - pl.metrics.streets / 2000 + (kind === "замд перпендикуляр" ? 5 : 0) });
}
results.sort((a, b) => b.score - a.score);
if (process.env.ALL) for (const W of [...new Set(results.map((r) => r.W))].sort((a, b) => a - b)) { const r = results.filter((q) => q.W === W).sort((a, b) => b.score - a.score)[0]; console.log("W", W, r.kind, `H=${r.H.toFixed(0)} lots=${r.lots} full=${r.full} green=${r.green.toFixed(0)} inSketch=${(r.inSk * 100).toFixed(0)}%`); }
for (const r of results.slice(0, 6)) console.log(r.kind, r.angle.toFixed(1), `lpb=${r.lpb} W=${r.W} s0=${r.s0} H=${r.H.toFixed(0)}`, `lots=${r.lots} full=${r.full} green=${r.green.toFixed(0)} streets=${r.streets.toFixed(0)} inSketch=${(r.inSk * 100).toFixed(0)}%`);
const best = results[0];

const ring = best.site[0][0], ll = (r) => r.map((q) => P.inverse(q).map((v) => Math.round(v * 1e8) / 1e8));
const rd = (r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
const out = {
  type: "FeatureCollection", crs_note: "Геометр WGS84 (EPSG:4326); properties.utm49 = UTM 49N (EPSG:32649), м",
  features: [
    { type: "Feature", properties: { name: "Төлөвлөлтийн хил · 8 га", area_m2: Math.round(area(best.site) * 10) / 10, angle: Math.round(best.angle * 10) / 10, lotsPerBlock: best.lpb, layout: best.kind,
      source: `ТААМАГЛАЛ: шороон замын тэнхлэгээс баруун тийш ${ROAD_HALF} м-ээс эхлэн замыг даган, одоо байгаа нэгж талбараас ${PARCEL_GAP} м зай авч, ноорог (зураг 3)-той ${Math.round(best.inSk * 100)}% давхцах ${TARGET.toLocaleString("en-US")} м² талбай. Хамгийн олон бүтэн нэгж талбар өгөх хувилбарыг хайж сонгосон (scripts/design-site.mjs).`,
      utm49: rd(ring) }, geometry: { type: "Polygon", coordinates: [ll(ring)] } },
    { type: "Feature", properties: { name: "Хэрэглэгчийн ноорог 2", area_m2: Math.round(skA), source: "Зураг 3-ын улаан шугам, egazar нэгж талбараар геолавласан (±5 м)", utm49: rd(close(sketch)) }, geometry: { type: "Polygon", coordinates: [ll(close(sketch))] } },
    ...(sketch1 ? [{ ...sketch1, properties: { ...sketch1.properties, name: "Хэрэглэгчийн ноорог 1" } }] : []),
  ],
};
for (const p of [new URL("data/site_boundary.geojson", root), new URL("web/public/data/site_boundary.geojson", root)]) writeFileSync(p, JSON.stringify(out, null, 1));
console.log("saved", best.kind, best.angle.toFixed(1), "area", area(best.site).toFixed(0), "vertices", ring.length - 1);
