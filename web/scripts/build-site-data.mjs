// data/site_boundary.geojson + data/sketch3_inputs.json → lib/siteData.json (Booroljuut модулиудад UTM 49N тогтмол)
// Ажиллуулах: node scripts/build-site-data.mjs  (design-site.mjs-ийн дараа)
import { readFileSync, writeFileSync } from "node:fs";
import { edgeBand, union, area } from "../lib/plan.ts";
const root = new URL("../../", import.meta.url);
const fc = JSON.parse(readFileSync(new URL("data/site_boundary.geojson", root), "utf8"));
// Хилийн хувилбарууд («8 га · хувилбар N») — 02 хэсэгт тусдаа суурьшлын бүс болно
const versions = fc.features.map((f) => ({ f, n: Number(/хувилбар (\d+)/.exec(f.properties.name)?.[1] ?? 0) })).filter((v) => v.n > 0).sort((a, c) => a.n - c.n);
const b = (versions[0] ?? { f: fc.features[0] }).f;
const { road } = JSON.parse(readFileSync(new URL("data/sketch3_inputs.json", root), "utf8"));
const r2 = (p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
// Төслийн хүрээ (Бөөрөлжүүт-ын ID 17 «Бүх талбай»): суурьшлын бүсээс 150 м — шороон зам болон гадна холболтын замын коридор багтана.
// ТААМАГЛАЛ: 150 м нь зөвхөн тооцооны хүрээ, газар эзэмшлийн хил биш.
const PROJECT_BUFFER = 150;
const zone = union(versions.length ? versions.map((v) => [[v.f.properties.utm49]]) : [[[b.properties.utm49]]]);
const grown = union([zone, edgeBand(zone, PROJECT_BUFFER)]);
const project = grown.reduce((a, p) => (area([p]) > area([a]) ? p : a))[0];
writeFileSync(new URL("../lib/siteData.json", import.meta.url), JSON.stringify({
  name: "Баяндун сум, хойд хэсэг — суурьшлын бүс",
  areaHa: Math.round(b.properties.area_m2 / 100) / 100,
  ring: b.properties.utm49.map(r2),
  versions: versions.map((v) => ({ n: v.n, areaHa: Math.round(v.f.properties.area_m2 / 100) / 100, ring: v.f.properties.utm49.map(r2) })),
  road: road.map(r2),
  projectBuffer: PROJECT_BUFFER,
  project: project.map(r2),
  source: b.properties.source,
}, null, 1));
console.log("lib/siteData.json", versions.length, "хувилбар,", road.length, "road points");
