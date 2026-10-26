// Хөрш нэгж талбарын тор: чиглэл, нүүр/гүн, эгнээ ба гудамжны давтамжийг хэмжих
// node scripts/neighbor-grid.mjs [радиус_м]
import { readFileSync } from "node:fs";
import proj4 from "proj4";
const R = Number(process.argv[2] ?? 400);
const P = proj4("EPSG:4326", "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs");
const site = JSON.parse(readFileSync(new URL("../lib/siteData.json", import.meta.url), "utf8"));
const c = site.ring.reduce((s, q) => [s[0] + q[0] / site.ring.length, s[1] + q[1] / site.ring.length], [0, 0]);
const eg = JSON.parse(readFileSync(new URL("../public/data/egazar_parcels.geojson", import.meta.url), "utf8"));
const polys = eg.features.map((f) => ({ id: f.properties.parcel_id, a: f.properties.area_m2, r: f.geometry.coordinates[0].slice(0, -1).map((q) => P.forward(q)) }))
  .map((p) => ({ ...p, c: p.r.reduce((s, q) => [s[0] + q[0] / p.r.length, s[1] + q[1] / p.r.length], [0, 0]) }))
  .filter((p) => Math.hypot(p.c[0] - c[0], p.c[1] - c[1]) < R);
console.log("parcels within", R, "m:", polys.length);
// Талбар бүрийн ирмэгийн чиглэл ба урт
const rows = polys.map((p) => {
  const e = p.r.map((q, i) => { const n = p.r[(i + 1) % p.r.length], dx = n[0] - q[0], dy = n[1] - q[1]; return { L: Math.hypot(dx, dy), a: ((Math.atan2(dy, dx) * 180 / Math.PI) % 180 + 180) % 180 }; });
  return { id: p.id, a: p.a, c: p.c, e, dist: Math.hypot(p.c[0] - c[0], p.c[1] - c[1]) };
}).sort((x, y) => x.dist - y.dist);
for (const r of rows.slice(0, 25)) console.log(r.id, r.a, Math.round(r.dist), r.e.map((e) => `${e.L.toFixed(1)}@${e.a.toFixed(1)}`).join(" "));

// Бүлэг бүрийн (40 м-ийн ирмэгийн чиглэлээр) локал тор: эгнээ (v) ба талбар (u) байрлал
const groups = new Map();
for (const p of polys) {
  const e = p.r.map((q, i) => { const n = p.r[(i + 1) % p.r.length]; return [n[0] - q[0], n[1] - q[1]]; }).filter(([dx, dy]) => Math.abs(Math.hypot(dx, dy) - 40) < 1);
  if (!e.length) continue;
  const a = Math.round(((Math.atan2(e[0][1], e[0][0]) * 180 / Math.PI) % 180 + 180) % 180 * 10) / 10;
  const k = [...groups.keys()].find((g) => Math.abs(g - a) < 1) ?? a;
  groups.set(k, [...(groups.get(k) ?? []), p]);
}
for (const [a, ps] of groups) {
  const t = (-a * Math.PI) / 180, rot = ([x, y]) => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];
  const uv = ps.map((p) => { const cs = p.r.map(rot); return { id: p.id, u0: Math.min(...cs.map((q) => q[0])), u1: Math.max(...cs.map((q) => q[0])), v0: Math.min(...cs.map((q) => q[1])), v1: Math.max(...cs.map((q) => q[1])) }; });
  const vs = [...new Set(uv.map((q) => Math.round(q.v0 * 10) / 10))].sort((x, y) => x - y);
  const us = [...new Set(uv.map((q) => Math.round(q.u0 * 10) / 10))].sort((x, y) => x - y);
  console.log(`\nangle ${a}° · ${ps.length} parcels, nearest ${Math.round(Math.min(...ps.map((p) => Math.hypot(p.c[0] - c[0], p.c[1] - c[1]))))} m`);
  console.log(" v0 rows:", vs.map((v, i) => (i ? `+${(v - vs[i - 1]).toFixed(1)}` : v.toFixed(1))).join(" "));
  console.log(" u0 cols:", us.map((v, i) => (i ? `+${(v - us[i - 1]).toFixed(1)}` : v.toFixed(1))).join(" "));
}
