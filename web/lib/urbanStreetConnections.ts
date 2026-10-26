import {corridorGraph,type CorridorGraph} from './sharedUtilityGraph';
import {area,bufPath,diff,dist,inter,nearest,unionAll,type Rings,type XY} from './geom';
import type {Dem} from './dem';
import {terrainSegmentMaxGrade} from './terrainRoute';
import type {Street,StreetCls} from './layout';
import {planningElevation,planningRoutingCost,type PlanningSuitability} from './planningSuitability';

export type UrbanStreetOptions={suitability?:PlanningSuitability;maxGrade?:Partial<Record<StreetCls,number>>};
/** Нөөц зурвасын бүх өргөн, нарийн вектор хориг, ангиллын налууг хамтад нь шалгана. */
export function urbanStreetAllowed(street:Street,boundary:Rings,dem:Dem|null,options:UrbanStreetOptions={}){
 if(street.path.length<2)return false;
 const surface=bufPath([street.path],street.w/2),context=options.suitability;
 if(area(diff(surface,boundary))>.01)return false;
 if(context?.restrictions.some(r=>(!r.profiles||r.profiles.includes('road'))&&area(inter(surface,r.rings))>.01))return false;
 for(let i=1;i<street.path.length;i++){
  const a=street.path[i-1],b=street.path[i],length=dist(a,b);if(length<.0001)continue;
  if(dem&&terrainSegmentMaxGrade(dem,a,b)>(options.maxGrade?.[street.cls]??8)+.00001)return false;
  const count=Math.max(1,Math.ceil(length/Math.min((dem?.cell??50)/2,25)));
  for(let k=0;k<=count;k++){
   const p:XY=[a[0]+(b[0]-a[0])*k/count,a[1]+(b[1]-a[1])*k/count];
   if(dem&&planningElevation(dem,...p)==null||context&&!Number.isFinite(planningRoutingCost(context,p,'road')))return false;
  }
 }
 return true;
}

export function streetComponents(g:Pick<CorridorGraph,'nodes'|'edges'|'adj'>){
 const component=new Int32Array(g.nodes.length).fill(-1);let count=0;
 for(let i=0;i<g.nodes.length;i++){if(component[i]>=0)continue;const pending=[i];component[i]=count;while(pending.length){const n=pending.pop()!;for(const ei of g.adj[n]){const e=g.edges[ei],v=e.a===n?e.b:e.a;if(component[v]<0){component[v]=count;pending.push(v);}}}count++;}
 return{component,count};
}

/** Блок хуваалтын замын төгсгөлийг бодит геометрээр залгана.
 * Зөвхөн өмнө нь нөөцөлсөн замын зурвас дотор богино холбоос нэмнэ:
 * барилгын газрыг дайрах, холын тусдаа хороололд зохиомол зам үүсгэхгүй. */
export function connectUrbanStreets(input:Street[],boundary:Rings,dem:Dem|null,localWidth:number,options:UrbanStreetOptions={}){
 const streets=options.suitability||options.maxGrade?input.filter(s=>urbanStreetAllowed(s,boundary,dem,options)):[...input],internal=()=>streets.filter(s=>!s.ext),corridor=unionAll(internal().map(s=>bufPath([s.path],s.w/2+.05)));
 const half=localWidth/2,maxGap=Math.max(localWidth,...input.map(s=>s.w))+8;
 let nextId=Math.max(10000,...input.map(s=>s.id))+1;
 for(let round=0;round<input.length;round++){
  const graph=corridorGraph(internal().map(s=>s.path)),{component,count}=streetComponents(graph);if(count<=1)break;
  const candidates:{path:XY[];distance:number}[]=[];
  graph.nodes.forEach((point,i)=>{for(const edge of graph.edges){if(component[i]===component[edge.a])continue;const end=nearest([[graph.nodes[edge.a],graph.nodes[edge.b]]],point,false),distance=dist(point,end);if(distance>.005&&distance<=maxGap)candidates.push({path:[point,end],distance});}});
  candidates.sort((a,b)=>a.distance-b.distance);let joined=false;
  for(const {path,distance}of candidates){
   const surface=bufPath([path],half);if(area(diff(surface,boundary))>.01||area(diff(surface,corridor))>.1)continue;
   const connector:Street={id:nextId,cls:'local',path,w:localWidth};if(!urbanStreetAllowed(connector,boundary,dem,options))continue;
   streets.push(connector);nextId++;joined=true;break;
  }
  if(!joined)break;
 }
 return streets;
}
