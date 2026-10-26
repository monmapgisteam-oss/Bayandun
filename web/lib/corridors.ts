// 05. Цогц төлөвлөлт — 1–4-р алхам: зам, улаан шугам, ЦДАШ, эрүүл ахуйн хамгаалалтын бүс.
// 1) Шинэ гол зам: одоо байгаа хучилттай замаас бүс бүр хүртэл DEM дээр налуу багатай A* замаар (Prim маягийн шуналтай өсгөлт),
//    хүчтэй уялдаатай бүсийн хооронд сүлжээний зай хэт урт бол шууд зам нэмнэ. Замын сүлжээн дээр Дейкстрагаар бүс хоорондын зай.
// 2) Улаан шугам: шинэ ба одоо байгаа зам, төлөвлөсөн төмөр замын зурвас.
// 3) ЦДАШ: ЦС (16)-аас одоо байгаа шугамын хамгийн ойрын хоёр чиглэл рүү 220 кВ шугам, хамгаалалтын зурвас.
// 4) ЭАХБ: ЦС, кокс хими, суурьшлын эргэн тойрны бүс.
import { boundaryMask } from "./planBoundary";
import { loadDem, type Dem } from "./dem";
import { fetchFeatures, PAVED_WHERE, type Seg } from "./geo";
import { area, clipPaths, bufPath, bufPoly, densify, diff, inter, unionAll, type Path, type Rings, type XY } from "./geom";
import { routeTerrain, type RouteResult, type RouteOptions } from "./terrainRoute";
import { inside, nearest } from "./geom";
import { ZONE_SERVICE_URL } from "./layers";
import { FN, LINKS, SZZ, type Cls, type Geo } from "./masterplan";
import {buildPlanningSuitability,loadPlanningEnvironment,evaluatePlanningPoint,type PlanningSuitability} from './planningSuitability';
import {corridorGraph} from './sharedUtilityGraph';

// ТААМАГЛАЛ / ШАЛГАХ: улаан шугамын өргөн (м) — БНбД, Авто замын тухай, Төмөр замын тээврийн тухай хуулийн зурвас газар
export type CorOpt = { rowRoad: number; rowRoadExist: number; rowRail: number; rowTl: number; linkRatio: number; cls16: Cls; cls7: Cls; maxGrade: number; demCell: number };
export const COR_DEFAULT: CorOpt = { rowRoad: 40, rowRoadExist: 24 /* Баяндун: сумын шороон зам, ТААМАГЛАЛ */, rowRail: 100, rowTl: 50, linkRatio: 1.6, cls16: "I", cls7: "I", maxGrade: 8, demCell: 50 };

export type RoadCls = "ext" | "trunk" | "link";
export const ROAD_CLS: Record<RoadCls, { label: string; color: string }> = {
  ext: { label: "Одоо байгаа замд холбох гол зам", color: "#B91C1C" },
  trunk: { label: "Бүс хоорондын гол зам", color: "#E4572E" },
  link: { label: "Уялдааны шууд зам", color: "#F59E0B" },
};
export type Road = { path: Path; cls: RoadCls; to: number; from: number | null; km: number; maxGrade: number };

// ---------- Замын граф ----------
type Graph = { key: Map<string, number>; xy: XY[]; adj: { to: number; w: number }[][] };
const kOf = (p: XY) => `${Math.round(p[0])},${Math.round(p[1])}`;
function node(g: Graph, p: XY) {
  const k = kOf(p);
  let i = g.key.get(k);
  if (i == null) { i = g.xy.length; g.key.set(k, i); g.xy.push(p); g.adj.push([]); }
  return i;
}
function edge(g: Graph, a: XY, b: XY) {
  const i = node(g, a), j = node(g, b), w = Math.hypot(a[0] - b[0], a[1] - b[1]);
  if (i === j) return;
  g.adj[i].push({ to: j, w }); g.adj[j].push({ to: i, w });
}
function dijkstra(g: Graph, src: number): Float64Array {
  const d = new Float64Array(g.xy.length).fill(Infinity), heap: [number, number][] = [[0, src]];
  d[src] = 0;
  while (heap.length) {
    // энгийн хоёртын овоо
    const [du, u] = heap[0], last = heap.pop()!;
    if (heap.length) { heap[0] = last; for (let i = 0; ;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[i], heap[m]] = [heap[m], heap[i]]; i = m; } }
    if (du > d[u]) continue;
    for (const { to, w } of g.adj[u]) {
      const nd = du + w;
      if (nd < d[to]) {
        d[to] = nd; heap.push([nd, to]);
        for (let i = heap.length - 1; i > 0;) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[i], heap[p]] = [heap[p], heap[i]]; i = p; }
      }
    }
  }
  return d;
}

function nearestOn(segs: Seg[], p: XY): { q: XY; d: number; s: Seg | null; i: number } {
  let best = { q: p, d: Infinity, s: null as Seg | null, i: -1 };
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    const ex = s[2] - s[0], ey = s[3] - s[1], l2 = ex * ex + ey * ey;
    const t = l2 ? Math.max(0, Math.min(1, ((p[0] - s[0]) * ex + (p[1] - s[1]) * ey) / l2)) : 0;
    const q: XY = [s[0] + ex * t, s[1] + ey * t], d = Math.hypot(q[0] - p[0], q[1] - p[1]);
    if (d < best.d) best = { q, d, s, i };
  }
  return best;
}
const pathSegs = (p: Path): Seg[] => p.slice(1).map((b, i) => [p[i][0], p[i][1], b[0], b[1]]);
const plen = (p: Path) => p.slice(1).reduce((s, b, i) => s + Math.hypot(b[0] - p[i][0], b[1] - p[i][1]), 0);

export type Net = {
  suitability?:PlanningSuitability;
  boundary:Rings; mask: Uint8Array; warnings: string[]; gates: Record<number,XY>;
  dem: Dem; roads: Road[]; exist: Path[]; existIn: Path[]; rail: Path[]; tl: Path[]; tlExist: Path[];
  segs: Seg[]; // бүх зам (одоо + шинэ) — зай тооцоход
  graph: Graph; attach: (p: XY) => { node: number; d: number };
};

/** Нарийн вектор саадыг DEM нүдний хооронд алдахгүйгээр коридорын торыг хязгаарлана. */
export function restrictCorridorMask(dem:Dem,input:Uint8Array,excluded:Rings,halfWidth:number){
 const mask=input.slice(),blocked=excluded.length?bufPoly(excluded,halfWidth+dem.cell/Math.SQRT2):[];
 if(blocked.length)for(let k=0;k<mask.length;k++)if(mask[k]&&inside(dem.x0+k%dem.nx*dem.cell,dem.y0+Math.floor(k/dem.nx)*dem.cell,blocked))mask[k]=0;
 return mask;
}
/** Тооцсон тэнхлэгээс гадна коридорын бүтэн өргөнийг жинхэнэ хил, хоригтой шалгана. */
export function routePlanningCorridor(dem:Dem,mask:Uint8Array,a:XY,b:XY,opt:RouteOptions,clearance:{boundary:Rings;excluded:Rings;halfWidth:number}):RouteResult{
 const result=routeTerrain(dem,mask,a,b,{smooth:true,exactEndpoints:true,...opt});
 if(result.status!=='ok'||result.path.length<2)return result;
 const surface=bufPath([result.path],clearance.halfWidth);
 if(area(diff(surface,clearance.boundary))>.01||clearance.excluded.length&&area(inter(surface,clearance.excluded))>.01)return{path:[],km:0,maxGrade:0,rise:0,status:'blocked',reason:'Трассын бүтэн өргөн хил эсвэл хамгаалалтын зурвастай давхцсан'};
 return result;
}

export async function buildNetwork(g0: Geo, o: CorOpt, onStep?: (s: string) => void): Promise<Net> {
  // Баяндун: DEM-ийн хүрээг төслийн хил (ID 17)-ээр — бүсүүд төслийн хилийг бүрэн хучдаггүй үед гадна коридор DEM-гүй үлдэхгүй
  const pts = g0.site.length ? g0.site.flat() : g0.ids.flatMap((id) => g0.rings[id].flat());
  const bb = { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
  const pad = Math.max(20,o.demCell);
  const boundary=g0.site.length?g0.site:unionAll(g0.ids.map((id)=>g0.rings[id]));
  if(!boundary.length)throw new Error("Төслийн хил алга. Хилийг тодорхойлно уу.");
  const warnings: string[] = [];
  onStep?.(`DEM (зам тооцох, ${o.demCell} м, төслийн хил дотор)…`);
  const dem = await loadDem({ x0: bb.x0 - pad, y0: bb.y0 - pad, x1: bb.x1 + pad, y1: bb.y1 + pad }, Math.max(20,o.demCell));
  // B07-ийн хил тогтмол боловч төлөвлөх үйлдвэрийн чөлөөт газарт нийтлэг
  // замын коридор нөөцөлж болно. Бүх B07-г хаавал B08–B14 тасардаг.
  // Үйлдвэр байрлуулахдаа энэ ROW-г хасна; B01, одоогийн B16-г хэвээр тойрно.
  const fixedBuffers=[1,16].filter((id)=>g0.rings[id]?.length).map((id)=>bufPoly(g0.rings[id],o.rowRoad/2));
  let mask = boundaryMask(dem,boundary,o.rowRoad/2);
  for(let k=0;k<mask.length;k++){
    const x=dem.x0+k%dem.nx*dem.cell,y=dem.y0+Math.floor(k/dem.nx)*dem.cell;
    if(!Number.isFinite(dem.z[k]) || fixedBuffers.some((rings)=>inside(x,y,rings)))mask[k]=0;
  }
  onStep?.("Одоо байгаа зам, төмөр зам, ЦДАШ…");
  const [roadF, railE, railP, tlF,environment] = await Promise.all([
    fetchFeatures(25, PAVED_WHERE, 20000, "roadtype"),
    fetchFeatures(26, "1=1", 30000, "OBJECTID").catch(() => { warnings.push("Одоо байгаа төмөр замын өгөгдөл татагдсангүй; хамгаалалтын зурвас бүрэн бус."); return []; }),
    fetchFeatures(0, "1=1", 30000, "OBJECTID", ZONE_SERVICE_URL).catch(() => { warnings.push("Төлөвлөсөн төмөр замын өгөгдөл татагдсангүй; хамгаалалтын зурвас бүрэн бус."); return []; }),
    fetchFeatures(24, "1=1", 20000, "OBJECTID").catch(() => { warnings.push("ЦДАШ-ын өгөгдөл татагдсангүй; гадна холболт тодорхойгүй."); return []; }),
    loadPlanningEnvironment(),
  ]);
  const near = (p: XY, m: number) => p[0] > bb.x0 - m && p[0] < bb.x1 + m && p[1] > bb.y0 - m && p[1] < bb.y1 + m;
  if(!mask.some(Boolean))throw new Error("Хил, зурвасын өргөн, хориглолтод багтах трассын нүд алга.");
  const externalRoads = roadF.flatMap((f) => f.geometry.paths ?? []).filter((p) => p.some((q) => near(q as XY, 25000))) as Path[];
  const exist=clipPaths(externalRoads,boundary);
  const existIn = exist.filter((p) => p.some((q) => near(q, 0)));
  const rail = clipPaths([...railE, ...railP].flatMap((f) => f.geometry.paths ?? []) as Path[],boundary);
  const externalTl=tlF.flatMap((f) => f.geometry.paths ?? []) as Path[];
  const tlExist = clipPaths(externalTl,boundary);
  onStep?.('Замын тохиромж: налуу · урсац · хөрс · цэвдэг · хамгаалалтын зурвас…');
  const suitability=buildPlanningSuitability({dem,boundary,roads:exist,environment,restrictions:[
    {id:'rail-corridor',label:'Төмөр замын нөөц зурвас',rings:rail.length?bufPath(rail,o.rowRail/2):[]},
    {id:'power-corridor',label:'ЦДАШ-ын нөөц зурвас',rings:tlExist.length?bufPath(tlExist,o.rowTl/2):[],profiles:['building']},
    {id:'existing-road',label:'Одоогийн авто замын нөөц зурвас',rings:exist.length?bufPath(exist,o.rowRoadExist/2):[],profiles:['building']},
    {id:'existing-plant',label:'B16 одоогийн станц',rings:g0.rings[16]??[],profiles:['building']},
  ]});
  const roadExcluded=unionAll([...[1,16].map(id=>g0.rings[id]??[]),...suitability.restrictions.filter(r=>!r.profiles||r.profiles.includes('road')).map(r=>r.rings)]);
  mask=restrictCorridorMask(dem,mask,roadExcluded,o.rowRoad/2);
  const roadClearance={boundary,excluded:roadExcluded,halfWidth:o.rowRoad/2};
  const roadCost=new Float64Array(mask.length).fill(Infinity);
  for(let k=0;k<mask.length;k++)if(mask[k]){const point:XY=[dem.x0+k%dem.nx*dem.cell,dem.y0+Math.floor(k/dem.nx)*dem.cell],assessment=evaluatePlanningPoint(suitability,point,'road');if(!assessment.allowed)mask[k]=0;else roadCost[k]=assessment.cost;}
  for(const layer of environment.layers)if(layer.status==='missing')warnings.push(`${layer.label}: тохиромжийн эх өгөгдөл татагдаагүй.`);

  // ---------- Шинэ гол зам: одоо байгаа замаас бүс бүр хүртэл (шуналтай өсгөлт) ----------
  if (!externalRoads.length) throw new Error("Одоо байгаа авто замын өгөгдөл олдсонгүй. Холболт зохиож үүсгэхгүй.");
  const snap=(p:XY):XY=>{let best:XY=p,dist=Infinity;for(let k=0;k<mask.length;k++)if(mask[k]){const q:XY=[dem.x0+k%dem.nx*dem.cell,dem.y0+Math.floor(k/dem.nx)*dem.cell],dd=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dd<dist){best=q;dist=dd;}}return best;};
  const net: Seg[] = exist.flatMap(pathSegs);
  if(!net.length){const nearRoad=nearestOn(externalRoads.flatMap(pathSegs),g0.c[g0.ids[0]]).q,seed=snap(nearRoad);net.push([seed[0],seed[1],seed[0],seed[1]]);warnings.push("Одоо байгаа зам хилийн гадна. Хил доторх орцоос сүлжээ тооцов; гадна холболтыг тусдаа шийднэ.");}
  const nExist=net.length; // эхний nExist нь одоо байгаа зам
  const roads: Road[] = [];
  const cell=(p:XY)=>{const x=Math.round((p[0]-dem.x0)/dem.cell),y=Math.round((p[1]-dem.y0)/dem.cell);return x<0||y<0||x>=dem.nx||y>=dem.ny?-1:y*dem.nx+x;};
  const connectable=(segments:Seg[],point:XY)=>{
    let best=nearestOn([],point);
    for(let i=0;i<segments.length;i++){const s=segments[i],near=nearestOn([s],point);const options=mask[cell(near.q)]?[near.q]:densify([[s[0],s[1]],[s[2],s[3]]],dem.cell/2).filter(p=>mask[cell(p)]);
      for(const q of options){const d=Math.hypot(q[0]-point[0],q[1]-point[1]);if(d<best.d)best={q,d,s,i};}
    }return best;
  };
  const gate = Object.fromEntries(g0.ids.map((id) => {
    const toward=nearestOn(net,g0.c[id]).q, edge=nearest(g0.rings[id],toward);
    let best:XY=edge,dist=Infinity;
    for(let k=0;k<mask.length;k++)if(mask[k]){const x=dem.x0+k%dem.nx*dem.cell,y=dem.y0+Math.floor(k/dem.nx)*dem.cell,d=Math.hypot(x-edge[0],y-edge[1]);if(d<dist){dist=d;best=[x,y];}}
    return [id,best];
  })) as Record<number, XY>;
  const left = new Set(g0.ids);
  while (left.size) {
    let best: { id: number; q: XY; d: number; s: Seg | null; i: number } | null = null;
    for (const id of left) { const r = connectable(net, gate[id]); if (Number.isFinite(r.d)&&(!best || r.d < best.d)) best = { id, ...r }; }
    if (!best) break;
    left.delete(best.id);
    onStep?.(`Зам: ${best.id}. ${FN[best.id].short} (${left.size} үлдсэн)…`);
    await new Promise((ok) => setTimeout(ok, 0));
    if (best.d < 30) continue; // замын дэргэд байна
    const routed = routePlanningCorridor(dem,mask,best.q,gate[best.id],{maxGrade:o.maxGrade,costSurface:roadCost},roadClearance);
    if(routed.status!=="ok"){warnings.push(`${FN[best.id].short}: ${routed.reason}`);continue;}
    if(routed.path.length<2)continue;
    const path=routed.path;
    roads.push({ path, maxGrade:routed.maxGrade, cls: best.i >= 0 && best.i < nExist ? "ext" : "trunk", to: best.id, from: null, km: plen(path) / 1000 });
    net.push(...pathSegs(path));
  }

  // Граф
  const build = () => {
    const physical=corridorGraph([...exist,...roads.map(r=>r.path)]),g:Graph={key:new Map(),xy:physical.nodes,adj:physical.nodes.map(()=>[])};
    physical.nodes.forEach((p,i)=>g.key.set(kOf(p),i));for(const e of physical.edges){g.adj[e.a].push({to:e.b,w:e.length});g.adj[e.b].push({to:e.a,w:e.length});}
    return g;
  };
  let graph = build();
  const attachFn = (g: Graph) => (p: XY) => {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < g.xy.length; i++) { const d = Math.hypot(g.xy[i][0] - p[0], g.xy[i][1] - p[1]); if (d < bd) { bd = d; bi = i; } }
    return { node: bi, d: bd };
  };

  // Уялдааны шууд зам: хүчтэй холбоотой (жин ≥2) бүсийн сүлжээний зай шулуунаас linkRatio дахин урт бол
  onStep?.("Уялдааны шууд зам шалгаж байна…");
  for (const l of LINKS.filter((x) => x.w >= 2)) {
    const a = gate[l.a], b = gate[l.b];
    if (!a || !b) continue; // Баяндун: холбоосын бүс төсөлд байхгүй
    const eu = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (eu < 500 || eu > 10000) continue;
    const na = attachFn(graph)(a), nb = attachFn(graph)(b), d = dijkstra(graph, na.node)[nb.node] + na.d + nb.d;
    if (d > o.linkRatio * eu) {
      const routed=routePlanningCorridor(dem,mask,a,b,{maxGrade:o.maxGrade,costSurface:roadCost},roadClearance);
      if(routed.status!=="ok"){warnings.push(`${l.a} → ${l.b}: ${routed.reason}`);continue;}
      if(routed.path.length<2)continue;
    const path=routed.path;
      roads.push({ path, maxGrade:routed.maxGrade, cls: "link", to: l.b, from: l.a, km: plen(path) / 1000 });
      graph = build();
    }
  }
  graph = build();

  // ---------- ЦДАШ: ЦС (16)-аас одоо байгаа шугамын хамгийн ойрын хоёр чиглэл рүү ----------
  const utilityExcluded=unionAll(suitability.restrictions.filter(r=>!r.profiles||r.profiles.includes('utility')).map(r=>r.rings)),utilityClearance={boundary,excluded:utilityExcluded,halfWidth:.75};
  const utilityMask=restrictCorridorMask(dem,mask,utilityExcluded,.75),utilityCost=Float64Array.from(utilityMask,(valid,k)=>valid?evaluatePlanningPoint(suitability,[dem.x0+k%dem.nx*dem.cell,dem.y0+Math.floor(k/dem.nx)*dem.cell],'utility').cost:Infinity);
  const tl: Path[] = [];
  const tlSegs = externalTl.flatMap(pathSegs);
  if (tlSegs.length) {
    const s = gate[16] ?? gate[g0.ids[0]], t1 = nearestOn(tlSegs, s);
    const first=routePlanningCorridor(dem,utilityMask,s,snap(t1.q),{maxGrade:25,costSurface:utilityCost},utilityClearance); if(first.status==="ok")tl.push(first.path);else warnings.push(`ЦДАШ: ${first.reason}`);
    const a1 = Math.atan2(t1.q[1] - s[1], t1.q[0] - s[0]);
    let t2: { q: XY; d: number } | null = null;
    for (const sg of tlSegs) for (const q of [[sg[0], sg[1]], [sg[2], sg[3]]] as XY[]) {
      let da = Math.abs(Math.atan2(q[1] - s[1], q[0] - s[0]) - a1); if (da > Math.PI) da = 2 * Math.PI - da;
      const d = Math.hypot(q[0] - s[0], q[1] - s[1]);
      if (da > (100 * Math.PI) / 180 && (!t2 || d < t2.d)) t2 = { q, d };
    }
    if (t2) {const second=routePlanningCorridor(dem,utilityMask,s,snap(t2.q),{maxGrade:25,costSurface:utilityCost},utilityClearance);if(second.status==="ok")tl.push(second.path);else warnings.push(`ЦДАШ: ${second.reason}`);}
  }

  const segs = [...exist, ...roads.map((r) => r.path)].flatMap(pathSegs);
  return { suitability:buildPlanningSuitability({...suitability,roads:[...exist,...roads.map(r=>r.path)]}),boundary, mask, warnings, gates:gate, dem, roads, exist, existIn, rail, tl, tlExist, segs, graph, attach: attachFn(graph) };
}

/** Сүлжээгээр хоёр цэгийн хоорондох зай (м): хүрэх зай + замын граф */
export function netDist(net: Net, pts: XY[]): number[][] {
  if(!net.graph.xy.length)return pts.map(()=>pts.map(()=>Infinity));
  const at = pts.map((p) => net.attach(p));
  return at.map((a) => { const d = dijkstra(net.graph, a.node); return at.map((b) => d[b.node] + a.d + b.d); });
}

// ---------- Улаан шугам, ЦДАШ-ын зурвас ----------
export type Red = { road: Rings; roadExist: Rings; rail: Rings; tl: Rings; all: Rings; ha: Record<"road" | "roadExist" | "rail" | "tl" | "all", number>; plan: Rings };
export function redZones(net: Net, g0: Geo, o: CorOpt): Red {
  const plan = g0.site.length ? g0.site : unionAll(g0.ids.map((id) => g0.rings[id]));
  const clip = (r: Rings) => (r.length ? inter(r, plan) : []);
  const road = clip(bufPath(net.roads.map((r) => r.path), o.rowRoad / 2));
  const roadExist = clip(net.existIn.length ? bufPath(net.existIn, o.rowRoadExist / 2) : []);
  const rail = clip(net.rail.length ? bufPath(net.rail, o.rowRail / 2) : []);
  const tl = clip(net.tl.length ? bufPath(net.tl, o.rowTl / 2) : []);
  const all = unionAll([road, roadExist, rail, tl].filter((r) => r.length));
  const ha = { road: area(road) / 1e4, roadExist: area(roadExist) / 1e4, rail: area(rail) / 1e4, tl: area(tl) / 1e4, all: area(all) / 1e4 };
  return { road, roadExist, rail, tl, all, ha, plan };
}

// ---------- ЭАХБ: ЦС, кокс хими, суурьшлын эргэн тойрон ----------
export type Szz = { id: number; cls: Cls; m: number; ring: Rings; hit: Rings; hitHa: number }[];
export function szzFixed(g0: Geo, o: CorOpt): { zones: Szz; settle: { cls: Cls; m: number; ring: Rings }[] } {
  const home = g0.rings[1];
  const zones = ([[16, o.cls16], [7, o.cls7]] as [number, Cls][]).map(([id, cls]) => {
    const m = SZZ[cls], ring = diff(bufPoly(g0.rings[id], m), g0.rings[id]), hit = inter(ring, home);
    return { id, cls, m, ring, hit, hitHa: area(hit) / 1e4 };
  });
  // Суурьшлын эргэн тойронд: ангиар хориглох бүс (жишээ нь I ангийн үйлдвэр 1000 м дотор болохгүй)
  const settle = (["I", "II", "III", "IV", "V"] as Cls[]).map((cls) => ({ cls, m: SZZ[cls], ring: diff(bufPoly(home, SZZ[cls]), home) }));
  return { zones, settle };
}

/** Инженерийн трасс нь авто замын коридорыг илүүд үзнэ. Бохирын өндөрсөлтийг тусад нь мэдээлнэ. */
export function routeUtilities(net:Net, edges:Record<string,{edges:XY[][];km:number}>, occupied:Rings=[]) {
  const excluded=unionAll([occupied,...(net.suitability?.restrictions??[]).filter(r=>!r.profiles||r.profiles.includes('utility')).map(r=>r.rings)]);
  // Авто замын тор B01/B16 болон 40 м ROW-г бүхэлд нь хассан байдаг.
  // Хоолой/кабельд тэр хоригийг өвлүүлэхгүй: өөрийн өргөн ба профайлаар шинээр үүсгэнэ.
  const utilityBoundary=boundaryMask(net.dem,net.boundary,.75);
  for(let k=0;k<utilityBoundary.length;k++)if(!Number.isFinite(net.dem.z[k])||net.dem.z[k]===-999999)utilityBoundary[k]=0;
  const utilityMask=restrictCorridorMask(net.dem,utilityBoundary,excluded,.75),roadMask=restrictCorridorMask(net.dem,net.mask,excluded,.75);
  const preferred=new Uint8Array(utilityMask.length);
  const utilityCost=net.suitability?Float64Array.from(utilityMask,(valid,k)=>valid?evaluatePlanningPoint(net.suitability!,[net.dem.x0+k%net.dem.nx*net.dem.cell,net.dem.y0+Math.floor(k/net.dem.nx)*net.dem.cell],'utility').cost:Infinity):undefined;
  if(utilityCost)for(let k=0;k<utilityMask.length;k++)if(!Number.isFinite(utilityCost[k])){utilityMask[k]=0;roadMask[k]=0;}
  for(const s of net.segs){const n=Math.max(1,Math.ceil(Math.hypot(s[2]-s[0],s[3]-s[1])/net.dem.cell));for(let j=0;j<=n;j++){
    const x=Math.round((s[0]+(s[2]-s[0])*j/n-net.dem.x0)/net.dem.cell),y=Math.round((s[1]+(s[3]-s[1])*j/n-net.dem.y0)/net.dem.cell);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const i=x+dx,k=y+dy;if(i>=0&&k>=0&&i<net.dem.nx&&k<net.dem.ny)preferred[k*net.dem.nx+i]=1;}
  }}
  return Object.fromEntries(Object.entries(edges).map(([kind,group])=>{const mask=['water','sewer','power','heat'].includes(kind)?utilityMask:roadMask,snap=(p:XY)=>snapRoutePoint({...net,mask},p);return[kind,group.edges.map((e)=>{
    const a=snap(e[0]),b=snap(e[e.length-1]);
    return routePlanningCorridor(net.dem,mask,kind==="sewer"?b:a,kind==="sewer"?a:b,{maxGrade:kind==="road"?8:kind==="rail"?2:25,preferred,costSurface:utilityCost},{boundary:net.boundary,excluded,halfWidth:kind==="road"?4:kind==="rail"?5:.75});
  })];}));
}

export function snapRoutePoint(net:Net,p:XY):XY {
 let best=p,dist=Infinity;
 for(let k=0;k<net.mask.length;k++)if(net.mask[k]){
  const q:XY=[net.dem.x0+k%net.dem.nx*net.dem.cell,net.dem.y0+Math.floor(k/net.dem.nx)*net.dem.cell],d=Math.hypot(q[0]-p[0],q[1]-p[1]);
  if(d<dist){best=q;dist=d;}
 }
 return best;
}
