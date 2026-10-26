'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {listMasterPlans,initialiseMasterPlans,getActiveMasterPlanId,selectMasterPlan,subscribePlans,type MasterPlan} from '@/lib/savedPlans';
type State={masters:MasterPlan[];activeId:string|null;ready:boolean;error:string;select:(id:string)=>Promise<void>};
const Context=createContext<State>({masters:[],activeId:null,ready:false,error:'',select:async()=>{}});
let initialising:Promise<string>|null=null;
export function MasterPlanProvider({children}:{children:ReactNode}){
 const [masters,setMasters]=useState<MasterPlan[]>([]),[activeId,setActiveId]=useState<string|null>(null),[ready,setReady]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let live=true;let version=0;const load=async()=>{const current=++version;try{const rows=await listMasterPlans();if(live&&current===version){setMasters(rows);setActiveId(getActiveMasterPlanId());setError('');}}catch(e){if(live)setError((e as Error).message);}};const off=subscribePlans(load);
 if(!initialising)initialising=initialiseMasterPlans().catch(e=>{initialising=null;throw e;});initialising.then(load).then(()=>{if(live)setReady(true);}).catch(e=>{if(live)setError((e as Error).message);});
 return()=>{live=false;off();};},[]);
 return <Context.Provider value={{masters,activeId,ready,error,select:selectMasterPlan}}>{children}</Context.Provider>;
}
export const useMasterPlan=()=>useContext(Context);
