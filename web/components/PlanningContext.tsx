"use client";
import {useMasterPlan} from './MasterPlanContext';
import {boundaryLayer} from '@/lib/boundaryLayer';
import {createContext,useContext,useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {buildGeo,loadGeo,type Geo} from '@/lib/masterplan';
import {area,diff,inter,type Rings} from '@/lib/geom';
import type {Net,Red} from '@/lib/corridors';
import {assertFixedBoundary,type BoundaryMode,type BoundaryDesign} from '@/lib/planningBoundary';
import {loadBoundaryDesign,saveBoundaryDesign} from '@/lib/savedPlans';
import {useMapCtx} from './MapCtx';
type Network={net:Net;red:Red};
type State={original:Geo|null;geo:Geo|null;design:BoundaryDesign|null;mode:BoundaryMode;setMode:(m:BoundaryMode)=>void;revision:number;key:string;error:string;saveDesign:(rings:Record<number,Rings>,options:unknown,comparison:BoundaryDesign['comparison'])=>Promise<void>;network:(step?:(s:string)=>void)=>Promise<Network>};
const Context=createContext<State|null>(null);
let originalPromise:Promise<Geo>|null=null;
export function PlanningProvider({children,enabled=true}:{children:ReactNode;enabled?:boolean}){
 const {activeId:masterPlanId,ready:masterReady}=useMasterPlan();
 const [original,setOriginal]=useState<Geo|null>(null),[design,setDesign]=useState<BoundaryDesign|null>(null),[mode,setMode]=useState<BoundaryMode>('current'),[error,setError]=useState('');
 const networks=useRef(new Map<string,Promise<Network>>()),activeMaster=useRef(masterPlanId);activeMaster.current=masterPlanId;
 useEffect(()=>{if(!masterReady||!enabled)return;let live=true;setDesign(null);setMode('current');setError('');networks.current.clear();if(!originalPromise)originalPromise=loadGeo().catch(e=>{originalPromise=null;throw e;});Promise.all([originalPromise,loadBoundaryDesign()]).then(([g,d])=>{if(!live)return;setOriginal(g);if(d){assertFixedBoundary(g.rings,d.rings);setDesign(d);}}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[masterReady,masterPlanId,enabled]);
 const geo=useMemo(()=>original&&mode==='recreated'&&design?buildGeo(design.rings,Object.fromEntries(Object.entries(design.rings).map(([id,r])=>[id,area(r)/1e4])),original.railSegs,original.roadSegs,original.site):original,[original,design,mode]);
 const revision=mode==='recreated'?design?.revision??0:1,key=`${masterPlanId??'none'}:${mode}:${revision}`;
 const value:State={original,geo,design,mode,setMode:m=>{if(m==='current'||design)setMode(m);},revision,key,error,
  saveDesign:async(rings,options,comparison)=>{if(!original)throw new Error('Эх хил уншигдаагүй.');assertFixedBoundary(original.rings,rings);for(const id of original.ids){if(!rings[id]?.length)throw new Error(`${id}-р бүсийн хил хоосон.`);if(id!==16&&area(diff(rings[id],original.site))>0.1)throw new Error(`${id}-р бүс төслийн хилийн гадна байна.`);for(const other of original.ids.filter(j=>j>id))if(area(inter(rings[id],rings[other]))>0.1)throw new Error(`${id}, ${other}-р бүс давхцаж байна.`);}const d:BoundaryDesign={id:'recreated',revision:(design?.revision??0)+1,created:new Date().toISOString(),rings,source16:JSON.stringify(original.rings[16]),options,comparison};await saveBoundaryDesign(d,masterPlanId);if(activeMaster.current!==masterPlanId)return;setDesign(d);setMode('recreated');networks.current.clear();},
  network:async(step)=>{if(!masterReady||!masterPlanId)throw new Error('Үндсэн төлөвлөгөө ачаалж байна.');if(!geo)throw new Error(error||'Бүсийн хил ачаалж байна.');let p=networks.current.get(key);if(!p){p=import('@/lib/corridors').then(({buildNetwork,redZones,COR_DEFAULT})=>buildNetwork(geo,{...COR_DEFAULT,demCell:30 /* Баяндун 8 га: Бөөрөлжүүт 100 м */},step).then(net=>({net,red:redZones(net,geo,COR_DEFAULT)})));networks.current.set(key,p);p.catch(()=>networks.current.delete(key));}return p;}
 };
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function usePlanning(){const s=useContext(Context);if(!s)throw new Error('PlanningProvider required');return s;}
export function BoundaryChoice({zone}:{zone?:number}){
 const p=usePlanning();return <section className="boundaryChoice"><span className="eyebrow">{zone?`БҮС ${String(zone).padStart(2,'0')} · `:''}ТӨЛӨВЛӨХ ХИЛ</span><div className="segTabs"><button className={p.mode==='current'?'on':''} aria-pressed={p.mode==='current'} onClick={()=>p.setMode('current')}>Одоогийн хил</button><button className={p.mode==='recreated'?'on':''} aria-pressed={p.mode==='recreated'} disabled={!p.design} onClick={()=>p.setMode('recreated')}>Тохиромжоор шинэчилсэн</button></div>{zone&&p.original&&<p className="boundaryAreas">Одоо <b>{p.original.ha[zone]?.toFixed(1)} га</b> · Шинэ <b>{p.design?(area(p.design.rings[zone])/1e4).toFixed(1)+' га':'тооцоогүй'}</b></p>}{p.error&&<p className="statusErr" role="alert">{p.error}</p>}</section>;
}
export function BoundaryOverlay({zone,module,active}:{zone?:number;module:number;active:boolean}){
 const {map}=useMapCtx(),p=usePlanning();
 useEffect(()=>{if(!map||!p.original||!active)return;const ids=zone?[zone]:p.original.ids;const layers=([{mode:'current',rings:p.original.rings,color:'#586b7d',style:'dash'},{mode:'recreated',rings:p.design?.rings,color:'#008b8b',style:'solid'}] as const).filter(s=>s.rings).map(s=>boundaryLayer(`mod:${module}:boundary-${s.mode}`,s.rings!,ids,s.mode==='current'?'Одоогийн хил':'Тохиромжоор шинэчилсэн хил',p.mode===s.mode,s.mode==='current'));map.addMany(layers);return()=>{map.removeMany(layers);layers.forEach(l=>l.destroy());};},[map,p.original,p.design,p.mode,zone,module,active]);return null;
}
