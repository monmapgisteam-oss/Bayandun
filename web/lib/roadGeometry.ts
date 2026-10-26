import type {Rings} from './geom';
import type {Point2} from './sharedUtilityGraph';
export type Road={id:string;path:Point2[];width:number;lanes:number;median?:number;turnSurface?:Rings;speed:number;use:'residential'|'industrial'|'connector'};
export const distance=(a:Point2,b:Point2)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const pathLength=(p:Point2[])=>p.slice(1).reduce((s,b,i)=>s+distance(p[i],b),0);
/** Хадгалсан хуучин/эвдэрсэн мөрөөс NaN геометр, хязгааргүй давталт үүсгэхгүй. */
export function validRoads(input:unknown):Road[]{
 if(!Array.isArray(input))return[];
 const roads:Road[]=[],seen=new Set<string>();
 for(const value of input){
  if(!value||typeof value!=='object'||!Array.isArray(value.path)||value.path.some((p:unknown)=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))continue;
  const path=(value.path as Point2[]).filter((p,i,a)=>!i||distance(a[i-1],p)>.001);
  if(path.length<2||!Number.isFinite(value.width)||value.width<5||!Number.isFinite(value.speed)||value.speed<=0)continue;
  const width=value.width,lanes=Math.max(1,Math.min(8,Math.trunc(value.lanes)||1)),median=Number.isFinite(value.median)?Math.max(0,Math.min(width-5,value.median)):0;
  const turnSurface=Array.isArray(value.turnSurface)&&value.turnSurface.every((r:unknown)=>Array.isArray(r)&&r.length>=4&&r.every((p:unknown)=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))?value.turnSurface as Rings:undefined;
  const a=JSON.stringify(path),b=JSON.stringify([...path].reverse()),key=[a<b?a:b,width,lanes,median,value.speed,value.use,JSON.stringify(turnSurface??[])].join('|');
  if(seen.has(key))continue;seen.add(key);
  roads.push({id:String(value.id??`road-${roads.length}`),path,width,lanes,median,turnSurface,speed:value.speed,use:['residential','industrial','connector'].includes(value.use)?value.use:'connector'});
 }
 return roads;
}
export function samplePath(p:Point2[],s:number){
 for(let i=1;i<p.length;i++){const a=p[i-1],b=p[i],l=distance(a,b);if(l<1e-8)continue;if(s<=l||i===p.length-1){const t=Math.max(0,Math.min(1,s/l));return{point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t] as Point2,dir:[(b[0]-a[0])/l,(b[1]-a[1])/l] as Point2};}s-=l;}
 return{point:p[0]??[0,0] as Point2,dir:[1,0] as Point2};
}
export function offsetPath(path:Point2[],offset:number):Point2[]{
 return path.map((p,i)=>{const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],l1=distance(a,p),l2=distance(p,b),u=l1>0?[(p[0]-a[0])/l1,(p[1]-a[1])/l1]:[(b[0]-p[0])/l2,(b[1]-p[1])/l2],v=l2>0?[(b[0]-p[0])/l2,(b[1]-p[1])/l2]:u,n=[u[1]+v[1],-u[0]-v[0]],nl=Math.hypot(...n);if(nl<1e-6)return[p[0]+u[1]*offset,p[1]-u[0]*offset];const m=Math.min(1.6,1/Math.max(.2,(n[0]*u[1]-n[1]*u[0])/nl));return[p[0]+n[0]/nl*offset*m,p[1]+n[1]/nl*offset*m];});
}
