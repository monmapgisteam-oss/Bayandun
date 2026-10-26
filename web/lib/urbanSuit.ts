// Хот төлөвлөлтийн тохиромжтой байдал — шалгуур, ангиллын оноо, grid тооцоолол.
// Зөвхөн төлөвлөлтийн бүсүүд (booroljuulelt2/41) дотор тооцно.
// ТААМАГЛАЛ: оноо, босго, жин бүгд концепт шатны санал — мэргэжилтний үнэлгээ, БНбД-ээр ШАЛГАХ.
import { ZONE_SERVICE_URL, ZONE_WHERE } from "./layers";
import { DIST_SOURCES, SegIndex, baseGrid, fetchFeatures, toSegs, type Feat, type Seg, type XY } from "./geo";

export type FGroup = "dem" | "env" | "infra";
export const FACTOR_GROUPS: { key: FGroup; title: string; hue: string }[] = [
  // Өнгө — globals.css (--g-*), CVD шалгалт давсан палитр
  { key: "dem", title: "Гадаргын хэлбэр (DEM)", hue: "var(--g-dem)" },
  { key: "env", title: "Байгаль орчин", hue: "var(--g-env)" },
  { key: "infra", title: "Дэд бүтэц", hue: "var(--g-infra)" },
];

/** [утга, оноо 0–1] цэгүүд — хооронд нь шугаман интерполяц */
export type Curve = [number, number][];

export type Factor = {
  key: string; label: string; group: FGroup; weight: number; hint: string;
  kind: "curve" | "aspect" | "cat";
  unit?: string; curve?: Curve;
  layer?: number; field?: string; cats?: Record<string, number>; names?: Record<string, string>;
};

// Тохиромжийн 5 түвшин (1 = тохиромжгүй … 5 = маш тохиромжтой)
export const LEVELS = [
  { n: 1, label: "Тохиромжгүй", color: "#d73027" },
  { n: 2, label: "Тохиромж муу", color: "#fc8d59" },
  { n: 3, label: "Дунд зэрэг", color: "#fee08b" },
  { n: 4, label: "Тохиромжтой", color: "#91cf60" },
  { n: 5, label: "Маш тохиромжтой", color: "#1a9850" },
];
/** Тогтмол босго: 2, 3, 4, 5-р түвшний доод оноо — ТААМАГЛАЛ */
export const BREAKS = [0.35, 0.5, 0.65, 0.8];
/** relative — шинжилсэн талбайн бодит онооны хүрээг (min–max) 5 тэнцүү хуваана; fixed — BREAKS */
export type ClassMethod = "relative" | "fixed";
export const levelOf = (s: number, breaks = BREAKS) => 1 + breaks.filter((b) => s >= b).length;

export const FACTORS: Factor[] = [
  // ---------- DEM ----------
  { key: "slope", label: "Налуу", group: "dem", kind: "curve", unit: "%", weight: 5,
    curve: [[0, 0.8], [0.5, 1], [3, 1], [8, 0.75], [15, 0.45], [25, 0.1], [35, 0]],
    hint: "0.5–3% налуу барилгажилт, ус зайлуулалтад хамгийн тохиромжтой; 0.5%-иас бага бол гадаргын ус тогтоно. БНбД-ийн заалтыг ШАЛГАХ." },
  { key: "aspect", label: "Налуугийн зүг (aspect)", group: "dem", kind: "aspect", unit: "°", weight: 2,
    hint: "Хүйтэн уур амьсгалд урд зүгт харсан налуу нарны дулаан, гэрэл их авна. 2%-иас бага налуутай хавтгай газарт зүг хамаагүй." },
  { key: "elev", label: "Харьцангуй өндөршил", group: "dem", kind: "curve", unit: "%", weight: 1,
    curve: [[0, 0.8], [25, 1], [70, 0.85], [100, 0.55]],
    hint: "Шинжилсэн талбайн хамгийн нам (0%) – хамгийн өндөр (100%) цэгтэй харьцуулсан байрлал. Хэт нам газарт хүйтэн агаар тогтох, өндөрлөг нь салхинд ил." },
  { key: "tpi", label: "Гадаргын байрлал (TPI)", group: "dem", kind: "curve", unit: "м", weight: 2,
    curve: [[-15, 0.15], [-6, 0.55], [-2, 1], [2, 1], [6, 0.75], [15, 0.45]],
    hint: "Нүдний өндрийг эргэн тойрны 7×7 нүдний дундажтай харьцуулна: сөрөг — хотгор, хөндий (ус, хүйтэн агаар тогтоно); эерэг — оргил, нуруу (салхинд ил)." },
  { key: "flow", label: "Урсацын хуримтлал", group: "dem", kind: "curve", unit: "га", weight: 3,
    curve: [[0, 1], [20, 1], [100, 0.5], [500, 0.1], [2000, 0]],
    hint: "D8 аргаар тооцсон дээд талын ус хураах талбай. Их утгатай нүд — сайр, гуу жалгын шугам (үер, усны эрсдэл). Төлөвлөлтийн хилээс гадуурх сав газрыг тооцоогүй." },

  // ---------- Байгаль орчин (FeatureServer-ийн бодит утгууд) ----------
  { key: "natural_zone", label: "Байгалийн бүс", group: "env", kind: "cat", layer: 36, field: "zonenamemo", weight: 0,
    cats: { "Хээрийн бүс": 1 },
    hint: "Талбай бүхэлдээ Хээрийн бүсэд оршдог тул ялгаа гаргахгүй — жин 0." },
  { key: "land_class", label: "Газрын ангилал", group: "env", kind: "cat", layer: 35, field: "classmon", weight: 3,
    cats: { "Бусад газар": 1, "Хөдөө аж ахуйн газар": 0.7, "Ойн сан бүхий газар": 0.3 },
    hint: "Улсын хэмжээний ерөнхий давхарга — \"Ойн сан бүхий газар\" нэг полигон ~3,500 км² тул бодит ойн хилийг илэрхийлэхгүй. Газрын кадастрын мэдээллээр ШАЛГАХ." },
  { key: "phenomenon_zone", label: "Үзэгдлийн бүс", group: "env", kind: "cat", layer: 34, field: "type_name", weight: 1,
    cats: {
      "Олон жилийн цэвдэг чулуулаг ховор алаг цоог тархалттай бүслүүр": 0.8,
      "Олон жилийн цэвдэг чулуулаг тохиолдлын тархалттай бүслүүр": 0.5,
    },
    names: {
      "Олон жилийн цэвдэг чулуулаг ховор алаг цоог тархалттай бүслүүр": "Цэвдэг ховор, алаг цоог",
      "Олон жилийн цэвдэг чулуулаг тохиолдлын тархалттай бүслүүр": "Цэвдэг тохиолдлын тархалттай",
    },
    hint: "Олон жилийн цэвдэг чулуулаг суурийн суулт, хөөлт үүсгэнэ — тархалт их байх тусам оноо бага." },
  { key: "soil_group", label: "Хөрсний бүлэг", group: "env", kind: "cat", layer: 33, field: "groupmon", weight: 1,
    cats: { "Тал газар, хөндий хотгорын хөрс": 1, "Уулын хөрс": 0.6, "Чийгт гаралын хөрс": 0.2 },
    hint: "Чийгт гаралын хөрс — гүний ус ойр, даац сул. Уулын хөрс нимгэн, чулуурхаг (газар шорооны ажил хүнд)." },
  { key: "soil_code", label: "Хөрсний төрөл", group: "env", kind: "cat", layer: 28, field: "codemon", weight: 2,
    cats: {
      "Ердийн хархүрэн ба дутуу хөгжилтэй хархүрэн хөрс": 1,
      "Үлдмэл нугархаг хархүрэн ба карбонатгүй хархүрэн хөрс": 0.8,
      "Уулын ердийн хархүрэн ба нимгэн хархүрэн хөрс": 0.6,
      "Уулын нимгэн хархүрэн ба ердийн хархүрэн хөрс": 0.5,
      "Нугат-хүрэн ба нугын хужирлаг хөрс": 0.3,
      "Нугын хужирлаг ба хужир-мараат хам хөрс": 0.1,
    },
    hint: "Хужирлаг, хужир-мараат хөрс барилгын суурь, шугам хоолойг идэмхийлж, чийг ихтэй. Инженер-геологийн судалгаагаар ШАЛГАХ." },
  { key: "permafrost_2016", label: "Цэвдэг (2016)", group: "env", kind: "cat", layer: 32, field: "type_name", weight: 2,
    cats: { "Улирлын хөлдөлтийн бүс": 1, "Тохиолдлын тархалттай бүслүүр": 0.5 },
    hint: "Улирлын хөлдөлттэй газар цэвдэгтэй харьцуулахад суурь барихад эрсдэл бага." },
  { key: "veg_class", label: "Ургамлын анги", group: "env", kind: "cat", layer: 31, field: "classmon", weight: 1,
    cats: { "Бэлчээр биш": 0.9, "Хээрийн ба хуурай хээр": 0.8, "Уулын ойт хээр": 0.3 },
    hint: "Уулын ойт хээр экологийн өндөр ач холбогдолтой — хамгаалах." },
  { key: "veg_group", label: "Ургамлын бүлэг", group: "env", kind: "cat", layer: 30, field: "groupmon", weight: 1,
    cats: { "Бэлчээр биш": 0.9, "Тэгш талын хээр ба хуурай хээр": 0.85, "Уулын хээрийн нуга": 0.4, "Нам дор газрын марзлаг хээр": 0.3 },
    hint: "Нам дор газрын марзлаг хээр — чийглэг, хужирлаг хотгор; уулын нуга — экологийн мэдрэг." },
  { key: "landscape", label: "Ландшафт", group: "env", kind: "cat", layer: 29, field: "descriptio", weight: 1,
    cats: {
      "northern dry-steppe of Bayanjargalan": 0.9,
      "northern dry-steppe and steppe of Bayandelger": 0.85,
      "northern dry-steppe and meadow of the upper Kherlen river": 0.5,
      "northern dry-steppe, southern dry-steppe and solonetz-solonchak of the southern Sergelen": 0.4,
    },
    names: {
      "northern dry-steppe of Bayanjargalan": "Баянжаргалангийн хойд хуурай хээр",
      "northern dry-steppe and steppe of Bayandelger": "Баяндэлгэрийн хойд хуурай хээр ба хээр",
      "northern dry-steppe and meadow of the upper Kherlen river": "Хэрлэнгийн эхийн хуурай хээр ба нуга",
      "northern dry-steppe, southern dry-steppe and solonetz-solonchak of the southern Sergelen":
        "Сэргэлэнгийн урд хэсгийн хуурай хээр, хужирлаг-мараат",
    },
    hint: "Нуга — гүний ус ойр; хужирлаг-мараат ландшафт — хөрс идэмхий." },

  // ---------- Дэд бүтэц (зай, м) ----------
  { key: "road", label: "Авто зам хүртэл", group: "infra", kind: "curve", unit: "м", weight: 3,
    curve: [[0, 0.3], [50, 1], [1000, 1], [3000, 0.6], [8000, 0.2], [15000, 0]],
    hint: "Хучилттай авто зам хүртэлх зай: ойр байх тусам холболт хямд; 50 м-ээс ойр дуу чимээ, аюулгүй байдал." },
  { key: "rail", label: "Төмөр зам хүртэл", group: "infra", kind: "curve", unit: "м", weight: 2,
    curve: [[0, 0], [100, 0.3], [500, 1], [3000, 1], [10000, 0.4]],
    hint: "Одоогийн ба төлөвлөгдсөн төмөр зам. Логистикт ойр байх ач холбогдолтой, харин 500 м-ээс ойр дуу чимээ, чичиргээ." },
  { key: "tl", label: "Цахилгааны шугам хүртэл", group: "infra", kind: "curve", unit: "м", weight: 2,
    curve: [[0, 0], [50, 0.4], [150, 1], [3000, 1], [10000, 0.5]],
    hint: "Холболтод ойр байх нь давуу; шугамын доор, хамгаалалтын зурвас дотор барилга барихгүй." },
  { key: "soum_center", label: "Сумын төв хүртэл", group: "infra", kind: "curve", unit: "м", weight: 1,
    curve: [[0, 1], [10000, 1], [30000, 0.4], [60000, 0.1]],
    hint: "Нийгмийн үйлчилгээ (сургууль, эмнэлэг) рүү хүрэх боломж." },
  { key: "plant", label: "Цахилгаан станцаас алслал", group: "infra", kind: "curve", unit: "м", weight: 3,
    curve: [[0, 0], [1000, 0.1], [3000, 0.6], [5000, 1]],
    hint: "Бөөрөлжүүт ЦС (150 м яндан, үнс, дуу чимээ). Эрүүл ахуйн хамгаалалтын бүсийн яг зайг ШАЛГАХ." },
];

export type Flag = "ТААМАГЛАЛ" | "ШАЛГАХ";
export type Exclusion = { key: string; label: string; unit?: string; value: number | ""; flag: Flag; hint: string; toggle?: boolean };

// Хориглох нөхцөл — хангасан нүд шууд 1-р түвшин (Тохиромжгүй). Хоосон = идэвхгүй.
export const EXCLUSIONS: Exclusion[] = [
  { key: "slope", label: "Налуу >", unit: "%", value: 25, flag: "ТААМАГЛАЛ", hint: "25%-иас их налууд барилгажилт, зам хэт өртөгтэй." },
  { key: "flow", label: "Урсацын хуримтлал >", unit: "га", value: 500, flag: "ТААМАГЛАЛ", hint: "Сайр, гуу жалгын гол шугам — үерийн эрсдэл." },
  { key: "plant", label: "Цахилгаан станцаас <", unit: "м", value: 1000, flag: "ШАЛГАХ", hint: "Эрүүл ахуйн хамгаалалтын бүсийн яг зай — норм ШАЛГАХ." },
  { key: "tl", label: "Цахилгааны шугамаас <", unit: "м", value: 40, flag: "ШАЛГАХ", hint: "220 кВ шугамын хамгаалалтын зурвасын өргөн — норм ШАЛГАХ." },
  { key: "rail", label: "Төмөр замаас <", unit: "м", value: 50, flag: "ШАЛГАХ", hint: "Төмөр замын зурвасын өргөн — норм ШАЛГАХ." },
  { key: "road", label: "Авто замаас <", unit: "м", value: "", flag: "ШАЛГАХ", hint: "Замын хамгаалалтын зурвас — норм ШАЛГАХ." },
  { key: "forest", label: "Ойн сан бүхий газар", value: 0, toggle: true, flag: "ШАЛГАХ",
    hint: "Ойн тухай хуулиар хамгаалалттай. Эх давхарга хэт ерөнхий (~3,500 км² полигон) тул анхдагчаар унтраасан — кадастраар ШАЛГАХ." },
];

// ---------- Оноо ----------
export function curveScore(c: Curve, v: number) {
  if (!isFinite(v)) return 0.5;
  if (v <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    const [x1, y1] = c[i - 1], [x2, y2] = c[i];
    if (v <= x2) return y1 + ((y2 - y1) * (v - x1)) / (x2 - x1 || 1);
  }
  return c[c.length - 1][1];
}

// 8 зүг: [нэр, оноо]
const ASPECT_DIRS: [string, number][] = [
  ["Хойд", 0.3], ["Зүүн хойд", 0.45], ["Зүүн", 0.65], ["Зүүн урд", 0.85],
  ["Урд", 1], ["Баруун урд", 0.85], ["Баруун", 0.65], ["Баруун хойд", 0.45],
];
export const FLAT_SLOPE = 2; // %
export const aspectDir = (a: number) => ASPECT_DIRS[Math.round((((a % 360) + 360) % 360) / 45) % 8];
export const ASPECT_TABLE: [string, number][] = [["Хавтгай (< 2%)", 1], ...ASPECT_DIRS];

export const catName = (f: Factor, v: string) => f.names?.[v] ?? v;
/** Ангиллын утга олдоогүй (давхарга хамраагүй) үед саармаг оноо */
export const UNKNOWN_SCORE = 0.5;

// ---------- Бэлтгэл өгөгдөл (нүдний хэмжээ бүрт нэг удаа) ----------
type Ring = XY[];
type Poly = { rings: Ring[]; xmin: number; ymin: number; xmax: number; ymax: number };

export type ZoneInfo = { oid: number; id: number; name: string };

export type Prepared = {
  cell: number;
  n: number; // бүс доторх нүдний тоо
  x: Float64Array; y: Float64Array; zone: Int32Array; // zone = zones[] индекс
  zones: ZoneInfo[];
  zoneRings: XY[][][]; // zones[]-тэй ижил дараалал
  // Суурь grid: нүд i-ийн grid индекс gk[i] = gj * nx + gi; нүдний зүүн доод булан x0 + gi*cell, y0 + gj*cell
  nx: number; ny: number; x0: number; y0: number; gk: Int32Array;
  segs: Record<string, Seg[]>; // зайн эх шугам (road, rail, tl, soum_center, plant) — хоригийн буферт
  num: Record<string, Float64Array>; // slope, aspect, elev(%), elevM, tpi, flow, зай
  cat: Record<string, string[]>; // ангиллын давхаргын утга ("" = хамраагүй)
};

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();

function toPolys(feats: Feat[]): Poly[] {
  return feats.map((f) => {
    const rings = (f.geometry.rings ?? []) as Ring[];
    let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
    for (const r of rings) for (const [x, y] of r) {
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
    return { rings, xmin, ymin, xmax, ymax };
  });
}

/** Олон цагирагтай полигон (нүх орсон) — even-odd дүрэм */
function inPoly(x: number, y: number, p: Poly) {
  if (x < p.xmin || x > p.xmax || y < p.ymin || y > p.ymax) return false;
  let c = false;
  for (const ring of p.rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
  }
  return c;
}

/** D8 урсацын хуримтлал — нүд бүрийн дээд талын талбай (га) */
function flowAccum(elev: Float64Array, nx: number, ny: number, cell: number) {
  const N = nx * ny;
  const to = new Int32Array(N).fill(-1);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    let best = 0, bk = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj;
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii;
      const drop = (elev[k] - elev[kk]) / (di && dj ? Math.SQRT2 : 1);
      if (drop > best) { best = drop; bk = kk; }
    }
    to[k] = bk;
  }
  const order = Array.from({ length: N }, (_, k) => k).sort((a, b) => elev[b] - elev[a]);
  const acc = new Float64Array(N).fill(1);
  for (const k of order) if (to[k] >= 0) acc[to[k]] += acc[k];
  const ha = (cell * cell) / 1e4;
  for (let k = 0; k < N; k++) acc[k] *= ha;
  return acc;
}

const prepCache = new Map<number, Promise<Prepared>>();

export function prepare(cell: number, onStep?: (s: string) => void): Promise<Prepared> {
  if (!prepCache.has(cell)) {
    const p = (async (): Promise<Prepared> => {
      onStep?.("Төлөвлөлтийн бүсүүдийг уншиж байна…");
      const zf = await fetchFeatures(41, ZONE_WHERE, 0, "OBJECTID,ID,Name", ZONE_SERVICE_URL);
      const zones: ZoneInfo[] = zf.map((f) => ({
        oid: Number(f.attributes.OBJECTID), id: Number(f.attributes.ID), name: clean(f.attributes.Name),
      }));
      const zpolys = toPolys(zf);

      const g = await baseGrid(cell, onStep);
      onStep?.("Бүс доторх нүдийг ялгаж байна…");
      const idx: number[] = [], zi: number[] = [];
      for (let k = 0; k < g.cx.length; k++) {
        const z = zpolys.findIndex((p) => inPoly(g.cx[k], g.cy[k], p));
        if (z >= 0) { idx.push(k); zi.push(z); }
      }
      const n = idx.length;
      if (!n) throw new Error("Бүс доторх нүд олдсонгүй");
      const x = Float64Array.from(idx, (k) => g.cx[k]), y = Float64Array.from(idx, (k) => g.cy[k]);

      onStep?.("Урсацын хуримтлал (D8) тооцож байна…");
      const acc = flowAccum(g.elev, g.nx, g.ny, cell);
      const elevM = Float64Array.from(idx, (k) => g.elev[k]);
      let lo = Infinity, hi = -Infinity;
      for (const v of elevM) if (isFinite(v)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
      const num: Record<string, Float64Array> = {
        slope: Float64Array.from(idx, (k) => g.slope[k]),
        aspect: Float64Array.from(idx, (k) => g.aspect[k]),
        elevM,
        elev: elevM.map((v) => (hi > lo ? ((v - lo) / (hi - lo)) * 100 : 50)),
        tpi: Float64Array.from(idx, (k) => g.tpi[k]),
        flow: Float64Array.from(idx, (k) => acc[k]),
      };

      // Зай — бүс доторх нүдэнд л тооцно
      const plant = zpolys[zones.findIndex((z) => z.id === 16)];
      const distSrc: Record<string, { label: string; load: () => Promise<Seg[]>; inside?: Poly }> = {
        road: DIST_SOURCES.road_paved,
        rail: {
          label: "Төмөр зам (одоогийн, төлөвлөгдсөн)",
          load: async () => [
            ...(await DIST_SOURCES.rail.load()),
            ...toSegs(await fetchFeatures(0, "1=1", 30000, "OBJECTID", ZONE_SERVICE_URL)),
          ],
        },
        tl: DIST_SOURCES.tl,
        soum_center: DIST_SOURCES.soum_center,
        plant: {
          label: "Бөөрөлжүүт цахилгаан станц",
          load: async () => (plant ? toSegs([{ attributes: {}, geometry: { rings: plant.rings } }]) : []),
          inside: plant,
        },
      };
      const segs: Record<string, Seg[]> = {};
      for (const [key, src] of Object.entries(distSrc)) {
        onStep?.(`${src.label} хүртэлх зайг тооцож байна…`);
        segs[key] = await src.load();
        const si = new SegIndex(segs[key]);
        num[key] = Float64Array.from({ length: n }, (_, i) =>
          src.inside && inPoly(x[i], y[i], src.inside) ? 0 : si.nearest(x[i], y[i], 80000));
      }

      // Байгаль орчны ангиллын давхарга
      const cat: Record<string, string[]> = {};
      for (const f of FACTORS.filter((f) => f.kind === "cat")) {
        onStep?.(`${f.label} давхаргыг уншиж байна…`);
        const feats = await fetchFeatures(f.layer!, "1=1", 2000, f.field!, undefined, cell / 4);
        const polys = toPolys(feats);
        const vals = feats.map((ft) => clean(ft.attributes[f.field!]));
        cat[f.key] = Array.from({ length: n }, (_, i) => {
          const h = polys.findIndex((p) => inPoly(x[i], y[i], p));
          return h >= 0 ? vals[h] : "";
        });
      }

      return {
        cell, n, x, y, zone: Int32Array.from(zi), zones, zoneRings: zpolys.map((z) => z.rings), num, cat,
        nx: g.nx, ny: g.ny, x0: g.x0, y0: g.y0, gk: Int32Array.from(idx), segs,
      };
    })();
    prepCache.set(cell, p);
    p.catch(() => prepCache.delete(cell));
  }
  return prepCache.get(cell)!;
}

// ---------- Үнэлгээ (жин, хориг солигдоход дахин хурдан тооцно) ----------
export type CellResult = { score: number; level: number; why: string; weak: string };
export type Summary = {
  breaks: number[]; // ашигласан босго
  hist: { area: number[]; step: number }; // хоригоос бусад нүдний онооны тархалт (га), 0–1 хүрээ
  factorMean: Record<string, number>; // шалгуур бүрийн дундаж оноо (0–1)
  cells: CellResult[]; // Prepared-ийн индексээр
  keep: Uint8Array; // 1 = сонгосон бүсэд багтсан нүд
  areas: number[]; // түвшин 1..5, га
  excluded: Record<string, number>; // хоригийн шалтгаан → га
  mean: number;
  byZone: { z: ZoneInfo; areas: number[]; mean: number; total: number }[];
};

export function factorScore(f: Factor, p: Prepared, i: number) {
  if (f.kind === "cat") {
    const v = p.cat[f.key][i];
    return v && f.cats && v in f.cats ? f.cats[v] : UNKNOWN_SCORE;
  }
  if (f.kind === "aspect") return p.num.slope[i] < FLAT_SLOPE ? 1 : aspectDir(p.num.aspect[i])[1];
  return curveScore(f.curve!, p.num[f.key][i]);
}

function excludedBy(e: Exclusion, p: Prepared, i: number) {
  if (e.value === "" || (e.toggle && !e.value)) return false;
  if (e.key === "forest") return p.cat.land_class[i] === "Ойн сан бүхий газар";
  const v = p.num[e.key][i];
  return e.key === "slope" || e.key === "flow" ? v > e.value : v < e.value;
}

export function evaluate(
  p: Prepared, factors: Factor[], excl: Exclusion[], zoneOid: number | null, method: ClassMethod = "relative",
): Summary {
  const active = factors.filter((f) => f.weight > 0);
  const W = active.reduce((s, f) => s + f.weight, 0) || 1;
  const ha = (p.cell * p.cell) / 1e4;
  const cells: CellResult[] = new Array(p.n);
  const keep = new Uint8Array(p.n);
  const areas = [0, 0, 0, 0, 0];
  const excluded: Record<string, number> = {};
  const zs = p.zones.map((z) => ({ z, areas: [0, 0, 0, 0, 0], sum: 0, total: 0 }));
  let sum = 0, cnt = 0;
  // 1-р алхам: нийлбэр оноо, хориг
  let lo = Infinity, hi = -Infinity;
  const fsum: Record<string, number> = Object.fromEntries(active.map((f) => [f.key, 0]));
  for (let i = 0; i < p.n; i++) {
    const z = zs[p.zone[i]];
    if (zoneOid != null && z.z.oid !== zoneOid) continue;
    keep[i] = 1;
    let score = 0, weak = "", loss = -1;
    for (const f of active) {
      const s = factorScore(f, p, i);
      fsum[f.key] += s;
      score += (f.weight / W) * s;
      const l = f.weight * (1 - s);
      if (l > loss) { loss = l; weak = f.label; }
    }
    const hit = excl.find((e) => excludedBy(e, p, i));
    const why = hit ? `${hit.label}${hit.toggle ? "" : ` ${hit.value} ${hit.unit ?? ""}`}`.trim() : "";
    cells[i] = { score, level: 1, why, weak: loss > 0 ? weak : "" };
    if (!hit) { lo = Math.min(lo, score); hi = Math.max(hi, score); }
  }
  // 2-р алхам: түвшин тогтоох
  const breaks = method === "relative" && hi > lo ? [0.2, 0.4, 0.6, 0.8].map((t) => lo + t * (hi - lo)) : BREAKS;
  const HB = 50;
  const hist = new Array(HB).fill(0);
  for (let i = 0; i < p.n; i++) {
    if (!keep[i]) continue;
    const c = cells[i], z = zs[p.zone[i]];
    if (!c.why) hist[Math.min(HB - 1, Math.max(0, Math.floor(c.score * HB)))] += ha;
    c.level = c.why ? 1 : levelOf(c.score, breaks);
    areas[c.level - 1] += ha;
    if (c.why) excluded[c.why] = (excluded[c.why] ?? 0) + ha;
    z.areas[c.level - 1] += ha; z.sum += c.score; z.total += ha;
    sum += c.score; cnt++;
  }
  return {
    breaks, hist: { area: hist, step: 1 / HB },
    factorMean: Object.fromEntries(active.map((f) => [f.key, cnt ? fsum[f.key] / cnt : 0])),
    cells, keep, areas, excluded, mean: cnt ? sum / cnt : 0,
    byZone: zs.filter((z) => z.total > 0)
      .map((z) => ({ z: z.z, areas: z.areas, total: z.total, mean: z.sum / (z.total / ha) })),
  };
}

/** Бүсийн дундаж түвшин (талбайгаар жигнэсэн) */
export const meanLevel = (areas: number[]) => {
  const t = areas.reduce((s, v) => s + v, 0);
  return t ? areas.reduce((s, v, i) => s + v * (i + 1), 0) / t : 0;
};
