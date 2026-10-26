import type {Rings} from './geom';
import type {SavedPlan} from './savedPlans';
export type BoundaryMode='current'|'recreated';
export type BoundaryStamp={mode:BoundaryMode;revision:number;zone?:number};
export type BoundaryDesign={id:'recreated';revision:number;created:string;rings:Record<number,Rings>;source16:string;options:unknown;comparison:Record<number,{before:number;after:number}>};
export function assertFixedBoundary(original:Record<number,Rings>,next:Record<number,Rings>){
 if(!original[16]?.length||JSON.stringify(original[16])!==JSON.stringify(next[16]))throw new Error('16-р бүсийн хил, талбай өөрчлөгдөх ёсгүй.');
}
export const baseTopic=(topic:string)=>topic.replace(/@(current|recreated)$/,'');
export const scopedTopic=(topic:string,mode:BoundaryMode)=>`${baseTopic(topic)}@${mode}`;
/** Alternative designs are mutually exclusive in city totals. Legacy plans belong to current. */
export function plansForBoundary(plans:SavedPlan[],mode:BoundaryMode){
 const selected=new Map<string,SavedPlan>();
 for(const p of plans){
  if((p.boundary?.mode??'current')!==mode)continue;
  const input=p.inputs as {zone?:number;site?:{programme?:{zone?:number}}}|undefined;
  const zone=p.boundary?.zone??input?.zone??input?.site?.programme?.zone;
  const base=baseTopic(p.topic),key=base.startsWith('urban:')&&(zone||base==='urban:mock-01')?`urban:${zone??1}`:base,old=selected.get(key);
  if(!old||p.updated>=old.updated)selected.set(key,p);
 }
 // A complete per-topic programme supersedes legacy separate factory drafts in that zone.
 for(const [key,p]of selected)if(key.startsWith('facility:')){const input=p.inputs as {zone?:number;site?:{programme?:{zone?:number}}}|undefined;const zone=input?.zone??input?.site?.programme?.zone;if(zone&&selected.has(`topic:${zone}`))selected.delete(key);}

 return [...selected.values()];
}
