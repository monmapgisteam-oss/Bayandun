import {inside,orientedRect,bbox,dist,area,diff,inter,type XY,type Rings} from "./geom";
import type {PlacementGoal} from './siteSpatial';
import {roadFrame} from './siteSpatial';
import {zAt} from "./dem";
import type {Geo} from "./masterplan";
import type {Net,Red} from "./corridors";
import {facilityCount,type Footprint} from "./facilityPlanning";
import {buildPlanningSuitability,evaluatePlanningPoint,evaluatePlanningFootprint,summarizePlanningSuitability,planningRoadDistance,type PlanningAssessment} from './planningSuitability';
export type LayoutInput={zone:number;demand:number;capacity:number;width:number;depth:number;height:number;spacing:number;slope:number;reserve:number;goal?:PlacementGoal;frontApron?:number;linearModules?:boolean};
export function layoutFacilities(geo:Geo,net:Net,red:Red|null,input:LayoutInput,occupied:Rings=[]){
 const {zone,demand,capacity,width:w,depth:d,spacing:gap,slope,reserve}=input;
 if(![zone,demand,capacity,w,d,input.height,gap,slope,reserve].every(Number.isFinite)||[w,d,input.height,gap,slope].some((v)=>v<=0)||reserve<0||reserve>90)throw new Error("Хэмжээс, налуу, нөөц талбайн параметрийг шалгана уу.");
 if(input.frontApron!=null&&(!Number.isFinite(input.frontApron)||input.frontApron<0))throw new Error('Ачилтын талбайн гүнийг шалгана уу.');
 const apron=input.frontApron??0;
 const count=facilityCount(demand,capacity);if(count>500)throw new Error("Нэг хувилбарт 500 хүртэл нэгж байршуулна.");
 const rings=inter(geo.rings[zone],net.boundary);if(!rings.length)throw new Error("Сонгосон бүс төслийн хилтэй огтлолцохгүй.");
 const b=bbox(rings),c=geo.c[zone],roads=[...net.exist,...net.roads.map((r)=>r.path)];if(!roads.length)throw new Error("Үйлдвэрийн хүрэх зам тооцогдоогүй байна.");
 const u:XY=input.goal?.axis??roadFrame(net,c).axis;
 const base=net.suitability??buildPlanningSuitability({dem:net.dem,boundary:net.boundary,roads});
 const sameRoads=base.roads.length===roads.length&&base.roads.every((p,i)=>p===roads[i]);
 const context=buildPlanningSuitability({...base,boundary:rings,restrictions:[...base.restrictions,...(red?.all.length?[{id:'reserved-corridor',label:'Зам, төмөр зам, ЦДАШ-ын нөөц зурвас',rings:red.all,profiles:['building' as const]}]:[]),...(occupied.length?[{id:'occupied-land',label:'Хадгалсан төлөвлөлтийн эзэлсэн газар',rings:occupied,profiles:['building' as const]}]:[]),...(geo.rings[16]?.length?[{id:'existing-power-plant',label:'Б16 одоогийн ЦС',rings:geo.rings[16],profiles:['building' as const]}]:[])]});
 const candidates:{x:number;y:number;score:number;risk:number}[]=[],step=Math.max(10,Math.min(w,d)/2),rejected:Record<string,number>={},assessments:PlanningAssessment[]=[];
 let assessed=0;
 const reject=(reasons:string[])=>{for(const reason of reasons)rejected[reason]=(rejected[reason]??0)+1;};
 for(let y=b.y0;y<=b.y1;y+=step)for(let x=b.x0;x<=b.x1;x+=step){
  if(!inside(x,y,rings))continue;assessed++;
  const result=evaluatePlanningPoint(context,[x,y],'building',{maxSlope:slope});if(!result.allowed){reject(result.reasons);continue;}
  const roadDistance=(sameRoads?result.evidence.roadDistanceM:planningRoadDistance(roads,[x,y]))??Infinity,risk=(1-(result.score??0))*Math.max(w,d,100)*4;
  // Одоогийн технологийн хөршлөл дээр бодитоор хэмжсэн хөрс, налуу, урсацын эрэмбийг нэмнэ.
  candidates.push({x,y,risk,score:(input.goal?dist([x,y],input.goal.target)*2+roadDistance*0.15:roadDistance)+risk+(input.goal?.lowGround?zAt(net.dem,x,y)*6:0)});
 }
 candidates.sort((a,b)=>a.score-b.score);
 const out:Footprint[]=[],maxArea=area(rings)*(1-reserve/100);let used=occupied.length?area(inter(occupied,rings)):0;
 // Нөөц envelope ба жинхэнэ барилгын ирмэгийн дээжүүд давхцахгүй тул хоёуланг шалгана.
 const assessSurfaces=(envelope:XY[],ring:XY[])=>{
  const assessment=evaluatePlanningFootprint(context,[envelope],{maxSlope:slope});if(!assessment.allowed){reject(assessment.reasons);return null;}
  const building=evaluatePlanningFootprint(context,[ring],{maxSlope:slope});if(!building.allowed){reject(building.reasons);return null;}
  for(const key of ['slopePct','flowHa','reliefM'] as const){const a=assessment.evidence[key],b=building.evidence[key];assessment.evidence[key]=a==null?b:b==null?a:Math.max(a,b);}
  assessment.evidence.terrainSamples=(assessment.evidence.terrainSamples??0)+(building.evidence.terrainSamples??0);
  return assessment;
 };
 const assessCandidate=(p:{x:number;y:number})=>{
  const envelope=facilityEnvelope(p.x,p.y,u,w,d,gap,apron),ring=orientedRect([p.x,p.y],u,w,d);
  if((occupied.length&&area(inter([envelope],occupied))>0.01)||area(diff([envelope],rings))>0.01||(red?.all.length&&area(inter([envelope],red.all))>0.01))return null;
  const assessment=assessSurfaces(envelope,ring);if(!assessment)return null;
  return{footprint:{x:p.x,y:p.y,ring,capacity,heading:-Math.atan2(u[1],u[0])*180/Math.PI},assessment};
 };
 if(input.linearModules&&count>1){
  // Эхний ганц барилга багтсанаар бүх эгнээг түүнд түгжихгүй. Нийт хэрэгцээ
  // багтах anchor-ийг эхлээд шалгаад, олдохгүй бол хамгийн олон нэгж багтахыг авна.
  const target=Math.min(count,Math.max(0,Math.floor((maxArea-used)/((w+gap)*(d+gap+apron)))));
  let best:NonNullable<ReturnType<typeof assessCandidate>>[]=[];
  if(target)for(const anchor of candidates){
   const first=assessCandidate(anchor);if(!first)continue;
   const arrangement=[first],grid:{x:number;y:number;score:number}[]=[];
   for(let row=0;row<Math.ceil(count/4);row++)for(let col=-Math.min(count,4);col<=Math.min(count,4);col++){
    if(!row&&!col)continue;const across=col*(w+gap),back=row*(d+gap+apron);
    grid.push({x:anchor.x+u[0]*across-u[1]*back,y:anchor.y+u[1]*across+u[0]*back,score:row*100000+Math.abs(col)*(w+gap)});
   }
   grid.sort((a,b)=>a.score-b.score);
   for(const p of grid){if(arrangement.length>=target)break;const candidate=assessCandidate(p);if(candidate)arrangement.push(candidate);}
   if(arrangement.length>best.length)best=arrangement;
   if(best.length>=target)break;
  }
  out.push(...best.map(p=>p.footprint));assessments.push(...best.map(p=>p.assessment));
  return{placed:out,needed:count,suitability:summarizePlanningSuitability(context,assessments,rejected,assessed),placementEvidence:assessments};
 }
 for(let index=0;index<candidates.length;index++){
  const p=candidates[index];
  if(out.length>=count||used+(w+gap)*(d+gap+apron)>maxArea)break;
  const ring=orientedRect([p.x,p.y],u,w,d),envelope=facilityEnvelope(p.x,p.y,u,w,d,gap,apron);
  if(out.some((o)=>{const dx=p.x-o.x,dy=p.y-o.y;return Math.abs(dx*u[0]+dy*u[1])<w+gap&&Math.abs(-dx*u[1]+dy*u[0])<d+gap+apron;}))continue;
  // Exact polygon difference prevents edges crossing concave boundaries and holes.
  if((occupied.length&&area(inter([envelope],occupied))>0.01)||area(diff([envelope],rings))>0.01||(red?.all.length&&area(inter([envelope],red.all))>0.01))continue;
  const assessment=assessSurfaces(envelope,ring);if(!assessment)continue;
  out.push({x:p.x,y:p.y,ring,capacity,heading:-Math.atan2(u[1],u[0])*180/Math.PI});
  assessments.push(assessment);
  if(out.length===1&&count>1){for(const q of candidates)q.score=dist([q.x,q.y],[p.x,p.y])*2+q.risk;candidates.sort((a,b)=>a.score-b.score);index=-1;}
  used+=(w+gap)*(d+gap+apron);
 }
 return {placed:out,needed:count,suitability:summarizePlanningSuitability(context,assessments,rejected,assessed),placementEvidence:assessments};
}

export function facilityEnvelope(x:number,y:number,u:XY,w:number,d:number,gap:number,apron=0){return orientedRect([x+u[1]*apron/2,y-u[0]*apron/2],u,w+gap,d+gap+apron);}
