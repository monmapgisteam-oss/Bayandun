'use client';
import {useEffect,useState} from 'react';
import {createMasterPlan} from '@/lib/savedPlans';
import {useMasterPlan} from './MasterPlanContext';
export function usePlanDestination(){const {activeId}=useMasterPlan(),[destination,setDestination]=useState<string|null>(activeId);useEffect(()=>setDestination(activeId),[activeId]);return{destination,setDestination};}
/** Сонголт хадгалах хүртэл идэвхтэй төсөл, тооцсон геометрийг солихгүй. */
export default function MasterPlanPicker({value,onChange,compact=false,disabled=false}:{value?:string|null;onChange?:(id:string)=>void;compact?:boolean;disabled?:boolean}){
 const {masters,activeId,ready,error:contextError,select}=useMasterPlan(),[creating,setCreating]=useState(false),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const selected=value===undefined?activeId:value;
 const choose=async(id:string)=>{setError('');try{if(onChange)onChange(id);else await select(id);}catch(e){setError((e as Error).message);}};
 const create=async()=>{setBusy(true);setError('');try{const id=await createMasterPlan(name,{activate:!onChange});if(onChange)onChange(id);setName('');setCreating(false);}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
 return <div className={`masterPlanPicker ${compact?'compact':''}`}><label><span>{onChange?'Хадгалах үндсэн төлөвлөгөө':'Үндсэн төлөвлөгөө'}</span><select className="sel" aria-label={onChange?'Хадгалах үндсэн төлөвлөгөө':'Идэвхтэй үндсэн төлөвлөгөө'} disabled={disabled||busy||!ready} value={selected??''} onChange={e=>choose(e.target.value)}>{!selected&&<option value="">Төлөвлөгөө сонгох</option>}{masters.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="btn" disabled={disabled||busy||!ready} onClick={()=>setCreating(v=>!v)} aria-expanded={creating}>＋ Шинэ</button>{creating&&<div className="masterPlanCreate"><input className="sel" aria-label="Шинэ үндсэн төлөвлөгөөний нэр" placeholder="Үндсэн төлөвлөгөөний нэр" value={name} disabled={busy} onChange={e=>setName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&name.trim())create();}}/><button className="btn btnPrimary" disabled={!name.trim()||busy} onClick={create}>{busy?'Үүсгэж байна…':'Үүсгэх'}</button></div>}{(error||contextError)&&<p className="statusErr" role="alert">{error||contextError}</p>}</div>;
}
