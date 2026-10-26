import {validRoads,type Road} from './roadTraffic';
import type {SavedPlan} from './savedPlans';
import type {SitePlan,SiteCirculation} from './facilitySite';
import type {Plan} from './urban';
import {section} from './rules';
export function industrialRoads(sites:SitePlan[],circulation:SiteCirculation):Road[]{return [...circulation.paths,...sites.flatMap(s=>s.access)].map((path,i)=>({id:`site-${i}`,path,width:8,lanes:1,speed:20,use:'industrial',...(i===0&&circulation.turnSurface?{turnSurface:circulation.turnSurface}:{})}));}
export function urbanRoads(p:Plan):Road[]{return p.streets.map(s=>{const cross=section(s.cls,s.w,p.inp);return{id:`street-${s.id}`,path:s.path,width:cross.road*2,lanes:cross.lanes,median:cross.median,speed:s.cls==='arterial'?40:s.cls==='collector'?30:20,use:'residential'};});}
export function savedRoads(plans:SavedPlan[]):Road[]{return validRoads(plans.flatMap(p=>{
 const input=p.inputs as {roads?:Road[];sites?:SitePlan[];circulation?:SiteCirculation;networkKey?:string}|undefined;
 let roads=validRoads(input?.roads);
 if(!roads.length&&Array.isArray(input?.sites)&&Array.isArray(input?.circulation?.paths)){
  const paths=[...input.circulation.paths,...input.sites.flatMap(s=>Array.isArray(s?.access)?s.access:[])];
  roads=validRoads(paths.map((path,i)=>({id:`site-${i}`,path,width:8,lanes:1,speed:20,use:'industrial',...(i===0&&input.circulation?.turnSurface?{turnSurface:input.circulation.turnSurface}:{})})));
 }
 if(!roads.length&&typeof input?.networkKey==='string'){try{const paths:unknown=JSON.parse(input.networkKey);if(Array.isArray(paths))roads=validRoads(paths.map((path,i)=>({id:`city-${i}`,path,width:8,lanes:1,speed:40,use:'connector'})));}catch{/* Хуучин эвдэрсэн өгөгдлөөс зам зохиохгүй. */}}
 return roads.map(r=>({...r,id:`${p.topic}:${r.id}`}));
}));}
