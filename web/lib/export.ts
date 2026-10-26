// Төлөвлөгөөг GeoJSON (WGS84 / UTM 49N), CSV (оройн координат), DXF (AutoCAD R12) болгон гаргах.
import { corners, type Multi, type Plan, type XY } from "./plan.ts";
import { multiToLL, toLL } from "./proj.ts";

const USE_MN = { res: "Гэр, орон сууцны хашааны газар", public: "Нийтийн зориулалт (цэцэрлэг, тоглоомын талбай)" } as const;
const r2 = (v: number) => Math.round(v * 100) / 100;
const r7 = (v: number) => Math.round(v * 1e7) / 1e7;
const geom = (m: Multi, ll: boolean) => {
  const g = ll ? multiToLL(m) : m, rd = ll ? r7 : r2;
  const c = g.map((p) => p.map((r) => r.map(([x, y]) => [rd(x), rd(y)])));
  return c.length === 1 ? { type: "Polygon", coordinates: c[0] } : { type: "MultiPolygon", coordinates: c };
};

export function planGeoJSON(pl: Plan, ll = true) {
  const f = (m: Multi, props: Record<string, unknown>) => (m.length ? [{ type: "Feature", properties: props, geometry: geom(m, ll) }] : []);
  return {
    type: "FeatureCollection",
    ...(ll ? {} : { crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::32649" } } }),
    name: "bayandun_plan",
    features: [
      ...f(pl.site, { layer: "site", name: "Төлөвлөлтийн хил", area_m2: r2(pl.metrics.site) }),
      ...f(pl.streets, { layer: "streets", name: "Гудамж, зам (улаан шугамын дотор)", area_m2: r2(pl.metrics.streets) }),
      ...f(pl.green, { layer: "green", name: "Ногоон байгууламж, нээлттэй талбай", area_m2: r2(pl.metrics.green) }),
      ...pl.lots.flatMap((l) => f(l.poly, { layer: "lots", id: l.id, use: l.use, landuse: USE_MN[l.use], block: l.block, area_m2: r2(l.area), size_m2: l.size, front_m: r2(l.front), depth_m: r2(l.depth), trimmed: l.trimmed, access: l.access })),
    ],
  };
}

export function lotsCSV(pl: Plan) {
  const rows = [["id", "zoriulalt", "blok", "hemjee_m2", "talbai_m2", "oroi", "E_utm49", "N_utm49", "lon", "lat"].join(",")];
  for (const l of pl.lots) corners(l.poly).forEach((q, i) => {
    const [lon, lat] = toLL(q);
    rows.push([l.id, `"${USE_MN[l.use]}"`, l.block, l.size, r2(l.area), i + 1, r2(q[0]), r2(q[1]), r7(lon), r7(lat)].join(","));
  });
  return "﻿" + rows.join("\r\n");
}

// AutoCAD R12 DXF — кирилл үсгийг \U+XXXX болгоно
const esc = (s: string) => [...s].map((ch) => (ch.charCodeAt(0) > 126 ? `\\U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}` : ch)).join("");
export function planDXF(pl: Plan) {
  const out: (string | number)[] = [0, "SECTION", 2, "HEADER", 9, "$ACADVER", 1, "AC1009", 9, "$INSUNITS", 70, 6, 0, "ENDSEC", 0, "SECTION", 2, "ENTITIES"];
  const poly = (layer: string, ring: XY[]) => {
    out.push(0, "POLYLINE", 8, layer, 66, 1, 70, 1, 10, 0, 20, 0, 30, 0);
    const pts = ring.length > 1 && ring[0][0] === ring.at(-1)![0] && ring[0][1] === ring.at(-1)![1] ? ring.slice(0, -1) : ring;
    for (const [x, y] of pts) out.push(0, "VERTEX", 8, layer, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0);
    out.push(0, "SEQEND", 8, layer);
  };
  const text = (layer: string, [x, y]: XY, h: number, s: string) => out.push(0, "TEXT", 8, layer, 10, x.toFixed(3), 20, y.toFixed(3), 30, 0, 40, h, 1, esc(s), 72, 1, 73, 2, 11, x.toFixed(3), 21, y.toFixed(3), 31, 0);
  const all = (layer: string, m: Multi) => m.forEach((p) => p.forEach((r) => poly(layer, r)));
  all("SITE_BOUNDARY", pl.site);
  all("STREETS", pl.streets);
  all("GREEN", pl.green);
  for (const l of pl.lots) {
    all(l.use === "res" ? "LOTS" : "PUBLIC", l.poly);
    text("LABELS", l.c, 3, l.id);
    text("LABELS", [l.c[0], l.c[1] - 4.5], 2, `${Math.round(l.area)} m2`);
  }
  out.push(0, "ENDSEC", 0, "EOF");
  return out.join("\r\n");
}

export function download(name: string, data: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
