/** ТААМАГЛАЛ: концепц хөдөлгөөн; тооллого, батлагдсан дохиоллын төлөвлөгөө биш. */
import {corridorGraph,type Point2} from './sharedUtilityGraph';
import {distance,pathLength,samplePath,offsetPath,validRoads,type Road} from './roadGeometry';
import {P,type Rings} from './geom';
import * as containsOperator from '@arcgis/core/geometry/operators/containsOperator';
import {roadSurface} from './roadAppearance';
import {planningContains} from './planningSuitability';
import {DESIGN_VEHICLES,laneMotion,turnMotion,sampleMotion,vehicleFits,type MotionPath,type VehicleKind} from './vehiclePaths';
export {distance,pathLength,samplePath,offsetPath,validRoads,type Road} from './roadGeometry';
function slicePath(p:Point2[],start:number,end:number){const out=[samplePath(p,start).point];let s=0;for(let i=1;i<p.length;i++){s+=distance(p[i-1],p[i]);if(s>start&&s<end)out.push(p[i]);}out.push(samplePath(p,end).point);return out;}
export type Lane={id:number;roadId:string;from:number;to:number;path:Point2[];length:number;speed:number;priority:number;use:Road['use']};
export type RoadNetwork={nodes:Point2[];lanes:Lane[];out:number[][];components:number;junctions:Set<number>;entries:number[];pavement:Rings;motions:Map<string,MotionPath|null>;turns:Map<string,MotionPath|null>;rejectedTurns:Set<string>;rejectedLanes:Set<string>};
export function roadNetwork(roads:Road[]):RoadNetwork{
 const valid=validRoads(roads),g=corridorGraph(valid.map(r=>r.path)),nodes=g.nodes,out=nodes.map(()=>[] as number[]),lanes:Lane[]=[],used=new Set<number>(),junctions=new Set(g.adj.flatMap((a,i)=>a.length>2?[i]:[]));let components=0;const visited=new Set<number>();
 // Гол зам үйлдвэрийн замтай залгахад хурд, өргөн, дарааллыг нэг сегмент болгон алдахгүй.
 const bins=new Map<string,{road:Road;a:Point2;b:Point2}[]>();
 for(const road of valid)for(let i=1;i<road.path.length;i++){
  const a=road.path[i-1],b=road.path[i],segment={road,a,b};
  for(let x=Math.floor(Math.min(a[0],b[0])/100);x<=Math.floor(Math.max(a[0],b[0])/100);x++)for(let y=Math.floor(Math.min(a[1],b[1])/100);y<=Math.floor(Math.max(a[1],b[1])/100);y++){
   const key=`${x},${y}`,list=bins.get(key)??[];list.push(segment);bins.set(key,list);
  }
 }
 const owners=g.edges.map(e=>{
  const a=nodes[e.a],b=nodes[e.b],m:Point2=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  const matches=(bins.get(`${Math.floor(m[0]/100)},${Math.floor(m[1]/100)}`)??[]).filter(s=>{
   const dx=s.b[0]-s.a[0],dy=s.b[1]-s.a[1],length2=dx*dx+dy*dy,t=((m[0]-s.a[0])*dx+(m[1]-s.a[1])*dy)/length2;
   return t>=-1e-6&&t<=1+1e-6&&Math.abs(dx*(m[1]-s.a[1])-dy*(m[0]-s.a[0]))/Math.sqrt(length2)<.002;
  });
  return matches.sort((a,b)=>b.road.width-a.road.width)[0]?.road??valid[0];
 });
 const style=(r:Road)=>[r.width,r.lanes,r.median??0,r.speed,r.use].join('|');
 const breakAt=(n:number)=>g.adj[n].length!==2||style(owners[g.adj[n][0]])!==style(owners[g.adj[n][1]]);
 for(let n=0;n<nodes.length;n++)if(!visited.has(n)){components++;const q=[n];visited.add(n);while(q.length){const a=q.pop()!;for(const ei of g.adj[a]){const e=g.edges[ei],b=e.a===a?e.b:e.a;if(!visited.has(b)){visited.add(b);q.push(b);}}}}
 const trace=(start:number,first:number)=>{const path=[nodes[start]];let n=start,ei=first;while(!used.has(ei)){used.add(ei);const e=g.edges[ei];n=e.a===n?e.b:e.a;path.push(nodes[n]);if(breakAt(n)||n===start)break;ei=g.adj[n].find(i=>i!==ei)!;}
  const containing=owners[first];if(!containing)return;
  for(const reverse of [false,true]){const from=reverse?n:start,to=reverse?start:n,center=reverse?[...path].reverse():path,total=pathLength(center),trim=Math.min(32,total*.4),offset=Math.min(containing.width/2-1.5,(containing.median??0)/2+(containing.width-(containing.median??0))/(containing.lanes*4));
   const lanePath=offsetPath(slicePath(center,g.adj[from].length>1?trim:Math.min(2.1,total*.2),total-(g.adj[to].length>1?trim:Math.min(7.6,total*.4))),offset),id=lanes.length;
   lanes.push({id,roadId:containing.id,from,to,path:lanePath,length:pathLength(lanePath),speed:containing.speed/3.6,priority:containing.use==='connector'?2:1,use:containing.use});out[from].push(id);
  }
 };
 for(let n=0;n<nodes.length;n++)if(breakAt(n))for(const ei of g.adj[n])if(!used.has(ei))trace(n,ei);
 for(let ei=0;ei<g.edges.length;ei++)if(!used.has(ei))trace(g.edges[ei].a,ei);
 const pavement=roadSurface(valid);
 return{nodes,lanes,out,components,junctions,entries:lanes.filter(l=>out[l.from].length===1).map(l=>l.id),pavement,motions:new Map(),turns:new Map(),rejectedTurns:new Set(),rejectedLanes:new Set()};
}
export type Vehicle={id:number;lane:number;s:number;speed:number;length:number;kind:VehicleKind;next:number|null;restricted?:boolean;turn?:{path:MotionPath;length:number;s:number;node:number};held?:number;waiting:number;trips:number};
export type Traffic={net:RoadNetwork;cars:Vehicle[];time:number;credit:number;nextId:number;seed:number;locks:Map<number,number>;completed:number;blocked:number};
export function createTraffic(net:RoadNetwork):Traffic{return{net,cars:[],time:0,credit:1,nextId:1,seed:42,locks:new Map(),completed:0,blocked:0};}
const random=(t:Traffic)=>{t.seed=(Math.imul(1664525,t.seed)+1013904223)>>>0;return t.seed/4294967296;};
const pavementPolygons=new WeakMap<Rings,ReturnType<typeof P>>();
export function pavementCovers(rings:Rings,body:Point2[]){let polygon=pavementPolygons.get(rings);if(!polygon){polygon=P(rings);containsOperator.accelerateGeometry(polygon);pavementPolygons.set(rings,polygon);}return containsOperator.execute(polygon,P([body]));}
export function trafficLaneMotion(net:RoadNetwork,id:number,kind:VehicleKind):MotionPath|null{
 const key=`${kind}:${id}`;if(net.motions.has(key))return net.motions.get(key)!;
 const vehicle=DESIGN_VEHICLES[kind],motion=laneMotion(net.lanes[id].path,vehicle.minRadius),valid=motion&&vehicleFits(motion,vehicle,(x,y)=>planningContains(net.pavement,x,y),.2,body=>pavementCovers(net.pavement,body))?motion:null;
 net.motions.set(key,valid);if(!valid)net.rejectedLanes.add(key);return valid;
}
export function trafficTurnMotion(net:RoadNetwork,from:number,to:number,kind:VehicleKind):MotionPath|null{
 const key=`${kind}:${from}:${to}`;if(net.turns.has(key))return net.turns.get(key)!;
 const incoming=trafficLaneMotion(net,from,kind),outgoing=trafficLaneMotion(net,to,kind),vehicle=DESIGN_VEHICLES[kind];let found:MotionPath|null=null;
 if(incoming&&outgoing){const a=sampleMotion(incoming,incoming.length),b=sampleMotion(outgoing,0);
  for(const factor of [1,1.2,1.5,2,3]){const candidate=turnMotion(a.point,a.dir,b.point,b.dir,vehicle.minRadius*factor);if(candidate&&vehicleFits(candidate,vehicle,(x,y)=>planningContains(net.pavement,x,y),.2,body=>pavementCovers(net.pavement,body))){found=candidate;break;}}
 }
 net.turns.set(key,found);if(!found)net.rejectedTurns.add(key);return found;
}
function nextLane(t:Traffic,c:Vehicle){const l=t.net.lanes[c.lane],options=t.net.out[l.to].filter(id=>t.net.lanes[id].to!==l.from),allowed=options.filter(id=>trafficTurnMotion(t.net,c.lane,id,c.kind));c.restricted=options.length>0&&!allowed.length;return allowed.length?allowed[Math.floor(random(t)*allowed.length)]:null;}
function freeEntry(t:Traffic,lane:number,length:number){return !t.cars.some(c=>c.lane===lane&&c.s<length+10||c.next===lane&&!!c.turn);}
/** Дараагийн муруйд хүрэхээс өмнө v² = vₜ² + 2ad нөхцөлөөр тоормослох зайг тооцно. */
function approachSpeed(path:MotionPath,s:number,lateral:number,braking:number){let start=0,limit=Infinity;for(const segment of path.segments){const radius=segment.kind==='line'?Infinity:segment.kind==='arc'?segment.radius:segment.minRadius;if(start+segment.length>=s&&Number.isFinite(radius))limit=Math.min(limit,Math.sqrt(lateral*radius+2*braking*Math.max(0,start-s)));start+=segment.length;}return limit;}
/** Хугацааг 50 мс-ээс бага алхамд хувааж, fps-ээс үл хамааруулна. */
export function stepTraffic(t:Traffic,seconds:number,perHour:number,truckShare:number,maxVehicles=180){
 if(!Number.isFinite(seconds)||seconds<=0)return;
 perHour=Number.isFinite(perHour)?Math.max(0,Math.min(100000,perHour)):0;
 truckShare=Number.isFinite(truckShare)?Math.max(0,Math.min(1,truckShare)):0;
 maxVehicles=Number.isFinite(maxVehicles)?Math.max(0,Math.min(1000,Math.trunc(maxVehicles))):180;
 let remaining=Math.min(2,Math.max(0,seconds));while(remaining>1e-8){const dt=Math.min(.05,remaining);remaining-=dt;t.time+=dt;t.credit+=Math.max(0,perHour)/3600*dt;
  while(t.credit>=1&&perHour>0){t.credit--;if(t.cars.length>=maxVehicles){t.blocked++;continue;}const pool=t.net.entries.length?t.net.entries:t.net.lanes.map(l=>l.id);if(!pool.length)break;
   const lane=t.net.lanes[pool[Math.floor(random(t)*pool.length)]],kind=random(t)<truckShare?'truck':'car',length=DESIGN_VEHICLES[kind].length;
   if(!trafficLaneMotion(t.net,lane.id,kind)||!freeEntry(t,lane.id,length)){t.blocked++;continue;}const c:Vehicle={id:t.nextId++,lane:lane.id,s:0,speed:0,length,kind,next:null,waiting:0,trips:0};c.next=nextLane(t,c);t.cars.push(c);
  }
  // Уулзварт гол замын ойртож буй машин эхэлж нэвтэрнэ; ижил зэрэглэлд хүлээсэн хугацаа.
  const order=[...t.cars].sort((a,b)=>t.net.lanes[b.lane].priority-t.net.lanes[a.lane].priority||b.waiting-a.waiting||a.id-b.id),finished=new Set<number>();
  for(const c of order){const lane=t.net.lanes[c.lane],design=DESIGN_VEHICLES[c.kind],motion=trafficLaneMotion(t.net,c.lane,c.kind)!,braking=c.kind==='truck'?2:3;if(c.held!=null&&lane.from===c.held&&c.s>c.length/2+4&&!c.turn){t.locks.delete(c.held);c.held=undefined;}
   if(c.turn){const turn=c.turn;c.speed=Math.min(lane.speed,t.net.lanes[c.next!].speed,8,Math.sqrt(design.lateralAcceleration*turn.path.minRadius),c.speed+1.5*dt);turn.s+=c.speed*dt;if(turn.s>=turn.length){c.lane=c.next!;c.s=turn.s-turn.length;c.turn=undefined;c.next=nextLane(t,c);c.trips++;}continue;}
   const ahead=t.cars.filter(o=>o!==c&&!o.turn&&o.lane===c.lane&&o.s>c.s).sort((a,b)=>a.s-b.s)[0];let gap=ahead?ahead.s-c.s-(design.wheelbase+design.frontOverhang)-DESIGN_VEHICLES[ahead.kind].rearOverhang-2:Infinity;
   const remain=motion.length-c.s,junction=t.net.junctions.has(lane.to);let mayEnter=c.next==null&&!c.restricted;
   if(c.next!=null){const lock=t.locks.get(lane.to);mayEnter=(lock==null||lock===c.id)&&freeEntry(t,c.next,c.length);if(junction&&remain<20&&mayEnter&&!ahead){if(c.held!=null&&c.held!==lane.to)t.locks.delete(c.held);t.locks.set(lane.to,c.id);c.held=lane.to;}if(junction&&t.locks.get(lane.to)!==c.id)mayEnter=false;}
   if(!mayEnter)gap=Math.min(gap,remain-1);
   const turnLimit=c.next!=null?Math.min(8,t.net.lanes[c.next].speed,Math.sqrt(design.lateralAcceleration*trafficTurnMotion(t.net,c.lane,c.next,c.kind)!.minRadius)):Infinity;
   const target=Math.min(lane.speed,design.maxSpeed,approachSpeed(motion,c.s,design.lateralAcceleration,braking),c.next!=null?Math.max(turnLimit,Math.sqrt(turnLimit*turnLimit+2*braking*Math.max(0,remain)+(braking*dt)**2)-braking*dt):Infinity,Math.max(0,Math.sqrt(Math.max(0,2*braking*gap+(ahead?.speed??0)**2+(braking*dt)**2))-braking*dt),Number.isFinite(gap)?Math.max(0,gap/1.4):Infinity);
   const speed=target>=c.speed?Math.min(target,c.speed+1.8*dt):Math.max(target,c.speed-braking*dt),advance=Math.min(speed*dt,Math.max(0,gap));c.speed=advance/dt;c.s+=advance;c.waiting=c.speed<.3?c.waiting+dt:0;
   if(c.s>=motion.length-.001&&mayEnter){if(c.next==null||c.trips>30){finished.add(c.id);t.completed++;if(c.held!=null)t.locks.delete(c.held);}else{const path=trafficTurnMotion(t.net,c.lane,c.next,c.kind)!;c.turn={path,length:path.length,s:Math.max(0,c.s-motion.length),node:lane.to};}}
  }
  t.cars=t.cars.filter(c=>!finished.has(c.id));
 }
}
export function vehiclePose(t:Traffic,c:Vehicle){const pose=c.turn?sampleMotion(c.turn.path,c.turn.s):sampleMotion(trafficLaneMotion(t.net,c.lane,c.kind)!,c.s),v=DESIGN_VEHICLES[c.kind],shift=v.length/2-v.rearOverhang;return{...pose,rearAxle:pose.point,point:[pose.point[0]+pose.dir[0]*shift,pose.point[1]+pose.dir[1]*shift] as Point2};}
