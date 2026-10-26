// 02 · «8 га-д систем өөрөө» — сумын төвийн амины байшинтай хорооллын төлөвлөгч.
// Бөөрөлжүүт-ын 03-р модулийн арга зүй (хөтөлбөр → тэнхлэг → бүсчлэл → блок/хашаа → барилга → ногоон → инженерийн шугам → төсөв → норм),
// гэхдээ 8 га, хөдөөгийн амины байшинд: хашааны хуваалтыг lib/plan.ts-ээр, хувилбаруудыг харьцуулж сонгоно.
// Бүх норм, нэгж өртөг нь ТААМАГЛАЛ — БНбД болон сумын ерөнхий төлөвлөгөөтэй тулгаж ШАЛГАХ.
import { area, corners, DEFAULT_PARAMS, diff, inside, inter, runPlan, union, type Lot, type Multi, type Params, type Plan, type XY } from "./plan.ts";
import { HOUSE_TYPES, PART, yardOf, type Yard } from "./parcelYards.ts";

export type SoumIn = {
  pop: number;            // хүн амын зорилт
  hhSize: number;         // өрхийн дундаж хүн
  plot: number | "auto";  // хашааны хэмжээ, м² (auto = зорилт хангах хамгийн том)
  rows: "auto" | "double" | "single"; // блокт 2 эгнээ (ар араасаа) эсвэл 1 эгнээ хашаа
  windbreak: number;      // хойд, баруун захын салхины хамгаалалтын зурвас, м
  kinder: boolean; shop: boolean; park: boolean; eng: boolean;
  house: { w: number; d: number; floors: number };
};
export const SOUM_DEFAULT: SoumIn = { pop: 60, hhSize: 3.6, plot: 2000, rows: "auto", windbreak: 10, kinder: false, shop: false, park: true, eng: false, house: { w: 12, d: 10, floors: 1 } };

// Хашааны хувилбар (нүүр × гүн, м): 2,000 м²-ээс дээш, гүн 50 м (хөрш нэгж талбартай ижил); сумын төвд 0.5 га хүртэл (Газар өмчлөх тухай хууль — ШАЛГАХ)
export const PLOTS: Record<number, [number, number]> = { 2000: [40, 50], 2500: [50, 50], 3000: [60, 50], 4000: [80, 50], 5000: [100, 50] };

// Нийтийн байгууламжийн хөтөлбөр (ТААМАГЛАЛ): талбай (м²), барилгын хэмжээ, давхар
export const FAC = {
  kinder: { label: "Цэцэрлэг", color: "#e07a5f", land: (pop: number) => Math.max(2000, pop * 0.1 * 35), b: [24, 12], floors: 2 },   // 0–5 нас ≈ 10%, 35 м²/хүүхэд
  shop: { label: "Худалдаа, үйлчилгээ", color: "#f2a541", land: () => 1000, b: [14, 10], floors: 1 },
  park: { label: "Спорт, амралтын талбай", color: "#5aa469", land: () => 4000, b: null, floors: 0 },
  eng: { label: "Инженерийн талбай (худаг, сав, дэд станц)", color: "#7e6bb0", land: () => 800, b: [8, 6], floors: 1 },
} as const;
export type FacKey = keyof typeof FAC;

// Нэгж өртөг, ам.доллар (ТААМАГЛАЛ — сумын төсөвт өртгөөр шинэчилнэ)
export const COST = { road: 25, water: 60, power: 40, connector: 25, tree: 30, kinder: 600, shop: 400, eng: 90000, house: 300 };

export type Building = { k: FacKey | "house" | "garage" | "gazebo" | "greenhouse" | "shed"; r: XY[]; floors: number; h: number; plot: string; color?: string };
export type Zone = { k: FacKey | "res" | "windbreak"; poly: Multi; area: number; label: string };
export type Check = { label: string; value: string; norm: string; ok: boolean | null; src: string };
export type Candidate = { plot: number; rows: "double" | "single"; hh: number; resShare: number; streetShare: number; ok: boolean; plan: Plan };
export type SoumPlan = {
  inp: SoumIn; site: Multi; cand: Candidate[]; chosen: Candidate; plan: Plan; windbreak: Multi; zones: Zone[]; plots: Lot[];
  facLots: Record<FacKey, Lot[]>; yards: Yard[]; buildings: Building[]; trees: { p: XY; k: "windbreak" | "street" | "yard" | "park" }[];
  utilities: { sys: "water" | "power"; path: XY[] }[]; connector: XY[] | null; entry: XY | null;
  metrics: Record<string, number>; checks: Check[]; cost: { item: string; qty: number; unit: string; usd: number }[];
};

const len = (p: XY[]) => p.slice(1).reduce((s, q, i) => s + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
const cen = (m: Multi): XY => { const r = m[0][0].slice(0, -1); return [r.reduce((s, q) => s + q[0], 0) / r.length, r.reduce((s, q) => s + q[1], 0) / r.length]; };
const dist = (a: XY, b: XY) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function nearestOn(paths: XY[][], p: XY): XY {
  let best: XY = p, bd = Infinity;
  for (const path of paths) for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ex + (p[1] - a[1]) * ey) / l2)) : 0, q: XY = [a[0] + ex * t, a[1] + ey * t];
    if (dist(q, p) < bd) { bd = dist(q, p); best = q; }
  }
  return best;
}

/** Хашааны урд (гудамж руу харсан) ирмэгийн хүрээ: A, u (ирмэг дагуу), n (дотогш), W, D */
export function frameOf(poly: Multi, streets: Multi) {
  const c = corners(poly);
  if (c.length < 4) return null;
  const m0 = cen(poly);
  let best: { A: XY; u: XY; n: XY; W: number } | null = null;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], W = dist(a, b), u: XY = [(b[0] - a[0]) / W, (b[1] - a[1]) / W];
    let n: XY = [-u[1], u[0]];
    const m: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((m0[0] - m[0]) * n[0] + (m0[1] - m[1]) * n[1] < 0) n = [-n[0], -n[1]];
    if (inside([m[0] - n[0] * 3, m[1] - n[1] * 3], streets) && (!best || W > best.W)) best = { A: a, u, n, W };
  }
  if (!best) return null;
  const D = Math.max(...c.map((q) => (q[0] - best!.A[0]) * best!.n[0] + (q[1] - best!.A[1]) * best!.n[1]));
  return { ...best, D };
}
const rectIn = (f: NonNullable<ReturnType<typeof frameOf>>, a0: number, d0: number, a1: number, d1: number): XY[] => {
  const P = (a: number, d: number): XY => [f.A[0] + f.u[0] * a + f.n[0] * d, f.A[1] + f.u[1] * a + f.n[1] * d];
  return [P(a0, d0), P(a1, d0), P(a1, d1), P(a0, d1), P(a0, d0)];
};

/** Хойд, баруун тийш харсан хилийн ирмэгийн дагуух зурвас (салхины хамгаалалт) */
function windband(site: Multi, w: number): Multi {
  if (w <= 0) return [];
  const r = site[0][0], ccw = r.slice(0, -1).reduce((s, a, i) => { const b = r[i + 1]; return s + (a[0] * b[1] - b[0] * a[1]); }, 0) > 0;
  const parts: Multi[] = [];
  for (let i = 0; i < r.length - 1; i++) {
    const a = r[i], b = r[i + 1], L = dist(a, b);
    if (L < 1) continue;
    const ox = (b[1] - a[1]) / L * (ccw ? 1 : -1), oy = -(b[0] - a[0]) / L * (ccw ? 1 : -1); // гадагш нормал
    if (oy < 0.35 && ox > -0.35) continue; // зөвхөн хойд (oy>0) эсвэл баруун (ox<0) тийш харсан ирмэг
    const ix = -ox * w, iy = -oy * w, ex = (b[0] - a[0]) / L * w, ey = (b[1] - a[1]) / L * w;
    parts.push([[[[a[0] - ex, a[1] - ey], [b[0] + ex, b[1] + ey], [b[0] + ex + ix, b[1] + ey + iy], [a[0] - ex + ix, a[1] - ey + iy], [a[0] - ex, a[1] - ey]]]]);
  }
  return parts.length ? union(parts) : [];
}

export function runSoum(site: Multi, inp: SoumIn, base: Partial<Params>, road: XY[]): SoumPlan {
  const wb = inter(windband(site, inp.windbreak), site);
  const net = wb.length ? diff(site, wb) : site;
  const siteA = area(site);
  // ---------- 1. Хөтөлбөр ба хувилбар ----------
  const hhNeed = Math.ceil(inp.pop / inp.hhSize);
  const facNeed = (pop: number) => (["kinder", "shop", "park", "eng"] as FacKey[]).filter((k) => inp[k]).map((k) => ({ k, land: FAC[k].land(pop) }));
  const sizes = inp.plot === "auto" ? Object.keys(PLOTS).map(Number).sort((a, b) => b - a) : [inp.plot];
  const cand: Candidate[] = [];
  for (const plot of sizes) for (const rows of inp.rows === "auto" ? (["double", "single"] as const) : [inp.rows]) {
    const [w, d] = PLOTS[plot];
    const pl = runPlan(net, { ...DEFAULT_PARAMS, ...base, anchor: null, mix: null, rows, lotW: w, lotD: d, lotsPerBlock: Math.max(2, Math.round(170 / w)), mainW: 18, localW: 12, publicLots: 0, minLotRatio: 1, search: true });
    const facLots = facNeed(inp.pop).reduce((s, f) => s + Math.ceil(f.land / plot), 0);
    const hh = pl.metrics.resCount - facLots;
    cand.push({ plot, rows, hh, resShare: (hh * plot) / siteA, streetShare: pl.metrics.streets / siteA, ok: hh >= hhNeed, plan: pl });
  }
  // Зорилт хангасан хамгийн том хашаа (эс бөгөөс хамгийн олон айл); ижил хэмжээнд гудамж бага нь
  const okC = cand.filter((c) => c.ok);
  const chosen = (okC.length ? okC.sort((a, b) => b.plot - a.plot || a.streetShare - b.streetShare) : [...cand].sort((a, b) => b.hh - a.hh || a.streetShare - b.streetShare))[0];
  const plan = chosen.plan;

  // ---------- 2. Тэнхлэг: орох цэг (шороон замд хамгийн ойр гудамжны тэнхлэгийн цэг) ----------
  let entry: XY | null = null, connector: XY[] | null = null;
  if (road.length > 1 && plan.centerlines.length) {
    let bd = Infinity;
    for (const l of plan.centerlines) for (const q of l) { const r = nearestOn([road], q), dd = dist(q, r); if (dd < bd) { bd = dd; entry = q; connector = [q, r]; } }
  }
  const siteC = cen(site), entryP = entry ?? siteC;

  // ---------- 3. Бүсчлэл: нийтийн байгууламжийг хашааны эгнээнээс сонгоно ----------
  const pool = [...plan.lots];
  const facLots = { kinder: [], shop: [], park: [], eng: [] } as Record<FacKey, Lot[]>;
  const take = (k: FacKey, near: XY, landNeed: number) => {
    const n = Math.ceil(landNeed / chosen.plot);
    const sorted = pool.sort((a, b) => dist(a.c, near) - dist(b.c, near));
    const first = sorted[0];
    if (!first) return;
    // эхнийхтэй нэг блокийн ойр хашаануудыг нэгтгэнэ (гудамжаар тасрахгүй)
    const key = (l: Lot) => (l.block === first.block ? 0 : 1e6) + dist(l.c, first.c);
    const picked = [first, ...sorted.slice(1).sort((a, b) => key(a) - key(b)).slice(0, n - 1)];
    for (const l of picked) pool.splice(pool.indexOf(l), 1);
    facLots[k] = picked;
  };
  const toward = (a: XY, b: XY, t: number): XY => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (const f of facNeed(inp.pop)) {
    if (f.k === "eng") take("eng", entryP, f.land);
    else if (f.k === "shop") take("shop", toward(entryP, siteC, 0.25), f.land);
    else if (f.k === "kinder") take("kinder", siteC, f.land);
    else take("park", toward(siteC, entryP, -0.25), f.land);
  }
  const plots = pool;
  const zones: Zone[] = [
    ...(wb.length ? [{ k: "windbreak" as const, poly: wb, area: area(wb), label: "Салхины хамгаалалтын ойн зурвас" }] : []),
    ...(Object.keys(facLots) as FacKey[]).filter((k) => facLots[k].length).map((k) => { const poly = union(facLots[k].map((l) => l.poly)); return { k, poly, area: area(poly), label: FAC[k].label }; }),
    { k: "res", poly: union(plots.map((l) => l.poly)), area: plots.reduce((s, l) => s + l.area, 0), label: "Амины орон сууцны хашаа" },
  ];

  // ---------- 4–5. Хашаа ба барилга ----------
  const buildings: Building[] = [], trees: SoumPlan["trees"] = [];
  // Both tabs use the same metre-based houses, garages, cars, paths and landscaping.
  const yards = plots.map((l, i) => yardOf(l.id, l.poly, plan.streets, HOUSE_TYPES[i % HOUSE_TYPES.length])).filter((y): y is Yard => !!y);
  for (const y of yards) {
    for (const b of y.bldgs) {
      if (b.k !== "house" && b.k !== "parking" && b.k !== "gazebo" && b.k !== "greenhouse" && b.k !== "shed") continue;
      buildings.push({ k: b.k === "parking" ? "garage" : b.k, r: b.r, h: b.h, floors: b.k === "house" ? y.houseType.floors : 1, plot: y.id,
        color: b.k === "house" || b.k === "parking" ? y.houseType.colors[0] : PART[b.k].color });
    }
    trees.push(...y.trees.map(t => ({ p: t.p, k: "yard" as const })));
    const f = y.frame;
    trees.push({ p: [f.A[0] + f.u[0] * f.W / 2 - f.n[0] * 2, f.A[1] + f.u[1] * f.W / 2 - f.n[1] * 2], k: "street" });
  }
  for (const k of ["kinder", "shop", "eng"] as const) {
    const ls = facLots[k], spec = FAC[k];
    if (!ls.length || !spec.b) continue;
    const f = frameOf(ls[0].poly, plan.streets);
    if (!f) continue;
    const [bw, bd] = spec.b, a0 = (f.W - bw) / 2, d0 = k === "shop" ? 3 : Math.max(5, (f.D - bd) / 3);
    buildings.push({ k, r: rectIn(f, a0, d0, a0 + bw, d0 + bd), floors: spec.floors, h: spec.floors * 3.6, plot: ls[0].id });
  }
  // Ногоон: салхины хамгаалалтын зурвас (4 м тор), цэцэрлэгт хүрээлэн (8 м тор)
  const grid = (m: Multi, step: number, k: SoumPlan["trees"][number]["k"]) => {
    if (!m.length) return;
    const xs = m.flatMap((p) => p[0].map((q) => q[0])), ys = m.flatMap((p) => p[0].map((q) => q[1]));
    for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) if (inside([x, y], m)) trees.push({ p: [x, y], k });
  };
  grid(wb, 4, "windbreak");
  if (facLots.park.length) grid(union(facLots.park.map((l) => l.poly)), 8, "park");

  // ---------- 7. Инженерийн шугам: ус, цахилгаан гудамжны тэнхлэгээр (бохир — айл бүрт септик, ТААМАГЛАЛ) ----------
  const off = (path: XY[], o: number): XY[] => { const [a, b] = [path[0], path.at(-1)!], L = dist(a, b) || 1, nx = -(b[1] - a[1]) / L * o, ny = (b[0] - a[0]) / L * o; return [[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]]; };
  const utilities: SoumPlan["utilities"] = plan.centerlines.flatMap((l) => [{ sys: "water" as const, path: off(l, 3) }, { sys: "power" as const, path: off(l, -3) }]);
  const engLot = facLots.eng[0];
  if (engLot) { const q = nearestOn(plan.centerlines, engLot.c); utilities.push({ sys: "water", path: [engLot.c, q] }, { sys: "power", path: [engLot.c, q] }); }

  // ---------- Үзүүлэлт, норм, төсөв ----------
  const hh = plots.length, pop = hh * inp.hhSize, roadLen = plan.centerlines.reduce((s, l) => s + len(l), 0);
  const water = utilities.filter((u) => u.sys === "water").reduce((s, u) => s + len(u.path), 0), power = utilities.filter((u) => u.sys === "power").reduce((s, u) => s + len(u.path), 0);
  const greenA = (wb.length ? area(wb) : 0) + (zones.find((z) => z.k === "park")?.area ?? 0) + plan.metrics.green;
  const houseA = buildings.filter((b) => b.k === "house").reduce((s, b) => s + area([[b.r]]) * b.floors, 0);
  const maxWalk = (k: FacKey) => facLots[k].length ? Math.max(...plots.map((l) => Math.min(...facLots[k].map((f) => dist(f.c, l.c))))) : Infinity;
  const metrics = {
    site: siteA, hh, pop, hhNeed, plot: chosen.plot, res: plots.reduce((s, l) => s + l.area, 0), streets: plan.metrics.streets, green: greenA,
    public: (["kinder", "shop", "park", "eng"] as FacKey[]).reduce((s, k) => s + (zones.find((z) => z.k === k)?.area ?? 0), 0),
    roadLen, water, power, connector: connector ? len(connector) : 0, trees: trees.length, houseGfa: houseA,
    cars: yards.reduce((s, y) => s + y.cars.length, 0), garageArea: yards.reduce((s, y) => s + y.garageArea, 0),
    waterDemand: pop * 0.12, powerDemand: hh * 3, kids: pop * 0.1,
  };
  const pct = (v: number) => (v / siteA) * 100, f1 = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 1 });
  const checks: Check[] = [
    { label: "Айл өрхийн зорилт", value: `${hh} / ${hhNeed}`, norm: `хүн амын зорилт ${inp.pop} ÷ ${inp.hhSize}`, ok: hh >= hhNeed, src: "Хөтөлбөр" },
    { label: "Хашааны хэмжээ", value: `${chosen.plot} м²`, norm: "≥ 2,000 м²", ok: chosen.plot >= 2000, src: "Газар өмчлөх тухай хууль — ШАЛГАХ" },
    { label: "Гудамж, зам", value: `${f1(pct(metrics.streets))}%`, norm: "15–25%", ok: pct(metrics.streets) >= 15 && pct(metrics.streets) <= 25, src: "БНбД 30-01-04 — ШАЛГАХ" },
    { label: "Ногоон байгууламж", value: `${f1(pct(greenA))}%`, norm: "≥ 10% (хашааны ногооноос гадна)", ok: pct(greenA) >= 10, src: "ТААМАГЛАЛ" },
    { label: "Тоглоомын талбай хүртэлх зай", value: `${f1(maxWalk("park"))} м`, norm: "≤ 300 м", ok: inp.park ? maxWalk("park") <= 300 : null, src: "ТААМАГЛАЛ" },
    { label: "Шороон замд холбогдсон", value: connector ? `${f1(metrics.connector)} м холбоос` : "үгүй", norm: "гол гудамж замд гарцтай", ok: !!connector, src: "Тэнхлэг" },
  ];
  const bA = (k: Building["k"]) => buildings.filter((b) => b.k === k).reduce((s, b) => s + area([[b.r]]) * b.floors, 0);
  const cost = [
    { item: "Гудамж (хайрган хучилт)", qty: metrics.streets, unit: "м²", usd: metrics.streets * COST.road },
    { item: "Шороон зам руу холбох зам", qty: metrics.connector * 12, unit: "м²", usd: metrics.connector * 12 * COST.connector },
    { item: "Усан хангамжийн шугам", qty: water, unit: "м", usd: water * COST.water },
    { item: "Цахилгааны шугам (0.4 кВ)", qty: power, unit: "м", usd: power * COST.power },
    { item: "Инженерийн талбай (худаг, сав, дэд станц)", qty: facLots.eng.length ? 1 : 0, unit: "ком", usd: facLots.eng.length ? COST.eng : 0 },
    { item: "Цэцэрлэг", qty: bA("kinder"), unit: "м²", usd: bA("kinder") * COST.kinder },
    { item: "Худалдаа, үйлчилгээ", qty: bA("shop"), unit: "м²", usd: bA("shop") * COST.shop },
    { item: "Мод тарилт", qty: trees.length, unit: "ш", usd: trees.length * COST.tree },
  ];
  cost.push({ item: "Амины байшин (айл өрх өөрөө — мэдээлэл)", qty: houseA, unit: "м²", usd: houseA * COST.house });
  return { inp, site, cand, chosen, plan, windbreak: wb, zones, plots, facLots, yards, buildings, trees, utilities, connector, entry, metrics, checks, cost };
}
