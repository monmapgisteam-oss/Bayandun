// 8 га · хувилбар 1 (2026-10-27: хувилбар 3 байснаа 1 болгож сольсон): хэрэглэгчийн урт тэгш өнцөгт ноорог (≈685×201 м, data/sketch_v3b_inputs.json ← scripts/sketch_v3b.py) дотор
// 8 га-ийн цэвэр тэгш өнцөгт. Хамгийн ойр хөрш бүлгийн чиглэлтэй, egazar нэгж талбараас ≥10 м, хөршид аль болох ойр (урд тал).
// Ноорог дээрх цэнхэр толбо (ус/намгархаг байж магадгүй — ШАЛГАХ): аль болох давхцуулахгүй (оноонд торгууль).
// Анхны ойролцоо ноорог (≈23 га): data/sketch_v3_inputs.json ← scripts/sketch_v3.py
// Хувилбар 2, 3-ыг өөрчлөхгүй — site_boundary.geojson-д «8 га · хувилбар 1»-ийг нэмэх/солих.
// Ажиллуулах: node scripts/design-site-v3.mjs && node scripts/build-site-data.mjs
import { readFileSync, writeFileSync } from "node:fs";
import proj4 from "proj4";
import { runPlan, DEFAULT_PARAMS, MIX_DEFAULT, area, inter } from "../lib/plan.ts";
import { neighborGroups } from "../lib/neighbors.ts";

const TARGET = 80000, PARCEL_GAP = 10; // ТААМАГЛАЛ: хувилбар 2-той ижил зай
const P = proj4("EPSG:4326", "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs");
const root = new URL("../../", import.meta.url);
const { rect: sketch, cyan } = JSON.parse(readFileSync(new URL("data/sketch_v3b_inputs.json", root), "utf8"));
const wet = cyan ? cyan.slice(0, -1) : null;
const eg = JSON.parse(readFileSync(new URL("web/public/data/egazar_parcels.geojson", root), "utf8"));
const close = (r) => [...r, r[0]];
const sk = sketch.slice(0, -1), sc = sk.reduce((s, q) => [s[0] + q[0] / sk.length, s[1] + q[1] / sk.length], [0, 0]);

const all = eg.features.map((f) => ({ id: f.properties.parcel_id, ring: f.geometry.coordinates[0].slice(0, -1).map((q) => P.forward(q)) }));
// Хамгийн ойр, эгнээний давтамж хэмжигдсэн бүлэг (ганц эгнээтэй бүлэг гудамжны зайг тодорхойлохгүй)
const groups = neighborGroups(all, sc, 600), G = [...groups].filter((g) => g.pitch > g.lotD).sort((a, b) => a.dist - b.dist)[0];
const near = all.filter((p) => Math.hypot(p.ring[0][0] - sc[0], p.ring[0][1] - sc[1]) < 900).map((p) => p.ring);

// ---------- энгийн геометр (design-site-rect.mjs-тэй ижил) ----------
const segDist = (p, a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2)) : 0; return Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]); };
const segs = (r) => r.map((a, i) => [a, r[(i + 1) % r.length]]);
const inPoly = ([x, y], r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const cross = (a, b, c, d) => { const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])); return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b); };
function dist(A, B) {
  if (B.some((p) => inPoly(p, A)) || A.some((p) => inPoly(p, B))) return 0;
  const sa = segs(A), sb = segs(B);
  if (sa.some(([a, b]) => sb.some(([c, d]) => cross(a, b, c, d)))) return 0;
  return Math.min(...A.flatMap((p) => sb.map(([a, b]) => segDist(p, a, b))), ...B.map((p) => Math.min(...sa.map(([a, b]) => segDist(p, a, b)))));
}
// Тэгш өнцөгт нооргийн дотор (ирмэг дагуу 5 м тутам), нооргийн гадна TOL м хүртэл гарахыг зөвшөөрнө (ноорог ойролцоо)
const insideSketch = (r, tol) => segs(r).every(([a, b]) => { const n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5);
  return Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]).every((p) => inPoly(p, sk) || Math.min(...segs(sk).map(([c, d]) => segDist(p, c, d))) <= tol); });

const th = (G.angle * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
const rot = (p) => [p[0] * U[0] + p[1] * U[1], p[0] * V[0] + p[1] * V[1]], world = (u, v) => [U[0] * u + V[0] * v, U[1] * u + V[1] * v];
const rect = (cu, cv, a, b) => [[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => world(cu + u, cv + v));
// Давтамж − гүн < 10 м бол эгнээнүүд ар араасаа нийлсэн гэсэн үг → хувилбар 2-ын 14 м гудамжийг авна (ТААМАГЛАЛ)
const SK_ASPECT = (() => { const e = [0, 1].map((i) => Math.hypot(sk[i + 1][0] - sk[i][0], sk[i + 1][1] - sk[i][1])); return Math.max(...e) / Math.min(...e); })();
const LOCAL_W = G.pitch - G.lotD >= 10 ? Math.round((G.pitch - G.lotD) * 10) / 10 : 14, PITCH = G.lotD + LOCAL_W;
const base = { ...DEFAULT_PARAMS, angle: G.angle, lotW: G.lotW, lotD: G.lotD, minLotRatio: 1, mix: MIX_DEFAULT, rows: "single", localW: LOCAL_W };
console.log(`хөрш бүлэг ${G.angle}° (${G.ids[0]}, ${G.n} нэгж, ${G.dist.toFixed(0)} м), эгнээ ${G.pitch} м → гудамж ${LOCAL_W} м, давтамж ${PITCH} м; ноорог ${(area([[close(sk)]]) / 1e4).toFixed(1)} га`);

// ---------- хайлт: эгнээний тоо (өндөр) × байрлал (5 м алхам) ----------
const R = sk.map(rot), uMin = Math.min(...R.map((p) => p[0])), uMax = Math.max(...R.map((p) => p[0])), vMin = Math.min(...R.map((p) => p[1])), vMax = Math.max(...R.map((p) => p[1]));
let cands = [];
for (const tol of [0, 15, 30]) {
  for (let n = 3; n <= 8; n++) {
    const H = base.mainW + 2 * G.lotD + (n - 2) * PITCH, b = H / 2, a = TARGET / H / 2, aspect = (2 * a) / H;
    if (aspect < 0.4 || aspect > 4) continue;
    for (let cu = uMin + a; cu <= uMax - a + 1e-6; cu += 5) for (let cv = vMin + b; cv <= vMax - b + 1e-6; cv += 5) {
      const r = rect(cu, cv, a, b);
      if (!insideSketch(r, tol)) continue;
      const dNear = Math.min(...near.map((q) => dist(r, q)));
      if (dNear < PARCEL_GAP) continue;
      const wetA = wet ? area(inter([[close(r)]], [[close(wet)]])) : 0;
      cands.push({ ring: r, n, H, aspect, dNear, tol, wetA });
    }
  }
  if (cands.length) break;
}
if (!cands.length) throw new Error("Нооргийн дотор 8 га-ийн тэгш өнцөгт багтсангүй");
console.log("шалгуур хангасан байрлал:", cands.length, "· нооргоос гарах зөвшөөрөл", cands[0].tol, "м");
// Хөршид хамгийн ойр 60 байрлалыг хуваалтаар үнэлнэ
cands = cands.sort((x, y) => x.wetA - y.wetA || x.dNear - y.dNear).slice(0, 60);
let best = null;
for (const c of cands) for (const lpb of [3, 4, 5, 6]) {
  const pl = runPlan([[close(c.ring)]], { ...base, lotsPerBlock: lpb, anchor: { p: c.ring[0], pitch: 0 } }), m = pl.metrics;
  const score = m.res / 200 + m.resCount - m.green / 400 - m.streets / 3000 - Math.abs(Math.log(c.aspect / SK_ASPECT)) * 3 - c.dNear / 25 - c.wetA / 200;
  if (!best || score > best.score) best = { ...c, lpb, score, m };
}
const m = best.m;
console.log(`сонгосон: ${best.n} эгнээ, ${(TARGET / best.H).toFixed(0)}×${best.H.toFixed(1)} м, блок ${best.lpb}, хөршөөс ${best.dNear.toFixed(1)} м, цэнхэр толботой давхцал ${best.wetA.toFixed(0)} м² · талбар ${m.resCount} (${m.bySize.map((b) => `${b.size}×${b.count}`).join(" ")}), гудамж ${m.streets.toFixed(0)}, ногоон ${m.green.toFixed(0)} м²`);

const ring = close(best.ring), ll = (r) => r.map((q) => P.inverse(q).map((v) => Math.round(v * 1e8) / 1e8));
const rd = (r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
const v3 = { type: "Feature", properties: { name: "8 га · хувилбар 1", area_m2: Math.round(area([[ring]]) * 10) / 10,
  angle: G.angle, lotW: G.lotW, lotD: G.lotD, lotsPerBlock: best.lpb, mix: MIX_DEFAULT, minLotRatio: 1, rows: "single", localW: LOCAL_W,
  anchor: { p: rd([best.ring[0]])[0], pitch: 0 }, layout: `тэгш өнцөгт ${(TARGET / best.H).toFixed(0)}×${best.H} м, хөршийн чиглэл ${G.angle}° (${G.ids[0]})`,
  neighborGroups: groups.map((g) => ({ angle: g.angle, n: g.n, dist: g.dist, lotW: g.lotW, lotD: g.lotD, pitch: g.pitch, anchor: rd([g.anchor])[0], example: g.ids[0] })),
  source: `ТААМАГЛАЛ: хэрэглэгчийн ноорог 3 (урт тэгш өнцөгт ≈${(area([[close(sk)]]) / 1e4).toFixed(0)} га) дотор, цэнхэр толботой давхцал ${Math.round(best.wetA)} м²; ${G.ids[0]}-ийн бүлгийн чиглэлтэй (${G.angle}°), egazar нэгж талбараас ≥${PARCEL_GAP} м (scripts/design-site-v3.mjs).`,
  utm49: rd(ring) }, geometry: { type: "Polygon", coordinates: [ll(ring)] } };
const sketchF = { type: "Feature", properties: { name: "Хэрэглэгчийн ноорог 3", area_m2: Math.round(area([[close(sk)]])), source: "data/raw/sketch_v3b.jpg → scripts/sketch_v3b.py (хуучин хувилбар 1 — одоогийн 3-ын 4 булантай тулгасан, ≈20–35 м)", utm49: rd(close(sk)) },
  geometry: { type: "Polygon", coordinates: [ll(close(sk))] } };

for (const p of [new URL("data/site_boundary.geojson", root), new URL("web/public/data/site_boundary.geojson", root)]) {
  const fc = JSON.parse(readFileSync(p, "utf8"));
  const keep = fc.features.filter((f) => !["8 га · хувилбар 1", "Хэрэглэгчийн ноорог 3"].includes(f.properties.name));
  const lastVersion = keep.reduce((i, f, j) => (/хувилбар/.test(f.properties.name) ? j : i), -1);
  fc.features = [...keep.slice(0, lastVersion + 1), v3, ...keep.slice(lastVersion + 1), sketchF];
  writeFileSync(p, JSON.stringify(fc, null, 1));
}
console.log("saved", area([[ring]]).toFixed(0), "m2");
