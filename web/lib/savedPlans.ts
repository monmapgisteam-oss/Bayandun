export type ReportTable={title:string;columns:string[];rows:(string|number|null)[][]};
export type PlanReport={tables:ReportTable[]};
import type {BoundaryStamp,BoundaryDesign} from "./planningBoundary";
// Геометр, төсөв, хэрэгцээг нэг transaction-д хадгална. Үндсэн төлөвлөгөө засварлагдана; хотын snapshot өөрчлөгдөхгүй.
export type SavedLayer={id:string;title:string;geometryType:string;spatialReference:Record<string,unknown>;fields:Record<string,unknown>[];features:Record<string,unknown>[];renderer:Record<string,unknown>;elevationInfo:unknown;labelingInfo:unknown[];opacity:number;minScale:number;maxScale:number};
export type PlanFinance={qty:Record<string,number>;info:Record<string,number>};
export type PlanDemand={powerMW?:number;waterM3Day?:number;annualGWh?:number;generationGWh?:number;waterSupplyM3Day?:number;substationMVA?:number};
export type SavedPlan={masterPlanId?:string;topic:string;title:string;section:number;updated:string;revision:number;layers:SavedLayer[];metrics:Record<string,string|number>;inputs?:unknown;report?:PlanReport;dimension:string;finance?:PlanFinance;demand?:PlanDemand;dependencies?:Record<string,number>;warnings?:string[];boundary?:BoundaryStamp};
export type PlanDraft=Omit<SavedPlan,"updated"|"revision">;
export type CityModel={id:string;name:string;created:string;plans:SavedPlan[]};
export type MasterPlan={id:string;name:string;created:string;updated:string;source?:string;boundaryDesign?:BoundaryDesign};
const DB="booroljuut-final-plans-v1", STORE="topics",MODELS="models",BOUNDARIES="boundaries",MASTERS="masterPlans",MASTER_TOPICS="masterTopics";
const ACTIVE_KEY='booroljuut-active-master-plan';
let activeMasterId:string|null|undefined;
export function getActiveMasterPlanId(){if(activeMasterId!==undefined)return activeMasterId;try{activeMasterId=typeof localStorage==='undefined'?null:localStorage.getItem(ACTIVE_KEY);}catch{activeMasterId=null;}return activeMasterId;}
const announce=()=>listeners.forEach(f=>f());
function activate(id:string){activeMasterId=id;try{if(typeof localStorage!=='undefined')localStorage.setItem(ACTIVE_KEY,id);}catch{}announce();}

const listeners=new Set<()=>void>();
export const subscribePlans=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
// Нэг хотын том геометрийг sidebar бүрд дахин IndexedDB-ээс задлахгүй.
// Засварлах API нь хуулбар өгнө; зөвхөн унших UI нэг царцаасан snapshot ашиглана.
type PlanKey=string|null;
const planCache=new Map<PlanKey,SavedPlan[]>(),planVersions=new Map<PlanKey,number>(),planReads=new Map<PlanKey,{version:number;promise:Promise<SavedPlan[]>}>();
function freezeSnapshot<T>(value:T,seen=new WeakSet<object>()):T{
 if(value&&typeof value==='object'&&!seen.has(value)){seen.add(value);if(!ArrayBuffer.isView(value)){for(const child of Object.values(value))freezeSnapshot(child,seen);Object.freeze(value);}}
 return value;
}
function cachePlans(key:PlanKey,plans:SavedPlan[]){const snapshot=freezeSnapshot(plans.sort((a,b)=>a.topic.localeCompare(b.topic)));planCache.delete(key);planCache.set(key,snapshot);while(planCache.size>2)planCache.delete(planCache.keys().next().value!);return snapshot;}
function invalidatePlans(key:PlanKey){planCache.delete(key);planVersions.set(key,(planVersions.get(key)??0)+1);planReads.delete(key);}
const changes=typeof window!=='undefined'&&typeof window.BroadcastChannel==='function'?new window.BroadcastChannel('booroljuut-plan-changes'):undefined;
if(changes)changes.onmessage=event=>{const key=event.data?.masterPlanId;if(key===null||typeof key==='string'){invalidatePlans(key);announce();}};
function plansChanged(key:PlanKey){invalidatePlans(key);changes?.postMessage({masterPlanId:key});}
function database():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{
 const request=indexedDB.open(DB,4);
 request.onupgradeneeded=()=>{for(const [name,keyPath]of [[STORE,"topic"],[MODELS,"id"],[BOUNDARIES,"id"],[MASTERS,"id"]])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath});
 if(!request.result.objectStoreNames.contains(MASTER_TOPICS)){const s=request.result.createObjectStore(MASTER_TOPICS,{keyPath:['masterPlanId','topic']});s.createIndex('masterPlanId','masterPlanId');}
 };
 request.onerror=()=>reject(new Error("Төлөвлөгөөний сан нээгдсэнгүй."));request.onsuccess=()=>resolve(request.result);
});}
async function readAll<T>(store:string):Promise<T[]>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction(store,"readonly"),r=tx.objectStore(store).getAll();tx.oncomplete=()=>{db.close();resolve(r.result);};tx.onerror=()=>{db.close();reject(tx.error);};});}
/** Queue болон request callback доторх synchronous алдаа мөн бүтэн transaction-ийг буцаана. */
async function writeTransaction(stores:string|string[],message:string,prepare:(tx:IDBTransaction,run:(work:()=>void)=>void)=>void){
 const db=await database();
 return new Promise<void>((resolve,reject)=>{
  let tx:IDBTransaction;
  try{tx=db.transaction(stores,'readwrite');}catch{db.close();reject(new Error(message));return;}
  let failure:unknown;
  const run=(work:()=>void)=>{try{work();}catch(e){failure=e;try{tx.abort();}catch{db.close();reject(e instanceof Error?e:new Error(message));}}};
  tx.oncomplete=()=>{db.close();resolve();};
  tx.onabort=()=>{db.close();reject(failure instanceof Error?failure:new Error(message));};
  run(()=>prepare(tx,run));
 });
}
function copyPlans<T extends PlanDraft>(plans:T[]):T[]{
 if(!Array.isArray(plans)||!plans.length||plans.some(p=>!p||typeof p.topic!=='string'||!p.topic.trim()||!Array.isArray(p.layers)||!p.layers.some(l=>Array.isArray(l?.features)&&l.features.length)))throw new Error('Хадгалах сэдэв / геометр алга. Эхлээд төлөвлөнө үү.');
 if(new Set(plans.map(p=>p.topic)).size!==plans.length)throw new Error('Сэдвийн дугаар давхардсан байна.');
 try{return structuredClone(plans);}catch{throw new Error('Төлөвлөгөөний өгөгдлийг хадгалах боломжгүй. Дахин төлөвлөнө үү.');}
}
async function readPlanRows(masterPlanId:PlanKey){
 if(!masterPlanId)return (await readAll<SavedPlan>(STORE)).sort((a,b)=>a.topic.localeCompare(b.topic));
 const db=await database();return new Promise<SavedPlan[]>((resolve,reject)=>{const tx=db.transaction(MASTER_TOPICS,'readonly'),r=tx.objectStore(MASTER_TOPICS).index('masterPlanId').getAll(masterPlanId);tx.oncomplete=()=>{db.close();resolve((r.result as SavedPlan[]).sort((a,b)=>a.topic.localeCompare(b.topic)));};tx.onabort=tx.onerror=()=>{db.close();reject(tx.error);};});
}
/** Зөвхөн унших UI: topic өөрчлөгдөх хүртэл ижил reference. Буцаасан өгөгдлийг засварлахгүй. */
export async function readPlansSnapshot(masterPlanId:PlanKey=getActiveMasterPlanId()):Promise<SavedPlan[]>{
 const cached=planCache.get(masterPlanId);if(cached){planCache.delete(masterPlanId);planCache.set(masterPlanId,cached);return cached;}
 const version=planVersions.get(masterPlanId)??0,pending=planReads.get(masterPlanId);if(pending?.version===version)return pending.promise;
 const promise=readPlanRows(masterPlanId).then(rows=>(planVersions.get(masterPlanId)??0)===version?cachePlans(masterPlanId,rows):freezeSnapshot(rows));
 const request={version,promise};planReads.set(masterPlanId,request);
 try{return await promise;}finally{if(planReads.get(masterPlanId)===request)planReads.delete(masterPlanId);}
}
/** Засварлах боломжтой тусдаа хуулбар; хадгалсан эсвэл UI snapshot-ийг өөрчлөхгүй. */
export async function listPlans(masterPlanId:PlanKey=getActiveMasterPlanId()){return structuredClone(await readPlansSnapshot(masterPlanId));}
export async function listCityModels(){return (await readAll<CityModel>(MODELS)).sort((a,b)=>b.created.localeCompare(a.created));}
export async function savePlans(plans:PlanDraft[],masterPlanId:string|null=getActiveMasterPlanId()){
 const snapshots=copyPlans(plans),sourceId=getActiveMasterPlanId();
 await writeTransaction(masterPlanId?[MASTER_TOPICS,MASTERS]:STORE,'Хадгалалт амжилтгүй. Хөтчийн сул зайг шалгана уу.',(tx,run)=>{
  const s=tx.objectStore(masterPlanId?MASTER_TOPICS:STORE),updated=new Date().toISOString();
  const write=()=>{for(const snapshot of snapshots){const get=s.get(masterPlanId?[masterPlanId,snapshot.topic]:snapshot.topic);get.onsuccess=()=>run(()=>{
   const plan={...snapshot};delete plan.masterPlanId;
   // Өөр хотын ижил revision нь орон зайн ижил холболтыг батлахгүй.
   if(masterPlanId&&(snapshot.masterPlanId??sourceId)!==masterPlanId&&Object.keys(plan.dependencies??{}).length)plan.warnings=[...new Set([...(plan.warnings??[]),'Өөр үндсэн төлөвлөгөөнөөс хадгалсан. Зам, шугамын холболтыг энэ хотын төлөвлөгөөтэй дахин тооцно уу.'])];
   s.put({...plan,...(masterPlanId?{masterPlanId}:{}),updated,revision:(get.result?.revision??0)+1});
  });}};
  if(!masterPlanId){write();return;}
  const ms=tx.objectStore(MASTERS),request=ms.getAll();request.onsuccess=()=>run(()=>{
   const masters=request.result as MasterPlan[],destination=masters.find(m=>m.id===masterPlanId);
   if(!destination)throw new Error('Хадгалах үндсэн төлөвлөгөө олдсонгүй.');
   let design=destination.boundaryDesign;
   for(const snapshot of snapshots.filter(p=>p.boundary?.mode==='recreated')){
    const origin=masters.find(m=>m.id===(snapshot.masterPlanId??sourceId)),source=origin?.boundaryDesign;
    if(!source||source.revision!==snapshot.boundary!.revision)throw new Error('Шинэ хилийн хувилбар өөрчлөгдсөн. Дахин төлөвлөөд хадгална уу.');
    if(design&&(design.revision!==source.revision||JSON.stringify(design.rings)!==JSON.stringify(source.rings)))throw new Error('Сонгосон үндсэн төлөвлөгөө өөр шинэчилсэн хилтэй. Тухайн хотыг нээгээд дахин төлөвлөнө үү.');
    design??=source;
   }
   ms.put({...destination,...(design?{boundaryDesign:design}:{}),updated});write();
  });
 });plansChanged(masterPlanId);announce();
}
export const savePlan=(plan:PlanDraft,masterPlanId:string|null=getActiveMasterPlanId())=>savePlans([plan],masterPlanId);
export async function saveCityModel(name:string,plans?:SavedPlan[]):Promise<string>{
 if(!name.trim())throw new Error("Загварын нэр оруулна уу.");
 const masterPlanId=getActiveMasterPlanId(),snapshots=plans?copyPlans(plans):undefined,id=crypto.randomUUID(),store=masterPlanId?MASTER_TOPICS:STORE;
 await writeTransaction([store,MODELS],'Хотын хувилбар хадгалагдсангүй. Хадгалсан сэдэв байгаа эсэхийг шалгана уу.',(tx,run)=>{
  const put=(items:SavedPlan[])=>{if(!items.length||new Set(items.map(p=>p.boundary?.mode??'current')).size>1){tx.abort();return;}tx.objectStore(MODELS).put({id,name:name.trim(),created:new Date().toISOString(),plans:items});};
  if(snapshots)put(snapshots);else{const s=tx.objectStore(store),r=masterPlanId?s.index('masterPlanId').getAll(masterPlanId):s.getAll();r.onsuccess=()=>run(()=>put(r.result));}
 });announce();return id;
}
export async function deletePlan(topic:string,masterPlanId:string|null=getActiveMasterPlanId()){
 if(!topic.trim())throw new Error('Устгах сэдэв сонгоно уу.');
 await writeTransaction(masterPlanId?[MASTER_TOPICS,MASTERS]:STORE,'Төлөвлөгөө устгагдсангүй.',(tx,run)=>{
  tx.objectStore(masterPlanId?MASTER_TOPICS:STORE).delete(masterPlanId?[masterPlanId,topic]:topic);
  if(masterPlanId){const s=tx.objectStore(MASTERS),r=s.get(masterPlanId);r.onsuccess=()=>run(()=>{if(!r.result){tx.abort();return;}s.put({...r.result,updated:new Date().toISOString()});});}
 });plansChanged(masterPlanId);announce();
}

export async function loadBoundaryDesign(){const id=getActiveMasterPlanId();if(id)return (await listMasterPlans()).find(p=>p.id===id)?.boundaryDesign??null;return (await readAll<BoundaryDesign>(BOUNDARIES))[0]??null;}
export async function saveBoundaryDesign(design:BoundaryDesign,masterPlanId:string|null=getActiveMasterPlanId()){
 const snapshot=structuredClone(design);
 await writeTransaction(masterPlanId?MASTERS:BOUNDARIES,'Шинэ хил хадгалагдсангүй.',(tx,run)=>{
  if(!masterPlanId){tx.objectStore(BOUNDARIES).put(snapshot);return;}
  const s=tx.objectStore(MASTERS),r=s.get(masterPlanId);r.onsuccess=()=>run(()=>{if(!r.result)throw new Error('Үндсэн төлөвлөгөө олдсонгүй.');s.put({...r.result,boundaryDesign:snapshot,updated:new Date().toISOString()});});
 });announce();
}

/** Хуучин санг хэвээр хадгална; шинэ үндсэн төлөвлөгөөнд автоматаар холихгүй. */
export async function listMasterPlans(){return(await readAll<MasterPlan>(MASTERS)).sort((a,b)=>b.updated.localeCompare(a.updated));}
export async function selectMasterPlan(id:string){if(!(await listMasterPlans()).some(p=>p.id===id))throw new Error('Үндсэн төлөвлөгөө олдсонгүй.');activate(id);}
export async function createMasterPlan(name:string,options:{activate?:boolean}={}){
 const clean=name.trim();if(!clean)throw new Error('Үндсэн төлөвлөгөөний нэр оруулна уу.');
 const id=crypto.randomUUID(),now=new Date().toISOString(),db=await database();
 await new Promise<void>((resolve,reject)=>{const tx=db.transaction(MASTERS,'readwrite');tx.objectStore(MASTERS).add({id,name:clean,created:now,updated:now});tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Үндсэн төлөвлөгөө үүссэнгүй.'));};});
 if(options.activate!==false)activate(id);else announce();return id;
}
export async function initialiseMasterPlans(){const plans=await listMasterPlans(),id=getActiveMasterPlanId();if(id&&plans.some(p=>p.id===id))return id;if(plans.length){activate(plans[0].id);return plans[0].id;}return createMasterPlan('Үндсэн төлөвлөгөө 01');}
export async function importMasterPlan(name:string,plans:SavedPlan[],source?:string,options:{boundaryDesign?:BoundaryDesign}={}){
 if(!name.trim())throw new Error('Үндсэн төлөвлөгөөний нэр оруулна уу.');
 const snapshots=copyPlans(plans),boundaryDesign=options.boundaryDesign?structuredClone(options.boundaryDesign):undefined,id=crypto.randomUUID(),now=new Date().toISOString();
 const imported=snapshots.map(p=>({...p,masterPlanId:id,updated:now,revision:Number.isInteger(p.revision)&&p.revision>0?p.revision:1}));
 if(snapshots.some(p=>p.boundary?.mode==='recreated')&&!boundaryDesign)throw new Error('Шинэчилсэн хилийн өгөгдөл дутуу байна.');
 await writeTransaction([MASTERS,MASTER_TOPICS],'Үндсэн төлөвлөгөө бүтнээр хадгалагдсангүй.',tx=>{
  tx.objectStore(MASTERS).add({id,name:name.trim(),created:now,updated:now,source,...(boundaryDesign?{boundaryDesign}:{})});
  for(const p of imported)tx.objectStore(MASTER_TOPICS).add(p);
 });plansChanged(id);cachePlans(id,imported);activate(id);return id;
}
export async function renameMasterPlan(id:string,name:string){if(!name.trim())throw new Error('Нэр оруулна уу.');const db=await database();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(MASTERS,'readwrite'),s=tx.objectStore(MASTERS),r=s.get(id);r.onsuccess=()=>{if(!r.result){tx.abort();return;}s.put({...r.result,name:name.trim(),updated:new Date().toISOString()});};tx.oncomplete=()=>{db.close();resolve();};tx.onabort=tx.onerror=()=>{db.close();reject(new Error('Нэр шинэчлэгдсэнгүй.'));};});announce();}
