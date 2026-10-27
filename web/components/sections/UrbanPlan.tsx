"use client";
import RoadTraffic from '../RoadTraffic';
import {savedCityNetwork} from "@/lib/cityRoadConnections";
import {snapshotLayers,captureLayers,planningLayerFilter} from "@/lib/planSnapshot";
import {urbanSceneLayers,urbanRoadSceneLayers,urbanRoadContext,urbanStreetGround} from "@/lib/urbanSnapshot";
import {urbanRoads} from '@/lib/plannedRoads';
import {useAnalysisReady, analysisComplete, AnalysisResults} from "../AnalysisWorkspace";
import {usePlanning} from "../PlanningContext";
import {plansForBoundary,baseTopic} from "@/lib/planningBoundary";
import {readPlansSnapshot} from "@/lib/savedPlans";
import PlanTables from "../PlanTables";
import PlanningSuitabilityResults from '../PlanningSuitabilityResults';
import {urbanReport} from "@/lib/urbanReport";
import SavePlanButton from "../SavePlanButton";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import { useMapCtx } from "../MapCtx";
import { Badge, Btn, KV, Note, Num, Section, Stats, Status, type Flag } from "../ui";
import { Bullet, Donut, HBars } from "../charts";
import { cellRing, fmtN } from "@/lib/geo";
import { evaluate, EXCLUSIONS, FACTORS, prepare } from "@/lib/urbanSuit";
import { ZONE_LAYER_URL, ZONE_WHERE } from "@/lib/layers";
import { area, bufPath, bufPoly, diff, inter, labelPt, unionAll, type Rings, type XY } from "@/lib/geom";
import { dropLayer, MOD_TIPS, modId, putLayer, utmLayer } from "@/lib/modmap";
import { SYS, type Sys } from "@/lib/network";
import { PLAN_MODES, type PlanMode } from "@/lib/layout";
import { SLOPE_CLS } from "@/lib/ibah";
import { checks, DEFAULT, kindOf, NORM, runPlan, SRC, type Inputs, type Plan } from "@/lib/urban";
import { GROUND, HEIGHT_CLS, heightCls, LOT_LABEL, MASS, STREET, TREE, ZONE, type GroundKind, type MassKind, type ZoneKey } from "@/lib/zoning";
import { addScenario } from "@/lib/scenarios";
import { CAT, DEFAULT_FIN, estimate, ITEM, ITEMS, loadFinParams, PHASES, saveModel, subscribeFinParams, urbanQty, urbanPlanFinance, type Cat, type FinParams } from "@/lib/finance";
import { SINGLE_HOUSE, TYPE, TYPES } from "@/lib/typology";
import ParcelHouses from "./ParcelHouses";
import SoumPlanner from "./SoumPlanner";

export type Zone = { oid: number; id: number; name: string; ha: number; type: string };

const STEPS = [
  { n: 1, t: "Хүн ам, талбай" }, { n: 2, t: "Гол, туслах тэнхлэг" }, { n: 3, t: "Бүсчлэл" }, { n: 4, t: "Блок хуваалт" },
  { n: 5, t: "Барилга · BCR · өндөр" }, { n: 6, t: "Ногоон байгууламж" }, { n: 7, t: "Явган, дугуйн зам" },
  { n: 8, t: "Инженерийн шугам" }, { n: 9, t: "ИБАХ" }, { n: 10, t: "Төсөв" }, { n: 0, t: "Бүгд · норм" },
];
const L = Object.fromEntries(["redline", "buildings", "site", "steep", "unsuit", "center", "axes", "local", "zones", "lots", "streetG", "base", "over", "marks", "lanes", "planned-roads-surface", "planned-roads-markings", "mass", "trees", "stops", "nets", "netWarn", "slope", "drain", "flood"]
  .map((k) => [k, modId(3, k)])) as Record<string, string>;
// Алхам бүрт харагдах давхарга
const SHOW: Record<number, string[]> = {
  1: ["site", "steep", "unsuit", "center"],
  2: ["site", "redline", "axes", "center", "planned-roads-surface", "planned-roads-markings"],
  3: ["zones", "axes"],
  4: ["lots", "streetG", "redline", "planned-roads-surface"],
  5: ["lots", "streetG", "mass", "planned-roads-surface"],
  6: ["streetG", "base", "over", "trees", "mass", "planned-roads-surface"],
  7: ["streetG", "base", "over", "marks", "planned-roads-surface", "planned-roads-markings", "stops", "mass"],
  8: ["nets", "netWarn"],
  9: ["lots", "slope", "drain", "flood", "nets", "netWarn"],
  0: ["streetG", "base", "over", "marks", "planned-roads-surface", "planned-roads-markings", "mass", "trees"],
  10: ["streetG", "base", "over", "mass", "trees", "planned-roads-surface"],
};
const rgb = (hex: string, a = 1) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]; };
const ha = (m2: number, d = 1) => `${fmtN(m2 / 1e4, d)} га`;
const SEQ = ["#DCE9F5", "#9EC4E6", "#5A9BD1", "#2B6CB0", "#153E75"]; // дараалсан нэг өнгө (хүн ам, ажлын байр)
const DIV = ["#2B6CB0", "#9EC4E6", "#EDEDED", "#F2B38A", "#C8553D"]; // дүүргэлт ← → ухалт

type F = { k: keyof Inputs; label: string; unit?: string; step?: number; flag?: Flag; hint?: string; ph?: string };

async function fetchZoneRings(): Promise<Record<number, Rings>> {
  const q = new URLSearchParams({ where: ZONE_WHERE, outFields: "OBJECTID", returnGeometry: "true", outSR: "32649", f: "json" });
  const d = await (await fetch(`${ZONE_LAYER_URL}/query?${q}`)).json();
  if (d.error) throw new Error(d.error.message);
  return Object.fromEntries((d.features as { attributes: { OBJECTID: number }; geometry: { rings: Rings } }[]).map((f) => [f.attributes.OBJECTID, f.geometry.rings]));
}

function Params({ children }: { children: ReactNode }) {
  return <details className="grp"><summary>Параметр</summary><div className="grid2">{children}</div></details>;
}

export default function UrbanPlan({ zones, zoneSel, setZoneSel, active = true }: { zones: Zone[] | null; zoneSel: number | null; setZoneSel: (oid: number | null) => void; active?: boolean }) {
  const { map, view, dim, setDim } = useMapCtx();
  const boundary=usePlanning();
  const [originalRings, setRings] = useState<Record<number, Rings> | null>(null);
  // Баяндун: хилийн хувилбарууд ижил ID (1)-тай тул бүсийн хилийг OBJECTID-аар (сервисээс) авна; шинэчилсэн хил байхгүй
  const rings=originalRings;
  const [inp, setInp] = useState<Inputs>(DEFAULT);
  const [pl, setPl] = useState<Plan | null>(null);
  const roadContexts=useRef(new WeakMap<Plan,XY[][]>());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const running=useRef(false),live=useRef(`${boundary.key}:${zoneSel}`),latestInput=useRef(inp);live.current=`${boundary.key}:${zoneSel}`;latestInput.current=inp;
  useEffect(()=>{live.current=`${boundary.key}:${zoneSel}`;return()=>{live.current='';};},[boundary.key,zoneSel]);
  useEffect(()=>{setPl(null);setDirty(false);setErr(null);setCmp(null);},[boundary.key,zoneSel]);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  // Баяндун: «Айл бүрт» (2,000 м² нэгж талбар бүрт амины байшин) эсвэл «Систем өөрөө» (Бөөрөлжүүт-ын загвар, барилга = амины байшин)
  const [planMode, setPlanMode] = useState<"parcel" | "auto">("parcel");
  const [parcelFocus, setParcelFocus] = useState(0);
  const [autoFocus, setAutoFocus] = useState(0);
  const showAuto = active && planMode === "auto";
  const [bMode, setBMode] = useState<"kind" | "height" | "pop" | "jobs">("height");
  const [lMode, setLMode] = useState<"use" | "bcr">("bcr");
  const [iMode, setIMode] = useState<"slope" | "earth" | "drain">("slope");
  const [sysOn, setSysOn] = useState<Sys[]>(["water", "sewer", "heat", "power"]);
  const [sanitary, setSanitary] = useState<Record<number, string>>({});
  const [top, setTop] = useState<HTMLElement | null>(null);
  const [networkDependency,setNetworkDependency]=useState<Record<string,number>>({});
  const [finSaved, setFinSaved] = useState(false);
  // Нэгж өртөг, ханш — 06-д засахад энд шууд шинэчлэгдэнэ
  const [finP, setFinP] = useState<FinParams>(DEFAULT_FIN);
  const [cur, setCur] = useState<"usd" | "mnt">("usd");
  useEffect(() => { setFinP(loadFinParams()); return subscribeFinParams(() => setFinP(loadFinParams())); }, []);

  useEffect(() => { fetchZoneRings().then(setRings).catch((e) => setErr(`Бүсийн геометр уншиж чадсангүй: ${e.message}`)); }, []);
  useEffect(() => { setTop(document.getElementById("analysis-results-3")); }, []);
  // Анхдагч: суурьшлын бүс; эрүүл ахуйн бүс — хүснэгтэд кокс химийг I анги гэж заасан
  useEffect(() => {
    if (!active || !zones) return;
    // Анх нээхэд үргэлж «хувилбар 1» (байхгүй бол эхний суурьшлын бүс)
    if (!zones.some(z=>z.oid===zoneSel&&kindOf(z.name,z.type)==="residential")) { const res = zones.filter((z) => kindOf(z.name, z.type) === "residential"), r = res.find((z) => /хувилбар 1$/.test(z.name)) ?? res[0]; if (r) setZoneSel(r.oid); }
    setSanitary((s) => Object.keys(s).length ? s : Object.fromEntries(zones.filter((z) => /Кокс/i.test(z.name)).map((z) => [z.oid, "I"])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones,zoneSel,active]);

  // 2-р хэсгийн DEM тохиромжоор талбайг хязгаарлах
  // Баяндун: анхдагч унтраалттай — 2-р хэсгийн DEM үнэлгээ 100 м нүдтэй тул 8 га-д хэт бүдүүн (≈8 нүд), талбайг 1 га болгож хумьдаг
  const [useSuit, setUseSuit] = useState(false);
  const [suitInfo, setSuitInfo] = useState<{ ha: number; share: number; cells: number } | null>(null);
  const zone = zones?.find((z) => z.oid === zoneSel) ?? null;
  const set = (k: keyof Inputs) => (v: unknown) => { setInp((c) => ({ ...c, [k]: v })); setDirty(true); };
  const num = (f: F) => <Num key={String(f.k)} label={f.label} value={inp[f.k] as number | ""} unit={f.unit} step={f.step} flag={f.flag} hint={f.hint} placeholder={f.ph} onChange={set(f.k)} />;

  // Талбайн нөхцөл (DEM-ийн тохиромж, ЦС, эрүүл ахуйн бүс) — нэг бүсийн бүх загварт ижил
  const buildCtx = async () => {
    if (!zone || kindOf(zone.name,zone.type)!=="residential" || !rings?.[zone.oid] || !zones) throw new Error("Суурьшлын бүс сонгоно уу.");
    // 2-р хэсгийн тохиромжийн үнэлгээ: «Гадаргын хэлбэр (DEM)» = 100%, бусад бүлэг 0% → 4–5 түвшний талбай
    let suitable: Rings | null = null;
    let info: typeof suitInfo = null;
    if (useSuit) {
      const p = await prepare(100, setMsg);
      setMsg("Гадаргын хэлбэр (DEM) 100% — тохиромжтой талбай…");
      const demOnly = FACTORS.map((f) => (f.group === "dem" ? f : { ...f, weight: 0 }));
      const excl = EXCLUSIONS.filter((e) => e.key === "slope" || e.key === "flow"); // DEM-ийн хасалт
      const res = evaluate(p, demOnly, excl, zone.oid, "relative");
      // Үнэлэгдсэн нүд (төв нь бүсэд) ба тэдгээрийн 1–3 түвшин (хоригдсон нүд = 1-р түвшин)
      const all: Rings[] = [], low: Rings[] = [];
      let good = 0;
      for (let i = 0; i < p.n; i++) {
        if (!res.keep[i]) continue;
        const sq: Rings = [cellRing(p.x[i], p.y[i], p.cell / 2)];
        all.push(sq);
        if (res.cells[i].level >= 4) good++; else low.push(sq);
      }
      if (!all.length) throw new Error("Бүсэд DEM-ээр үнэлэгдсэн нүд олдсонгүй — хязгаарлалтыг унтраана уу.");
      const zr = rings[zone.oid];
      // Төв нь бүсээс гадуур нүдээр хучигдсан хилийн зурвас үнэлэгдээгүй — хөрш тохиромжгүй нүдний дэргэдэх хэсгийг л тохиромжгүйд тооцно
      const lowU = unionAll(low);
      const bad = lowU.length
        ? unionAll([inter(lowU, zr), inter(diff(zr, unionAll(all)), bufPoly(lowU, p.cell * 0.75))]) : [];
      const raw = diff(zr, bad);
      // Нүдний шатлалыг зөөлрүүлж бүсийн хилээр хайчилна
      suitable = !bad.length ? zr : raw.length ? inter(bufPoly(bufPoly(raw, p.cell * 0.3), -p.cell * 0.3), zr) : [];
      if (!suitable.length) throw new Error("DEM-ийн тохиромжтой (4–5 түвшин) талбай олдсонгүй — хязгаарлалтыг унтраана уу.");
      info = { ha: area(suitable) / 1e4, share: (area(suitable) / Math.max(1, area(zr))) * 100, cells: good };
    }
    const built = zones.find((z) => kindOf(z.name, z.type) === "built");
    const plant: XY | null = built && rings[built.oid] ? labelPt(rings[built.oid]) : null;
    const san = Object.entries(sanitary).filter(([oid, c]) => c && Number(oid) !== zone.oid && rings[Number(oid)])
      .map(([oid, c]) => ({ rings: rings[Number(oid)], m: NORM.sanitary[c] }));
    const infrastructure=plansForBoundary(await readPlansSnapshot(),boundary.mode).find(p=>baseTopic(p.topic)==="infrastructure");
    const baseline=await boundary.network(setMsg),network=savedCityNetwork(baseline.net,infrastructure?[infrastructure]:[]);
    const roads=[...network.exist,...network.roads.map(r=>r.path)];
    return { ctx: { plant, sanitary: san, suitable, roads, suitability:network.suitability, network }, info, dependency:infrastructure&&roads?{[infrastructure.topic]:infrastructure.revision} as Record<string,number>:{} };
  };

  const run = async (values:Inputs=inp) => {
    if(running.current)return;
    if (!zone || !rings?.[zone.oid] || !zones){setErr("Суурьшлын хил ачаалж байна.");return;}
    running.current=true;const started=live.current;
    setBusy(true); setErr(null);
    try {
      const { ctx, info, dependency } = await buildCtx();
      if(started!==live.current)return;
      const res = await runPlan(rings[zone.oid], { ...values, ...SINGLE_HOUSE }, ctx, message=>{if(started===live.current)setMsg(message);});
      if(started!==live.current)return;
      // Тохиромжийн дүн төлөвлөгөөтэйгөө хамт — алдаа гарвал хуучин хоёулаа хэвээр
      roadContexts.current.set(res,ctx.roads);setPl(res); setNetworkDependency(dependency); analysisComplete(3); setSuitInfo(info); setDirty(JSON.stringify(latestInput.current)!==JSON.stringify(values)); setFinSaved(false);
    } catch (e) {
      console.error("[UrbanPlan]", e); if(started===live.current)setErr((e as Error).message);
    } finally { running.current=false;setBusy(false); setMsg(null); }
  };

  // ---------- Хот төлөвлөлтийн загвар (lib/typology.ts) ----------
  // Загвар бүр анхдагч параметр дээр өөрийн багцыг давхарлана — харьцуулалт шударга байхын тулд хэрэглэгчийн бусад өөрчлөлтийг авахгүй
  const presetOf = (k: string): Inputs => {
    const t = TYPE[k], p: Inputs = { ...DEFAULT, pop: inp.pop, typo: k, ...t.set };
    if (t.fromJobs) p.pop = Math.round(((p.jobsMine + p.jobsPlant + (p.jobsInd === "" ? 0 : Number(p.jobsInd))) * p.famCoef * p.svcMult) / 100) * 100;
    return p;
  };
  const applyType = (k: string) => {if(running.current)return;const values=k?presetOf(k):{...inp,typo:""};setInp(values);setDirty(true);if(k)void run(values);};
  const runDefault=()=>{if(running.current)return;const values={...DEFAULT};setInp(values);setDirty(true);void run(values);};
  const [cmp, setCmp] = useState<{ k: string; pl: Plan | null; err?: string }[] | null>(null);
  const compare = async () => {
    if (running.current||!zone || !rings?.[zone.oid]) return;
    running.current=true;const started=live.current;
    setBusy(true); setErr(null); setCmp([]);
    const out: { k: string; pl: Plan | null; err?: string }[] = [];
    try {
      const { ctx, info, dependency } = await buildCtx();
      for (const t of TYPES) {
        if(started!==live.current)return;
        setMsg(`${t.n}/${TYPES.length} · ${t.label}…`);
        try { const result=await runPlan(rings[zone.oid], { ...presetOf(t.k), ...SINGLE_HOUSE }, ctx, () => {});roadContexts.current.set(result,ctx.roads);out.push({ k: t.k, pl:result }); }
        catch (e) { out.push({ k: t.k, pl: null, err: (e as Error).message }); }
        if(started!==live.current)return;setCmp([...out]);
      }
      setSuitInfo(info);setNetworkDependency(dependency);
    } catch (e) {
      if(started===live.current)setErr((e as Error).message);
    } finally {running.current=false;setBusy(false);setMsg(null);}
  };
  const showCmp = (p: Plan) => {if(running.current)return;setPl(p); setInp(p.inp); setDirty(false); setFinSaved(false); };
  const detailedReport=useMemo(()=>pl?{tables:[...urbanReport(pl).tables,{title:"Нормын шалгалт",columns:["Үзүүлэлт","Төлөвлөгөө","Норм","Эх сурвалж","Төлөв"],rows:checks(pl).map(c=>[c.label,c.value,c.norm,c.src,c.ok===null?"Шалгах":c.ok?"Хангасан":"Зөрчил"])}]}:undefined,[pl]);
  const trafficRoads=useMemo(()=>pl?urbanRoads(pl):[],[pl]);
  const roadContext=useMemo(()=>pl?urbanRoadContext(pl,roadContexts.current.get(pl)):[],[pl]);
  const roadOptions=useMemo(()=>({contextRoads:roadContext,boundary:boundary.geo?.site}),[roadContext,boundary.geo]);
  const urbanSnapshots=async()=>{if(!pl||!map)return[];const captured=await captureLayers(map,planningLayerFilter("urban:")),scene=urbanSceneLayers(pl,roadOptions);try{const canonical=await snapshotLayers(scene),merged=new Map(captured.filter(l=>!['mod:3:lanes','mod:3:external-roads','mod:3:external-roads-surface','mod:3:external-roads-markings'].includes(l.id)).map(l=>[l.id,l]));for(const layer of canonical)merged.set(layer.id,layer);return [...merged.values()];}finally{scene.forEach(l=>l.destroy());}};
  const urbanSave=pl?(<SavePlanButton zoneId={zone?.id} topic={`urban:${zoneSel}`} title={`Суурьшил · ${zone?.name??""}`} section={3} disabled={dirty||busy} getLayers={urbanSnapshots} inputs={{...pl.inp,roads:urbanRoads(pl),suitability:pl.suitabilityReports??{building:pl.suitability}}} report={detailedReport} warnings={checks(pl).filter(c=>c.ok===false).map(c=>`${c.label}: ${c.value} / ${c.norm}`)} finance={urbanPlanFinance(pl)} dependencies={networkDependency} demand={{powerMW:pl.t.elecMw??undefined,waterM3Day:pl.t.water}} metrics={{"Хүн ам":Math.round(pl.t.pop),"Өрх":Math.round(pl.t.hh),"Ажлын байр":Math.round(pl.t.jobs),"Барилга":pl.bldgs.length,"Талбай, га":+(pl.siteArea/1e4).toFixed(2)}} />):null;
  const saveFin = (p: Plan) => saveModel({ source: 3, name: `${TYPE[p.inp.typo]?.label ?? "Гараар"} · ${zone?.name ?? "Суурьшил"} · ${fmtN(p.t.pop)} хүн`, ...urbanQty(p) });

  // ---------- Давхаргууд (төлөвлөгөө, 2D/3D солигдоход) ----------
  useEffect(() => {
    if (!map) return;
    Object.values(L).forEach((id) => dropLayer(map, id));
    if (!showAuto || !pl) return;
    const is3d = dim === "3d", sc = pl.scene;
    const fill = (c: string, a: number, w = 0, oc?: string) => ({ type: "simple-fill", color: rgb(c, a), outline: { color: rgb(oc ?? c, 1), width: w } });
    const uv = (field: string, items: { v: string | number; label: string; sym: unknown }[]) => ({ type: "unique-value", field, uniqueValueInfos: items.map((i) => ({ value: i.v, label: i.label, symbol: i.sym })) });

    putLayer(map, utmLayer({ id: L.site, title: "Төлөвлөх талбай", geom: "polygon", fields: [], rows: [{ g: pl.site, a: {} }], renderer: { type: "simple", symbol: fill("#F97316", 0.1, 2.5) } }));
    if (pl.unsuit.length) putLayer(map, utmLayer({ id: L.unsuit, title: "DEM-ийн хувьд тохиромжгүй (1–3 түвшин)", geom: "polygon", fields: [], rows: [{ g: pl.unsuit, a: {} }], renderer: { type: "simple", symbol: fill("#6B7280", 0.35, 0.5) } }));
    if (pl.steep.length) putLayer(map, utmLayer({ id: L.steep, title: "Эгц налуу", geom: "polygon", fields: [], rows: [{ g: pl.steep, a: {} }], renderer: { type: "simple", symbol: fill("#C8553D", 0.35, 0.5) } }));
    putLayer(map, utmLayer({ id: L.center, title: "Төв", geom: "point", fields: [], rows: pl.hubs.map((h) => ({ g: h, a: {} })),
      renderer: { type: "simple", symbol: { type: "simple-marker", style: "diamond", size: 14, color: "#F97316", outline: { color: "#fff", width: 1.5 } } } }));
    putLayer(map,utmLayer({id:L.redline,title:"Төлөвлөсөн улаан шугам",geom:"polygon",fields:[{name:"street_id",type:"integer"},{name:"width_m",type:"double"},{name:"class",type:"string"}],rows:pl.streets.filter(s=>!s.ext).map(s=>({g:inter(bufPath([s.path],s.w/2),pl.site),a:{street_id:s.id,width_m:s.w,class:s.cls}})).filter(r=>r.g.length),renderer:{type:"simple",symbol:fill("#be3235",0,1.2)}}));
    putLayer(map,utmLayer({id:L.buildings,title:"Барилгын бүртгэл",geom:"polygon",fields:[{name:"building_id",type:"integer"},{name:"lot_id",type:"integer"},{name:"use",type:"string"},...["height_m","floors","foot_m2","gfa_m2","population","households","jobs","water_m3_day","sewer_m3_day","heat_kw","power_kw"].map(name=>({name,type:"double" as const}))],rows:pl.bldgs.map(b=>({g:b.rings,a:{building_id:b.id,lot_id:b.lot,use:b.use,height_m:b.h,floors:b.floors,foot_m2:b.foot,gfa_m2:b.gfa,population:b.pop,households:b.hh,jobs:b.jobs,water_m3_day:b.waterM3,sewer_m3_day:b.sewM3,heat_kw:b.heatKw,power_kw:b.elecKw}})),renderer:{type:"simple",symbol:fill("#d7b895",1,.5,"#51483b")}}));
    MOD_TIPS.set(L.redline,a=>({title:`Улаан шугам · ${a.street_id}`,hue:"#be3235",rows:[["Өргөн",`${a.width_m} м`],["Төлөв","Төлөвлөсөн"]]}));
    // Тэнхлэг (шугам)
    const axes = pl.streets.filter((s) => s.cls !== "local");
    putLayer(map, utmLayer({
      id: L.axes, title: "Тэнхлэг", geom: "polyline", fields: [{ name: "cls", type: "string" }, { name: "len", type: "double" }, { name: "ext", type: "integer" }],
      rows: axes.map((s) => ({ g: s.path, a: { cls: s.cls, len: s.path.reduce((a, p, i) => a + (i ? Math.hypot(p[0] - s.path[i - 1][0], p[1] - s.path[i - 1][1]) : 0), 0), ext: s.ext ? 1 : 0 } })),
      renderer: uv("cls", (["arterial", "collector"] as const).map((c) => ({ v: c, label: STREET[c].label, sym: { type: "simple-line", color: STREET[c].color, width: c === "arterial" ? 5 : 3.5, cap: "round" } }))),
    }));
    MOD_TIPS.set(L.axes, (a) => ({ title: STREET[a.cls as "arterial"].label, hue: STREET[a.cls as "arterial"].color, rows: [["Урт", `${fmtN(Number(a.len))} м`], ...(Number(a.ext) ? [["", "Одоо байгаа зам руу холбогч"] as [string, string]] : [])] }));
    // Бүсчлэл
    putLayer(map, utmLayer({
      id: L.zones, title: "Бүсчлэл", geom: "polygon", fields: [{ name: "cls", type: "string" }, { name: "ha", type: "double" }, { name: "lbl", type: "string" }],
      rows: pl.zones.map((z) => ({ g: z.rings, a: { cls: z.cls, ha: z.area / 1e4, lbl: `${ZONE[z.cls].label}\n${fmtN(z.area / 1e4, 1)} га` } })),
      renderer: uv("cls", (Object.keys(ZONE) as ZoneKey[]).map((k) => ({ v: k, label: `${ZONE[k].label} · ${ZONE[k].zone}`, sym: fill(ZONE[k].color, 0.85, 0.8, "#ffffff") }))),
      labelingInfo: [{ labelExpressionInfo: { expression: "$feature.lbl" }, symbol: { type: "text", color: "#1f2933", haloColor: "#ffffff", haloSize: 1, font: { size: 10, weight: "bold" } } }],
    }));
    MOD_TIPS.set(L.zones, (a) => ({ title: ZONE[a.cls as ZoneKey].label, hue: ZONE[a.cls as ZoneKey].color, rows: [["Selbe бүс", ZONE[a.cls as ZoneKey].zone], ["Талбай", `${fmtN(Number(a.ha), 2)} га`]] }));
    // Lot (блок)
    const bl = new Map<number, { foot: number; gfa: number; pop: number; jobs: number }>();
    for (const b of pl.bldgs) { const q = bl.get(b.lot) ?? { foot: 0, gfa: 0, pop: 0, jobs: 0 }; q.foot += b.foot; q.gfa += b.gfa; q.pop += b.pop; q.jobs += b.jobs; bl.set(b.lot, q); }
    putLayer(map, utmLayer({
      id: L.lots, title: "Блок", geom: "polygon",
      fields: [{ name: "id", type: "integer" }, { name: "use", type: "string" }, { name: "zone", type: "string" }, { name: "ha", type: "double" }, { name: "bcr", type: "double" },
        { name: "far", type: "double" }, { name: "pop", type: "double" }, { name: "jobs", type: "double" }, { name: "earth", type: "double" }, { name: "cut", type: "double" }, { name: "fill", type: "double" }, { name: "flood", type: "integer" }],
      rows: pl.lots.map((l) => {
        const q = bl.get(l.id), e = pl.ibah.earth.get(l.id);
        return { g: l.rings, a: { id: l.id, use: l.use, zone: l.zone, ha: l.area / 1e4, bcr: q ? (q.foot / l.area) * 100 : 0, far: q ? q.gfa / l.area : 0, pop: q?.pop ?? 0, jobs: q?.jobs ?? 0,
          earth: e ? (e.cut - e.fill) / (l.area / 1e4) : 0, cut: e?.cut ?? 0, fill: e?.fill ?? 0, flood: pl.ibah.floodLots.includes(l.id) ? 1 : 0 } };
      }),
      renderer: { type: "simple", symbol: fill("#ffffff", 0) },
    }));
    MOD_TIPS.set(L.lots, (a) => ({
      title: LOT_LABEL[a.use as keyof typeof LOT_LABEL], hue: ZONE[a.zone as ZoneKey].color, rows: [
        ["Талбай", `${fmtN(Number(a.ha), 2)} га`], ["BCR / FAR", `${fmtN(Number(a.bcr), 1)}% / ${fmtN(Number(a.far), 2)}`],
        ...(Number(a.pop) ? [["Хүн ам", fmtN(Number(a.pop))] as [string, string]] : []),
        ...(Number(a.jobs) ? [["Ажлын байр", fmtN(Number(a.jobs))] as [string, string]] : []),
        ...(Number(a.cut) + Number(a.fill) ? [["Ухалт / дүүргэлт", `${fmtN(Number(a.cut))} / ${fmtN(Number(a.fill))} м³`] as [string, string]] : []),
        ...(Number(a.flood) ? [["ИБАХ", "Урсацын шугам дайрна — суваг, хоолой"] as [string, string]] : []),
      ],
    }));
    // Гудамжны гадаргуу, lot-ын гадаргуу
    const gRen = uv("k", (Object.keys(GROUND) as GroundKind[]).map((k) => ({ v: k, label: GROUND[k].label, sym: fill(GROUND[k].color, 1) })));
    for (const [id, list] of [[L.streetG, urbanStreetGround(pl,roadOptions)], [L.base, sc.base], [L.over, sc.over]] as const) {
      putLayer(map, utmLayer({ id, title: "Гадаргуу", geom: "polygon", fields: [{ name: "k", type: "string" }], rows: list.map((x) => ({ g: x.rings, a: { k: x.k } })), renderer: gRen }));
      MOD_TIPS.set(id, (a) => ({ title: GROUND[a.k as GroundKind].label, hue: GROUND[a.k as GroundKind].color, rows: [] }));
    }
    for(const layer of urbanRoadSceneLayers(pl,roadOptions))putLayer(map,layer);
    putLayer(map, utmLayer({ id: L.marks, title: "Тэмдэглэгээ", geom: "polygon", fields: [], rows: sc.marks.map((m) => ({ g: m.rings, a: {} })), minScale: 6000, renderer: { type: "simple", symbol: fill("#F5F5F2", 1) } }));
    // Барилга — давхар бүрээр (3D), дээвэр (2D)
    const byId = new Map(pl.bldgs.map((b) => [b.id, b]));
    putLayer(map, utmLayer({
      id: L.mass, title: "Барилга", geom: "polygon",
      fields: [{ name: "k", type: "string" }, { name: "z0", type: "double" }, { name: "h", type: "double" }, { name: "bid", type: "integer" }, { name: "fl", type: "integer" },
        { name: "hc", type: "integer" }, { name: "pop", type: "double" }, { name: "jobs", type: "double" }],
      rows: sc.masses.filter((m) => is3d || m.fl === 0).map((m) => { const b = byId.get(m.bid)!; return { g: m.rings, a: { k: m.k, z0: m.z0, h: m.h, bid: m.bid, fl: m.fl, hc: heightCls(b.floors), pop: b.pop, jobs: b.jobs } }; }),
      elevationInfo: is3d ? { mode: "relative-to-ground", featureExpressionInfo: { expression: "$feature.z0" }, unit: "meters" } : undefined,
      renderer: { type: "simple", symbol: fill("#F5EBD7", 1) },
    }));
    MOD_TIPS.set(L.mass, (a) => {
      const b = byId.get(Number(a.bid));
      if (!b) return { title: "Барилга", hue: "#999", rows: [] };
      const fl = Number(a.fl);
      return { title: `${LOT_LABEL[b.use]} · ${HEIGHT_CLS[heightCls(b.floors)].label}`, hue: HEIGHT_CLS[heightCls(b.floors)].color, rows: [
        ...(fl ? [["Энэ давхар", `${fl}-р · ${MASS[a.k as MassKind].label}`] as [string, string]] : []),
        ["Давхар / өндөр", `${b.floors} · ${fmtN(b.h, 1)} м`], ["Суурь / нийт", `${fmtN(b.foot)} / ${fmtN(b.gfa)} м²`],
        ...(b.pop ? [["Хүн ам / өрх", `${fmtN(b.pop)} / ${fmtN(b.hh)}`] as [string, string]] : []),
        ...(b.jobs ? [["Ажлын байр", fmtN(b.jobs)] as [string, string]] : []),
        ...(b.waterM3 ? [["Ус / бохир", `${fmtN(b.waterM3, 1)} / ${fmtN(b.sewM3, 1)} м³/хон`] as [string, string]] : []),
        ...(b.heatKw != null ? [["Дулаан", `${fmtN(b.heatKw)} кВт`] as [string, string]] : []),
        ...(b.elecKw != null ? [["Цахилгаан", `${fmtN(b.elecKw)} кВт`] as [string, string]] : []),
        ["Дээвэр", MASS[b.roof].label],
      ] };
    });
    // Мод
    putLayer(map, utmLayer({
      id: L.trees, title: "Мод", geom: "point", fields: [{ name: "t", type: "integer" }, { name: "h", type: "double" }, { name: "d", type: "double" }], minScale: 15000,
      rows: sc.trees.map((t) => ({ g: [t.x, t.y] as XY, a: { t: t.t, h: t.h, d: t.r * 2 } })),
      renderer: is3d ? {
        ...uv("t", TREE.map((t, i) => ({ v: i, label: t.label, sym: { type: "point-3d", symbolLayers: [{ type: "object", resource: { primitive: i === 0 ? "cone" : "sphere" }, material: { color: t.color }, anchor: "bottom" }] } }))),
        visualVariables: [{ type: "size", field: "h", axis: "height", valueUnit: "meters" }, { type: "size", field: "d", axis: "width-and-depth", valueUnit: "meters" }],
      } : uv("t", TREE.map((t, i) => ({ v: i, label: t.label, sym: { type: "simple-marker", size: i === 2 ? 3 : 5, color: t.color, outline: { color: [30, 60, 30, 0.6], width: 0.4 } } }))),
    }));
    putLayer(map, utmLayer({ id: L.stops, title: "Автобусны буудал", geom: "point", fields: [], rows: sc.stops.map((s) => ({ g: s, a: {} })),
      renderer: { type: "simple", symbol: { type: "simple-marker", style: "square", size: 9, color: "#2563EB", outline: { color: "#fff", width: 1.5 } } } }));
    MOD_TIPS.set(L.stops, () => ({ title: "Автобусны буудал", hue: "#2563EB", rows: [["Хүртээмж", "500 м (БНбД З.10.22)"]] }));
    // Инженерийн шугам
    const nl = (Object.keys(SYS) as Sys[]).flatMap((s) => (pl.nets[s]?.lines ?? []).map((l) => ({ ...l, s })));
    if (pl.heatMain) nl.push({ sys: "heat", s: "heat", path: pl.heatMain, flow: 0, dn: null, slope: null, depth: null, warn: false });
    const w = (dn: number | null) => (dn == null ? 2 : dn >= 500 ? 5 : dn >= 300 ? 4 : dn >= 200 ? 3 : 2);
    putLayer(map, utmLayer({
      id: L.nets, title: "Инженерийн шугам", geom: "polyline",
      fields: [{ name: "sys", type: "string" }, { name: "dn", type: "integer" }, { name: "flow", type: "double" }, { name: "slope", type: "double" }, { name: "depth", type: "double" }, { name: "w", type: "double" },{name:"from_node",type:"integer"},{name:"to_node",type:"integer"},{name:"invert_from",type:"double"},{name:"invert_to",type:"double"}],
      rows: nl.map((l) => ({ g: l.path, a: { sys: l.sys, dn: l.dn ?? 0, flow: l.flow, slope: l.slope ?? 0, depth: l.depth ?? 0, from_node:l.fromNode??null,to_node:l.toNode??null,invert_from:l.invertFrom??null,invert_to:l.invertTo??null,w: w(l.dn) } })),
      renderer: { ...uv("sys", (Object.keys(SYS) as Sys[]).map((s) => ({ v: s, label: SYS[s].label, sym: { type: "simple-line", color: SYS[s].color, width: 2.5, cap: "round" } }))),
        visualVariables: [{ type: "size", field: "w", minDataValue: 2, maxDataValue: 5, minSize: 1.5, maxSize: 5 }] },
    }));
    MOD_TIPS.set(L.nets, (a) => ({ title: SYS[a.sys as Sys].label, hue: SYS[a.sys as Sys].color, rows: [
      ...(Number(a.dn) ? [["Диаметр", `DN ${a.dn}`] as [string, string]] : []),
      ...(Number(a.slope) ? [["Хоолойн налуу", `${fmtN(Number(a.slope) * 100, 2)}%`] as [string, string]] : []),
      ...(Number(a.depth) ? [["Суулгалтын гүн", `${fmtN(Number(a.depth), 1)} м`] as [string, string]] : []),
    ] }));
    putLayer(map, utmLayer({ id: L.netWarn, title: "Гүн / диаметр шалгах", geom: "polyline", fields: [{ name: "sys", type: "string" }],
      rows: nl.filter((l) => l.warn).map((l) => ({ g: l.path, a: { sys: l.sys } })),
      renderer: { type: "simple", symbol: { type: "simple-line", color: [217, 70, 239, 0.9], width: 1.5, style: "short-dot" } } }));
    MOD_TIPS.set(L.netWarn, (a) => ({ title: `${SYS[a.sys as Sys].label} — шалгах`, hue: "#D946EF", rows: [["", "Гүн, диаметр, насос / өөр трассын шаардлагыг шалгах"]] }));
    // ИБАХ
    putLayer(map, utmLayer({ id: L.slope, title: "Налуу", geom: "polygon", fields: [{ name: "c", type: "integer" }],
      rows: pl.ibah.slope.filter((s) => s.rings.length).map((s) => ({ g: s.rings, a: { c: s.cls } })),
      renderer: uv("c", SLOPE_CLS.map((c, i) => ({ v: i, label: c.label, sym: fill(c.color, 0.85) }))) }));
    MOD_TIPS.set(L.slope, (a) => ({ title: SLOPE_CLS[Number(a.c)].label, hue: SLOPE_CLS[Number(a.c)].color, rows: [] }));
    putLayer(map, utmLayer({ id: L.flood, title: "Үерийн эрсдэл", geom: "polygon", fields: [], rows: pl.ibah.flood.length ? [{ g: pl.ibah.flood, a: {} }] : [],
      renderer: { type: "simple", symbol: fill("#17BEBB", 0.3, 0.6) } }));
    putLayer(map, utmLayer({ id: L.drain, title: "Урсацын шугам", geom: "polyline", fields: [], rows: pl.ibah.drains.map((p) => ({ g: p, a: {} })),
      renderer: { type: "simple", symbol: { type: "simple-line", color: "#0E7490", width: 2 } } }));
  }, [map, pl, dim, showAuto, roadOptions]);

  // ---------- Дэд горимын рендерер ----------
  useEffect(() => {
    if (!showAuto || !map || !pl) return;
    const is3d = dim === "3d";
    const lots = map.findLayerById(L.lots) as FeatureLayer | undefined;
    const fill = (c: string, a: number, w = 0.6, oc = "#ffffff") => ({ type: "simple-fill", color: rgb(c, a), outline: { color: rgb(oc, 0.9), width: w } });
    if (lots) {
      if (step === 9 && iMode === "earth") {
        lots.renderer = { type: "class-breaks", field: "earth", classBreakInfos: [[-1e9, -3000], [-3000, -500], [-500, 500], [500, 3000], [3000, 1e9]].map(([a, b], i) => ({
          minValue: a, maxValue: b, label: ["Их дүүргэлт", "Дүүргэлт", "Тэнцвэртэй", "Ухалт", "Их ухалт"][i] + " (м³/га)", symbol: fill(DIV[i], 0.85) })) } as never;
      } else if (step === 9) {
        lots.renderer = { type: "unique-value", field: "flood", uniqueValueInfos: [{ value: 1, label: "Урсац дайрсан", symbol: fill("#17BEBB", 0.0, 2.2, "#0E7490") }], defaultSymbol: fill("#ffffff", 0, 0.5, "#666666") } as never;
      } else if (step === 5 && lMode === "bcr") {
        lots.renderer = { type: "class-breaks", field: "bcr", classBreakInfos: [[0.001, 15], [15, 25], [25, 40], [40, 60], [60, 100]].map(([a, b], i) => ({
          minValue: a, maxValue: b, label: `BCR ${a < 1 ? 0 : a}–${b}%`, symbol: fill(["#FDF3D7", "#F7D98B", "#8CC084", "#E9985B", "#C8553D"][i], 0.75) })), defaultSymbol: fill("#ffffff", 0.1, 0.4, "#999999") } as never;
      } else {
        lots.renderer = { type: "unique-value", field: "zone", uniqueValueInfos: (Object.keys(ZONE) as ZoneKey[]).map((k) => ({ value: k, label: ZONE[k].label, symbol: fill(ZONE[k].color, 0.8, 0.8) })) } as never;
      }
    }
    const mass = map.findLayerById(L.mass) as FeatureLayer | undefined;
    if (mass) {
      const mode = step === 5 ? bMode : "kind";
      const sym = (c: string) => is3d
        ? { type: "polygon-3d", symbolLayers: [{ type: "extrude", material: { color: rgb(c, 1) }, edges: { type: "solid", color: [40, 40, 40, 0.45], size: 0.5 } }] }
        : { type: "simple-fill", color: rgb(c, 1), outline: { color: [50, 50, 50, 0.9], width: 0.5 } };
      const size = is3d ? { visualVariables: [{ type: "size", field: "h", valueUnit: "meters" }] } : {};
      if (mode === "height") mass.renderer = { type: "unique-value", field: "hc", uniqueValueInfos: HEIGHT_CLS.map((c, i) => ({ value: i, label: c.label, symbol: sym(c.color) })), ...size } as never;
      else if (mode === "pop" || mode === "jobs") {
        const br = mode === "pop" ? [0, 1, 60, 120, 200, 1e9] : [0, 1, 20, 60, 150, 1e9];
        mass.renderer = { type: "class-breaks", field: mode, defaultSymbol: sym("#E5E5E5"), classBreakInfos: br.slice(0, -1).map((a, i) => ({
          minValue: a, maxValue: br[i + 1], label: i ? `${a}–${br[i + 1] > 1e8 ? "+" : br[i + 1]}` : "0", symbol: sym(i ? SEQ[i] : "#E5E5E5") })), ...size } as never;
      } else mass.renderer = { type: "unique-value", field: "k", uniqueValueInfos: (Object.keys(MASS) as MassKind[]).map((k) => ({ value: k, label: MASS[k].label, symbol: sym(MASS[k].color) })), ...size } as never;
    }
    const nets = map.findLayerById(L.nets) as FeatureLayer | undefined;
    if (nets) nets.definitionExpression = step === 9 ? "sys = 'storm'" : `sys IN (${sysOn.map((s) => `'${s}'`).join(",") || "''"})`;
    const warn = map.findLayerById(L.netWarn) as FeatureLayer | undefined;
    if (warn) warn.definitionExpression = step === 9 ? "sys = 'storm'" : `sys IN (${sysOn.map((s) => `'${s}'`).join(",") || "''"})`;
  }, [map, pl, dim, step, bMode, lMode, iMode, sysOn, showAuto]);

  // ---------- Алхмаар шүүх ----------
  useEffect(() => {
    if (!map) return;
    const on = new Set(SHOW[step] ?? []);
    if (step === 9) { on.delete("slope"); on.delete("drain"); on.delete("flood");
      if (iMode === "slope") on.add("slope"); if (iMode === "drain") { on.add("drain"); on.add("flood"); } if (iMode !== "earth") on.add("drain"); }
    for (const [k, id] of Object.entries(L)) { const l = map.findLayerById(id); if (l) l.visible = showAuto && on.has(k); }
  }, [map, pl, dim, step, iMode, showAuto]);

  // Шинэ төлөвлөгөө руу ойртоно
  useEffect(() => {
    const lyr = pl && (map?.findLayerById(L.site) as FeatureLayer | undefined);
    if (!showAuto || !lyr || !view) return;
    let live = true;
    lyr.queryExtent().then(({ extent }) => {
      if (live && extent && !view.destroyed) view.goTo(view.type === "3d" ? { target: extent.clone().expand(1.2), tilt: 50 } as never : extent.clone().expand(1.15), { duration: 900 }).catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pl, showAuto]);

  useEffect(() => () => { Object.values(L).forEach((id) => dropLayer(map, id)); }, [map]);

  const ck = useMemo(() => (pl ? checks(pl) : []), [pl]);
  const t = pl?.t, rep = pl?.scene.rep ?? {};
  const pct = (v: number) => (pl ? (v / pl.siteArea) * 100 : 0);
  const stepChecks = (n: number) => ck.filter((c) => n === 0 || c.step === n);

  useAnalysisReady(!!pl);
  const kpi = pl && t && top && createPortal(
    <div className="kpiBar">
      {[
        ["Хүн ам", fmtN(t.pop), `зорилт ${fmtN(pl.inp.pop)}`],
        ["Өрх", fmtN(t.hh), ""],
        ["Ажлын байр", fmtN(t.jobs), `+${fmtN(t.jobsBase)} үндсэн`],
        ["Талбай", ha(pl.siteArea, 0), `${fmtN(t.densGross)} хүн/га`],
        ["FAR · BCR", `${fmtN(t.farRes, 2)} · ${fmtN(t.bcrRes * 100, 0)}%`, "орон сууцны блок"],
        ["Ногоон / хүн", `${fmtN(t.greenPP, 1)} м²`, "парк"],
        ["Ус", `${fmtN(t.water)} м³`, "хоногт"],
        ["Дулаан", t.heatMw == null ? "—" : `${fmtN(t.heatMw, 1)} МВт`, t.heatMw == null ? "норм оруулах" : ""],
        ["Шороон ажил", `${fmtN((pl.ibah.cut + pl.ibah.fill) / 1000, 0)}к м³`, "ухалт + дүүргэлт"],
        ["Нормын зөрчил", String(ck.filter((c) => c.ok === false).length), `/${ck.length}`],
      ].map(([l, v, s]) => (
        <div className="kpi" key={l}><span>{l}</span><b>{v}</b>{s && <small>{s}</small>}</div>
      ))}
    </div>, top);

  if (!zones) return <p className="muted">Бүсийн жагсаалт ачаалж байна…</p>;
  const residential = zones.filter((z) => kindOf(z.name, z.type) === "residential");

  return (
    <>
      <AnalysisResults>{planMode === "auto"&&pl&&detailedReport&&<><div className="segTabs resultSteps">{STEPS.map(s=><button key={s.n} className={step===s.n?'on':''} onClick={()=>setStep(s.n)}>{s.t}</button>)}</div>{urbanSave}<PlanningSuitabilityResults reports={pl.suitabilityReports??{building:pl.suitability}}/><RoadTraffic roads={trafficRoads} module={3} active={showAuto&&[0,2,4,5,6,7,10].includes(step)} perHour={Math.round((pl.t.pop??0)*.04)} truckShare={.03}/><PlanTables tables={detailedReport.tables}/></>}</AnalysisResults>
      <div className="planHead">
        <label className="num"><span className="numLabel">Бүс</span>
          <select className="sel" disabled={busy} value={zoneSel ?? ""} onChange={(e) => { setZoneSel(Number(e.target.value)); setDirty(true); }}>
            {residential.map((z) => <option key={z.oid} value={z.oid}>{z.name} · {fmtN(z.ha)} га</option>)}
          </select>
        </label>
        <div className="segTabs planModes" role="tablist" aria-label="Төлөвлөх арга">
          <button role="tab" aria-selected={planMode === "parcel"} className={planMode === "parcel" ? "on" : ""} disabled={busy} onClick={() => { setPlanMode("parcel"); setDim("2d"); setParcelFocus(n => n + 1); }}>Айл бүрт · нэгж талбар</button>
          <button role="tab" aria-selected={planMode === "auto"} className={planMode === "auto" ? "on" : ""} disabled={busy} onClick={() => { setPlanMode("auto"); setDim("2d"); setAutoFocus(n => n + 1); }}>8 га-д систем өөрөө · амины байшин</button>
        </div>
      </div>

      <div hidden={planMode !== "parcel"}><ParcelHouses ring={zone && rings?.[zone.oid] ? rings[zone.oid] : null} version={zone ? Number(/хувилбар (\d+)/.exec(zone.name)?.[1] ?? 0) || null : null} active={active && planMode === "parcel"} focusKey={parcelFocus} /></div>
      <div hidden={planMode !== "auto"}><SoumPlanner ring={zone && rings?.[zone.oid] ? rings[zone.oid] : null} version={zone ? Number(/хувилбар (\d+)/.exec(zone.name)?.[1] ?? 0) || null : null} active={active && planMode === "auto"} focusKey={autoFocus} /></div>
    </>
  );
}

function stepTable(rows: ReturnType<typeof checks>) {
  if (!rows.length) return null;
  return (
    <table className="tbl">
      <thead><tr><th>Үзүүлэлт</th><th>Утга</th><th>Норм</th></tr></thead>
      <tbody>{rows.map((c) => (
        <tr key={c.label} className={c.ok === false ? "rowBad" : ""}>
          <td>{c.label}<small>{c.src}</small></td><td className="tnum">{c.value}</td>
          <td><span className={`chk ${c.ok == null ? "" : c.ok ? "chkOk" : "chkBad"}`}>{c.ok == null ? "?" : c.ok ? "✓" : "✕"}</span>{c.norm}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}
