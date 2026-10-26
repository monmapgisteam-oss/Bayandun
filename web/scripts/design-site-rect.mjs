// 8 га-ийн хилийг цэвэр тэгш өнцөгтөөр сонгох: хөршийн бүлгийн (2112002039, 55.5°) чиглэлтэй, хориглосон бүсийг огтлохгүй —
// тэгш өнцөгт бүхэлдээ (шороон замын тэнхлэгээс ≥35 м, хөрш нэгж талбараас ≥10 м) зөвшөөрөгдсөн газарт багтана.
// Зүүн булан нь замын зурваст тулж (≤38 м), урд тал нь хөршийн дэргэд (≤25 м). Талбай яг 80,000 м².
// Ажиллуулах: node scripts/design-site-rect.mjs [нэгж_талбарын_дугаар=2112002039]
import { readFileSync, writeFileSync } from "node:fs";
import proj4 from "proj4";
import { runPlan, DEFAULT_PARAMS, MIX_DEFAULT, area } from "../lib/plan.ts";
import { neighborGroups } from "../lib/neighbors.ts";

const TARGET = 80000, ROAD_SETBACK = 35, PARCEL_GAP = 10, SOUTH_MAX = 25; // ТААМАГЛАЛ: нооргуудын зүүн хил замаас 32–40 м
const KEY_PARCEL = process.argv[2] ?? "2112002039";
const P = proj4("EPSG:4326", "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs");
const root = new URL("../../", import.meta.url);
const { road, sketch } = JSON.parse(readFileSync(new URL("data/sketch3_inputs.json", root), "utf8"));
const prev = JSON.parse(readFileSync(new URL("data/site_boundary.geojson", root), "utf8"));
const sketches = prev.features.filter((f) => /ноорог/i.test(f.properties.name));
let v1 = null;
try { v1 = JSON.parse(readFileSync(new URL("data/site_boundary_v1.geojson", root), "utf8")).features[0]; } catch { /* хувилбар 1 байхгүй */ }
const eg = JSON.parse(readFileSync(new URL("web/public/data/egazar_parcels.geojson", root), "utf8"));
const close = (r) => [...r, r[0]];
const sc = sketch.reduce((s, q) => [s[0] + q[0] / sketch.length, s[1] + q[1] / sketch.length], [0, 0]);

const all = eg.features.map((f) => ({ id: f.properties.parcel_id, ring: f.geometry.coordinates[0].slice(0, -1).map((q) => P.forward(q)) }));
const groups = neighborGroups(all, sc, 450), G = groups.find((g) => g.ids.includes(KEY_PARCEL)) ?? groups[0];
const near = all.filter((p) => Math.hypot(p.ring[0][0] - sc[0], p.ring[0][1] - sc[1]) < 700).map((p) => p.ring);
const south = all.filter((p) => G.ids.includes(p.id)).map((p) => p.ring);

// ---------- энгийн геометр ----------
const segDist = (p, a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2)) : 0; return Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]); };
const segs = (r, closed = true) => (closed ? r.map((a, i) => [a, r[(i + 1) % r.length]]) : r.slice(1).map((b, i) => [r[i], b]));
const inPoly = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
/** Олон өнцөгт ↔ олон өнцөгт/шугам хоорондын хамгийн бага зай (огтлолцвол 0) */
function dist(A, B, bClosed = true) {
  const sa = segs(A), sb = segs(B, bClosed);
  if (bClosed && (B.some((p) => inPoly(p, A)) || A.some((p) => inPoly(p, B)))) return 0;
  if (sa.some(([a, b]) => sb.some(([c, d]) => cross(a, b, c, d)))) return 0;
  return Math.min(...A.flatMap((p) => sb.map(([a, b]) => segDist(p, a, b))), ...B.map((p) => Math.min(...sa.map(([a, b]) => segDist(p, a, b)))));
}
// Замаас баруун тал: тэгш өнцөгтийн орой бүр замын шугамын баруун талд
const westOfRoad = (p) => { for (const [a, b] of segs(road, false)) if (p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1])) { const t = (p[1] - a[1]) / (b[1] - a[1] || 1); return p[0] < a[0] + (b[0] - a[0]) * t; } return true; };

const th = (G.angle * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
// Тэгш өнцөгт, баруун (u−, v+) буланд nu × nv хонхортой (ноорог 3 шиг). Бүх ирмэг хөршийн чиглэлтэй зэрэгцээ.
const shape = (c, a, b, nu = 0, nv = 0) => (nu > 0 && nv > 0 ? [[-a, -b], [a, -b], [a, b], [-a + nu, b], [-a + nu, b - nv], [-a, b - nv]] : [[-a, -b], [a, -b], [a, b], [-a, b]])
  .map(([u, v]) => [c[0] + U[0] * u + V[0] * v, c[1] + U[1] * u + V[1] * v]);
const ok = (r) => r.every(westOfRoad) && dist(r, road, false) >= ROAD_SETBACK && near.every((q) => dist(r, q) >= PARCEL_GAP);

const LOCAL_W = Math.round((G.pitch - G.lotD) * 10) / 10;
const base = { ...DEFAULT_PARAMS, angle: G.angle, lotW: G.lotW, lotD: G.lotD, anchor: { p: G.anchor, pitch: G.pitch }, minLotRatio: 1, mix: MIX_DEFAULT, rows: "single", localW: LOCAL_W };
console.log(`бүлэг ${G.angle}° (${KEY_PARCEL}), эгнээ ${G.pitch} м → гудамж ${LOCAL_W} м`);

// ---------- хайлт: өндөр (V) × төвийн хойд байрлал, тус бүрт хамгийн зүүн тийш (зам руу) түлхэнэ ----------
// Хилийн өндөр (V) = эгнээний тоогоор: гол гудамж + 2 × гүн + (n − 2) × давтамж — эгнээ бүр хилийн ар талд яг тулна.
// Хөдөлгүүрийн зангууг (anchor, давтамж 0) хилийн урд ирмэг дээр тавьж хамгийн доод эгнээг тэндээс эхлүүлнэ.
const rot = (p) => [p[0] * U[0] + p[1] * U[1], p[0] * V[0] + p[1] * V[1]], world = (u, v) => [U[0] * u + V[0] * v, U[1] * u + V[1] * v];
const [us, vs] = rot(sc), vA = rot(G.anchor)[1], Pch = G.pitch, MAIN_W = base.mainW;
const cands = [], stat = { none: 0, road: 0, south: 0, minSouth: Infinity };
for (let n = 3; n <= 8; n++) {
  const H = MAIN_W + 2 * G.lotD + (n - 2) * Pch, b = H / 2;
  for (const nv of [0, Pch, 2 * Pch, 3 * Pch]) for (const nu of nv ? [40, 80, 120, 160, 200, 240] : [0]) {
    const a = (TARGET + nu * nv) / H / 2, aspect = (2 * a) / H;
    if (aspect < 0.55 || aspect > 1.8 || nv >= H - 60 || nu >= 2 * a - 60) continue;
    for (let dv = -300; dv <= 200; dv += 8) {
      const vc = vs + dv;
      let best = null;
      for (let du = 350; du >= -350; du -= 4) { const r = shape(world(us + du, vc), a, b, nu, nv); if (ok(r)) { best = r; break; } }
      if (!best) { stat.none++; continue; }
      const dRoad = dist(best, road, false), dSouth = Math.min(...south.map((q) => dist(best, q)));
      if (dRoad > ROAD_SETBACK + 3) { stat.road++; continue; }
      if (dSouth > SOUTH_MAX) { stat.south++; stat.minSouth = Math.min(stat.minSouth, dSouth); continue; }
      cands.push({ ring: best, H, aspect, dRoad, dSouth, nu, nv, n });
    }
  }
}
console.log("шалгуур хангасан тэгш өнцөгт:", cands.length, stat);
let best = null;
for (const c of cands) for (const lpb of [3, 4, 5, 6]) {
  const pl = runPlan([[close(c.ring)]], { ...base, lotsPerBlock: lpb, anchor: { p: c.ring[0], pitch: 0 } }), m = pl.metrics;
  const score = m.res / 200 + m.resCount - m.green / 400 - m.streets / 3000 - Math.abs(Math.log(c.aspect)) * 3 - (c.nu ? 1 : 0);
  if (!best || score > best.score) best = { ...c, lpb, score, m };
}
if (!best) throw new Error("Шалгуур хангасан тэгш өнцөгт олдсонгүй");
const m = best.m;
console.log(`сонгосон: ${best.n} эгнээ, ${((TARGET + best.nu * best.nv) / best.H).toFixed(0)}×${best.H.toFixed(1)} м, хонхор ${best.nu}×${best.nv.toFixed(1)} м, блок ${best.lpb}, замаас ${best.dRoad.toFixed(1)} м, урд хөршөөс ${best.dSouth.toFixed(1)} м · талбар ${m.resCount} (${m.bySize.map((b) => `${b.size}×${b.count}`).join(" ")}), гудамж ${m.streets.toFixed(0)}, ногоон ${m.green.toFixed(0)} м²`);

const ring = close(best.ring), ll = (r) => r.map((q) => P.inverse(q).map((v) => Math.round(v * 1e8) / 1e8));
const rd = (r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
const out = {
  type: "FeatureCollection", crs_note: prev.crs_note,
  features: [
    { type: "Feature", properties: { name: "8 га · хувилбар 2", area_m2: Math.round(area([[ring]]) * 10) / 10,
      angle: G.angle, lotW: G.lotW, lotD: G.lotD, lotsPerBlock: best.lpb, mix: MIX_DEFAULT, minLotRatio: 1, rows: "single", localW: LOCAL_W,
      anchor: { p: rd([best.ring[0]])[0], pitch: 0 }, layout: `тэгш өнцөгт ${(TARGET / best.H).toFixed(0)}×${best.H} м${best.nu ? `, баруун буланд ${best.nu}×${best.nv.toFixed(1)} м хонхор` : ""}, хөршийн чиглэл ${G.angle}° (${KEY_PARCEL})`,
      neighborGroups: groups.map((g) => ({ angle: g.angle, n: g.n, dist: g.dist, lotW: g.lotW, lotD: g.lotD, pitch: g.pitch, anchor: rd([g.anchor])[0], example: g.ids[0] })),
      source: `ТААМАГЛАЛ: ${KEY_PARCEL}-ийн бүлгийн чиглэлтэй (${G.angle}°) тэгш өнцөгт; шороон замын тэнхлэгээс ≥${ROAD_SETBACK} м, хөрш нэгж талбараас ≥${PARCEL_GAP} м, урд тал нь хөршөөс ≤${SOUTH_MAX} м (scripts/design-site-rect.mjs).`,
      utm49: rd(ring) }, geometry: { type: "Polygon", coordinates: [ll(ring)] } },
    // Хувилбар 1 — өмнөх хил (design-site-neighbor.mjs → data/site_boundary_v1.geojson)
    ...(v1 ? [{ ...v1, properties: { ...v1.properties, name: "8 га · хувилбар 1" } }] : []),
    ...sketches,
  ],
};
for (const p of [new URL("data/site_boundary.geojson", root), new URL("web/public/data/site_boundary.geojson", root)]) writeFileSync(p, JSON.stringify(out, null, 1));
console.log("saved", area([[ring]]).toFixed(0), "m2");
