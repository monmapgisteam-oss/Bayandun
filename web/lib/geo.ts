// UTM 49N (EPSG:32649) дээрх хөнгөн геометр ба өгөгдөл татах туслахууд.
// Бүх тооцоо метрээр — Web Mercator-ын гажилтгүй.
import { PLAN_BOUNDARY, SERVICE_URL, ELEVATION_URL } from "./layers";

export type XY = [number, number];
export type Seg = [number, number, number, number];

export const BOUNDARY: XY[] = PLAN_BOUNDARY;

export const BBOX = (() => {
  const xs = BOUNDARY.map((p) => p[0]), ys = BOUNDARY.map((p) => p[1]);
  return { xmin: Math.min(...xs), ymin: Math.min(...ys), xmax: Math.max(...xs), ymax: Math.max(...ys) };
})();

/** Цэг полигон дотор эсэх (ray casting) */
export function inside(x: number, y: number, ring: XY[] = BOUNDARY) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

export function segDist(px: number, py: number, s: Seg) {
  const [x1, y1, x2, y2] = s;
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

export function ringSegs(ring: XY[]): Seg[] {
  return ring.map((p, i) => {
    const q = ring[(i + 1) % ring.length];
    return [p[0], p[1], q[0], q[1]] as Seg;
  });
}

/** Полигон хүртэлх зай (дотор бол 0) */
export function distToPolygon(x: number, y: number, ring: XY[] = BOUNDARY) {
  if (inside(x, y, ring)) return 0;
  let d = Infinity;
  for (const s of ringSegs(ring)) d = Math.min(d, segDist(x, y, s));
  return d;
}

export function polygonArea(ring: XY[]) {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** Хэрчмийн орон зайн индекс — хамгийн ойрын зайг хурдан олох */
export class SegIndex {
  private b = new Map<string, Seg[]>();
  public segs: Seg[];
  private size: number;
  constructor(segs: Seg[], size = 1000) {
    this.segs = segs; this.size = size;
    for (const s of segs) {
      const x0 = Math.floor(Math.min(s[0], s[2]) / size), x1 = Math.floor(Math.max(s[0], s[2]) / size);
      const y0 = Math.floor(Math.min(s[1], s[3]) / size), y1 = Math.floor(Math.max(s[1], s[3]) / size);
      for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) {
        const k = `${i},${j}`;
        (this.b.get(k) ?? this.b.set(k, []).get(k)!).push(s);
      }
    }
  }
  nearest(x: number, y: number, maxR = 30000) {
    if (!this.segs.length) return Infinity;
    const ci = Math.floor(x / this.size), cj = Math.floor(y / this.size);
    let best = Infinity;
    const maxRing = Math.ceil(maxR / this.size);
    for (let r = 0; r <= maxRing; r++) {
      if (best < (r - 1) * this.size) break;
      for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
        if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
        const arr = this.b.get(`${i},${j}`);
        if (arr) for (const s of arr) best = Math.min(best, segDist(x, y, s));
      }
    }
    return best;
  }
}

// ---------- FeatureServer-ээс EPSG:32649-аар татах ----------
type Feat = { attributes: Record<string, unknown>; geometry: { paths?: XY[][]; rings?: XY[][]; x?: number; y?: number } };
const featCache = new Map<string, Promise<Feat[]>>();

export type { Feat };

/** base — SERVICE_URL-аас өөр FeatureServer; simplify — геометрийг хөнгөвчлөх зай (м) */
export function fetchFeatures(n: number, where = "1=1", pad = 20000, fields = "*", base = SERVICE_URL, simplify = 0): Promise<Feat[]> {
  const key = `${base}|${n}|${where}|${pad}|${fields}|${simplify}`;
  if (!featCache.has(key)) {
    featCache.set(key, (async () => {
      const out: Feat[] = [];
      const env = [BBOX.xmin - pad, BBOX.ymin - pad, BBOX.xmax + pad, BBOX.ymax + pad].join(",");
      for (let offset = 0; ; offset += 2000) {
        const q = new URLSearchParams({
          where, geometry: env, geometryType: "esriGeometryEnvelope", inSR: "32649", outSR: "32649",
          spatialRel: "esriSpatialRelIntersects", outFields: fields, returnGeometry: "true",
          resultOffset: String(offset), resultRecordCount: "2000", f: "json",
          ...(simplify ? { maxAllowableOffset: String(simplify) } : {}),
        });
        const r = await fetch(`${base}/${n}/query?${q}`);
        const d = await r.json();
        if (d.error) throw new Error(d.error.message);
        out.push(...d.features);
        if (!d.exceededTransferLimit && d.features.length < 2000) break;
      }
      return out;
    })());
  }
  return featCache.get(key)!;
}

export function toSegs(feats: Feat[]): Seg[] {
  const segs: Seg[] = [];
  for (const f of feats) for (const p of f.geometry.paths ?? f.geometry.rings ?? []) {
    for (let i = 1; i < p.length; i++) segs.push([p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]]);
  }
  return segs;
}

export function toPointSegs(feats: Feat[]): Seg[] {
  return feats.filter((f) => f.geometry.x != null).map((f) => [f.geometry.x!, f.geometry.y!, f.geometry.x!, f.geometry.y!]);
}

// Хучилттай зам — config/config.yaml road_filters.road_paved-тай ижил (ТААМАГЛАЛ)
export const PAVED_WHERE =
  "roadtype IN ('Хурдны зам','Олон улсын чанартай авто зам','Улсын чанартай авто зам','Хоёрдогч авто зам','Гуравдагч зам','Авто зам','Үйлчилгээний зам','Замын холбоос')";

// ---------- Өндөржилт (Terrain3D) ----------
let elevLayer: Promise<import("@arcgis/core/layers/ElevationLayer").default> | null = null;

export async function sampleElevation(pts: XY[]): Promise<number[]> {
  const [{ default: ElevationLayer }, { default: Multipoint }] = await Promise.all([
    import("@arcgis/core/layers/ElevationLayer"), import("@arcgis/core/geometry/Multipoint"),
  ]);
  if (!elevLayer) elevLayer = (async () => { const l = new ElevationLayer({ url: ELEVATION_URL }); await l.load(); return l; })();
  const layer = await elevLayer;
  const out: number[] = [];
  const CH = 2500;
  for (let i = 0; i < pts.length; i += CH) {
    const mp = new Multipoint({ points: pts.slice(i, i + CH), spatialReference: { wkid: 32649 } });
    const r = await layer.queryElevation(mp, { demResolution: "finest-contiguous", noDataValue: -999999, returnSampleInfo: true });
    const points=(r.geometry as InstanceType<typeof Multipoint>).points;
    if(points.length!==mp.points.length)throw new Error("DEM цэгийн тоо зөрсөн; тооцоог зогсоолоо.");
    const valid=(z:number,missing:number|null|undefined,resolution:number|null|undefined)=>Number.isFinite(z)&&z!==missing&&z!==-999999&&(resolution??0)>=0;
    const values=points.map(p=>p[2]),missing=points.flatMap((p,j)=>valid(p[2],r.noDataValue,r.sampleInfo?.[j]?.demResolution)?[]:[j]);
    // Түр тасалдсан tile-ийг жижиг бүлгээр дахин уншина. Өндөр зохиож нөхөхгүй.
    for(let k=0;k<missing.length;k+=100){
      const indexes=missing.slice(k,k+100),retry=new Multipoint({points:indexes.map(j=>mp.points[j]),spatialReference:{wkid:32649}});
      const result=await layer.queryElevation(retry,{demResolution:'finest-contiguous',noDataValue:-999999,returnSampleInfo:true}),sample=(result.geometry as InstanceType<typeof Multipoint>).points;
      if(sample.length!==indexes.length)throw new Error('DEM давтан уншихад цэгийн тоо зөрлөө.');
      indexes.forEach((index,j)=>{const z=sample[j][2];if(!valid(z,result.noDataValue,result.sampleInfo?.[j]?.demResolution))throw new Error('DEM өндөр давтан таталтаар олдсонгүй. Холболт, өгөгдлийн хүрээг шалгана уу.');values[index]=z;});
    }
    out.push(...values);
  }
  return out;
}

// ---------- Суурь растер (grid) ----------
export type BaseGrid = {
  cell: number; nx: number; ny: number; x0: number; y0: number;
  cx: Float64Array; cy: Float64Array; isIn: Uint8Array;
  elev: Float64Array; slope: Float64Array; aspect: Float64Array; tpi: Float64Array;
  dist: Record<string, Float64Array>;
};

export const DIST_SOURCES: Record<string, { label: string; load: () => Promise<Seg[]> }> = {
  road_paved: { label: "Хучилттай зам", load: async () => toSegs(await fetchFeatures(25, PAVED_WHERE, 20000, "roadtype")) },
  road_any: { label: "Бүх зам", load: async () => toSegs(await fetchFeatures(25, "1=1", 20000, "roadtype")) },
  rail: { label: "Төмөр зам", load: async () => toSegs(await fetchFeatures(26, "1=1", 30000, "OBJECTID")) },
  tl: { label: "Цахилгааны шугам", load: async () => toSegs(await fetchFeatures(24, "1=1", 20000, "OBJECTID")) },
  soum_center: { label: "Сумын төв", load: async () => toPointSegs(await fetchFeatures(22, "1=1", 60000, "center_nam")) },
};

const gridCache = new Map<number, Promise<BaseGrid>>();

/** Төлөвлөлтийн хилийг хамарсан grid: өндөр, налуу, aspect, TPI, зайн давхаргууд */
export function baseGrid(cell: number, onStep?: (s: string) => void): Promise<BaseGrid> {
  if (!gridCache.has(cell)) {
    gridCache.set(cell, (async () => {
      const x0 = Math.floor(BBOX.xmin / cell) * cell - cell, y0 = Math.floor(BBOX.ymin / cell) * cell - cell;
      const nx = Math.ceil((BBOX.xmax - x0) / cell) + 2, ny = Math.ceil((BBOX.ymax - y0) / cell) + 2;
      const N = nx * ny;
      const cx = new Float64Array(N), cy = new Float64Array(N), isIn = new Uint8Array(N);
      const pts: XY[] = [];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        cx[k] = x0 + (i + 0.5) * cell; cy[k] = y0 + (j + 0.5) * cell;
        isIn[k] = inside(cx[k], cy[k]) ? 1 : 0;
        pts.push([cx[k], cy[k]]);
      }
      onStep?.(`DEM-ээс ${N.toLocaleString()} цэгийн өндөр авч байна…`);
      const elev = Float64Array.from(await sampleElevation(pts));
      const slope = new Float64Array(N), aspect = new Float64Array(N), tpi = new Float64Array(N);
      const at = (i: number, j: number) => elev[Math.min(ny - 1, Math.max(0, j)) * nx + Math.min(nx - 1, Math.max(0, i))];
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        const dzdx = (at(i + 1, j) - at(i - 1, j)) / (2 * cell);
        const dzdy = (at(i, j + 1) - at(i, j - 1)) / (2 * cell);
        slope[k] = Math.hypot(dzdx, dzdy) * 100; // %
        aspect[k] = (Math.atan2(-dzdx, -dzdy) * 180 / Math.PI + 360) % 360; // уруу чиглэл, хойд=0
        let s = 0, c = 0;
        for (let dj = -3; dj <= 3; dj++) for (let di = -3; di <= 3; di++) {
          if (!di && !dj) continue;
          s += at(i + di, j + dj); c++;
        }
        tpi[k] = elev[k] - s / c;
      }
      const dist: Record<string, Float64Array> = {};
      for (const [key, src] of Object.entries(DIST_SOURCES)) {
        onStep?.(`${src.label} хүртэлх зайг тооцож байна…`);
        const idx = new SegIndex(await src.load());
        const d = new Float64Array(N);
        for (let k = 0; k < N; k++) d[k] = isIn[k] ? idx.nearest(cx[k], cy[k]) : NaN;
        dist[key] = d;
      }
      return { cell, nx, ny, x0, y0, cx, cy, isIn, elev, slope, aspect, tpi, dist };
    })());
    gridCache.get(cell)!.catch(() => gridCache.delete(cell));
  }
  return gridCache.get(cell)!;
}

export const cellRing = (x: number, y: number, h: number): XY[] =>
  [[x - h, y - h], [x + h, y - h], [x + h, y + h], [x - h, y + h], [x - h, y - h]];

export const fmtN = (v: number | null | undefined, d = 0) =>
  v == null || !isFinite(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: 0 });

/** Шугамыг тогтмол алхмаар нягтруулна (м) */
export function densify(path: XY[], step: number): { pts: XY[]; chain: number[] } {
  const pts: XY[] = [path[0]], chain = [0];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const [x1, y1] = path[i - 1], [x2, y2] = path[i];
    const L = Math.hypot(x2 - x1, y2 - y1);
    const n = Math.max(1, Math.ceil(L / step));
    for (let s = 1; s <= n; s++) {
      pts.push([x1 + ((x2 - x1) * s) / n, y1 + ((y2 - y1) * s) / n]);
      chain.push(acc + (L * s) / n);
    }
    acc += L;
  }
  return { pts, chain };
}

/** Геометрийг EPSG:32649 руу хөрвүүлэх (sketch-ээс ирсэн Web Mercator) */
export async function toUTM<T extends __GeomLike>(g: T): Promise<T> {
  const op = await import("@arcgis/core/geometry/operators/projectOperator");
  if (!op.isLoaded()) await op.load();
  return op.execute(g as never, { wkid: 32649 } as never) as unknown as T;
}
export async function toWGS<T extends __GeomLike>(g: T): Promise<T> {
  const op = await import("@arcgis/core/geometry/operators/projectOperator");
  if (!op.isLoaded()) await op.load();
  return op.execute(g as never, { wkid: 4326 } as never) as unknown as T;
}
type __GeomLike = { spatialReference?: unknown };
