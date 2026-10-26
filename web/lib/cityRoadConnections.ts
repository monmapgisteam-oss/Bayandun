import {zAt} from './dem';
import type {SavedPlan} from './savedPlans';
import type {Net,Red,Road} from './corridors';
import {baseTopic} from './planningBoundary';
import {savedRoads} from './plannedRoads';
import {savedStructures} from './planOccupancy';
import {accessRoute} from './facilitySite';
import {corridorGraph} from './sharedUtilityGraph';
import {streetComponents} from './urbanStreetConnections';
import {buildPlanningSuitability,planningRoadDistance} from './planningSuitability';
import {terrainSegmentMaxGrade} from './terrainRoute';
import {nearest,dist,unionAll,pathLength,area,inter,diff,bufPath,bufPoly,clipPaths,type Rings,type XY} from './geom';
const segments=(paths:XY[][]):Net['segs']=>paths.flatMap(path=>path.slice(1).map((b,i)=>[path[i][0],path[i][1],b[0],b[1]]));
/** Ижил хот/хилийн хадгалсан замыг шинэ сэдвийн орцод дахин ашиглана.
 * Өмнөх үйлдвэрийн зам нь батлагдсан нийтийн зам бус саналын хамтын коридор. */
export function savedCityNetwork(net:Net,plans:SavedPlan[],options:{zones?:Record<number,Rings>}={}):Net{
 const saved=plans.find(p=>baseTopic(p.topic)==='infrastructure'),input=saved?.inputs as {networkKey?:unknown;roads?:unknown}|undefined;
 const validPaths=(raw:unknown):XY[][]=>Array.isArray(raw)?raw.filter((p):p is number[][]=>Array.isArray(p)&&p.length>1&&p.every(x=>Array.isArray(x)&&x.length>=2&&Number.isFinite(x[0])&&Number.isFinite(x[1]))).map(p=>p.map(x=>[x[0],x[1]] as XY)):[];
 let paths=validPaths(Array.isArray(input?.roads)?input.roads.map(r=>r&&typeof r==='object'?'path' in r?r.path:null:null):[]);
 if(!paths.length&&typeof input?.networkKey==='string'){try{paths=validPaths(JSON.parse(input.networkKey));}catch{/* Хуучин эвдэрсэн мөр нь тооцоолсон сүлжээг устгах ёсгүй. */}}
 // Хуучин хадгалалт замын тэнхлэггүй байж болно. Бодит эх зам ба DEM-ээр
 // шинээр тооцсон сүлжээг хадгалж, үйлдвэрийн төлөвлөлтийг үргэлжлүүлнэ.
 const base=saved?(paths.length?{...net,exist:paths,roads:[],segs:segments(paths),suitability:net.suitability?buildPlanningSuitability({...net.suitability,roads:paths}):undefined,warnings:[...net.warnings]}:{...net,warnings:[...net.warnings,'Хадгалсан хотын замын тэнхлэг дутуу тул одоогийн эх өгөгдлөөр тооцсон замыг ашиглав. Хотын холболтыг дахин хадгална уу.']}):net;
 const warnings=[...base.warnings];let missingFactoryContext=0;
 const prior=plans.filter(p=>baseTopic(p.topic)!=='infrastructure').flatMap(plan=>{
  const roads=savedRoads([plan]),factory=/^topic:(\d+)$/.exec(baseTopic(plan.topic));if(!factory)return roads;
  // Үйлдвэрийн ачих талбай, ажилтны мухар замыг хотын гол холболт гэж
  // ашиглахгүй. Зөвхөн тодорхой хадгалсан гаднын орцын, эзэмшигч бүсээс
  // бүтэн өргөнөөр гарсан хэсгийг яг одоогийн тэнхлэг дээр хуваалцана.
  const owner=options.zones?.[Number(factory[1])],data=plan.inputs as {sites?:{access?:unknown}[]}|undefined;
  const access=validPaths(Array.isArray(data?.sites)?data.sites.flatMap(site=>Array.isArray(site?.access)?site.access:[]):[]);
  if(!owner?.length||!net.boundary?.length||!access.length){missingFactoryContext++;return[];}
  const same=(a:XY[],b:XY[])=>a.length===b.length&&(a.every((p,i)=>p[0]===b[i][0]&&p[1]===b[i][1])||a.every((p,i)=>p[0]===b[b.length-1-i][0]&&p[1]===b[b.length-1-i][1]));
  const external=roads.filter(road=>access.some(path=>same(road.path,path)));
  if(!external.length){missingFactoryContext++;return[];}
  return external.flatMap(road=>clipPaths([road.path],diff(net.boundary,bufPoly(owner,road.width/2))).filter(path=>pathLength(path)>.01).map((path,i)=>({...road,id:`${road.id}:external-${i}`,path})));
 });
 if(missingFactoryContext)warnings.push(`${missingFactoryContext} үйлдвэрийн эзэмшигч бүс / гаднын орцын тэнхлэг дутуу тул дотоод замыг хамтын коридор гэж ашигласангүй.`);
 if(!prior.length)return warnings.length===base.warnings.length?base:{...base,warnings};
 const baseline=[...base.exist,...base.roads.map(r=>r.path)],restrictions=net.suitability?.restrictions.filter(r=>!r.profiles||r.profiles.includes('road'))??[];
 let rejected=0,narrow=0;
 const reusable=prior.filter(r=>{
  // Одоогийн Net нь өргөнийг тусад нь хадгалахгүй, үйлдвэрийн context 8 м.
  // Нарийн PV/салхины замыг 8 м болгосон мэт ашиглахгүй.
  if(r.width<8){narrow++;return false;}
  if(!net.boundary?.length||!net.dem){rejected++;return false;}
  const surface=bufPath([r.path],r.width/2),valid=area(diff(surface,net.boundary))<=.01&&!restrictions.some(s=>area(inter(surface,s.rings))>.01)&&r.path.slice(1).every((b,i)=>terrainSegmentMaxGrade(net.dem,r.path[i],b)<=8.00001);
  if(!valid)rejected++;return valid;
 });
 if(narrow)warnings.push(`${narrow} хадгалсан зам 8 м-ээс нарийн тул үйлдвэрийн хамтын коридорт ашигласангүй; өргөтгөл / тусдаа орцыг төлөвлөнө.`);if(rejected)warnings.push(`${rejected} хадгалсан замыг одоогийн хил / хориг / DEM налууны шалгалтаар хамтын коридорт ашигласангүй.`);
 if(!reusable.length)return{...base,warnings};
 // Нэг физик сегментийг давхар нэмж, сантиметрийн параллель шинэ трасс
 // үүсгэхгүй. Хуучин тэнхлэгийн яг координат дээр шинэ орцыг залгана.
 const candidateGraph=corridorGraph([...baseline,...reusable.map(r=>r.path)]),additions:Road[]=candidateGraph.edges.filter(e=>{
  const a=candidateGraph.nodes[e.a],b=candidateGraph.nodes[e.b];return(planningRoadDistance(baseline,[(a[0]+b[0])/2,(a[1]+b[1])/2])??Infinity)>.001;
 }).map(e=>{const path:XY[]=[candidateGraph.nodes[e.a],candidateGraph.nodes[e.b]];return{path,cls:'link',from:null,to:0,km:e.length/1000,maxGrade:terrainSegmentMaxGrade(net.dem,path[0],path[1])};});
 if(additions.length)warnings.push('ТААМАГЛАЛ: өмнө хадгалсан сэдвийн замыг хамтын саналын коридор болгон дахин ашиглав. Нийтийн замын статус, нэвтрэх эрх / сервитут баталгаажаагүй.');
 const combined=[...baseline,...additions.map(r=>r.path)],physical=corridorGraph(combined),graph:Net['graph']={key:new Map(),xy:physical.nodes,adj:physical.nodes.map(()=>[])};
 physical.nodes.forEach((p,i)=>graph.key.set(`${Math.round(p[0])},${Math.round(p[1])}`,i));for(const e of physical.edges){graph.adj[e.a].push({to:e.b,w:e.length});graph.adj[e.b].push({to:e.a,w:e.length});}
 const attach=(p:XY)=>{let node=0,d=Infinity;graph.xy.forEach((q,i)=>{const distance=dist(p,q);if(distance<d){node=i;d=distance;}});return{node,d};};
 return{...base,roads:[...base.roads,...additions],segs:physical.edges.map(e=>{const a=physical.nodes[e.a],b=physical.nodes[e.b];return[a[0],a[1],b[0],b[1]];}),graph,attach,suitability:net.suitability?buildPlanningSuitability({...net.suitability,roads:combined}):undefined,warnings:[...new Set(warnings)]};
}
/** Дахин тооцсон хотын замыг хадгалсан сэдвийн бодит орцтой холбох; байрлалыг хөдөлгөхгүй. */
export function connectSavedTopics(net:Net,red:Red,plans:SavedPlan[],protectedAreas:Rings=[]){
 const topics=plans.filter(p=>baseTopic(p.topic)!=='infrastructure'),local=savedRoads(topics),city=[...net.exist,...net.roads.map(r=>r.path)],links:Road[]=[],warnings:string[]=[];
 if(!city.length)return{net,warnings:['Хотын замын сүлжээ алга.']};
 const obstacles=unionAll([savedStructures(topics),protectedAreas,red.rail]),baseline=corridorGraph(city),baseComponents=streetComponents(baseline),lengths=new Map<number,number>();
 for(const edge of baseline.edges){const c=baseComponents.component[edge.a];lengths.set(c,(lengths.get(c)??0)+edge.length);}
 const main=[...lengths].sort((a,b)=>b[1]-a[1])[0]?.[0],anchor=baseline.nodes.find((_,i)=>baseComponents.component[i]===main);
 if(!anchor)return{net,warnings:['Хотын замын хүчинтэй сегмент алга.']};
 const paths=[...city,...local.map(r=>r.path)];let remaining=0;
 // Бодит холбоос бүрээр компонентуудыг нэгтгэнэ. Гол хэсэг рүү хүрэх
 // боломжгүй байсан ч нэг талд байгаа хоёр хэсгийг хооронд нь залгана.
 for(let round=0;round<paths.length+1;round++){
  const graph=corridorGraph([...paths,...links.map(r=>r.path)]),{component,count}=streetComponents(graph);remaining=Math.max(0,count-1);if(!remaining)break;
  const ai=graph.nodes.findIndex(p=>dist(p,anchor)<.001),root=component[ai],trunks=graph.edges.filter(e=>component[e.a]===root).map(e=>[graph.nodes[e.a],graph.nodes[e.b]] as XY[]);
  const groups=new Map<number,number[]>();graph.nodes.forEach((_,i)=>{if(component[i]===root)return;const nodes=groups.get(component[i])??[];nodes.push(i);groups.set(component[i],nodes);});
  const candidates=[...groups].map(([id,nodes])=>{const points:XY[]=[...nodes.map(n=>graph.nodes[n]),...graph.edges.filter(e=>component[e.a]===id).map(e=>[(graph.nodes[e.a][0]+graph.nodes[e.b][0])/2,(graph.nodes[e.a][1]+graph.nodes[e.b][1])/2] as XY)],choices=points.map(start=>({start,end:nearest(trunks,start,false)})).sort((a,b)=>dist(a.start,a.end)-dist(b.start,b.end));return{id,choices};}).sort((a,b)=>dist(a.choices[0].start,a.choices[0].end)-dist(b.choices[0].start,b.choices[0].end));
  let joined=false;
  for(const group of candidates){for(const c of group.choices.slice(0,12)){
   const path=accessRoute(c.start,c.end,net,obstacles,net.boundary);if(!path.length)continue;
   const maxGrade=path.slice(1).reduce((grade,p,i)=>Math.max(grade,Math.abs(zAt(net.dem,...p)-zAt(net.dem,...path[i]))/Math.max(.001,dist(p,path[i]))*100),0);
   links.push({path,cls:'link',from:null,to:0,km:pathLength(path)/1000,maxGrade});
   if(red.tl.length&&area(inter(bufPath([path],4),red.tl))>.01)warnings.push('ШАЛГАХ: хотын холбох зам ЦДАШ-ын зурвастай огтлолцоно. Агаарын зай, тулгуур, засварын нэвтрэлт ба техникийн нөхцөлийг баталгаажуулна.');
   joined=true;break;
  }if(joined)break;}
  if(!joined){
   // Үндсэн хэсгийг төмөр зам зэрэг хатуу хориг тусгаарласан үед бусад
   // компонентын боломжтой холбоосыг алгасахгүй. Хоригийг сулруулахгүй.
   const entries=[...groups],fallback:{choices:{start:XY;end:XY}[]}[]=[];
   for(let a=0;a<entries.length;a++)for(let b=a+1;b<entries.length;b++){
    const [id,nodes]=entries[a],other=entries[b][0],targets=graph.edges.filter(e=>component[e.a]===other).map(e=>[graph.nodes[e.a],graph.nodes[e.b]] as XY[]);
    const points:XY[]=[...nodes.map(n=>graph.nodes[n]),...graph.edges.filter(e=>component[e.a]===id).map(e=>[(graph.nodes[e.a][0]+graph.nodes[e.b][0])/2,(graph.nodes[e.a][1]+graph.nodes[e.b][1])/2] as XY)];
    if(targets.length)fallback.push({choices:points.map(start=>({start,end:nearest(targets,start,false)})).sort((a,b)=>dist(a.start,a.end)-dist(b.start,b.end))});
   }
   fallback.sort((a,b)=>dist(a.choices[0].start,a.choices[0].end)-dist(b.choices[0].start,b.choices[0].end));
   for(const group of fallback){for(const c of group.choices.slice(0,12)){
    const path=accessRoute(c.start,c.end,net,obstacles,net.boundary);if(!path.length)continue;
    const maxGrade=path.slice(1).reduce((grade,p,i)=>Math.max(grade,Math.abs(zAt(net.dem,...p)-zAt(net.dem,...path[i]))/Math.max(.001,dist(p,path[i]))*100),0);
    links.push({path,cls:'link',from:null,to:0,km:pathLength(path)/1000,maxGrade});
    if(red.tl.length&&area(inter(bufPath([path],4),red.tl))>.01)warnings.push('ШАЛГАХ: хотын холбох зам ЦДАШ-ын зурвастай огтлолцоно. Агаарын зай, тулгуур, засварын нэвтрэлт ба техникийн нөхцөлийг баталгаажуулна.');
    joined=true;break;
   }if(joined)break;}
  }
  if(!joined)break;
 }
 if(remaining)warnings.push(`Хотын нэгдсэн сүлжээнд ${remaining} тусдаа замын хэсэг холбогдоогүй. Хил, саад, налуу болон гарцыг шалгана уу.`);
 return{net:{...net,roads:[...net.roads,...links],segs:segments([...city,...links.map(r=>r.path)]),warnings:[...net.warnings,...new Set(warnings)]},warnings:[...new Set(warnings)]};
}
