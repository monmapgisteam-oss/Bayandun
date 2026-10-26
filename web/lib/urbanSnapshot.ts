// Концепц хотын гадаргуу, давхар, дээвэр, модыг бодит хэмжээтэйгээр хадгалах.
import type {Plan} from './urban';
import {utmLayer} from './modmap';
import {SYS} from './network';
import {GROUND,MASS,LOT_LABEL,heightCls} from './zoning';
import {inter,diff,bufPath,clipPath,unionAll,type XY,type Rings} from './geom';
import {urbanRoads} from './plannedRoads';
import {roadDetailLayers,roadSurface,type RoadAppearanceOptions} from './roadAppearance';
const roadCache=new WeakMap<Plan,{roads:ReturnType<typeof urbanRoads>;boundary:Rings}>();
function urbanRoadData(pl:Plan){
 let data=roadCache.get(pl);if(!data){const roads=urbanRoads(pl),external=pl.streets.filter(s=>s.ext),access=external.length?urbanRoads({...pl,streets:external}):[];data={roads,boundary:unionAll([pl.zone,...access.map(r=>bufPath([r.path],r.width/2))])};roadCache.set(pl,data);}return data;
}
function boundedRoadOptions(pl:Plan,options:RoadAppearanceOptions){const data=urbanRoadData(pl);return{...options,boundary:options.boundary?.length?inter(data.boundary,options.boundary):data.boundary};}
/** Залгах хотын замын зөвхөн ойр хэсэг; тасалсан үзүүрүүд суурьшлын дүрслэлээс 100 м зайд байна. */
export function urbanRoadContext(pl:Plan,paths:XY[][]=[]){
 const roads=urbanRoads(pl);if(!paths.length||!roads.length)return roads;
 const points=roads.flatMap(r=>r.path),pad=Math.max(100,...roads.map(r=>r.width*2)),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x0=Math.min(...xs)-pad,x1=Math.max(...xs)+pad,y0=Math.min(...ys)-pad,y1=Math.max(...ys)+pad;
 const nearby=clipPath(paths,[[[x0,y0],[x0,y1],[x1,y1],[x1,y0],[x0,y0]]]);
 return [...roads,...nearby.map((path,i)=>({id:`urban-context-${i}`,path,width:8,lanes:1,speed:40,use:'connector' as const}))];
}
/** Доторх замыг суурьшлын хилээр, хүрэх замыг өөрийн бодит коридороор хязгаарлана. */
export function urbanRoadSceneLayers(pl:Plan,options:RoadAppearanceOptions={}){
 return roadDetailLayers(urbanRoadData(pl).roads,'mod:3:planned-roads',boundedRoadOptions(pl,options));
}
/** Хуучин асфальт шинэ голын зурвасыг дүүргэхгүй; явган/дугуйн зам, ногоон зурвасыг хадгална. */
export function urbanStreetGround(pl:Plan,options:RoadAppearanceOptions={}){
 const {roads}=urbanRoadData(pl),bounded=boundedRoadOptions(pl,options),outer=inter(unionAll(roads.map(r=>bufPath([r.path],r.width/2))),bounded.boundary),median=diff(outer,roadSurface(roads,bounded));
 return [...pl.scene.streets.filter(s=>s.k!=='road').map(s=>({...s,rings:inter(s.rings,pl.zone)})).filter(s=>s.rings.length),...(median.length?[{rings:median,k:'verge' as const,lot:0}]:[])];
}
export function urbanSceneLayers(pl:Plan,options:RoadAppearanceOptions={}){
 const byId=new Map(pl.bldgs.map(b=>[b.id,b]));
 const ground={type:'unique-value',field:'k',uniqueValueInfos:Object.entries(GROUND).map(([value,m])=>({value,symbol:{type:'simple-fill',color:m.color,outline:{width:0}}}))};
 return [
 ...(['streets','base','over'] as const).map(k=>utmLayer({id:`mod:3:${k==='streets'?'streetG':k}`,title:'Хотын гадаргуу',geom:'polygon',fields:[{name:'k',type:'string'}],rows:(k==='streets'?urbanStreetGround(pl,options):pl.scene[k].map(o=>({...o,rings:inter(o.rings,pl.zone)}))).map(o=>({g:o.rings,a:{k:o.k}})).filter(r=>r.g.length),renderer:ground})),
 ...urbanRoadSceneLayers(pl,options),
 utmLayer({id:'mod:3:marks',title:'Явган гарц · зогсоолын тэмдэглэгээ',geom:'polygon',fields:[],rows:pl.scene.marks.map(m=>({g:inter(m.rings,pl.zone),a:{}})).filter(r=>r.g.length),minScale:10000,renderer:{type:'simple',symbol:{type:'simple-fill',color:'#f5f5f2',outline:{width:0}}}}),
 utmLayer({id:'mod:3:mass',title:'Барилга · давхар ба дээвэр',geom:'polygon',fields:[{name:'name',type:'string'},{name:'k',type:'string'},...['h','z0','pop','jobs','hh','gfa_m2','water_m3_day','sewer_m3_day','heat_kw','power_kw','suitability_score','terrain_slope_pct','flow_ha','terrain_relief_m','dem_cell_m'].map(name=>({name,type:'double' as const})),...['bid','fl','hc','floors'].map(name=>({name,type:'integer' as const}))],rows:pl.scene.masses.map(o=>{const b=byId.get(o.bid);return{g:inter(o.rings,pl.zone),a:{name:b?`${LOT_LABEL[b.use]} · ${b.id}`:'Барилга',k:o.k,h:o.h,z0:o.z0,bid:o.bid,fl:o.fl,hc:b?heightCls(b.floors):0,floors:b?.floors??0,pop:b?.pop??0,jobs:b?.jobs??0,hh:b?.hh??0,gfa_m2:b?.gfa??0,water_m3_day:b?.waterM3??0,sewer_m3_day:b?.sewM3??0,heat_kw:b?.heatKw??null,power_kw:b?.elecKw??null,suitability_score:b?.suitability?.score??null,terrain_slope_pct:b?.suitability?.evidence.slopePct??null,flow_ha:b?.suitability?.evidence.flowHa??null,terrain_relief_m:b?.suitability?.evidence.reliefM??null,dem_cell_m:b?.suitability?.evidence.demCellM??null}};}).filter(r=>r.g.length),elevationInfo:{mode:'relative-to-ground',featureExpressionInfo:{expression:'$feature.z0'},unit:'meters'},renderer:{type:'unique-value',field:'k',uniqueValueInfos:Object.entries(MASS).map(([value,m])=>({value,symbol:{type:'polygon-3d',symbolLayers:[{type:'extrude',size:1,material:{color:m.color}}]}})),visualVariables:[{type:'size',field:'h',valueUnit:'meters'}]}}),
 utmLayer({id:'mod:3:trees',title:'Мод',geom:'point',fields:[{name:'h',type:'double'},{name:'d',type:'double'}],rows:pl.scene.trees.map(t=>({g:[t.x,t.y] as XY,a:{h:t.h,d:t.r*2}})),minScale:20000,renderer:{type:'simple',symbol:{type:'point-3d',symbolLayers:[{type:'object',resource:{primitive:'sphere'},material:{color:'#64854d'},anchor:'bottom'}]},visualVariables:[{type:'size',field:'h',axis:'height',valueUnit:'meters'},{type:'size',field:'d',axis:'width-and-depth',valueUnit:'meters'}]}}),
 utmLayer({id:'mod:3:nets',title:'Хорооллын шугам',geom:'polyline',fields:[{name:'sys',type:'string'},{name:'load',type:'double'},{name:'dn_mm',type:'double'},{name:'from_node',type:'integer'},{name:'to_node',type:'integer'},{name:'invert_from',type:'double'},{name:'invert_to',type:'double'},{name:'depth_m',type:'double'}],rows:Object.values(pl.nets).flatMap(n=>(n?.lines??[]).map(l=>({g:l.path,a:{sys:l.sys,load:l.flow,dn_mm:l.dn,from_node:l.fromNode??null,to_node:l.toNode??null,invert_from:l.invertFrom??null,invert_to:l.invertTo??null,depth_m:l.depth}}))),renderer:{type:'unique-value',field:'sys',uniqueValueInfos:Object.entries(SYS).map(([value,s])=>({value,symbol:{type:'simple-line',color:s.color,width:1.6}}))}})];
}
