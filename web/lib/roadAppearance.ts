import {utmLayer} from './modmap';
import * as containsOperator from '@arcgis/core/geometry/operators/containsOperator';
import {P,L,bufPath,bufPoly,clipPath,unionAll,diff,inter,circle,type Rings,type XY} from './geom';
import {corridorGraph} from './sharedUtilityGraph';
import {offsetPath,samplePath,pathLength,validRoads,type Road} from './roadGeometry';

export type RoadAppearanceOptions={contextRoads?:Road[];boundary?:Rings};
type Context={surface:Rings;junctions:Rings;markings?:XY[][];laneMarkings?:XY[][];canonical:Road[]};
const cache=new WeakMap<Road[],Context>();
const style=(r:Road)=>[r.width,r.lanes,r.median??0].join('|');
const distance=(a:XY,b:XY)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const order=(a:XY,b:XY)=>a[0]-b[0]||a[1]-b[1];

/** Давхардсан хэсэг бүрт нэг хөндлөн огтлол; эх тэнхлэг, хөдөлгөөний сүлжээг өөрчлөхгүй. */
function displayAxes(roads:Road[]){
 const graph=corridorGraph(roads.map(r=>r.path)),bins=new Map<string,{road:Road;a:XY;b:XY}[]>();
 for(const road of roads)for(let i=1;i<road.path.length;i++){
  const a=road.path[i-1],b=road.path[i],segment={road,a,b};
  for(let x=Math.floor(Math.min(a[0],b[0])/100);x<=Math.floor(Math.max(a[0],b[0])/100);x++)for(let y=Math.floor(Math.min(a[1],b[1])/100);y<=Math.floor(Math.max(a[1],b[1])/100);y++){const key=`${x},${y}`,list=bins.get(key)??[];list.push(segment);bins.set(key,list);}
 }
 const owners=graph.edges.map(e=>{
  const a=graph.nodes[e.a],b=graph.nodes[e.b],m:XY=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return(bins.get(`${Math.floor(m[0]/100)},${Math.floor(m[1]/100)}`)??[]).filter(s=>{const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],l2=dx*dx+dy*dy,t=((m[0]-s.a[0])*dx+(m[1]-s.a[1])*dy)/l2;return t>=-1e-6&&t<=1+1e-6&&Math.abs(dx*(m[1]-s.a[1])-dy*(m[0]-s.a[0]))/Math.sqrt(l2)<.002;}).sort((a,b)=>b.road.width-a.road.width)[0]?.road??roads[0];
 });
 const used=new Set<number>(),canonical:Road[]=[],breakAt=(n:number)=>graph.adj[n].length!==2||style(owners[graph.adj[n][0]])!==style(owners[graph.adj[n][1]]);
 const trace=(start:number,first:number)=>{const path=[graph.nodes[start]];let n=start,ei=first;
  while(!used.has(ei)){used.add(ei);const e=graph.edges[ei];n=e.a===n?e.b:e.a;path.push(graph.nodes[n]);if(breakAt(n)||n===start)break;ei=graph.adj[n].find(i=>i!==ei)!;}
  if(order(path[0],path.at(-1)!)>0)path.reverse();
  if(distance(path[0],path.at(-1)!)<.001){path.pop();let first=0;for(let i=1;i<path.length;i++)if(order(path[i],path[first])<0)first=i;const rotated=[...path.slice(first),...path.slice(0,first)];if(order(rotated[1],rotated.at(-1)!)>0)rotated.splice(1,rotated.length-1,...rotated.slice(1).reverse());path.splice(0,path.length,...rotated,rotated[0]);}
  canonical.push({...owners[first],id:`paint-${canonical.length}`,path});
 };
 for(let n=0;n<graph.nodes.length;n++)if(breakAt(n))for(const ei of graph.adj[n])if(!used.has(ei))trace(n,ei);
 for(let ei=0;ei<graph.edges.length;ei++)if(!used.has(ei))trace(graph.edges[ei].a,ei);
 return{graph,owners,canonical};
}
/** Уулзварын өөрийн өргөн, өнцөгт таарсан зураасгүй талбай. Хотын хамгийн өргөн замаар бүх уулзварыг огтлохгүй. */
function junctionAreas(axes:ReturnType<typeof displayAxes>){
 const {graph,owners}=axes,areas:Rings[]=[];
 for(let n=0;n<graph.nodes.length;n++){
  const edges=graph.adj[n];if(edges.length<3)continue;
  const half=Math.max(...edges.map(e=>owners[e].width/2)),reach=half*10+20;
  areas.push([circle(graph.nodes[n],Math.max(5,half+1),32)]);
  const arms=edges.map(first=>{let node=n,ei=first,length=0;const path=[graph.nodes[n]];
   while(length<reach){const edge=graph.edges[ei],next=edge.a===node?edge.b:edge.a;length+=edge.length;path.push(graph.nodes[next]);if(graph.adj[next].length!==2||next===n)break;node=next;ei=graph.adj[next].find(e=>e!==ei)!;}
   return bufPath([slice(path,0,Math.min(length,reach))],owners[first].width/2+.6);
  });
  for(let a=0;a<arms.length;a++)for(let b=a+1;b<arms.length;b++){const overlap=inter(arms[a],arms[b]);if(overlap.length)areas.push(overlap);}
 }
 return unionAll(areas);
}
function slice(path:XY[],from:number,to:number){
 const out:XY[]=[samplePath(path,from).point];let length=0;
 for(let i=1;i<path.length;i++){length+=distance(path[i-1],path[i]);if(length>from&&length<to)out.push(path[i]);if(length>=to)break;}
 out.push(samplePath(path,to).point);return out;
}
function context(input:Road[]):Context{
 const old=cache.get(input);if(old)return old;
 const roads=validRoads(input);if(!roads.length)return{surface:[],junctions:[],markings:[],canonical:[]};
 const axes=displayAxes(roads),junctions=junctionAreas(axes),outer=unionAll(roads.flatMap(r=>[bufPath([r.path],r.width/2),r.turnSurface??[]]));
 const median=diff(unionAll(axes.canonical.filter(r=>(r.median??0)>0).map(r=>bufPath([r.path],r.median!/2))),junctions),surface=diff(outer,median);
 const result={surface,junctions,canonical:axes.canonical};cache.set(input,result);return result;
}
function sharedMarkings(shared:Context){
 if(shared.markings)return shared.markings;
 const {surface,junctions,canonical}=shared;
 const interior=bufPoly(surface,-.1),laneArea=diff(interior,bufPoly(junctions,.1)),laneGeometry=P(laneArea),marks:XY[][]=[],lanes:XY[][]=[],arrows:XY[][]=[];
 containsOperator.accelerateGeometry(laneGeometry);
 // Нийлсэн асфальтын жинхэнэ гадна/голын ирмэг: давхцсан замын дотор цагаан хүрээ үлдэхгүй.
 marks.push(...bufPoly(surface,-.35));
 for(const r of canonical){
  const median=r.median??0,laneWidth=(r.width-median)/(r.lanes*2),offsets=[...(median>0?[]:[0]),...Array.from({length:Math.max(0,r.lanes-1)},(_,i)=>median/2+(i+1)*laneWidth).flatMap(v=>[-v,v])];
  for(const offset of offsets){const path=offsetPath(r.path,offset),length=pathLength(path);for(let from=2;from<length-2;from+=9){const to=Math.min(from+3,length-2);if(to-from>.5)lanes.push(slice(path,from,to));}}
  const length=pathLength(r.path);
  if(length>45)for(const side of [-1,1]){
   const p=samplePath(r.path,side===1?length*.25:length*.75),u:XY=[p.dir[0]*side,p.dir[1]*side],offset=median/2+laneWidth/2,q:XY=[p.point[0]+u[1]*offset,p.point[1]-u[0]*offset],tip:XY=[q[0]+u[0]*2,q[1]+u[1]*2];
   const arrow:XY[][]=[[[q[0]-u[0]*2,q[1]-u[1]*2],tip],[[tip[0]-u[0]-u[1]*.7,tip[1]-u[1]+u[0]*.7],tip,[tip[0]-u[0]+u[1]*.7,tip[1]-u[1]-u[0]*.7]]];
   if(containsOperator.execute(laneGeometry,L(arrow)))arrows.push(...arrow);
  }
 }
 shared.laneMarkings=[...clipPath(lanes,laneArea).filter(p=>pathLength(p)>.5),...arrows];
 shared.markings=[...marks,...shared.laneMarkings];return shared.markings;
}
/** Нэг сэдвийн эзэмшлийн зам; огтлолцлыг бүх хотын замтай хамт шийднэ. */
export function roadSurface(roads:Road[],options:RoadAppearanceOptions={}):Rings{
 const shared=context(options.contextRoads??roads),own=options.contextRoads&&options.contextRoads!==roads?inter(shared.surface,unionAll(validRoads(roads).flatMap(r=>[bufPath([r.path],r.width/2),r.turnSurface??[]]))):shared.surface;
 return options.boundary?.length?inter(own,options.boundary):own;
}
export function roadMarkings(roads:Road[],options:RoadAppearanceOptions={}):XY[][]{
 if(!roads.length)return[];const shared=context(options.contextRoads??roads);
 if((!options.contextRoads||options.contextRoads===roads)&&!options.boundary?.length)return sharedMarkings(shared);
 return clipPath(sharedMarkings(shared),bufPoly(roadSurface(roads,options),-.1)).filter(path=>pathLength(path)>.1);
}
/** Шалгалтад: гадна захын зураас уулзварын гадна хүрээг дагана; зөвхөн эгнээ/сумыг эндээс хасна. */
export const roadJunctionAreas=(roads:Road[])=>context(roads).junctions;
export function roadLaneMarkings(roads:Road[],options:RoadAppearanceOptions={}){const shared=context(options.contextRoads??roads);sharedMarkings(shared);return clipPath(shared.laneMarkings??[],bufPoly(roadSurface(roads,options),-.1));}
export function roadDetailLayers(roads:Road[],prefix:string,options:RoadAppearanceOptions={}){
 const surface=roadSurface(roads,options),marks=roadMarkings(roads,options),paint=inter(bufPath(marks,.075),surface);
 return[
  utmLayer({id:`${prefix}-surface`,title:'Зам · нийлсэн асфальтан гадаргуу',geom:'polygon',fields:[],rows:surface.length?[{g:surface,a:{}}]:[],renderer:{type:'simple',symbol:{type:'simple-fill',color:'#58636b',outline:{width:0}}}}),
  utmLayer({id:`${prefix}-markings`,title:'Зам · цагаан тэмдэглэгээ, эгнээ, чиглэл',geom:'polygon',fields:[],rows:paint.length?[{g:paint,a:{}}]:[],minScale:18000,renderer:{type:'simple',symbol:{type:'simple-fill',color:'#f2f3ec',outline:{width:0}}}}),
 ];
}
