import {topicAppearance} from './topicAppearance';
import {spatialGoal,SPACE_ROLES} from './siteSpatial';
import {layoutFacilities,facilityEnvelope,type LayoutInput} from './facilityLayout';
import {area,bbox,bufPath,bufPoly,circle,clipPaths,diff,dist,inside,inter,nearest,orientedRect,unionAll,type Rings,type XY} from './geom';
import {zAt} from './dem';
import {boundaryMask} from './planBoundary';
import {routeTerrain,uniqueRouteLength,terrainSegmentMaxGrade} from './terrainRoute';
import type {Net,Red} from './corridors';
import type {Geo} from './masterplan';
import {FACILITIES,FACILITY_DEFAULTS,type FacilityKind} from './facilityPlanning';
import {utmLayer} from './modmap';
import {facilityModel,modelRenderer} from './renewableModels';
import type {PlanDemand,PlanFinance} from './savedPlans';
import {buildPlanningSuitability,planningContains,planningRoutingCost,planningElevation,type PlanningSuitability,type PlanningSuitabilitySummary,type PlanningAssessment} from './planningSuitability';
export type Programme=LayoutInput&{id:string;name:string;kind:FacilityKind;water:number;power:number;appearance?:string;open?:boolean;group?:string;role?:string;capacityUnit?:string;sewer?:number;docks?:number;vehicleRadius?:number;deferConnections?:boolean};
export const DEFAULT_ZONE:Record<FacilityKind,number>={process:6,datacenter:14,warehouse:15,water:2,substation:13};
export function defaultProgramme(kind:FacilityKind,id:string):Programme{const c=FACILITIES[kind],v=FACILITY_DEFAULTS[kind];return{id,name:c.label,kind,zone:DEFAULT_ZONE[kind],...v,width:c.width,depth:c.depth,height:c.height,spacing:40,slope:5,reserve:30};}
export type SitePlan={programme:Programme;placed:ReturnType<typeof layoutFacilities>['placed'];needed:number;reserved:Rings;yards:Rings;green:Rings;access:XY[][];ports?:XY[];aprons?:Rings;services?:Record<string,XY[][]>;warnings:string[];finance:PlanFinance;demand:PlanDemand;suitability?:PlanningSuitabilitySummary;placementEvidence?:PlanningAssessment[]};
const accessSuitability=new WeakMap<Net,PlanningSuitability>();
function accessContext(net:Net){if(net.suitability)return net.suitability;let context=accessSuitability.get(net);if(!context){context=buildPlanningSuitability({dem:net.dem,boundary:net.boundary,roads:[...(net.exist??[]),...(net.roads??[]).map(r=>r.path)]});accessSuitability.set(net,context);}return context;}
// Local access roads use the DEM's actual sampling resolution for elevations, interpolated
// onto a 5 m routing grid. This improves obstacle clearance, not terrain accuracy.
export function accessRoute(start:XY,target:XY,net:Net,obstacles:Rings,allowed:Rings,halfWidth=4,maxGrade=8):XY[]{
 const length=dist(start,target);if(!Number.isFinite(length)||length<.001)return[];
 const suitability=accessContext(net),profile=halfWidth<=1?'utility':'road';
 const costAt=(p:XY)=>planningRoutingCost(suitability,p,profile);
 const restrictions=suitability.restrictions.filter(r=>!r.profiles||r.profiles.includes(profile));
 const intersectsRestriction=(surface:Rings)=>restrictions.some(r=>r.rings.length&&area(inter(surface,r.rings))>.01);
 // Шууд коридор нь хил, саад, DEM налуугаар бүрэн зөв бол торны шатлал хэрэггүй.
 const direct=bufPath([[start,target]],halfWidth);
 if(terrainSegmentMaxGrade(net.dem,start,target)<=maxGrade+.00001&&area(diff(direct,allowed))<.01&&(!obstacles.length||area(inter(direct,obstacles))<.01)&&!intersectsRestriction(direct)){
  let valid=true,minCost=Infinity,maxCost=0;const count=Math.max(1,Math.ceil(length/5));let previous=start;
  for(let i=0;i<=count;i++){const point:XY=[start[0]+(target[0]-start[0])*i/count,start[1]+(target[1]-start[1])*i/count],a=planningElevation(net.dem,...point),b=planningElevation(net.dem,...previous),grade=i&&a!=null&&b!=null?Math.abs(a-b)/dist(point,previous)*100:0,cost=costAt(point);if(a==null||b==null||!Number.isFinite(grade)||grade>maxGrade||!Number.isFinite(cost)){valid=false;break;}minCost=Math.min(minCost,cost);maxCost=Math.max(maxCost,cost);previous=point;}
  // ТААМАГЛАЛ: зөвхөн жигд, бага өртөгтэй коридорт шууд холбоос; ялгаатай эрсдэлийг A* харьцуулна.
  if(valid&&maxCost<=1.8&&maxCost-minCost<=.1)return[start,target];
 }
 const pad=length>2000?250:100,width=Math.abs(target[0]-start[0])+pad*2,height=Math.abs(target[1]-start[1])+pad*2;
 // Урт хотын холбоос 2 км дээр тасрахгүй. Нүдний тоог хязгаарлана;
 // энэ нь DEM-ийн эх нягтралыг нэмэгдүүлэхгүй.
 const cell=Math.max(length>2000?10:5,Math.ceil(Math.sqrt(width*height/250000)/5)*5),x0=Math.floor((Math.min(start[0],target[0])-pad)/cell)*cell,y0=Math.floor((Math.min(start[1],target[1])-pad)/cell)*cell;
 const nx=Math.ceil((Math.max(start[0],target[0])+pad-x0)/cell)+1,ny=Math.ceil((Math.max(start[1],target[1])+pad-y0)/cell)+1;
 const d={x0,y0,nx,ny,cell,z:new Float64Array(nx*ny)},mask=boundaryMask(d,allowed,halfWidth),costSurface=new Float64Array(nx*ny).fill(Infinity);
 const frame:Rings=[[[x0,y0],[x0,y0+ny*cell],[x0+nx*cell,y0+ny*cell],[x0+nx*cell,y0],[x0,y0]]];
 const allObstacles=restrictions.length?unionAll([obstacles,...restrictions.map(r=>r.rings)]):obstacles;
 const localObstacles=allObstacles.length?inter(allObstacles,frame):[];
 const block=localObstacles.length?bufPoly(localObstacles,halfWidth+cell/Math.SQRT2):[];
 for(let k=0;k<mask.length;k++){const x=x0+k%nx*cell,y=y0+Math.floor(k/nx)*cell,z=planningElevation(net.dem,x,y);d.z[k]=z??NaN;if(z==null||block.length&&planningContains(block,x,y))mask[k]=0;if(mask[k]){const cost=costAt([x,y]);if(!Number.isFinite(cost))mask[k]=0;else costSurface[k]=cost;}}
 const result=routeTerrain(d,mask,start,target,{maxGrade,costSurface,smooth:true});if(result.status!=='ok')return [];
 const path=[start,...result.path,target],surface=bufPath([path],halfWidth);
 if(area(diff(surface,allowed))>0.01||obstacles.length&&area(inter(surface,obstacles))>0.01||intersectsRestriction(surface))return [];
 for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];if(terrainSegmentMaxGrade(net.dem,a,b)>maxGrade+.00001)return[];const count=Math.max(1,Math.ceil(dist(a,b)/Math.min(5,net.dem.cell/2)));let previous=a;for(let j=1;j<=count;j++){const p:XY=[a[0]+(b[0]-a[0])*j/count,a[1]+(b[1]-a[1])*j/count],za=planningElevation(net.dem,...previous),zb=planningElevation(net.dem,...p),len=dist(previous,p);if(za==null||zb==null||len>.0001&&Math.abs(zb-za)/len*100>maxGrade+1e-6||!Number.isFinite(costAt(p)))return[];previous=p;}}
 return path;
}
export function planFacilitySite(geo:Geo,net:Net,red:Red|null,programme:Programme,occupied:Rings=[],mains?:Record<string,{path:XY[];status:string}[]>,context:SitePlan[]=[]):SitePlan{
 if(![programme.water,programme.power].every(v=>Number.isFinite(v)&&v>=0))throw new Error('Ус, цахилгааны хэрэгцээг шалгана уу.');
 const input={...programme,goal:spatialGoal(programme,context,geo,net),spacing:Math.max(40,programme.spacing)};
 const result=layoutFacilities(geo,net,red,input,occupied),{placed,needed}=result;
 const envelopes=placed.map(p=>{const a=-p.heading*Math.PI/180;return [facilityEnvelope(p.x,p.y,[Math.cos(a),Math.sin(a)],programme.width,programme.depth,input.spacing,programme.frontApron)];});
 const aprons=unionAll(programme.frontApron?placed.map(p=>{const a=-p.heading*Math.PI/180,u:XY=[Math.cos(a),Math.sin(a)],offset=(programme.depth+programme.frontApron!)/2;return[orientedRect([p.x+u[1]*offset,p.y-u[0]*offset],u,programme.width,programme.frontApron!)];}):[]);
 const footprints=unionAll(placed.map(p=>[p.ring]));
 const reserved=unionAll(envelopes),paved=unionAll([aprons,inter(reserved,bufPoly(footprints,input.spacing/2-6))]);
 let yards=diff(paved,footprints);const green=diff(reserved,paved),access:XY[][]=[],entries:XY[]=[],services:Record<string,XY[][]>={},warnings:string[]=[];
 const roads=[...net.exist,...net.roads.map(r=>r.path)];
 const obstacles=unionAll([footprints,occupied,...(red?[red.rail]:[]),...[1,7,16].filter(id=>id!==programme.zone&&geo.rings[id]).map(id=>geo.rings[id])].filter(r=>r.length));
 const allowed=net.boundary,routeCache=new Map<string,XY[][][number]>();
 const route=(start:XY,end:XY,halfWidth=4,maxGrade=8)=>{const key=[...start,...end,halfWidth,maxGrade].join(',');let path=routeCache.get(key);if(!path){path=accessRoute(start,end,net,obstacles,allowed,halfWidth,maxGrade);routeCache.set(key,path);}return path;};
 for(const [i,p]of placed.entries()){
  // Select a door/service-yard edge toward the nearest actual road.
  const near=nearest(roads,[p.x,p.y],false),a=-p.heading*Math.PI/180,u:XY=[Math.cos(a),Math.sin(a)],v:XY=[-u[1],u[0]];
  const doors:XY[]=[1,-1].flatMap(sign=>[[p.x+sign*u[0]*(programme.width/2+10),p.y+sign*u[1]*(programme.width/2+10)] as XY,[p.x+sign*v[0]*(programme.depth/2+10),p.y+sign*v[1]*(programme.depth/2+10)] as XY]).sort((a,b)=>dist(a,near)-dist(b,near));
  if(programme.deferConnections){entries.push([p.x+v[0]*-(programme.depth/2+(programme.frontApron??0)+12),p.y+v[1]*-(programme.depth/2+(programme.frontApron??0)+12)]);continue;}
  let path:XY[]=[];for(const door of doors){path=route(door,nearest(roads,door,false));if(path.length)break;}
  entries.push(path[0]??doors[0]);
  if(path.length)access.push(path);else warnings.push(`№${i+1}: 8 м хүрэх замын холбоос олдсонгүй.`);
 }
 for(const kind of programme.deferConnections?[]:['power','water','sewer']){
  if(kind==='power'?programme.kind==='substation'||programme.power<=0:programme.water<=0)continue;
  const trunks=(mains?.[kind]??[]).filter(r=>r.status==='ok'&&r.path.length>1).map(r=>r.path),paths:XY[][]=[];
  if(trunks.length)for(const entry of entries){
   const targets=trunks.map(p=>nearest([p],entry,false)).sort((a,b)=>dist(entry,a)-dist(entry,b)).slice(0,3);
   for(const target of targets){const path=route(entry,target,1,25);if(path.length){paths.push(path);break;}}
  }
  services[kind]=paths;if(paths.length<placed.length)warnings.push(`${kind}: ${placed.length-paths.length} нэгж гол шугамтай холбогдоогүй.`);
 }
 const roadSurface=access.length?unionAll(access.map(p=>bufPath([p],4))):[];
 yards=diff(yards,roadSurface);
 if(placed.length<needed)warnings.push(`${needed-placed.length} нэгжийн хэрэгцээ талбайд багтаагүй.`);
 warnings.push('Шугамууд нь тооцсон гол шугамд хүрсэн концепц коридор. Даралт, кабелийн чадал, бохирын өөрийн урсгал / насос болон техникийн нөхцөлийг баталгаажуулаагүй.');
 const kind=programme.kind;
 const utilityReserve=unionAll(Object.values(services).flatMap(paths=>paths.map(path=>bufPath([path],1))));
 warnings.push(...result.suitability.missing.map(v=>`ДУТУУ ӨГӨГДӨЛ: ${v}`));
 return {programme,placed,needed,suitability:result.suitability,placementEvidence:result.placementEvidence,ports:entries,aprons,reserved:unionAll([reserved,roadSurface,utilityReserve]),yards,green:diff(green,roadSurface),access,services,warnings,
 finance:{qty:{...Object.fromEntries(Object.entries(services).map(([k,paths])=>[k,uniqueRouteLength(paths)])),factoryGfa:programme.open?0:placed.length*programme.width*programme.depth,sitePaving:area(yards)+(programme.open&&programme.appearance!=='green'&&programme.appearance!=='retention'?area(footprints):0),roadLoc:uniqueRouteLength(access),protectHa:area(diff(green,roadSurface))/1e4,indPrepHa:area(reserved)/1e4,...(kind==='water'?{waterCap:placed.length*programme.capacity}:{}),...(kind==='substation'?{substation:Math.min(programme.power,placed.length*programme.capacity*0.9)}:{})},info:{ha:area(reserved)/1e4}},
 demand:{powerMW:programme.power,waterM3Day:programme.water,...(kind==='water'?{waterSupplyM3Day:placed.length*programme.capacity}:{}),...(kind==='substation'?{substationMVA:placed.length*programme.capacity,powerMW:0}:{})}};
}
export function siteLayers(site:SitePlan,dimension='3d'){
 const {programme:p}=site,id=`mod:5:facility-${p.id}`,role=SPACE_ROLES[p.role??'']??p.name;
 const poly=(suffix:string,title:string,rings:Rings,color:string)=>utmLayer({id:`${id}:${suffix}`,title:`${p.name} · ${title}`,geom:'polygon',fields:[{name:'name',type:'string'},{name:'zone',type:'integer'},{name:'area_m2',type:'double'},{name:'status',type:'string'}],rows:rings.length?[{g:rings,a:{name:title,zone:p.zone,area_m2:area(rings),status:'Концепц төлөвлөлт'}}]:[],renderer:{type:'simple',symbol:{type:'simple-fill',color,outline:{color:'#64716d',width:0.4}}}});
 const dockRows=site.placed.flatMap((o,i)=>{if(!p.docks||!p.frontApron)return[];const a=-o.heading*Math.PI/180,u:XY=[Math.cos(a),Math.sin(a)],v:XY=[-u[1],u[0]],point=(x:number,y:number):XY=>[o.x+u[0]*x+v[0]*y,o.y+u[1]*x+v[1]*y];return Array.from({length:p.docks},(_,j)=>{const x=-p.width*0.4+(j+0.5)*p.width*0.8/p.docks!,half=Math.min(2,p.width*0.35/p.docks!);return{g:[point(x-half,-p.depth/2),point(x-half,-p.depth/2-p.frontApron!),point(x+half,-p.depth/2-p.frontApron!),point(x+half,-p.depth/2)],a:{name:`Док ${i+1}.${j+1}`,depth_m:p.frontApron!}};});});
 const layers=[utmLayer({id:`${id}:docks`,title:'Ачилтын док · байрлал',geom:'polyline',fields:[{name:'name',type:'string'},{name:'depth_m',type:'double'}],rows:dockRows,renderer:{type:'simple',symbol:{type:'simple-line',color:'#efe5bf',width:1.2}}}),poly('aprons','Ачилтын док · маневрын талбай',site.aprons??[],'#b9b5a5'),poly('yards','Үйлчилгээний талбай',diff(site.yards,site.aprons??[]),'#acaaa1'),poly('green','Ногоон / ус нэвчүүлэх нөөц',site.green,'#6b8655'),poly('access','8 м хүрэх зам',site.access.length?unionAll(site.access.map(p=>bufPath([p],4))):[],'#555d63'),
 utmLayer({id:`${id}:buildings`,title:p.name,geom:dimension==='3d'&&!p.open?'point':'polygon',fields:[{name:'name',type:'string'},{name:'role',type:'string'},{name:'appearance',type:'string'},{name:'heading',type:'double'},{name:'zone',type:'integer'},{name:'capacity',type:'double'},{name:'capacity_unit',type:'string'},{name:'width_m',type:'double'},{name:'depth_m',type:'double'},{name:'height_m',type:'double'},{name:'docks',type:'integer'},{name:'apron_m',type:'double'},{name:'power_mw',type:'double'},{name:'water_m3_day',type:'double'},{name:'area_m2',type:'double'},...['suitability_score','terrain_slope_pct','upstream_area_ha','site_relief_m','dem_cell_m','data_coverage'].map(name=>({name,type:'double' as const}))],rows:site.placed.map((o,i)=>({g:dimension==='3d'&&!p.open?[o.x,o.y] as XY:o.ring,a:{name:`${p.name} · ${i+1}`,role,appearance:topicAppearance(p.zone,p.role,p.appearance??p.kind),heading:o.heading,zone:p.zone,capacity:o.capacity,capacity_unit:p.capacityUnit??FACILITIES[p.kind].unit,width_m:p.width,depth_m:p.depth,height_m:p.open?0:p.height,docks:p.docks??0,apron_m:p.frontApron??0,power_mw:p.power/site.needed,water_m3_day:p.water/site.needed,area_m2:p.width*p.depth,suitability_score:site.placementEvidence?.[i]?.score??null,terrain_slope_pct:site.placementEvidence?.[i]?.evidence.slopePct??null,upstream_area_ha:site.placementEvidence?.[i]?.evidence.flowHa??null,site_relief_m:site.placementEvidence?.[i]?.evidence.reliefM??null,dem_cell_m:site.suitability?.demCellM??null,data_coverage:site.placementEvidence?.[i]?.coverage??null}})),
 labelingInfo:[{labelExpressionInfo:{expression:'$feature.role'},labelPlacement:dimension==='3d'&&!p.open?'above-center':'always-horizontal',minScale:7000,symbol:{type:'text',color:'#f8fafc',haloColor:'#24343e',haloSize:1.2,font:{size:9}}}],
 renderer:dimension==='3d'&&!p.open?modelRenderer(facilityModel(topicAppearance(p.zone,p.role,p.appearance??p.kind),p.width,p.depth,p.height,p.docks),site.placed[0]?.heading??0):{type:'simple',symbol:{type:'simple-fill',color:p.appearance==='green'?'#6b8655':p.appearance==='retention'?'#75999e':p.open?'#a6aaa9':'#8195a5',outline:{color:'#334a5c',width:1}}}}),
 ...Object.entries(site.services??{}).map(([kind,paths])=>utmLayer({id:`${id}:service-${kind}`,title:`${p.name} · ${kind}`,geom:'polyline',fields:[{name:'name',type:'string'},{name:'length_km',type:'double'},{name:'status',type:'string'}],rows:paths.map(g=>({g,a:{name:({water:'Ус',power:'Цахилгаан',sewer:'Бохир'} as Record<string,string>)[kind]??kind,length_km:uniqueRouteLength([g]),status:'Гол шугамд хүрсэн концепц маршрут'}})),renderer:{type:'simple',symbol:{type:'simple-line',color:({water:'#2d8bb9',power:'#c38b25',sewer:'#9060a5'} as Record<string,string>)[kind],width:1.5,style:'dash'}}}))];
 return layers.filter(l=>{if(l.source.length)return true;l.destroy();return false;});
}

export type SiteCirculation={paths:XY[][];connected:number;total:number;components:number;km:number;walkways?:XY[][];pedestrianUnresolved?:number;loops?:number;turnWarnings?:number;turnSurface?:Rings;turnAudit?:{vehicle:string;radiusM:number;checked:number;enabled:number;restricted:number;addedAreaM2:number}};
/** Internal access is a separate network from external city connections. It can cross
 * a plot's service apron, but never a building, reserved neighbouring use or topic boundary. */
export function connectSiteSpaces(sites:(Pick<SitePlan,'programme'|'placed'>&Partial<Pick<SitePlan,'ports'|'access'>>)[],geo:Geo,net:Net,red:Red|null,occupied:Rings=[]):SiteCirculation{
 const units=sites.flatMap(s=>s.placed.map((p,i)=>({p,programme:s.programme,port:s.ports?.[i]}))),paths:XY[][]=[];
 if(!units.length)return{paths,connected:0,total:0,components:0,km:0};
 const zone=sites[0].programme.zone,allowed=inter(geo.rings[zone],net.boundary);
 const obstacles=unionAll([occupied,...units.map(u=>[u.p.ring]),...(red?[red.rail]:[])].filter(r=>r.length));
 const doors=units.map(({p,programme:q,port})=>{if(port)return[port];const a=-p.heading*Math.PI/180,u:XY=[Math.cos(a),Math.sin(a)],v:XY=[-u[1],u[0]];return [1,-1].flatMap(sign=>[[p.x+sign*u[0]*(q.width/2+12),p.y+sign*u[1]*(q.width/2+12)] as XY,[p.x+sign*v[0]*(q.depth/2+12),p.y+sign*v[1]*(q.depth/2+12)] as XY]).filter(d=>inside(d[0],d[1],allowed)).slice(0,1);});
 const parents=units.map((_,i)=>i),root=(i:number):number=>parents[i]===i?i:(parents[i]=root(parents[i]));
 const pairs:{a:number;b:number;d:number;choices:{a:XY;b:XY;d:number}[]}[]=[];
 for(let a=0;a<units.length;a++)for(let b=a+1;b<units.length;b++){const choices=doors[a].flatMap(x=>doors[b].map(y=>({a:x,b:y,d:dist(x,y)}))).sort((x,y)=>x.d-y.d);if(choices[0]?.d<=2000)pairs.push({a,b,d:choices[0].d,choices});}
 pairs.sort((a,b)=>a.d-b.d);const linked=new Set<number>();
 // Ачилтын нэг цэг рүү ижил талаас хоёр зам тулгаж 180° буцаахгүй.
 // Шинэ салбар нь өмнөх орц/дотоод нуруу замд залгаж, докын төгсгөлийг салаа хэвээр үлдээнэ.
 const spines:{unit:number;path:XY[]}[]=sites.flatMap(s=>(s.access??[]).flatMap(path=>{const unit=units.findIndex(u=>u.port&&dist(u.port,path[0])<.02);return unit<0?[]:clipPaths([path],allowed).map(path=>({unit,path}));}));
 for(const pair of pairs){if(root(pair.a)===root(pair.b))continue;
  const candidates=pair.choices.map(c=>({...c,spine:false}));
  for(const [a,b]of [[pair.a,pair.b],[pair.b,pair.a]]){const connected=spines.filter(s=>root(s.unit)===root(b)),roads=connected.map(s=>s.path);
   // Хоёр эргэлт / докын төгсгөлийг 1–5 м зайтай шахахгүй. 30 м нь SU-30
   // концепцийн зангилааны нөөц; батлагдсан замын нормын утга гэж үзэхгүй.
   const anchors=[...units.flatMap((_,i)=>root(i)===root(b)?doors[i]:[]),...connected.flatMap(s=>[s.path[0],s.path.at(-1)!])],free=roads.length?clipPaths(roads,diff(allowed,unionAll(anchors.map(p=>[circle(p,30,32)])))):[];
   if(free.length)for(const start of doors[a]){const target=nearest(free,start,false);if(dist(start,target)>.05)candidates.push({a:start,b:target,d:dist(start,target),spine:true});}}
  candidates.sort((a,b)=>Number(b.spine)-Number(a.spine)||a.d-b.d);
  for(const c of candidates.slice(0,8)){const path=accessRoute(c.a,c.b,net,obstacles,allowed);if(path.length){paths.push(path);spines.push({unit:pair.a,path});parents[root(pair.a)]=root(pair.b);linked.add(pair.a);linked.add(pair.b);break;}}if(new Set(parents.map((_,i)=>root(i))).size===1)break;}
 let loops=0;
 if(units.some(u=>u.programme.frontApron)&&units.length>2){
  for(const pair of [...pairs].reverse()){if(root(pair.a)!==root(pair.b))continue;const c=pair.choices[0];if(!c||paths.some(path=>dist(path[0],c.a)<0.01&&dist(path[path.length-1],c.b)<0.01))continue;const path=accessRoute(c.a,c.b,net,obstacles,allowed);if(path.length){paths.push(path);loops++;break;}}
 }
 const {walkways,pedestrianUnresolved}=connectStaffPaths(sites,geo,net,red,occupied,[...paths,...sites.flatMap(s=>s.access??[])]);
 return{paths,connected:linked.size,total:units.length,components:new Set(parents.map((_,i)=>root(i))).size,km:uniqueRouteLength(paths),walkways,pedestrianUnresolved,loops};
}
export function circulationLayer(c:SiteCirculation,module:number){return utmLayer({id:`mod:${module}:facility-internal-roads`,title:'Цогцолборын дотоод авто зам · 8 м',geom:'polygon',fields:[{name:'length_km',type:'double'},{name:'road_width_m',type:'double'},{name:'connected',type:'integer'},{name:'total',type:'integer'},{name:'components',type:'integer'}],rows:c.paths.length?[{g:unionAll([...(c.paths.map(path=>bufPath([path],4))),c.turnSurface??[]]),a:{length_km:c.km,road_width_m:8,connected:c.connected,total:c.total,components:c.components}}]:[],renderer:{type:'simple',symbol:{type:'simple-fill',color:'#58636b',outline:{color:'#b9beb9',width:0.5}}}});}

export function pedestrianLayer(c:SiteCirculation,module:number){const paths=c.walkways??[];return utmLayer({id:`mod:${module}:facility-pedestrian`,title:'Ажилчдын явган холбоос · 2.5 м',geom:'polygon',fields:[{name:'name',type:'string'},{name:'road_width_m',type:'double'},{name:'length_km',type:'double'},{name:'status',type:'string'}],rows:paths.map(path=>({g:bufPath([path],1.25),a:{name:'Зогсоол → захиргаа',road_width_m:2.5,length_km:uniqueRouteLength([path]),status:'Авто замаас тусгаарласан концепц'}})),renderer:{type:'simple',symbol:{type:'simple-fill',color:'#c5b997',outline:{color:'#eee8ce',width:0.4}}}});}

export function connectStaffPaths(sites:(Pick<SitePlan,'programme'|'placed'>&Partial<Pick<SitePlan,'access'>>)[],geo:Geo,net:Net,red:Red|null,occupied:Rings,vehiclePaths:XY[][]){
 const units=sites.flatMap(s=>s.placed.map(p=>({p,programme:s.programme}))),zone=sites[0]?.programme.zone;
 if(zone==null)return{walkways:[] as XY[][],pedestrianUnresolved:0};
 const allowed=inter(geo.rings[zone],net.boundary),obstacles=unionAll([occupied,...units.map(u=>[u.p.ring]),...(red?[red.rail]:[])].filter(r=>r.length));
 const walkways:XY[][]=[],vehicleSurface=unionAll(vehiclePaths.map(p=>bufPath([p],5))),walkingObstacles=unionAll([obstacles,vehicleSurface]);let pedestrianUnresolved=0;
 // Ажилчдын зогсоол → захиргааны тусдаа явган холбоос. Авто замыг огтлохгүй;
 // боломжгүй бол шийдээгүй гэж тайлагнана, баталгаагүй гарц зурахгүй.
 for(const [a,unit]of units.entries())if(unit.programme.role==='parking'){
  const b=units.findIndex(q=>q.programme.group===unit.programme.group&&q.programme.role==='admin');if(b<0)continue;
  const walkDoors=(index:number)=>{const {p,programme:q}=units[index],angle=-p.heading*Math.PI/180,u:XY=[Math.cos(angle),Math.sin(angle)],v:XY=[-u[1],u[0]];return[1,-1].flatMap(sign=>[[p.x+sign*u[0]*(q.width/2+12),p.y+sign*u[1]*(q.width/2+12)] as XY,[p.x+sign*v[0]*(q.depth/2+12),p.y+sign*v[1]*(q.depth/2+12)] as XY]);};
  const choices=walkDoors(a).flatMap(x=>walkDoors(b).map(y=>({a:x,b:y,d:dist(x,y)}))).sort((x,y)=>x.d-y.d);let connected=false;
  for(const choice of choices){const path=accessRoute(choice.a,choice.b,net,walkingObstacles,allowed,1.25,8);if(path.length){walkways.push(path);connected=true;break;}}
  if(!connected)pedestrianUnresolved++;
 }
 return{walkways,pedestrianUnresolved};
}
