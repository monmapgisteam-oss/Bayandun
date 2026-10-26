// Баяндун төслийн эх өгөгдлийн FeatureServer (ArcGIS REST-ийн Query-ийн хэрэгцээт дэд хэсэг).
// Бөөрөлжүүт-ын модулиуд ArcGIS Online сервисээс уншдаг тул ижил дугаартай давхаргаар локал өгөгдлийг өгнө:
//   41 = төлөвлөлтийн бүс (ID 1 «Суурьшлын бүс», ID 17 «Бүх талбай»), 25 = авто зам (шороон зам), 50 = egazar нэгж талбар.
// Бусад дугаар (төмөр зам, ЦДАШ, хөрс…) Баяндунд өгөгдөлгүй тул хоосон давхарга буцаана.
// Орон зайн шүүлтүүр: зөвхөн envelope-ийн хүрээгээр (объектын bbox давхцал).
import { readFile } from "node:fs/promises";
import path from "node:path";
import proj4 from "proj4";
import site from "@/lib/siteData.json";

export const runtime = "nodejs";

const UTM = "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs";
proj4.defs("EPSG:32649", UTM);
type Attrs = Record<string, string | number | null>;
type Geometry = { rings?: number[][][]; paths?: number[][][] };
type Layer = { id: number; name: string; geometryType: "esriGeometryPolygon" | "esriGeometryPolyline"; fields: { name: string; type: string }[]; features: { attributes: Attrs; geometry: Geometry }[] };

const field = (name: string, type: "oid" | "int" | "double" | "string") => ({ name, alias: name, type: { oid: "esriFieldTypeOID", int: "esriFieldTypeInteger", double: "esriFieldTypeDouble", string: "esriFieldTypeString" }[type], ...(type === "string" ? { length: 255 } : {}) });

let cache: Promise<Record<number, Layer>> | null = null;
function layers() {
  cache ??= (async () => {
    const ring = site.ring as number[][];
    const zones: Layer = {
      id: 41, name: "Төлөвлөлтийн бүс", geometryType: "esriGeometryPolygon",
      fields: [field("OBJECTID", "oid"), field("ID", "int"), field("Name", "string"), field("Hectare", "double"), field("Type", "string")],
      features: [
        // Хилийн хувилбар бүр тусдаа суурьшлын бүс (ID 1); OBJECTID 2 нь «Бүх талбай»-д
        ...(site.versions?.length ? site.versions : [{ n: 0, areaHa: site.areaHa, ring }]).map((v, i) => ({
          attributes: { OBJECTID: i === 0 ? 1 : i + 2, ID: 1, Name: v.n ? `Суурьшлын бүс · хувилбар ${v.n}` : "Суурьшлын бүс", Hectare: v.areaHa, Type: "Төлөвлөж буй" },
          geometry: { rings: [v.ring as number[][]] },
        })),
        // ID 17 «Бүх талбай» — төслийн хүрээ (бүсээс projectBuffer м): Бөөрөлжүүт-ын замын сүлжээ бүсийг тойрч энд коридор тавина
        { attributes: { OBJECTID: 2, ID: 17, Name: "Бүх талбай", Hectare: 0, Type: "" }, geometry: { rings: [site.project as number[][]] } },
      ],
    };
    const road: Layer = {
      id: 25, name: "Авто зам", geometryType: "esriGeometryPolyline",
      fields: [field("OBJECTID", "oid"), field("roadtype", "string"), field("soum_name", "string")],
      features: [{ attributes: { OBJECTID: 1, roadtype: "Хөрсөн зам", soum_name: "Баяндун" }, geometry: { paths: [site.road as number[][]] } }],
    };
    const gj = JSON.parse(await readFile(path.join(process.cwd(), "public", "data", "egazar_parcels.geojson"), "utf8")) as { features: { properties: Attrs; geometry: { coordinates: number[][][] } }[] };
    const parcels: Layer = {
      id: 50, name: "Одоо байгаа нэгж талбар (egazar)", geometryType: "esriGeometryPolygon",
      fields: [field("OBJECTID", "oid"), field("parcel_id", "string"), field("landuse", "string"), field("area_m2", "double"), field("address", "string")],
      features: gj.features.map((f, i) => ({ attributes: { OBJECTID: i + 1, parcel_id: f.properties.parcel_id, landuse: f.properties.landuse, area_m2: f.properties.area_m2, address: f.properties.address }, geometry: { rings: f.geometry.coordinates.map((r) => r.map((p) => proj4("EPSG:4326", "EPSG:32649", p))) } })),
    };
    return { 41: zones, 25: road, 50: parcels };
  })().catch((e) => { cache = null; throw e; });
  return cache;
}
const empty = (id: number): Layer => ({ id, name: `Хоосон давхарга ${id}`, geometryType: "esriGeometryPolygon", fields: [field("OBJECTID", "oid")], features: [] });

// outSR/inSR нь тоо эсвэл {"wkid":102100,...} JSON хэлбэрээр ирнэ
const sr = (v: string | null) => {
  let n = Number(v || 32649);
  if (!Number.isFinite(n) && v) { try { const o = JSON.parse(v); n = Number(o.latestWkid ?? o.wkid); } catch { n = NaN; } }
  return n === 102100 || n === 102113 || n === 900913 ? 3857 : n;
};
/** geometry=envelope (JSON эсвэл "xmin,ymin,xmax,ymax") → EPSG:32649 хүрээ */
function envelope(raw: string | null, inSR: number) {
  if (!raw) return null;
  let e: { xmin: number; ymin: number; xmax: number; ymax: number; spatialReference?: { wkid?: number; latestWkid?: number } };
  try { e = raw.startsWith("{") ? JSON.parse(raw) : Object.fromEntries(["xmin", "ymin", "xmax", "ymax"].map((k, i) => [k, Number(raw.split(",")[i])])) as unknown as typeof e; } catch { return null; }
  if (![e.xmin, e.ymin, e.xmax, e.ymax].every(Number.isFinite)) return null;
  const from = e.spatialReference ? sr(JSON.stringify(e.spatialReference)) : inSR;
  if (from !== 32649 && from !== 4326 && from !== 3857) return null;
  const c = [[e.xmin, e.ymin], [e.xmax, e.ymin], [e.xmax, e.ymax], [e.xmin, e.ymax]].map((p) => (from === 32649 ? p : proj4(`EPSG:${from}`, "EPSG:32649", p)));
  const xs = c.map((p) => p[0]), ys = c.map((p) => p[1]);
  return { xmin: Math.min(...xs), ymin: Math.min(...ys), xmax: Math.max(...xs), ymax: Math.max(...ys) };
}
const touches = (g: Geometry, b: { xmin: number; ymin: number; xmax: number; ymax: number }) => {
  const pts = [...(g.rings ?? []), ...(g.paths ?? [])].flat();
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return Math.max(...xs) >= b.xmin && Math.min(...xs) <= b.xmax && Math.max(...ys) >= b.ymin && Math.min(...ys) <= b.ymax;
};
function project(g: Geometry, to: number): Geometry {
  if (to === 32649) return g;
  if (to !== 4326 && to !== 3857) throw new Error(`Unsupported outSR: ${to}`);
  const f = (p: number[]) => proj4("EPSG:32649", `EPSG:${to}`, p.slice(0, 2));
  return { ...(g.rings ? { rings: g.rings.map((r) => r.map(f)) } : {}), ...(g.paths ? { paths: g.paths.map((r) => r.map(f)) } : {}) };
}
function extent(l: Layer, to = 32649) {
  const pts = l.features.flatMap((f) => { const g = project(f.geometry, to); return [...(g.rings ?? []), ...(g.paths ?? [])].flat(); });
  const all = pts.length ? pts : (site.ring as number[][]).map((p) => project({ paths: [[p]] }, to).paths![0][0]);
  const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  return { xmin: Math.min(...xs), ymin: Math.min(...ys), xmax: Math.max(...xs), ymax: Math.max(...ys), spatialReference: { wkid: to === 3857 ? 102100 : to } };
}

/** Энгийн where: талбар = / <> / != / > / < утга, AND/OR, хаалт, 1=1. Танихгүй нөхцөл (IN, LIKE…) бол шүүхгүй. */
function whereFn(where: string): (a: Attrs) => boolean {
  const cmps: ((a: Attrs) => boolean)[] = [];
  let expr = where.replace(/\b1\s*=\s*1\b/g, " true ").replace(/([A-Za-z_]\w*)\s*(<>|!=|>=|<=|=|>|<)\s*('(?:[^']|'')*'|-?\d+(?:\.\d+)?)/g, (_m, k: string, op: string, raw: string) => {
    const v = raw.startsWith("'") ? raw.slice(1, -1).replace(/''/g, "'") : Number(raw);
    cmps.push((a) => { const x = a[k]; if (x == null) return false; return op === "=" ? x === v : op === "<>" || op === "!=" ? x !== v : op === ">" ? x > v : op === "<" ? x < v : op === ">=" ? x >= v : x <= v; });
    return ` c[${cmps.length - 1}] `;
  }).replace(/\bAND\b/gi, "&&").replace(/\bOR\b/gi, "||");
  if (!/^[\s()&|c\[\]\d]*(true)?[\s()&|c\[\]\d]*$/.test(expr.replace(/true/g, ""))) return () => true;
  expr = expr.replace(/true/g, "1");
  const fn = new Function("c", `return !!(${expr || "1"});`) as (c: boolean[]) => boolean;
  return (a) => fn(cmps.map((t) => t(a)));
}

const json = (v: unknown, status = 200) => Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
const layerMeta = (l: Layer) => ({
  currentVersion: 11.5, id: l.id, name: l.name, type: "Feature Layer", geometryType: l.geometryType, objectIdField: "OBJECTID", globalIdField: "",
  displayField: l.fields.find((f) => f.type === "esriFieldTypeString")?.name ?? "OBJECTID", fields: l.fields, extent: extent(l), spatialReference: { wkid: 32649 },
  hasZ: false, hasM: false, capabilities: "Query", supportedQueryFormats: "JSON", maxRecordCount: 2000, supportsAdvancedQueries: true, supportsStatistics: false,
  advancedQueryCapabilities: { supportsPagination: true, supportsOrderBy: false, supportsDistinct: true, supportsReturningQueryExtent: true, supportsStatistics: false, supportsQueryWithDistance: false },
  minScale: 0, maxScale: 0, typeIdField: "", types: [], relationships: [], drawingInfo: null,
});

type Ctx = { params: Promise<{ path?: string[] }> };
async function handle(request: Request, ctx: Ctx) {
  try {
    const { path: p = [] } = await ctx.params, all = await layers();
    const q = new URL(request.url).searchParams;
    if (request.method === "POST") new URLSearchParams(await request.text()).forEach((v, k) => q.set(k, v));
    if (!p.length) return json({
      currentVersion: 11.5, serviceDescription: site.name, capabilities: "Query", supportedQueryFormats: "JSON", maxRecordCount: 2000,
      spatialReference: { wkid: 32649 }, units: "esriMeters", initialExtent: extent(all[41]), fullExtent: extent(all[50]),
      layers: Object.values(all).map((l) => ({ id: l.id, name: l.name, parentLayerId: -1, defaultVisibility: true, subLayerIds: null, minScale: 0, maxScale: 0, type: "Feature Layer", geometryType: l.geometryType })), tables: [],
    });
    const id = Number(p[0]);
    if (!Number.isInteger(id)) return json({ error: { code: 404, message: "Layer not found.", details: [] } }, 404);
    const l = all[id] ?? empty(id);
    if (p.length === 1) return json(layerMeta(l));
    if (p[1] !== "query") return json({ error: { code: 404, message: "Operation not found.", details: [] } }, 404);
    const test = whereFn(q.get("where") ?? "1=1"), ids = q.get("objectIds")?.split(",").map(Number);
    const box = envelope(q.get("geometry"), sr(q.get("inSR")));
    const rows = l.features.filter((f) => test(f.attributes) && (!ids || ids.includes(Number(f.attributes.OBJECTID))) && (!box || touches(f.geometry, box)));
    const out = sr(q.get("outSR"));
    if (q.get("returnCountOnly") === "true") return json({ count: rows.length });
    if (q.get("returnIdsOnly") === "true") return json({ objectIdFieldName: "OBJECTID", objectIds: rows.map((f) => f.attributes.OBJECTID) });
    if (q.get("returnExtentOnly") === "true") return json({ count: rows.length, extent: extent({ ...l, features: rows }, out) });
    const names = q.get("outFields") ?? "*", sel = names === "*" || !names ? l.fields : l.fields.filter((f) => names.split(",").map((s) => s.trim()).includes(f.name));
    const geom = q.get("returnGeometry") !== "false";
    let feats = rows.map((f) => ({ attributes: Object.fromEntries(sel.map((s) => [s.name, f.attributes[s.name] ?? null])), ...(geom ? { geometry: project(f.geometry, out) } : {}) }));
    if (q.get("returnDistinctValues") === "true") { const seen = new Set<string>(); feats = feats.filter((f) => { const k = JSON.stringify(f.attributes); if (seen.has(k)) return false; seen.add(k); return true; }); }
    const offset = Number(q.get("resultOffset") ?? 0), count = Number(q.get("resultRecordCount") ?? 2000);
    return json({ objectIdFieldName: "OBJECTID", geometryType: l.geometryType, spatialReference: { wkid: out === 3857 ? 102100 : out }, fields: sel, features: feats.slice(offset, offset + count), exceededTransferLimit: offset + count < feats.length });
  } catch (e) {
    return json({ error: { code: 400, message: (e as Error).message, details: [] } }, 400);
  }
}
export const GET = handle;
export const POST = handle;
