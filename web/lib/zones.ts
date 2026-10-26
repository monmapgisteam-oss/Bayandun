// Төлөвлөлтийн бүсийн полигон (booroljuulelt2/41) ба бүсийн DEM grid
import { ZONE_LAYER_URL } from "./layers";
import { DIST_SOURCES, distToPolygon, inside, sampleElevation, SegIndex, toWGS, type XY } from "./geo";

// Сервисийн нэрэнд мөр таслалт, илүү зай байгаа
export const cleanName = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

export type Zone = { id: number; name: string; ha: number; rings: XY[][]; lat: number; lon: number };
const cache = new Map<number, Promise<Zone>>();

export function loadZone(id: number): Promise<Zone> {
  if (!cache.has(id)) {
    cache.set(id, (async () => {
      const q = new URLSearchParams({ where: `ID = ${id}`, outFields: "ID,Name,Hectare", outSR: "32649", returnGeometry: "true", f: "json" });
      const d = await (await fetch(`${ZONE_LAYER_URL}/query?${q}`)).json();
      const f = d.features?.[0];
      if (!f) throw new Error(`Бүс ID=${id} олдсонгүй`);
      const rings = f.geometry.rings as XY[][];
      const pts = rings.flat();
      const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
      const { default: Point } = await import("@arcgis/core/geometry/Point");
      const w = await toWGS(new Point({ x: cx, y: cy, spatialReference: { wkid: 32649 } }));
      return { id, name: cleanName(f.attributes.Name), ha: Number(f.attributes.Hectare), rings, lat: w.y!, lon: w.x! };
    })());
    cache.get(id)!.catch(() => cache.delete(id));
  }
  return cache.get(id)!;
}

/** Олон цагирагтай полигон дотор эсэх (even-odd) */
export const inZone = (x: number, y: number, rings: XY[][]) => rings.reduce((c, r) => (inside(x, y, r) ? !c : c), false);
export const distToZone = (x: number, y: number, rings: XY[][]) =>
  inZone(x, y, rings) ? 0 : Math.min(...rings.map((r) => distToPolygon(x, y, r)));
/** Бүсийн хил хүртэлх зай (дотор талаас) */
export function distToEdge(x: number, y: number, rings: XY[][]) {
  let d = Infinity;
  for (const r of rings) for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
    const t = l2 ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / l2)) : 0;
    d = Math.min(d, Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy)));
  }
  return d;
}

export type ZoneGrid = {
  cell: number; nx: number; ny: number; x0: number; y0: number;
  cx: Float64Array; cy: Float64Array; isIn: Uint8Array;
  elev: Float64Array; slope: Float64Array; aspect: Float64Array; tpi: Float64Array;
  dist: Record<"road" | "road_paved" | "rail" | "tl", Float64Array>;
};

/**
 * Бүсийг хамарсан DEM grid (Terrain3D-ээс дээж): өндөр, налуу (%), aspect (уруу зүг, °), TPI (радиус tpiR м).
 * pad = tpiR тул хилийн ойролцоо TPI бүрэн хөрштэй.
 */
export async function zoneGrid(z: Zone, cell: number, tpiR: number, onStep?: (s: string) => void): Promise<ZoneGrid> {
  const pts = z.rings.flat();
  const pad = Math.ceil(tpiR / cell) * cell + cell;
  const x0 = Math.floor(Math.min(...pts.map((p) => p[0])) / cell) * cell - pad;
  const y0 = Math.floor(Math.min(...pts.map((p) => p[1])) / cell) * cell - pad;
  const nx = Math.ceil((Math.max(...pts.map((p) => p[0])) + pad - x0) / cell);
  const ny = Math.ceil((Math.max(...pts.map((p) => p[1])) + pad - y0) / cell);
  const N = nx * ny;
  const cx = new Float64Array(N), cy = new Float64Array(N), isIn = new Uint8Array(N);
  const xy: XY[] = [];
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    cx[k] = x0 + (i + 0.5) * cell; cy[k] = y0 + (j + 0.5) * cell;
    isIn[k] = inZone(cx[k], cy[k], z.rings) ? 1 : 0;
    xy.push([cx[k], cy[k]]);
  }
  onStep?.(`DEM-ээс ${N.toLocaleString("en-US")} цэгийн өндөр авч байна (${cell} м)…`);
  const elev = Float64Array.from(await sampleElevation(xy));
  const at = (i: number, j: number) => elev[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
  // TPI: summed-area table-аар дөрвөлжин хөршийн дундаж
  const sat = new Float64Array((nx + 1) * (ny + 1));
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++)
    sat[(j + 1) * (nx + 1) + i + 1] = elev[j * nx + i] + sat[j * (nx + 1) + i + 1] + sat[(j + 1) * (nx + 1) + i] - sat[j * (nx + 1) + i];
  const r = Math.max(1, Math.round(tpiR / cell));
  const slope = new Float64Array(N), aspect = new Float64Array(N), tpi = new Float64Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    // Horn (1981) 3×3
    const a = at(i - 1, j + 1), b = at(i, j + 1), c = at(i + 1, j + 1), d = at(i - 1, j), f = at(i + 1, j),
      g = at(i - 1, j - 1), h = at(i, j - 1), ii = at(i + 1, j - 1);
    const dzdx = ((c + 2 * f + ii) - (a + 2 * d + g)) / (8 * cell);
    const dzdy = ((a + 2 * b + c) - (g + 2 * h + ii)) / (8 * cell);
    slope[k] = Math.hypot(dzdx, dzdy) * 100;
    aspect[k] = (Math.atan2(-dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
    const i0 = Math.max(0, i - r), i1 = Math.min(nx, i + r + 1), j0 = Math.max(0, j - r), j1 = Math.min(ny, j + r + 1);
    const s = sat[j1 * (nx + 1) + i1] - sat[j0 * (nx + 1) + i1] - sat[j1 * (nx + 1) + i0] + sat[j0 * (nx + 1) + i0];
    const n = (i1 - i0) * (j1 - j0);
    tpi[k] = elev[k] - (s - elev[k]) / (n - 1);
  }
  const dist = {} as ZoneGrid["dist"];
  const src: Record<keyof ZoneGrid["dist"], string> = { road: "road_any", road_paved: "road_paved", rail: "rail", tl: "tl" };
  for (const [key, s] of Object.entries(src) as [keyof ZoneGrid["dist"], string][]) {
    onStep?.(`${DIST_SOURCES[s].label} хүртэлх зай…`);
    const idx = new SegIndex(await DIST_SOURCES[s].load());
    const d = new Float64Array(N);
    for (let k = 0; k < N; k++) d[k] = isIn[k] ? idx.nearest(cx[k], cy[k], 60000) : NaN;
    dist[key] = d;
  }
  return { cell, nx, ny, x0, y0, cx, cy, isIn, elev, slope, aspect, tpi, dist };
}
