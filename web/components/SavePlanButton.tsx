"use client";
import {usePlanning} from './PlanningContext';
import {scopedTopic} from '@/lib/planningBoundary';
import {useEffect,useRef,useState} from 'react';
import {useMapCtx} from './MapCtx';
import MasterPlanPicker,{usePlanDestination} from './MasterPlanPicker';
import {useMasterPlan} from './MasterPlanContext';
import {captureLayers,planningLayerFilter} from '@/lib/planSnapshot';
import {savePlan,type SavedLayer,type PlanFinance,type PlanDemand,type PlanReport} from '@/lib/savedPlans';
export default function SavePlanButton({topic,title,section,disabled=false,metrics={},inputs,finance,demand,warnings,dependencies,zoneId,report,getLayers}:{topic:string;report?:PlanReport;zoneId?:number;title:string;section:number;disabled?:boolean;metrics?:Record<string,string|number>;inputs?:unknown;finance?:PlanFinance;demand?:PlanDemand;warnings?:string[];dependencies?:Record<string,number>;getLayers?:()=>Promise<SavedLayer[]>}){
 const boundary=usePlanning(),{map,view,dim,setDim}=useMapCtx(),{masters,activeId}=useMasterPlan(),{destination,setDestination}=usePlanDestination();
 const [busy,setBusy]=useState(false),[waiting,setWaiting]=useState(false),[status,setStatus]=useState(''),lock=useRef(false),key=useRef(boundary.key);key.current=boundary.key;
 const pending=useRef<{key:string;destination:string}|null>(null);
 useEffect(()=>{key.current=boundary.key;return()=>{key.current='';};},[boundary.key]);
 const commit=async(target:string,started:string)=>{try{
  const layers=getLayers?await getLayers():await captureLayers(map!,planningLayerFilter(topic));
  if(started!==key.current)throw new Error('Үндсэн төлөвлөгөө / хил өөрчлөгдсөн. Дахин тооцно уу.');
  await savePlan({masterPlanId:activeId??undefined,topic:scopedTopic(topic.startsWith('urban:')&&zoneId?`urban:${zoneId}`:topic,boundary.mode),boundary:{mode:boundary.mode,revision:boundary.revision,zone:zoneId??(topic==='wind'?3:topic==='solar'?4:undefined)},title,section,layers,dimension:'3d',metrics,inputs,report,finance,demand,warnings,dependencies},target);
  setStatus(`${masters.find(p=>p.id===target)?.name??'Үндсэн төлөвлөгөө'} · хадгаллаа`);
 }catch(e){setStatus((e as Error).message);}finally{lock.current=false;pending.current=null;setWaiting(false);setBusy(false);}};
 const save=()=>{if(!map||!destination||lock.current)return;lock.current=true;setBusy(true);setStatus('');const target={key:boundary.key,destination};if(!getLayers&&(dim!=='3d'||view?.type!=='3d')){pending.current=target;setWaiting(true);setDim('3d');}else void commit(target.destination,target.key);};
 useEffect(()=>{if(!waiting||!pending.current)return;if(pending.current.key!==boundary.key){pending.current=null;lock.current=false;setWaiting(false);setBusy(false);setStatus('Үндсэн төлөвлөгөө / хил солигдсон.');return;}if(dim!=='3d'||view?.type!=='3d')return;const p=pending.current;const frame=requestAnimationFrame(()=>{pending.current=null;void commit(p.destination,p.key);});return()=>cancelAnimationFrame(frame);},[waiting,dim,view,boundary.key]);
 useEffect(()=>{if(!waiting)return;const timer=setTimeout(()=>{if(!pending.current)return;pending.current=null;lock.current=false;setWaiting(false);setBusy(false);setStatus('3D харагдац нээгдсэнгүй. Дахин хадгална уу.');},30000);return()=>clearTimeout(timer);},[waiting]);
 return <div className="savePlan"><MasterPlanPicker value={destination} onChange={setDestination} disabled={busy}/><button className="btn btnPrimary" disabled={disabled||busy||!map||!destination||!activeId} onClick={save}>{busy?(waiting?'3D өгөгдөл бэлтгэж байна…':'Хадгалж байна…'):'Үндсэн төлөвлөгөөнд хадгалах'}</button>{status&&<p role="status">{status}</p>}</div>;
}
