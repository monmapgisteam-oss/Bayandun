// Хөршийн нэгж талбарын давамгай чиглэл ~37.5° (Сансар гудамж) байх ёстой
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import proj4 from "proj4";
import { dominantAngle } from "../lib/plan.ts";

test("хөршийн чиглэл", () => {
  const P = proj4("EPSG:4326", "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs");
  const eg = JSON.parse(readFileSync(new URL("../public/data/egazar_parcels.geojson", import.meta.url), "utf8"));
  const a = dominantAngle(eg.features.map((f) => [[f.geometry.coordinates[0].map((q) => P.forward(q))]]));
  console.log("angle", a.toFixed(2));
  assert.ok(a > 30 && a < 45);
});
