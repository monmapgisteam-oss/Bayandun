// 8 га-ийн хилийг хөрш нэгж талбарын бүлгийн чиглэлээр сонгох (хэрэглэгчийн ноорог 3: урд талын бүлэг, 2112002039).
// Хил = тухайн чиглэлийн тэгш өнцөгт ∩ (шороон замын тэнхлэгээс 35 м, хөрш нэгж талбараас 10 м); зүүн булан нь замын зурваст тулна,
// урд тал нь хөршийн дэргэд, 8 га хүрэхгүй хэсгийг хойш сунгана. Нэгж талбар хөршийн эгнээний шугамын үргэлжлэл (anchor).
// Ажиллуулах: node scripts/design-site-neighbor.mjs [нэгж_талбарын_дугаар=2112002039]
import { readFileSync, writeFileSync } from "node:fs";
import proj4 from "proj4";
import { runPlan, DEFAULT_PARAMS, MIX_DEFAULT, area, inter, diff, union, edgeBand } from "../lib/plan.ts";
import { neighborGroups } from "../lib/neighbors.ts";

// ТААМАГЛАЛ: хэрэглэгчийн ноорог 1, 3-ын зүүн хил шороон замын тэнхлэгээс 32–40 м (дундаж ≈35 м) — замын нөөц зурвас;
// одоо байгаа нэгж талбараас 10 м
const TARGET = 80000, ROAD_HALF = 35, PARCEL_GAP = 10;
const KEY_PARCEL = process.argv[2] ?? "2112002039";
const P = proj4("EPSG:4326", "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs");
const root = new URL("../../", import.meta.url);
const { road, sketch } = JSON.parse(readFileSync(new URL("data/sketch3_inputs.json", root), "utf8"));
const prev = JSON.parse(readFileSync(new URL("data/site_boundary.geojson", root), "utf8"));
const sketches = prev.features.filter((f) => /ноорог/i.test(f.properties.name));
const eg = JSON.parse(readFileSync(new URL("web/public/data/egazar_parcels.geojson", root), "utf8"));
const close = (r) => [...r, r[0]];
const sc = sketch.reduce((s, q) => [s[0] + q[0] / sketch.length, s[1] + q[1] / sketch.length], [0, 0]);

const all = eg.features.map((f) => ({ id: f.properties.parcel_id, ring: f.geometry.coordinates[0].map((q) => P.forward(q)) }));
const groups = neighborGroups(all, sc, 450), G = groups.find((g) => g.ids.includes(KEY_PARCEL)) ?? groups[0];
console.log("бүлгүүд:", groups.map((g) => `${g.angle}° (${g.n}, ${g.dist} м, давтамж ${g.pitch})`).join(" · "), "→ сонгосон", G.angle);

const lineBand = (pts, w) => union(pts.slice(1).map((b, i) => {
  const a = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (-(b[1] - a[1]) / L) * w, ny = ((b[0] - a[0]) / L) * w;
  return [[[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]]];
}).concat(pts.map((a) => [[close(Array.from({ length: 12 }, (_, k) => [a[0] + w * Math.cos((k * Math.PI) / 6), a[1] + w * Math.sin((k * Math.PI) / 6)]))]])));
const west = [[close([...road, [road.at(-1)[0] - 3000, road.at(-1)[1]], [road[0][0] - 3000, road[0][1]]])]];
const nearParcels = all.filter((p) => Math.hypot(p.ring[0][0] - sc[0], p.ring[0][1] - sc[1]) < 900).map((p) => [[p.ring]]);
// Зөвшөөрөгдсөн бүс: талбайн орчмын 1.4 км цонх ∩ замаас баруун тал − (замын зурвас, хөршийн буфер); дараа нь opening-ийг нэг удаа
const W0 = 700, win = [[close([[sc[0] - W0, sc[1] - W0], [sc[0] + W0, sc[1] - W0], [sc[0] + W0, sc[1] + W0], [sc[0] - W0, sc[1] + W0]])]];
const allowedRaw = diff(inter(win, west), union([lineBand(road, ROAD_HALF), ...nearParcels.map((m) => union([m, edgeBand(m, PARCEL_GAP)]))]));
const groupPolys = all.filter((p) => G.ids.includes(p.id)).map((p) => p.ring);

const segDist = (p, a, b) => { const ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey, t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2)) : 0; return Math.hypot(a[0] + ex * t - p[0], a[1] + ey * t - p[1]); };
const distTo = (ring, paths) => Math.min(...ring.flatMap((p) => paths.flatMap((path) => path.slice(1).map((b, i) => segDist(p, path[i], b)))));
const th = (G.angle * Math.PI) / 180, U = [Math.cos(th), Math.sin(th)], V = [-Math.sin(th), Math.cos(th)];
const rect = (c, a, b) => [[close([[-a, -b], [a, -b], [a, b], [-a, b]].map(([u, v]) => [c[0] + U[0] * u + V[0] * v, c[1] + U[1] * u + V[1] * v]))]];
const biggest = (m) => (m.length > 1 ? [m.reduce((x, p) => (area([p]) > area([x]) ? p : x))] : m);
// Морфологийн opening (d м): хөршийн буфер хоорондох 2d-ээс нарийн сэрээ, зурвасыг арилгана
const opening = (m, d) => { try { const s = diff(m, edgeBand(m, d)); return s.length ? inter(union([s, edgeBand(s, d)]), m) : []; } catch { return m; } }; // polygon-clipping унавал хэвээр
const allowed = allowedRaw;
// Сэрээ тайрах: хил дагуу ≥30 м зайтай боловч шулуунаар <6 м ойр хоёр цэгийн хоорондох нарийн хэсгийг (жижиг талыг) хасна
function despike(m) {
  if (!m.length) return m;
  let r = m[0][0].slice(0, -1);
  for (let again = true; again;) {
    again = false;
    const n = r.length, along = [0];
    for (let i = 1; i <= n; i++) along.push(along[i - 1] + Math.hypot(r[i % n][0] - r[i - 1][0], r[i % n][1] - r[i - 1][1]));
    outer: for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) {
      const ds = Math.min(along[j] - along[i], along[n] - (along[j] - along[i]));
      if (ds < 30 || Math.hypot(r[i][0] - r[j][0], r[i][1] - r[j][1]) >= 6) continue;
      const inside = r.slice(i, j + 1), outside = [...r.slice(j), ...r.slice(0, i + 1)];
      r = area([[close(inside)]]) < area([[close(outside)]]) ? outside : inside;
      again = true; break outer;
    }
  }
  return [[close(r)]];
}
function sized(c, aspect) {
  let lo = 0.2, hi = 3, base = Math.sqrt(TARGET);
  const siteOf = (s) => despike(biggest(inter(rect(c, (base * s * Math.sqrt(aspect)) / 2, (base * s) / Math.sqrt(aspect) / 2), allowed)));
  if (area(siteOf(hi)) < TARGET) return null;
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; area(siteOf(m)) < TARGET ? (lo = m) : (hi = m); }
  return siteOf(hi);
}

// Зөвхөн бүтэн талбар (minLotRatio 1), холимог хэмжээ 1,000–5,000 м² — үнэлгээ: орон сууцны цэвэр талбай ба тоо
// Эгнээ бүр өөрийн гудамжтай (хэрэглэгчийн хүсэлт): гудамжны өргөн = хөршийн эгнээний давтамж − гүн (64.1 − 50 = 14.1 м) → эгнээ бүр хөрштэй нэг шугамд
const LOCAL_W = Math.round((G.pitch - G.lotD) * 10) / 10;
const base = { ...DEFAULT_PARAMS, angle: G.angle, lotW: G.lotW, lotD: G.lotD, anchor: { p: G.anchor, pitch: G.pitch }, minLotRatio: 1, mix: MIX_DEFAULT, rows: "single", localW: LOCAL_W };
const results = [];
for (let dx = -160; dx <= 160; dx += 20) for (let dy = -160; dy <= 160; dy += 20) for (const aspect of [0.7, 1, 1.4]) {
  const c = [sc[0] + dx, sc[1] + dy], site = sized(c, aspect);
  if (!site || Math.abs(area(site) - TARGET) > 5) continue;
  const ring = site[0][0];
  if (distTo(ring, [road]) > ROAD_HALF + 3) continue;                 // зүүн булан нь замын нөөц зурваст тулна
  const south = distTo(ring, groupPolys.map(close));                     // урд талын хөршөөс зай
  if (south > PARCEL_GAP + 15) continue;                                 // ноорог шиг урд тал нь хөршийн дэргэд, илүүг хойш сунгана
  const pl = runPlan(site, { ...base, lotsPerBlock: 4 });
  const res = pl.lots.filter((l) => l.use === "res"), full = res.filter((l) => !l.trimmed).length;
  results.push({ c, aspect, site, south, full, lots: res.length, green: pl.metrics.green, score: pl.metrics.res / 200 + res.length - Math.max(0, south - PARCEL_GAP) / 5 - pl.metrics.green / 2000 });
}
results.sort((a, b) => b.score - a.score);
// Шилдэг 8 хувилбарт блокийн уртыг (3–6 талбар) туршина
let best = null;
for (const r of results.slice(0, 8)) for (const lpb of [3, 4, 5, 6]) {
  const pl = runPlan(r.site, { ...base, lotsPerBlock: lpb });
  const res = pl.lots.filter((l) => l.use === "res"), full = res.filter((l) => !l.trimmed).length;
  const score = pl.metrics.res / 200 + res.length - Math.max(0, r.south - PARCEL_GAP) / 5 - pl.metrics.green / 2000 - pl.metrics.streets / 3000;
  if (!best || score > best.score) best = { ...r, lpb, full, lots: res.length, score, streets: pl.metrics.streets, green: pl.metrics.green, res: pl.metrics.res, bySize: pl.metrics.bySize };
}
console.log(`сонгосон: төв ${best.c.map((v) => v.toFixed(0))}, харьцаа ${best.aspect}, блок ${best.lpb}, талбар ${best.lots} (бүтэн ${best.full}), урд хөршөөс ${best.south.toFixed(1)} м, гудамж ${best.streets.toFixed(0)} м², ногоон ${best.green.toFixed(0)} м², орон сууц ${best.res.toFixed(0)} м²`, best.bySize.map((b) => `${b.size}×${b.count}`).join(" "));

// Хилийн оройг цэвэрлэх: 0.2 м-ээс ойр давхардсан болон 1 см-ээс бага хазайлттай (шулуун дээрх) цэгийг хасна
function tidy(r) {
  let pts = r.slice(0, -1).filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 0.2);
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < pts.length && pts.length > 3; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length], q = pts[i], b = pts[(i + 1) % pts.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L > 0 && Math.abs((q[0] - a[0]) * (b[1] - a[1]) - (q[1] - a[1]) * (b[0] - a[0])) / L < 0.01) { pts.splice(i, 1); changed = true; }
    }
  }
  return close(pts);
}
const ring = tidy(best.site[0][0]), ll = (r) => r.map((q) => P.inverse(q).map((v) => Math.round(v * 1e8) / 1e8));
const rd = (r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]);
const out = {
  type: "FeatureCollection", crs_note: prev.crs_note,
  features: [
    { type: "Feature", properties: { name: "Төлөвлөлтийн хил · 8 га", area_m2: Math.round(area([[ring]]) * 10) / 10,
      angle: G.angle, lotW: G.lotW, lotD: G.lotD, lotsPerBlock: best.lpb, mix: MIX_DEFAULT, minLotRatio: 1, rows: "single", localW: LOCAL_W, anchor: { p: rd([G.anchor])[0], pitch: G.pitch }, layout: `хөршийн чиглэл ${G.angle}° (${KEY_PARCEL}-ийн бүлэг)`,
      neighborGroups: groups.map((g) => ({ angle: g.angle, n: g.n, dist: g.dist, lotW: g.lotW, lotD: g.lotD, pitch: g.pitch, anchor: rd([g.anchor])[0], example: g.ids[0] })),
      source: `ТААМАГЛАЛ: хэрэглэгчийн ноорог 3-ын дагуу ${KEY_PARCEL}-ийн бүлгийн чиглэлтэй (${G.angle}°) тэгш өнцөгт; шороон замын тэнхлэгээс ${ROAD_HALF} м, хөрш нэгж талбараас ${PARCEL_GAP} м зай авч, 8 га хүрэхгүй хэсгийг хойш сунгасан (scripts/design-site-neighbor.mjs).`,
      utm49: rd(ring) }, geometry: { type: "Polygon", coordinates: [ll(ring)] } },
    ...sketches,
  ],
};
for (const p of [new URL("data/site_boundary.geojson", root), new URL("web/public/data/site_boundary.geojson", root)]) writeFileSync(p, JSON.stringify(out, null, 1));
console.log("saved", area([[ring]]).toFixed(0), "m2,", ring.length - 1, "vertices");
