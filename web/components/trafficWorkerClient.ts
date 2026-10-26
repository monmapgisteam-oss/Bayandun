import {createTraffic,type Road,type Traffic} from '../lib/roadTraffic';
import type {TrafficProgress,TrafficWorkerResponse} from './trafficPreparation';
import {loadPreparedTraffic} from './trafficCache';
export async function prepareTrafficInWorker(roads:Road[],signal:AbortSignal,onProgress:(progress:TrafficProgress)=>void):Promise<Traffic>{
 const prepared=await loadPreparedTraffic(roads,signal);if(prepared)return createTraffic(prepared);
 return new Promise((resolve,reject)=>{
  if(signal.aborted){reject(new DOMException('Цуцалсан','AbortError'));return;}
  if(typeof Worker==='undefined'){reject(new Error('Энэ хөтөч background worker дэмжихгүй байна. Шинэчилсэн хөтчөөр нээнэ үү.'));return;}
  const worker=new Worker(new URL('./traffic.worker.ts',import.meta.url),{type:'module',name:'city-road-traffic'});
  let settled=false;
  const cleanup=()=>{signal.removeEventListener('abort',cancel);worker.terminate();};
  const fail=(error:Error)=>{if(settled)return;settled=true;cleanup();reject(error);};
  const cancel=()=>fail(new DOMException('Цуцалсан','AbortError'));
  signal.addEventListener('abort',cancel,{once:true});
  worker.onmessage=(event:MessageEvent<TrafficWorkerResponse>)=>{if(settled)return;const message=event.data;
   if(message.type==='progress')onProgress(message.progress);
   else if(message.type==='error')fail(new Error(message.message));
   else if(message.type==='ready'){settled=true;cleanup();resolve(createTraffic(message.network));}
  };
  worker.onerror=event=>fail(new Error(event.message||'Хөдөлгөөний worker ачаалагдсангүй. Дахин тоглуулна уу.'));
  worker.onmessageerror=()=>fail(new Error('Хөдөлгөөний сүлжээний өгөгдлийг дамжуулж чадсангүй.'));
  try{worker.postMessage({type:'prepare',roads});}catch(error){fail(error instanceof Error?error:new Error(String(error)));}
 });
}
