import {dist,nearest,type XY} from './geom';
import type {Geo} from './masterplan';
import type {Net} from './corridors';
import type {Programme,SitePlan} from './facilitySite';
export type PlacementGoal={target:XY;axis:XY;lowGround?:boolean};
export const SPACE_ROLES:Record<string,string>={main:'Үйлдвэрлэл',electrolysis:'Үйлдвэрлэл',feed:'Түүхий эд',product:'Бүтээгдэхүүн',storage:'Тусгаарласан хадгалалт',byproducts:'Дайвар бүтээгдэхүүн',packing:'Савлагаа',loading:'Ачилт',delivery:'Хүргэлт',truck:'Ачааны хүлээлт',rail:'Төмөр замын нөөц',admin:'Ажилчдын орц',parking:'Ажилчдын зогсоол',cooling:'Хөргөлт',waterprep:'Ус бэлтгэл',treatment:'Ус цэвэрлэгээ',utilities:'Инженерийн үйлчилгээ',electrical:'Цахилгаан',drainage:'Урсацын нөөц',courtyard:'Явган орчин',pilot:'Туршилт',samples:'Дээж',crossdock:'Шилжүүлэн ачилт'};
/** Замын бодит сегменттэй зэрэгцээ үндсэн тэнхлэг; замаас цааш эерэг гүн. */
export function roadFrame(net:Net,center:XY){
 const roads=[...net.exist,...net.roads.map(r=>r.path)];let best=Infinity,axis:XY=[1,0],gate=center;
 for(const road of roads)for(let i=1;i<road.length;i++){const a=road[i-1],b=road[i],q=nearest([[a,b]],center,false),distance=dist(center,q),length=dist(a,b);if(length>0&&distance<best){best=distance;gate=q;axis=[(b[0]-a[0])/length,(b[1]-a[1])/length];}}
 let inward:XY=[-axis[1],axis[0]];if((center[0]-gate[0])*inward[0]+(center[1]-gate[1])*inward[1]<0){axis=[-axis[0],-axis[1]];inward=[-inward[0],-inward[1]];}
 return{axis,inward,gate};
}
/** ТААМАГЛАЛ: урсгалын хөршлөл, нийтийн орц, инженерийн арын хэсэг.
 * Эдгээр нь байршлын зорилт; яг footprint нь хил/хориг/налуугаар шалгагдана. */
export function spatialGoal(p:Programme,sites:SitePlan[],geo:Geo,net:Net):PlacementGoal|undefined{
 if(!p.group||!p.role)return;
 const group=sites.filter(s=>s.programme.group===p.group),main=group.find(s=>['main','electrolysis'].includes(s.programme.role??'')&&s.placed.length);
 if(!main){const frame=roadFrame(net,geo.c[p.zone]);return{axis:frame.axis,target:[frame.gate[0]+frame.inward[0]*220,frame.gate[1]+frame.inward[1]*220]};}
 const c:XY=[main.placed.reduce((v,q)=>v+q.x,0)/main.placed.length,main.placed.reduce((v,q)=>v+q.y,0)/main.placed.length],angle=-main.placed[0].heading*Math.PI/180,u:XY=[Math.cos(angle),Math.sin(angle)],v:XY=[-u[1],u[0]];
 const span=(axis:XY,dim:'width'|'depth')=>Math.max(...main.placed.map(q=>Math.abs((q.x-c[0])*axis[0]+(q.y-c[1])*axis[1])))+main.programme[dim]/2;
 const x=span(u,'width')+p.width/2+65,y=span(v,'depth')+p.depth/2+65;
 let offset:XY=[0,y];
 if(p.role==='feed')offset=[-x,0];
 else if(['product','packing','crossdock','samples','pilot'].includes(p.role))offset=[x,0];
 else if(['storage','byproducts'].includes(p.role))offset=[x+50,y*0.4];
 else if(['loading','delivery','truck','rail'].includes(p.role))offset=[x,-y];
 else if(p.role==='admin')offset=[-x,-y-70];
 else if(p.role==='parking')offset=[-x-90,-y-70];
 else if(p.role==='courtyard')offset=[0,-y];
 else if(['utilities','electrical','waterprep'].includes(p.role))offset=[-x,y];
 else if(p.role==='drainage')offset=[x,y+75];
 // Админ/зогсоол нэг урд хэсэгт, ачилт эсрэг талд; нэг цогцолборын хэсгүүд хоорондоо ойр.
 return{axis:u,target:[c[0]+u[0]*offset[0]+v[0]*offset[1],c[1]+u[1]*offset[0]+v[1]*offset[1]],lowGround:p.role==='drainage'};
}
