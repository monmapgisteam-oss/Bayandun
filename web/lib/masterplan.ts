// 05. Цогц төлөвлөлт — 16 бүсийн функцийн уялдаа, ухаалаг бүсчлэл (байршил солих), ирээдүйн хотын нэгдсэн үзүүлэлт.
// 1 (суурьшил), 7 (кокс хими), 16 (ЦС) бүсийн байршил тогтмол; бусад 13 функцийг бүсийн полигонд дахин хуваарилж болно.
// Үйлдвэр бүрийн ажлын байр, ус, цахилгаан, ачааны тоо — ТЭЗҮ байхгүй тул бүгд ТААМАГЛАЛ, самбараас засна.
import { bufPoly, diff, inter, area, labelPt, unionAll, type Rings, type XY } from "./geom";
import { fetchFeatures, PAVED_WHERE, ringSegs, SegIndex, toSegs, type Seg } from "./geo";
import { SITE_ID, ZONE_LAYER_URL, ZONE_SERVICE_URL, ZONE_WHERE } from "./layers";
import { cleanName } from "./zones";

export type Cls = "I" | "II" | "III" | "IV" | "V";
// Эрүүл ахуйн хамгаалалтын бүсийн өргөн (м) — SanPiN 2.2.1/2.1.1.1200-03 жишиг; 3-р хэсгийн NORM.sanitary-тай ижил
export const SZZ: Record<Cls, number> = { I: 1000, II: 500, III: 300, IV: 100, V: 50 };

export type Group = "live" | "green" | "energy" | "coal" | "chem" | "tech" | "logi" | "power";
export const GROUP: Record<Group, { label: string; color: string }> = {
  live: { label: "Суурьшил", color: "#F2DCA2" },
  green: { label: "Ногоон зурвас", color: "#75CB98" },
  energy: { label: "Сэргээгдэх эрчим хүч", color: "#7DD3FC" },
  coal: { label: "Нүүрсний боловсруулалт", color: "#8D6E63" },
  chem: { label: "Химийн үйлдвэр", color: "#E57373" },
  tech: { label: "Технологи, судалгаа", color: "#9575CD" },
  logi: { label: "Тээвэр, логистик", color: "#90A4AE" },
  power: { label: "Цахилгаан станц", color: "#546E7A" },
};

/** Функц (анхны бүсийн ID-аар). jobs — ажлын байр, water — м³/хон, mw — цахилгааны ачаалал, heat — дулаан/уур (МВт), freight — сая тн/жил */
export type Fn = {
  id: number; name: string; short: string; group: Group; color: string; cls: Cls | null; fixed?: boolean;
  jobs: number; water: number; mw: number; heat: number; freight: number;
};

// ТААМАГЛАЛ: тоон утгууд нь ижил төрлийн үйлдвэрийн эрэмбийн (order-of-magnitude) жишиг — ТЭЗҮ-ээр солино.
// Ангилал — SanPiN 1200-03 жишиг; кокс химийг I гэж 3-р хэсэгт заасан, бусдыг ШАЛГАХ.
export const FNS: Fn[] = [
  { id: 1, name: "Суурьшлын бүс", short: "Суурьшил", group: "live", color: "#F2DCA2", cls: null, fixed: true, jobs: 0, water: 0, mw: 0, heat: 0, freight: 0 },
  { id: 2, name: "Суурингийн ногоон зурвас", short: "Ногоон зурвас", group: "green", color: "#75CB98", cls: null, jobs: 20, water: 0, mw: 0, heat: 0, freight: 0 },
  { id: 3, name: "Салхин цахилгаан станц", short: "Салхин ЦС", group: "energy", color: "#7DD3FC", cls: null, jobs: 60, water: 0, mw: 0, heat: 0, freight: 0 },
  { id: 4, name: "Нарны ЦС ба ногоон устөрөгч", short: "Нар + H₂", group: "energy", color: "#FACC15", cls: "III", jobs: 120, water: 1500, mw: 0, heat: 0, freight: 0.05 },
  { id: 5, name: "Хиймэл хөрс, бордооны үйлдвэр", short: "Бордоо", group: "chem", color: "#A3B18A", cls: "III", jobs: 150, water: 300, mw: 3, heat: 0, freight: 0.2 },
  { id: 6, name: "Нүүрс хатаах үйлдвэр", short: "Нүүрс хатаах", group: "coal", color: "#8D6E63", cls: "III", jobs: 250, water: 500, mw: 15, heat: 40, freight: 3 },
  { id: 7, name: "Кокс химийн үйлдвэр", short: "Кокс хими", group: "coal", color: "#5D4037", cls: "I", fixed: true, jobs: 1500, water: 8000, mw: 40, heat: 0, freight: 3 },
  { id: 8, name: "Метанолын үйлдвэр", short: "Метанол", group: "chem", color: "#EF5350", cls: "I", jobs: 400, water: 6000, mw: 30, heat: 0, freight: 0.6 },
  { id: 9, name: "Шингэрүүлсэн хийн үйлдвэр", short: "Шингэрүүлсэн хий", group: "chem", color: "#FF8A65", cls: "II", jobs: 350, water: 3000, mw: 40, heat: 0, freight: 0.4 },
  { id: 10, name: "Хүхрийн хүчлийн үйлдвэр", short: "Хүхрийн хүчил", group: "chem", color: "#FBC02D", cls: "II", jobs: 200, water: 1500, mw: 5, heat: 0, freight: 0.4 },
  { id: 11, name: "Аммонийн нитратын үйлдвэр", short: "Аммонийн нитрат", group: "chem", color: "#EC407A", cls: "I", jobs: 400, water: 3000, mw: 25, heat: 0, freight: 0.5 },
  { id: 12, name: "Нүүрс шингэрүүлэлтийн үйлдвэр", short: "Нүүрс шингэрүүлэх", group: "coal", color: "#3E2723", cls: "I", jobs: 1200, water: 10000, mw: 60, heat: 0, freight: 1.5 },
  { id: 13, name: "R&D Center", short: "R&D", group: "tech", color: "#9575CD", cls: "V", jobs: 300, water: 150, mw: 3, heat: 3, freight: 0 },
  { id: 14, name: "Data Center", short: "Data Center", group: "tech", color: "#5C6BC0", cls: "V", jobs: 100, water: 500, mw: 50, heat: 0, freight: 0 },
  { id: 15, name: "Төмөр зам, логистикийн талбай", short: "Логистик", group: "logi", color: "#90A4AE", cls: "III", jobs: 400, water: 100, mw: 5, heat: 1, freight: 0 },
  { id: 16, name: "Бөөрөлжүүт цахилгаан станц", short: "Бөөрөлжүүт ЦС", group: "power", color: "#546E7A", cls: "II", fixed: true, jobs: 540, water: 0, mw: 0, heat: 0, freight: 0 },
];
export const FN = Object.fromEntries(FNS.map((f) => [f.id, f])) as Record<number, Fn>;
/** Төлөвлөж буй функц (суурьшил, одоо баригдаж буй ЦС-аас бусад) — байршил тогтмол эсэхээс үл хамаарна */
export const isInd = (f: Fn) => f.id !== 1 && f.id !== 16;

export type LinkKind = "coal" | "gas" | "h2" | "chem" | "power" | "heat" | "people" | "product" | "green";
export const LINK: Record<LinkKind, { label: string; color: string }> = {
  coal: { label: "Нүүрс", color: "#6D4C41" },
  gas: { label: "Хий (коксын хий, синтез хий)", color: "#FB8C00" },
  h2: { label: "Устөрөгч", color: "#29B6F6" },
  chem: { label: "Химийн түүхий эд", color: "#E53935" },
  power: { label: "Цахилгаан", color: "#F2B705" },
  heat: { label: "Дулаан, уур", color: "#E03E2D" },
  people: { label: "Хүн, ажилчид", color: "#8E24AA" },
  product: { label: "Бүтээгдэхүүн → логистик", color: "#607D8B" },
  green: { label: "Хамгаалалтын ногоон", color: "#43A047" },
};
/** Үйлдвэрийн симбиоз (industrial symbiosis) — w: урсгалын харьцангуй жин 1–3 (ТААМАГЛАЛ) */
export type Link = { a: number; b: number; kind: LinkKind; w: number; note: string };
export const LINKS: Link[] = [
  { a: 16, b: 6, kind: "coal", w: 3, note: "Уурхай/ЦС-ийн нүүрс → хатаах" },
  { a: 16, b: 6, kind: "heat", w: 2, note: "ЦС-ийн уур, хаягдал дулаан → нүүрс хатаах" },
  { a: 6, b: 7, kind: "coal", w: 3, note: "Хатаасан нүүрс → коксжуулах" },
  { a: 6, b: 12, kind: "coal", w: 3, note: "Хатаасан нүүрс → шингэрүүлэлт" },
  { a: 6, b: 9, kind: "coal", w: 2, note: "Нүүрс → хийжүүлэлт" },
  { a: 7, b: 8, kind: "gas", w: 2, note: "Коксын хий → метанолын синтез" },
  { a: 7, b: 10, kind: "chem", w: 2, note: "Коксын хийн H₂S, хүхэр → хүхрийн хүчил" },
  { a: 7, b: 11, kind: "chem", w: 1, note: "Коксын хийн аммиак → аммонийн нитрат" },
  { a: 12, b: 9, kind: "gas", w: 1, note: "Шингэрүүлэлтийн дагалдах хий" },
  { a: 4, b: 11, kind: "h2", w: 2, note: "Ногоон H₂ → аммиак → аммонийн нитрат" },
  { a: 4, b: 8, kind: "h2", w: 1, note: "Ногоон H₂ → метанол" },
  { a: 4, b: 12, kind: "h2", w: 1, note: "H₂ → нүүрс шингэрүүлэлт (гидрогенжүүлэлт)" },
  { a: 10, b: 5, kind: "chem", w: 1, note: "Хүхрийн хүчил → бордоо" },
  { a: 11, b: 5, kind: "chem", w: 1, note: "Азот → бордоо" },
  { a: 7, b: 15, kind: "product", w: 2, note: "Кокс → төмөр зам" },
  { a: 12, b: 15, kind: "product", w: 2, note: "Шингэн түлш → төмөр зам" },
  { a: 8, b: 15, kind: "product", w: 1, note: "Метанол → төмөр зам" },
  { a: 9, b: 15, kind: "product", w: 1, note: "Хий → тээвэр" },
  { a: 11, b: 15, kind: "product", w: 1, note: "Аммонийн нитрат → тээвэр" },
  { a: 5, b: 15, kind: "product", w: 1, note: "Бордоо → тээвэр" },
  { a: 16, b: 14, kind: "power", w: 2, note: "ЦС → Data Center (тасралтгүй цахилгаан)" },
  { a: 3, b: 4, kind: "power", w: 1, note: "Салхины цахилгаан → электролиз" },
  { a: 3, b: 16, kind: "power", w: 1, note: "Салхин ЦС → дэд станц, сүлжээ" },
  { a: 16, b: 13, kind: "heat", w: 1, note: "ЦС-ийн дулаан → R&D" },
  { a: 1, b: 2, kind: "green", w: 3, note: "Ногоон зурвас суурьшлыг хүрээлнэ" },
  { a: 1, b: 13, kind: "people", w: 2, note: "R&D — суурьшилд ойр" },
  { a: 1, b: 14, kind: "people", w: 1, note: "Data Center — ажилчид" },
  { a: 1, b: 15, kind: "people", w: 1, note: "Логистикийн ажилчид" },
  { a: 13, b: 14, kind: "people", w: 1, note: "R&D ↔ Data Center" },
];

export type Params = {
  plannedPop?:number; plannedWaterDom?:number; plannedWindMW?:number; plannedSolarMW?:number;
  fn: Record<number, Pick<Fn, "jobs" | "water" | "mw" | "heat" | "freight" | "cls">>;
  // Хүн ам — 3-р хэсгийн анхдагчтай ижил
  jobsMine: number; famCoef: number; svcMult: number; hhSize: number; m2pp: number; netRatio: number; densGross: number;
  kinder: number; school: number; bedsPer1000: number;
  // Ус
  waterLpd: number; sewShare: number; indSew: number; reuse: number; irrM3ha: number; irrShare: number;
  // Эрчим хүч
  kwhPP: number; heatWm2: number; plantMW: number; plantOwn: number; plantAvail: number; indLoad: number;
  windMWkm2: number; windCF: number; solarMWha: number; solarLand: number; solarCF: number; h2Share: number; h2kWh: number;
  // Тээвэр
  railShare: number; trainT: number; truckT: number; shiftShare: number; busShare: number; busCap: number; detour: number;
  // Байршлын оновчлол
  windFrom: number; kFlow: number; kSan: number; kWind: number; kRail: number; kArea: number;
};

export const DEFAULT_P: Params = {
  fn: Object.fromEntries(FNS.map((f) => [f.id, { jobs: f.jobs, water: f.water, mw: f.mw, heat: f.heat, freight: f.freight, cls: f.cls }])),
  jobsMine: 500, famCoef: 2.5, svcMult: 1.3, hhSize: 3.4, m2pp: 25, netRatio: 0.75, densGross: 150,
  kinder: 60, school: 150, bedsPer1000: 6,
  waterLpd: 200, sewShare: 95, indSew: 30, reuse: 80, irrM3ha: 15, irrShare: 30,
  kwhPP: 2000, heatWm2: 100, plantMW: 600, plantOwn: 10, plantAvail: 85, indLoad: 85,
  windMWkm2: 3, windCF: 30, solarMWha: 0.5, solarLand: 70, solarCF: 17, h2Share: 80, h2kWh: 55,
  railShare: 80, trainT: 3000, truckT: 30, shiftShare: 60, busShare: 70, busCap: 50, detour: 1.2,
  windFrom: 315, kFlow: 1, kSan: 5, kWind: 2, kRail: 1, kArea: 10,
};

// ---------- Геометр ----------
export type Geo = {
  ids: number[]; rings: Record<number, Rings>; ha: Record<number, number>; c: Record<number, XY>;
  pd: (a: number, b: number) => number; // полигон хоорондын хамгийн бага зай (м)
  rail: Record<number, { d: number; from: XY; to: XY }>; // хамгийн ойрын төмөр зам (одоо + төлөвлөсөн)
  road: Record<number, { d: number; from: XY; to: XY }>; // хамгийн ойрын хучилттай зам
  railSegs: Seg[]; roadSegs: Seg[];
  site: Rings; // ID = 17 "Бүх талбай" — шинэ бүсчлэлийн хуваах талбай (байхгүй бол бүсүүдийн нэгдэл)
};

function nearestOnSegs(pts: XY[], segs: Seg[]): { d: number; from: XY; to: XY } {
  let best = { d: Infinity, from: pts[0], to: pts[0] };
  for (const p of pts) for (const s of segs) {
    const ex = s[2] - s[0], ey = s[3] - s[1], l2 = ex * ex + ey * ey;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - s[0]) * ex + (p[1] - s[1]) * ey) / l2)) : 0;
    const q: XY = [s[0] + ex * t, s[1] + ey * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best.d) best = { d, from: p, to: q };
  }
  return best;
}
const thin = (r: Rings, n = 400): XY[] => { const pts = r.flat(); const k = Math.max(1, Math.ceil(pts.length / n)); return pts.filter((_, i) => i % k === 0); };

export async function loadGeo(onStep?: (s: string) => void): Promise<Geo> {
  onStep?.("Бүсийн полигон уншиж байна…");
  const q = new URLSearchParams({ where: `(${ZONE_WHERE}) OR ID = ${SITE_ID}`, outFields: "ID,Name,Hectare", returnGeometry: "true", outSR: "32649", f: "json" });
  const d = await (await fetch(`${ZONE_LAYER_URL}/query?${q}`)).json();
  if (d.error) throw new Error(d.error.message);
  const rings: Record<number, Rings> = {}, ha: Record<number, number> = {};
  let site: Rings = [];
  for (const f of d.features as { attributes: Record<string, unknown>; geometry: { rings: Rings } }[]) {
    const id = Number(f.attributes.ID);
    if (id === SITE_ID) { site = f.geometry.rings; continue; }
    if (!FN[id]) { console.warn("Үл мэдэх бүс", id, cleanName(f.attributes.Name)); continue; }
    // Баяндун: ижил ID-тай хэд хэдэн хувилбарыг нэгтгэнэ (замын коридор бүгдийг тойрно)
    rings[id] = rings[id] ? unionAll([rings[id], f.geometry.rings]) : f.geometry.rings; ha[id] = area(rings[id]) / 1e4;
  }
  if(site.length)for(const [key,value] of Object.entries(rings)){const id=Number(key);rings[id]=id===16?value:inter(value,site);ha[id]=area(rings[id])/1e4;}
  // Баяндун: зөвхөн суурьшлын бүс (ID 1) — Бөөрөлжүүт-ын бусад 15 функцын бүс байхгүй
  if (!rings[1]) throw new Error("Бүс олдсонгүй: 1 (Суурьшлын бүс)");
  if (!site.length) console.warn(`Бүх талбай (ID = ${SITE_ID}) олдсонгүй — бүсүүдийн нэгдлийг хуваах талбай болгоно`);
  onStep?.("Төмөр зам (одоо + төлөвлөсөн), хучилттай зам…");
  const [railE, railP, road] = await Promise.all([
    fetchFeatures(26, "1=1", 30000, "OBJECTID").catch(() => []),
    fetchFeatures(0, "1=1", 30000, "OBJECTID", ZONE_SERVICE_URL).catch(() => []),
    fetchFeatures(25, PAVED_WHERE, 20000, "roadtype").catch(() => []),
  ]);
  return buildGeo(rings, ha, toSegs([...railE, ...railP]), toSegs(road), site);
}

/** Полигоноос Geo (зай, төв, төмөр зам/зам хүртэл) — дахин бүсчлэлийн шинэ полигонд ч ашиглана */
export function buildGeo(rings: Record<number, Rings>, ha: Record<number, number>, railSegs: Seg[], roadSegs: Seg[], site: Rings = []): Geo {
  const ids = Object.keys(rings).map(Number).sort((a, b) => a - b);
  const c: Record<number, XY> = Object.fromEntries(ids.map((i) => [i, labelPt(rings[i])]));
  const idx = Object.fromEntries(ids.map((i) => [i, new SegIndex(rings[i].flatMap(ringSegs), 500)]));
  const pdC = new Map<string, number>();
  const pd = (a: number, b: number) => {
    if (a === b) return 0;
    const k = a < b ? `${a},${b}` : `${b},${a}`;
    if (!pdC.has(k)) {
      let m = Infinity;
      for (const p of thin(rings[a])) m = Math.min(m, idx[b].nearest(p[0], p[1], 40000));
      for (const p of thin(rings[b])) m = Math.min(m, idx[a].nearest(p[0], p[1], 40000));
      pdC.set(k, m);
    }
    return pdC.get(k)!;
  };
  const rail: Geo["rail"] = {}, rd: Geo["road"] = {};
  for (const i of ids) {
    const pts = thin(rings[i], 150);
    rail[i] = railSegs.length ? nearestOnSegs(pts, railSegs) : { d: NaN, from: c[i], to: c[i] };
    rd[i] = roadSegs.length ? nearestOnSegs(pts, roadSegs) : { d: NaN, from: c[i], to: c[i] };
  }
  return { ids, rings, ha, c, pd, rail, road: rd, railSegs, roadSegs, site };
}

// ---------- Байршлын үнэлгээ ба оновчлол ----------
/** assign: полигоны ID → функцийн ID */
export type Assign = Record<number, number>;
export const IDENTITY: Assign = Object.fromEntries(FNS.map((f) => [f.id, f.id]));
export const whereOf = (a: Assign) => Object.fromEntries(Object.entries(a).map(([p, f]) => [f, Number(p)])) as Record<number, number>;

export type Cost = { flow: number; san: number; wind: number; rail: number; area: number; total: number };
const COMPASS = (deg: number): XY => [Math.sin((deg * Math.PI) / 180), Math.cos((deg * Math.PI) / 180)];

export function costOf(a: Assign, g: Geo, P: Params): Cost {
  const w = whereOf(a);
  let flow = 0, san = 0, wind = 0, rail = 0, ar = 0;
  for (const l of LINKS) {
    const pa = g.c[w[l.a]], pb = g.c[w[l.b]];
    flow += l.w * Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) / 1000;
  }
  const toDir = COMPASS(P.windFrom + 180), home = w[1];
  // Логистикийн талбай бүх ачааг дамжуулна — төмөр замд ойр байх шаардлага нийт ачаагаар
  const freightAll = FNS.reduce((s, f) => s + (isInd(f) ? P.fn[f.id].freight : 0), 0);
  for (const f of FNS) {
    if (!isInd(f)) continue;
    const p = w[f.id], fp = P.fn[f.id];
    if (fp.cls && f.id !== 2) {
      const d = g.pd(p, home);
      san += Math.max(0, SZZ[fp.cls] - d) / 100;
      if (fp.cls === "I" || fp.cls === "II") {
        const v: XY = [g.c[home][0] - g.c[p][0], g.c[home][1] - g.c[p][1]], L = Math.hypot(...v) || 1;
        const align = (v[0] * toDir[0] + v[1] * toDir[1]) / L;
        if (align > 0) wind += align * (fp.cls === "I" ? 2 : 1) * 10 / (L / 1000 + 2);
      }
    }
    const fr = f.id === 15 ? freightAll : fp.freight;
    if (fr > 0 && Number.isFinite(g.rail[p].d)) rail += fr * g.rail[p].d / 1000;
    const need = g.ha[f.id], have = g.ha[p];
    if (have < need * 0.9) ar += ((need * 0.9 - have) / need) * 100;
    else if (have > need * 2) ar += (have / need - 2) * 10;
  }
  const total = P.kFlow * flow + P.kSan * san + P.kWind * wind + P.kRail * rail + P.kArea * ar;
  return { flow, san, wind, rail, area: ar, total };
}


// ---------- Ирээдүйн хот ----------
type Edge = XY[];
/** Prim MST — root-оос бусад цэгийг хамгийн богино мод сүлжээгээр холбоно */
function mst(pts: XY[], root = 0): Edge[] {
  if (pts.length < 2) return [];
  const inT = new Array(pts.length).fill(false), best = new Array(pts.length).fill(Infinity), par = new Array(pts.length).fill(-1);
  best[root] = 0;
  const out: Edge[] = [];
  for (let n = 0; n < pts.length; n++) {
    let u = -1;
    for (let i = 0; i < pts.length; i++) if (!inT[i] && (u < 0 || best[i] < best[u])) u = i;
    inT[u] = true;
    if (par[u] >= 0) out.push([pts[par[u]], pts[u]]);
    for (let v = 0; v < pts.length; v++) {
      if (inT[v]) continue;
      const d = Math.hypot(pts[u][0] - pts[v][0], pts[u][1] - pts[v][1]);
      if (d < best[v]) { best[v] = d; par[v] = u; }
    }
  }
  return out;
}
const lenKm = (e: Edge[]) => e.reduce((s, [a, b]) => s + Math.hypot(a[0] - b[0], a[1] - b[1]), 0) / 1000;

export type Trunk = "road" | "rail" | "power" | "water" | "sewer" | "heat";
export const TRUNK: Record<Trunk, { label: string; color: string }> = {
  road: { label: "Бүс хоорондын гол зам", color: "#E4572E" },
  rail: { label: "Төмөр замын салаа", color: "#37474F" },
  power: { label: "Цахилгааны гол шугам", color: "#F2B705" },
  water: { label: "Усан хангамжийн гол шугам", color: "#2F80ED" },
  sewer: { label: "Бохирын гол шугам → цэвэрлэх байгууламж", color: "#8B5A2B" },
  heat: { label: "Дулааны гол шугам", color: "#E03E2D" },
};

export type Future = {
  where: Record<number, number>;
  jobs: number; jobsInd: number; pop: number; hh: number; resNeedHa: number; resHa: number; gfaRes: number;
  kinder: number; school: number; beds: number;
  waterDom: number; waterInd: number; sewer: number; reuseM3: number; irrM3: number;
  mwInd: number; gwhInd: number; gwhDom: number; gwhDemand: number; gwhPlant: number; windMW: number; gwhWind: number;
  solarMW: number; gwhSolar: number; h2t: number; gwhGrid: number; heatDom: number; heatInd: number;
  freightMt: number; trains: number; trucks: number; commuters: number; buses: number; pkm: number;
  trunks: Record<Trunk, { edges: Edge[]; km: number }>;
  railSpurs: { fn: number; km: number }[];
  san: { fn: number; need: number; d: number; ok: boolean }[];
  zonesTbl: { poly: number; fn: number; ha: number; need: number; jobs: number; water: number; mw: number; freight: number; rail: number; road: number }[];
};

export function future(a: Assign, g: Geo, P: Params): Future {
  const w = whereOf(a), F = (id: number) => P.fn[id];
  const ind = FNS.filter(isInd);
  const jobsInd = ind.reduce((s, f) => s + F(f.id).jobs, 0);
  const jobs = jobsInd + P.jobsMine + F(16).jobs;
  const pop = P.plannedPop ?? jobs * P.famCoef * P.svcMult, hh = pop / P.hhSize;
  const gfaRes = (pop * P.m2pp) / P.netRatio;
  const waterDom = P.plannedWaterDom ?? (pop * P.waterLpd) / 1000, waterInd = ind.reduce((s, f) => s + F(f.id).water, 0);
  const sewer = (waterDom * P.sewShare) / 100 + (waterInd * P.indSew) / 100;
  const mwInd = ind.reduce((s, f) => s + F(f.id).mw, 0);
  const gwhInd = (mwInd * 8760 * P.indLoad) / 100 / 1000, gwhDom = (pop * P.kwhPP) / 1e6;
  const windMW = P.plannedWindMW ?? (g.ha[w[3]] / 100) * P.windMWkm2, gwhWind = (windMW * 8760 * P.windCF) / 100 / 1000;
  const solarMW = P.plannedSolarMW ?? g.ha[w[4]] * (P.solarLand / 100) * P.solarMWha, gwhSolar = (solarMW * 8760 * P.solarCF) / 100 / 1000;
  const gwhPlant = (P.plantMW * (1 - P.plantOwn / 100) * 8760 * P.plantAvail) / 100 / 1000;
  const h2t = (gwhSolar * (P.h2Share / 100) * 1e6) / P.h2kWh / 1000;
  const gwhDemand = gwhInd + gwhDom + gwhSolar * (P.h2Share / 100);
  const freightMt = ind.reduce((s, f) => s + F(f.id).freight, 0);
  const commuters = jobs * (P.shiftShare / 100);
  const pkm = ind.reduce((s, f) => s + F(f.id).jobs * 2 * (Math.hypot(g.c[w[f.id]][0] - g.c[w[1]][0], g.c[w[f.id]][1] - g.c[w[1]][1]) / 1000) * P.detour, 0);

  // Гол шугам: эх үүсвэрээс хэрэглэгч бүс рүү мод сүлжээ
  const tree = (root: number, fns: number[]) => { const pts = [root, ...fns.filter((f) => f !== root)].map((f) => g.c[w[f]]); const e = mst(pts, 0); return { edges: e, km: lenKm(e) * P.detour }; };
  const allIds = FNS.map((f) => f.id);
  const roadTree = tree(1, allIds);
  // Хамгийн ойрын хучилттай зам руу холбогч
  const gate = allIds.map((f) => g.road[w[f]]).filter((r) => Number.isFinite(r.d)).sort((x, y) => x.d - y.d)[0];
  if (gate && gate.d > 50) { roadTree.edges.push([gate.from, gate.to]); roadTree.km += (gate.d / 1000) * P.detour; }
  const railSpurs = ind.filter((f) => F(f.id).freight >= 0.3 || f.id === 15).map((f) => ({ fn: f.id, km: Number.isFinite(g.rail[w[f.id]].d) ? g.rail[w[f.id]].d / 1000 : 0 }));
  const railEdges: Edge[] = railSpurs.filter((s) => s.km > 0.05).map((s) => [g.rail[w[s.fn]].from, g.rail[w[s.fn]].to]);
  const trunks: Future["trunks"] = {
    road: roadTree,
    rail: { edges: railEdges, km: railSpurs.reduce((s, r) => s + r.km, 0) * P.detour },
    power: tree(16, [1, ...ind.filter((f) => F(f.id).mw > 0 || f.id === 3 || f.id === 4).map((f) => f.id)]),
    // ДУТУУ ӨГӨГДӨЛ: усны эх үүсвэр — уурхайн ус шүүрүүлэлт (ЦС-ийн орчим) гэж үзэв
    water: tree(16, [1, ...ind.filter((f) => F(f.id).water > 0).map((f) => f.id)]),
    // Цэвэрлэх байгууламж ногоон зурвасын бүсэд — цэвэршүүлсэн усыг ногоон байгууламжид (docs/project_context.md)
    sewer: tree(2, [1, ...ind.filter((f) => F(f.id).water > 0 && f.id !== 2).map((f) => f.id)]),
    heat: tree(16, [1, ...ind.filter((f) => F(f.id).heat > 0).map((f) => f.id)]),
  };
  const san = ind.filter((f) => F(f.id).cls && f.id !== 2).map((f) => {
    const need = SZZ[F(f.id).cls!], d = g.pd(w[f.id], w[1]);
    return { fn: f.id, need, d, ok: d >= need };
  });
  const irrM3 = g.ha[w[2]] * (P.irrShare / 100) * P.irrM3ha;
  return {
    where: w, jobs, jobsInd, pop, hh, gfaRes, resNeedHa: pop / P.densGross, resHa: g.ha[w[1]],
    kinder: (pop / 1000) * P.kinder, school: (pop / 1000) * P.school, beds: (pop / 1000) * P.bedsPer1000,
    waterDom, waterInd, sewer, reuseM3: (sewer * P.reuse) / 100, irrM3,
    mwInd, gwhInd, gwhDom, gwhDemand, gwhPlant, windMW, gwhWind, solarMW, gwhSolar, h2t,
    gwhGrid: gwhPlant + gwhWind + gwhSolar - gwhDemand,
    heatDom: (gfaRes * P.heatWm2) / 1e6, heatInd: ind.reduce((s, f) => s + F(f.id).heat, 0),
    freightMt, trains: (freightMt * 1e6 * (P.railShare / 100)) / 365 / P.trainT, trucks: (freightMt * 1e6 * (1 - P.railShare / 100)) / 365 / P.truckT,
    commuters, buses: Math.ceil((commuters * (P.busShare / 100)) / P.busCap), pkm,
    trunks, railSpurs, san,
    zonesTbl: g.ids.map((p) => {
      const f = a[p], fp = F(f);
      return { poly: p, fn: f, ha: g.ha[p], need: g.ha[f], jobs: fp.jobs, water: fp.water, mw: fp.mw, freight: fp.freight, rail: g.rail[p].d / 1000, road: g.road[p].d / 1000 };
    }),
  };
}

/** Эрүүл ахуйн бүсийн цагираг ба суурьшилтай давхцсан хэсэг (газрын зурагт) */
export function szzRings(a: Assign, g: Geo, P: Params) {
  const w = whereOf(a), home = g.rings[w[1]];
  return FNS.filter((f) => isInd(f) && f.id !== 2 && P.fn[f.id].cls).map((f) => {
    const r = g.rings[w[f.id]], m = SZZ[P.fn[f.id].cls!];
    const ring = diff(bufPoly(r, m), r), hit = inter(ring, home);
    return { fn: f.id, m, ring, hit, hitHa: area(hit) / 1e4 };
  });
}

/** Санхүүжилтийн (06) тоо хэмжээ — бүс хоорондын гол дэд бүтэц, хүн амын хэрэгцээ. Хороолол доторх шугам 03-аас орно. */
export function masterQty(f: Future, g: Geo): { qty: Record<string, number>; info: Record<string, number> } {
  const w = f.where;
  const indHa = FNS.filter((x) => isInd(x) && x.group !== "green" && x.group !== "energy").reduce((s, x) => s + g.ha[w[x.id]], 0);
  return {
    qty: {
      gfaRes: f.gfaRes, kinderSeat: f.kinder, schoolSeat: f.school, bed: f.beds,
      roadTrunk: f.trunks.road.km, railSpur: f.trunks.rail.km,
      waterMain: f.trunks.water.km, sewerMain: f.trunks.sewer.km, heatMain: f.trunks.heat.km, powerMain: f.trunks.power.km,
      waterCap: f.waterDom + f.waterInd, wwtpCap: f.sewer, substation: f.mwInd + (f.gwhDom * 1000) / 8760,
      windMW: f.windMW, solarMW: f.solarMW, protectHa: g.ha[w[2]], indPrepHa: indHa, buses: f.buses,
    },
    info: { pop: f.pop, hh: f.hh, ha: Object.values(g.ha).reduce((s, x) => s + x, 0), jobs: f.jobs },
  };
}

// ---------- Шалтгаан: функцийн анхны ба шинэ байршлын харьцуулалт ----------
export type Why = { label: string; old: string; now: string; better: boolean | null; note?: string };
/** Функц f-ийн байршил, талбайн шалтгааныг анхны (gOld, aOld) ба шинэ (gNew, aNew) бүсчлэлээр харьцуулна */
export function explain(f: number, gOld: Geo, aOld: Assign, gNew: Geo, aNew: Assign, P: Params): { rows: Why[]; delta: Cost; costOld: Cost; costNew: Cost } {
  const wo = whereOf(aOld), wn = whereOf(aNew), fp = P.fn[f];
  const km = (v: number) => `${(v / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })} км`;
  const ha = (v: number) => `${v.toLocaleString("en-US", { maximumFractionDigits: 0 })} га`;
  const cmp = (o: number, n: number, lowerBetter = true) => (Math.abs(o - n) < 1e-6 ? null : lowerBetter ? n < o : n > o);
  const d = (g: Geo, w: Record<number, number>, a: number, b: number) => Math.hypot(g.c[w[a]][0] - g.c[w[b]][0], g.c[w[a]][1] - g.c[w[b]][1]);
  const rows: Why[] = [];
  rows.push({ label: "Талбай", old: ha(gOld.ha[wo[f]]), now: ha(gNew.ha[wn[f]]), better: null });
  if (fp.cls && isInd(FN[f]) && f !== 2) {
    const o = gOld.pd(wo[f], wo[1]), n = gNew.pd(wn[f], wn[1]), need = SZZ[fp.cls];
    rows.push({ label: `Суурьшил хүртэл (ЭАХБ ${fp.cls} анги ≥${need} м)`, old: km(o), now: km(n), better: n >= need && o < need ? true : n < need && o >= need ? false : null,
      note: n < need ? "ЭАХБ хангахгүй" : undefined });
    if (fp.cls === "I" || fp.cls === "II") {
      const toDir = COMPASS(P.windFrom + 180);
      const up = (g: Geo, w: Record<number, number>) => { const v: XY = [g.c[w[1]][0] - g.c[w[f]][0], g.c[w[1]][1] - g.c[w[f]][1]], L = Math.hypot(...v) || 1; return Math.max(0, (v[0] * toDir[0] + v[1] * toDir[1]) / L); };
      const uo = up(gOld, wo), un = up(gNew, wn);
      rows.push({ label: "Суурьшил салхины доод талд (0–1)", old: uo.toFixed(2), now: un.toFixed(2), better: cmp(uo, un) });
    }
  }
  const freightAll = FNS.reduce((s, x) => s + (isInd(x) ? P.fn[x.id].freight : 0), 0), fr = f === 15 ? freightAll : fp.freight;
  if (fr > 0) rows.push({ label: `Төмөр зам хүртэл (ачаа ${fr.toLocaleString("en-US", { maximumFractionDigits: 1 })} сая тн)`, old: km(gOld.rail[wo[f]].d), now: km(gNew.rail[wn[f]].d), better: cmp(gOld.rail[wo[f]].d, gNew.rail[wn[f]].d) });
  let fo = 0, fn = 0;
  for (const l of LINKS) {
    if (l.a !== f && l.b !== f) continue;
    const o = d(gOld, wo, l.a, l.b), n = d(gNew, wn, l.a, l.b), other = l.a === f ? l.b : l.a;
    fo += l.w * o; fn += l.w * n;
    rows.push({ label: `↔ ${FN[other].short} (${LINK[l.kind].label}, жин ${l.w})`, old: km(o), now: km(n), better: cmp(o, n), note: l.note });
  }
  if (fo) rows.push({ label: "Урсгалын нийт (жин × км)", old: (fo / 1000).toFixed(1), now: (fn / 1000).toFixed(1), better: cmp(fo, fn) });
  const costOld = costOf(aOld, gOld, P), costNew = costOf(aNew, gNew, P);
  const delta = Object.fromEntries(Object.keys(costNew).map((k) => [k, costNew[k as keyof Cost] - costOld[k as keyof Cost]])) as Cost;
  return { rows, delta, costOld, costNew };
}
