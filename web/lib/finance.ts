// 06. Санхүүжилт тооцоолох — 03 (Суурьшлын бүсийн загвар тооцоолох) ба 05 (Цогц төлөвлөлт)-аас хадгалсан тоо хэмжээнд
// нэгж өртөг (USD) үржүүлж, төгрөгт хөрвүүлнэ. Нэгж өртөг бүгд ТААМАГЛАЛ — зах зээлийн үнэ, ТЭЗҮ-ээр солино.
import {corridorGraph} from './sharedUtilityGraph';
import type {Street} from './layout';

export type Cat = "housing" | "public" | "road" | "rail" | "utility" | "energy" | "green" | "prep" | "transport";
export const CAT: Record<Cat, { label: string; color: string }> = {
  housing: { label: "Орон сууц, худалдаа", color: "#E9C46A" },
  public: { label: "Нийтийн барилга (сургууль, цэцэрлэг, эмнэлэг)", color: "#E985A6" },
  road: { label: "Зам, гудамж, зогсоол", color: "#E4572E" },
  rail: { label: "Төмөр зам", color: "#37474F" },
  utility: { label: "Инженерийн шугам, байгууламж", color: "#2F80ED" },
  energy: { label: "Эрчим хүч (сэргээгдэх, дэд станц)", color: "#F2B705" },
  green: { label: "Ногоон байгууламж", color: "#43A047" },
  prep: { label: "Талбайн бэлтгэл, шороон ажил", color: "#8D6E63" },
  transport: { label: "Нийтийн тээвэр", color: "#8E24AA" },
};

/** Тоо хэмжээний түлхүүр — нэг түлхүүр нэг нэгж өртөгтэй */
export type Item = { k: string; label: string; unit: string; cat: Cat; usd: number };
// ТААМАГЛАЛ: Монгол дахь барилга, дэд бүтцийн эрэмбийн үнэ (USD, НӨАТ-гүй). ШАЛГАХ: Барилгын яамны өртгийн норм, ТЭЗҮ.
export const ITEMS: Item[] = [
  {k:"factoryGfa",label:"Үйлдвэрийн барилга (тоноглол ороогүй)",unit:"м²",cat:"public",usd:700},
  {k:"sitePaving",label:"Үйлдвэрийн үйлчилгээ / ачилтын талбай",unit:"м²",cat:"road",usd:60},
  { k: "gfaRes", label: "Орон сууцны барилга", unit: "м²", cat: "housing", usd: 650 },
  { k: "gfaCom", label: "Худалдаа, үйлчилгээ, оффис", unit: "м²", cat: "housing", usd: 700 },
  { k: "gfaPub", label: "Нийтийн барилга", unit: "м²", cat: "public", usd: 900 },
  { k: "kinderSeat", label: "Цэцэрлэгийн суудал", unit: "суудал", cat: "public", usd: 12000 },
  { k: "schoolSeat", label: "Сургуулийн суудал", unit: "суудал", cat: "public", usd: 9000 },
  { k: "bed", label: "Эмнэлгийн ор", unit: "ор", cat: "public", usd: 150000 },
  { k: "roadArt", label: "Магистраль гудамж", unit: "км", cat: "road", usd: 2_500_000 },
  { k: "roadCol", label: "Цуглуулах гудамж", unit: "км", cat: "road", usd: 1_500_000 },
  { k: "roadLoc", label: "Орон нутгийн гудамж", unit: "км", cat: "road", usd: 800_000 },
  { k: "roadTrunk", label: "Бүс хоорондын хатуу хучилттай зам", unit: "км", cat: "road", usd: 1_200_000 },
  { k: "walkKm", label: "Явган хүний зам", unit: "км", cat: "road", usd: 150_000 },
  { k: "bikeKm", label: "Дугуйн зам", unit: "км", cat: "road", usd: 100_000 },
  { k: "stall", label: "Ил зогсоолын зай", unit: "зай", cat: "road", usd: 1500 },
  { k: "stallUnder", label: "Далд зогсоолын зай", unit: "зай", cat: "road", usd: 20000 },
  { k: "railSpur", label: "Төмөр замын салаа", unit: "км", cat: "rail", usd: 2_000_000 },
  { k: "water", label: "Усан хангамжийн шугам (хороолол)", unit: "км", cat: "utility", usd: 350_000 },
  { k: "sewer", label: "Бохирын шугам (хороолол)", unit: "км", cat: "utility", usd: 500_000 },
  { k: "heat", label: "Дулааны шугам (хороолол)", unit: "км", cat: "utility", usd: 1_000_000 },
  { k: "power", label: "Цахилгааны шугам 10/0.4 кВ", unit: "км", cat: "utility", usd: 250_000 },
  { k: "storm", label: "Борооны ус зайлуулах шугам", unit: "км", cat: "utility", usd: 400_000 },
  { k: "waterMain", label: "Усан хангамжийн гол шугам", unit: "км", cat: "utility", usd: 600_000 },
  { k: "sewerMain", label: "Бохирын гол шугам", unit: "км", cat: "utility", usd: 700_000 },
  { k: "heatMain", label: "Дулааны гол шугам", unit: "км", cat: "utility", usd: 1_500_000 },
  { k: "powerMain", label: "Цахилгааны гол шугам 35/110 кВ", unit: "км", cat: "utility", usd: 300_000 },
  { k: "waterCap", label: "Усан хангамжийн байгууламж (эх үүсвэр, цэвэршүүлэх, сан)", unit: "м³/хон", cat: "utility", usd: 600 },
  { k: "wwtpCap", label: "Цэвэрлэх байгууламж", unit: "м³/хон", cat: "utility", usd: 1200 },
  { k: "substation", label: "Дэд станц", unit: "МВт", cat: "energy", usd: 50_000 },
  { k: "windMW", label: "Салхин цахилгаан станц", unit: "МВт", cat: "energy", usd: 1_300_000 },
  { k: "solarMW", label: "Нарны цахилгаан станц", unit: "МВт", cat: "energy", usd: 700_000 },
  { k: "parkHa", label: "Цэцэрлэгт хүрээлэн", unit: "га", cat: "green", usd: 250_000 },
  { k: "protectHa", label: "Хамгаалалтын ногоон / ногоон зурвас", unit: "га", cat: "green", usd: 8000 },
  { k: "trees", label: "Мод тарих", unit: "ш", cat: "green", usd: 150 },
  { k: "earth", label: "Шороон ажил (ухалт + дүүргэлт)", unit: "м³", cat: "prep", usd: 4 },
  { k: "indPrepHa", label: "Үйлдвэрийн талбайн бэлтгэл", unit: "га", cat: "prep", usd: 20000 },
  { k: "buses", label: "Автобус", unit: "ш", cat: "transport", usd: 250_000 },
];
export const ITEM = Object.fromEntries(ITEMS.map((i) => [i.k, i])) as Record<string, Item>;

// Үе шатны хуваарилалт (%) — I 2026–2030, II 2031–2035, III 2036–2040 (ТААМАГЛАЛ)
export const PHASES = ["I · 2026–2030", "II · 2031–2035", "III · 2036–2040"];
export const DEFAULT_PHASE: Record<Cat, [number, number, number]> = {
  housing: [30, 40, 30], public: [40, 40, 20], road: [50, 30, 20], rail: [60, 30, 10], utility: [50, 30, 20],
  energy: [40, 40, 20], green: [30, 40, 30], prep: [60, 30, 10], transport: [40, 30, 30],
};

export type FinParams = {
  rate: number; // ₮/USD
  cont: number; // гэнэтийн зардал, %
  soft: number; // зураг төсөл, хяналт, %
  usd: Record<string, number>;
  phase: Record<Cat, [number, number, number]>;
};
export const DEFAULT_FIN: FinParams = {
  rate: 3450, cont: 10, soft: 8,
  usd: Object.fromEntries(ITEMS.map((i) => [i.k, i.usd])), phase: DEFAULT_PHASE,
};

// ---------- Хадгалсан загвар ----------
export type CostModel = {
  id: string; source: 3 | 4 | 5; name: string; created: string;
  qty: Record<string, number>; info: Record<string, number>; // info — хүн ам, талбай (нэг хүнд/га-д ногдох)
};
const KEY = "booroljuulelt:costmodels";
const subs = new Set<() => void>();
export function loadModels(): CostModel[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}
function store(list: CostModel[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  subs.forEach((f) => f());
}
export function saveModel(m: Omit<CostModel, "id" | "created">) {
  const list = loadModels();
  const id = Math.random().toString(36).slice(2, 9);
  list.push({ ...m, id, created: new Date().toISOString() });
  store(list);
  return id;
}
export const removeModel = (id: string) => store(loadModels().filter((m) => m.id !== id));
export const subscribeModels = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };

// ---------- Тооцоо ----------
export type Line = { k: string; qty: number; usd: number };
export type FinOut = {
  lines: Line[]; byCat: Record<Cat, number>; base: number; cont: number; soft: number; total: number;
  byPhase: number[];
};
export function estimate(qty: Record<string, number>, p: FinParams): FinOut {
  const lines = Object.entries(qty).filter(([k, q]) => ITEM[k] && q > 0).map(([k, q]) => ({ k, qty: q, usd: q * (p.usd[k] ?? ITEM[k].usd) }));
  const byCat = Object.fromEntries(Object.keys(CAT).map((c) => [c, 0])) as Record<Cat, number>;
  for (const l of lines) byCat[ITEM[l.k].cat] += l.usd;
  const base = lines.reduce((s, l) => s + l.usd, 0);
  const k = (1 + p.cont / 100) * (1 + p.soft / 100);
  const byPhase = [0, 0, 0];
  for (const c of Object.keys(CAT) as Cat[]) {
    const v = byCat[c] * k;
    const ph = p.phase[c], ps = ph.reduce((s, x) => s + x, 0) || 1;
    ph.forEach((x, i) => { byPhase[i] += (v * x) / ps; });
  }
  const cont = base * (p.cont / 100), soft = (base + cont) * (p.soft / 100);
  return { lines, byCat, base, cont, soft, total: base + cont + soft, byPhase };
}

const km = (m: number) => m / 1000;
/** 03. Суурьшлын бүсийн загвар тооцоолох-ын төлөвлөгөөнөөс тоо хэмжээ */
export function urbanQty(pl: {
  siteArea: number; land: Record<string, number>; bldgs: { use: string; gfa: number; gfaRes: number; gfaCom: number }[];
  scene: { rep: Record<string, number> }; nets: Record<string, { len: number } | null>; ibah: { cut: number; fill: number };
  streets?:Pick<Street,'path'|'cls'|'ext'>[];
  t: { pop: number; hh: number; walkKm: number; bikeKm: number; stalls: number; stallsUnder: number; trees: number; water: number; sewer: number; elecMw: number | null; heatMw: number | null; transitCover: number };
}): { qty: Record<string, number>; info: Record<string, number> } {
  const rep = pl.scene.rep, t = pl.t;
  const pubUse = new Set(["school", "kinder", "clinic"]);
  const gfaPub = pl.bldgs.filter((b) => pubUse.has(b.use)).reduce((s, b) => s + b.gfa, 0);
  const gfaRes = pl.bldgs.reduce((s, b) => s + b.gfaRes, 0);
  const gfaCom = pl.bldgs.filter((b) => !pubUse.has(b.use) && b.use !== "eng").reduce((s, b) => s + b.gfa - b.gfaRes, 0);
  // Гадна шинээр холбох зам scene.rep-д ордоггүй. Давхардсан сегментийг дахин үнэлэхгүй.
  const external={arterial:0,collector:0,local:0},streets=pl.streets??[];
  if(streets.some(s=>s.ext)){
    const paths=streets.filter(s=>!s.ext).map(s=>s.path),length=()=>corridorGraph(paths).edges.reduce((sum,e)=>sum+e.length,0);
    let measured=length();
    for(const cls of ['arterial','collector','local'] as const){
      const connectors=streets.filter(s=>s.ext&&s.cls===cls);if(!connectors.length)continue;
      paths.push(...connectors.map(s=>s.path));const next=length();external[cls]=Math.max(0,next-measured);measured=next;
    }
  }
  return {
    qty: {
      gfaRes, gfaCom, gfaPub,
      roadArt: km((rep["len.arterial"] ?? 0)+external.arterial), roadCol: km((rep["len.collector"] ?? 0)+external.collector), roadLoc: km((rep["len.local"] ?? 0)+external.local),
      walkKm: t.walkKm, bikeKm: t.bikeKm, stall: t.stalls, stallUnder: t.stallsUnder,
      water: km(pl.nets.water?.len ?? 0), sewer: km(pl.nets.sewer?.len ?? 0), heat: km(pl.nets.heat?.len ?? 0),
      power: km(pl.nets.power?.len ?? 0), storm: km(pl.nets.storm?.len ?? 0),
      waterCap: t.water, wwtpCap: t.sewer, substation: t.elecMw ?? 0,
      parkHa: (pl.land.park ?? 0) / 1e4, protectHa: (pl.land.protect ?? 0) / 1e4, trees: t.trees,
      earth: pl.ibah.cut + pl.ibah.fill,
    },
    info: { pop: t.pop, hh: t.hh, ha: pl.siteArea / 1e4 },
  };
}

// ---------- Нэгж өртөг, ханш — 03 ба 06 хэсэг хуваалцана ----------
const PKEY = "booroljuulelt:finparams";
const psubs = new Set<() => void>();
export function loadFinParams(): FinParams {
  try { const s = localStorage.getItem(PKEY); return s ? { ...DEFAULT_FIN, ...JSON.parse(s) } : DEFAULT_FIN; } catch { return DEFAULT_FIN; }
}
export function saveFinParams(p: FinParams) {
  try { localStorage.setItem(PKEY, JSON.stringify(p)); } catch {}
  psubs.forEach((f) => f());
}
export const subscribeFinParams = (f: () => void) => { psubs.add(f); return () => { psubs.delete(f); }; };

/** Shared plants are costed by their own Section 5 saved sites. */
export function urbanPlanFinance(pl:Parameters<typeof urbanQty>[0]){const out=urbanQty(pl);delete out.qty.waterCap;delete out.qty.wwtpCap;delete out.qty.substation;return out;}
