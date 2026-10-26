// Анхны (default) төлөвлөгөөг ../outputs руу GeoJSON, CSV, DXF болгон гаргах: node scripts/export-default.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import proj4 from "proj4";
import { runPlan, DEFAULT_PARAMS, dominantAngle } from "../lib/plan.ts";
import { planGeoJSON, lotsCSV, planDXF } from "../lib/export.ts";

const read = (n) => JSON.parse(readFileSync(new URL(`../public/data/${n}.geojson`, import.meta.url), "utf8"));
const P = proj4("EPSG:4326", "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs");
const b = read("site_boundary"), eg = read("egazar_parcels");
const ring = b.features[0].properties.utm49, c = ring[0];
// Апп-тай ижил: хилийн санал болгосон чиглэл, эс бөгөөс эхний оройгоос 600 м-т орших хөршийн чиглэл
const near = eg.features.map((f) => [[f.geometry.coordinates[0].map((q) => P.forward(q))]]).filter((m) => Math.hypot(m[0][0][0][0] - c[0], m[0][0][0][1] - c[1]) < 600);
const props = b.features[0].properties;
const angle = props.angle ?? Math.round(dominantAngle(near) * 10) / 10;
// Апп (components/Workspace.tsx)-тай ижил санал болгосон тохиргоо
const rec = Object.fromEntries(["lotW", "lotD", "lotsPerBlock", "mix", "minLotRatio", "anchor", "rows", "localW"].filter((k) => props[k] != null).map((k) => [k, props[k]]));
const pl = runPlan([[ring]], { ...DEFAULT_PARAMS, ...rec, angle });
const out = new URL("../../outputs/", import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("bayandun_plan_wgs84.geojson", out), JSON.stringify(planGeoJSON(pl, true)));
writeFileSync(new URL("bayandun_plan_utm49.geojson", out), JSON.stringify(planGeoJSON(pl, false)));
writeFileSync(new URL("bayandun_lots_corners.csv", out), lotsCSV(pl));
writeFileSync(new URL("bayandun_plan_utm49.dxf", out), planDXF(pl));
const m = pl.metrics;
console.log(JSON.stringify({ angle, bySize: m.bySize.map((b) => `${b.size}×${b.count}`).join(" "), lots: m.resCount, avg: Math.round(m.avgLot), res: Math.round(m.res), pub: Math.round(m.pub), streets: Math.round(m.streets), green: Math.round(m.green), site: Math.round(m.site), warnings: pl.warnings }, null, 1));
