// Хувилбар 1-ийн баруун хойд хилийг тэгшлэх (хэрэглэгчийн цэнхэр шугам, 2026-10-26):
// Б-001-ийн зүүн талын хөндлөн гудамжны зүүн ирмэг (u_b) ба Б-005…Б-009 эгнээний ар тал (v_b)-аар баруун хойд буланг тэгш өнцөгтөөр тайрна.
// Хасагдсан талбайг хойд ирмэгийг (v+) шулуунаар нь сунгаж нөхөж 80,000 м² болгоно (замаас ≥35 м, хөршөөс ≥10 м).
// Ажиллуулах: node scripts/refine-v1.mjs  (design-site-neighbor.mjs → site_boundary_v1.geojson-ий дараа)
import { readFileSync, writeFileSync } from "node:fs";
import proj4 from "proj4";
import { runPlan, DEFAULT_PARAMS, area, inter, diff, union, edgeBand } from "../lib/plan.ts";

const TARGET = 80000, ROAD_SETBACK = 35, PARCEL_GAP = 10;
const P = proj4("EPSG:4326", "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs");
const root = new URL("../../", import.meta.url);
const v1File = new URL("data/site_boundary_v1.geojson", root);
const v1 = JSON.parse(readFileSync(v1File, "utf8")).features[0], pr = v1.properties;
const rec = Object.fromEntries(["angle", "lotW", "lotD", "lotsPerBlock", "mix", "minLotRatio", "anchor", "rows", "localW"].filter((k) => pr[k] != null).map((k) => [k, pr[k]]));
const params = { ...DEFAULT_PARAMS, ...rec };
const close = (r) => [...r, r[0]];
const site = [[pr.utm49]];

// Хэрэглэгчийн дэлгэц дээрх дугаарлалт (апп-ын одоогийн тохиргоо)
const pl = runPlan(site, params), lot = (id) => pl.lots.find((l) => l.id === id) ?? (() => { throw new Error(`${id} олдсонгүй`); })();
const th = (params.angle * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
const rot = (p) => [p[0] * U[0] + p[1] * U[1], p[0] * V[0] + p[1] * V[1]], world = (u, v) => [U[0] * u + V[0] * v, U[1] * u + V[1] * v];
const uv = (m) => m.flatMap((p) => p[0]).map(rot);
const uL = Math.min(...["Б-001", "Б-010"].flatMap((id) => uv(lot(id).poly).map((q) => q[0])));
const uB = uL - params.localW;                                                          // хөндлөн гудамжны зүүн ирмэг
const vB = Math.max(...["Б-005", "Б-006", "Б-007", "Б-008", "Б-009"].flatMap((id) => uv(lot(id).poly).map((q) => q[1]))); // эгнээний ар тал
const ring = uv(site), U0 = Math.min(...ring.map((q) => q[0])) - 50, U1 = Math.max(...ring.map((q) => q[0])), V1 = Math.max(...ring.map((q) => q[1]));
const box = (u0, v0, u1, v1) => [[close([world(u0, v0), world(u1, v0), world(u1, v1), world(u0, v1)])]];

// Зөвшөөрөгдсөн бүс (замын зурвас, хөршийн буфер)
const { road } = JSON.parse(readFileSync(new URL("data/sketch3_inputs.json", root), "utf8"));
const eg = JSON.parse(readFileSync(new URL("web/public/data/egazar_parcels.geojson", root), "utf8"));
const c0 = pr.utm49[0];
const lineBand = (pts, w) => union(pts.slice(1).map((b, i) => {
  const a = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (-(b[1] - a[1]) / L) * w, ny = ((b[0] - a[0]) / L) * w;
  return [[[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]]];
}).concat(pts.map((a) => [[close(Array.from({ length: 12 }, (_, k) => [a[0] + w * Math.cos((k * Math.PI) / 6), a[1] + w * Math.sin((k * Math.PI) / 6)]))]])));
const parcels = eg.features.map((f) => [[f.geometry.coordinates[0].map((q) => P.forward(q))]]).filter((m) => Math.hypot(m[0][0][0][0] - c0[0], m[0][0][0][1] - c0[1]) < 700);
const blocked = union([lineBand(road, ROAD_SETBACK), ...parcels.map((m) => union([m, edgeBand(m, PARCEL_GAP)]))]);

const cut = diff(site, box(U0 - 500, vB, uB, V1 + 500));
console.log(`тайрсан: ${(area(site) - area(cut)).toFixed(0)} м² (u_b ${uB.toFixed(1)}, v_b ${vB.toFixed(1)})`);
// Нөхөлт: (А) хойд ирмэгийг v+ чиглэлд, (Б) зүүн хойд ирмэгийг u+ (гудамжны) чиглэлд сунгах — олон талбартай, дараа нь ногоон бага нь
const Vmin = Math.min(...ring.map((q) => q[1]));
const biggest = (g) => (g.length > 1 ? [g.reduce((a, p) => (area([p]) > area([a]) ? p : a))] : g);
const options = {
  "хойд ирмэг (v+)": (h) => biggest(diff(union([cut, box(uB, vB, U1, V1 + h)]), blocked)),
  "зүүн хойд ирмэг (u+)": (h) => biggest(diff(union([cut, box(U1 - 1, Vmin, U1 + h, V1)]), blocked)),
};
let pick = null;
for (const [name, grown] of Object.entries(options)) {
  let lo = 0, hi = 80;
  if (area(grown(hi)) < TARGET) { console.log(name, ": 80 м-т ч 8 га хүрэхгүй"); continue; }
  for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; area(grown(m)) < TARGET ? (lo = m) : (hi = m); }
  const g = grown(hi), mt = runPlan(g, params).metrics;
  console.log(`${name}: +${hi.toFixed(2)} м → ${mt.resCount} талбар, ногоон ${mt.green.toFixed(0)} м²`);
  if (!pick || mt.resCount > pick.lots || (mt.resCount === pick.lots && mt.green < pick.green - 1)) pick = { name, h: hi, out: g, green: mt.green, lots: mt.resCount };
}
const out = pick.out, ringOut = out[0][0], hi = pick.h;
console.log(`сонгосон: ${pick.name} +${hi.toFixed(2)} м → ${area(out).toFixed(1)} м², ${ringOut.length - 1} орой`);

const rd = (r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
const ll = (r) => r.map((q) => P.inverse(q).map((v) => Math.round(v * 1e8) / 1e8));
const feature = { ...v1, properties: { ...pr, name: "8 га · хувилбар 3", area_m2: Math.round(area(out) * 10) / 10, utm49: rd(ringOut),
  source: `${pr.source} Баруун хойд буланг хэрэглэгчийн цэнхэр шугамаар (гудамжны шугам) тэгшилж, ${pick.name}-ийг ${hi.toFixed(1)} м сунгасан (scripts/refine-v1.mjs).` },
  geometry: { type: "Polygon", coordinates: [ll(ringOut)] } };
writeFileSync(v1File, JSON.stringify({ type: "FeatureCollection", features: [feature] }, null, 1));
for (const f of [new URL("data/site_boundary.geojson", root), new URL("web/public/data/site_boundary.geojson", root)]) {
  const d = JSON.parse(readFileSync(f, "utf8"));
  d.features = d.features.map((x) => (/хувилбар 3/.test(x.properties.name) ? feature : x));
  writeFileSync(f, JSON.stringify(d, null, 1));
}
const check = runPlan([[ringOut]], params).metrics;
console.log(`шинэ хувилбар 3 (хуучин 1): ${check.resCount} талбар (${check.bySize.map((b) => `${b.size}×${b.count}`).join(" ")}), ногоон ${check.green.toFixed(0)} м²`);
