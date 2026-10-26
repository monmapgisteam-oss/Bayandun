import type {SavedPlan} from './savedPlans';
import type {Rings} from './geom';
import {baseTopic} from './planningBoundary';
/** Exact reserved land is saved with each topic; PV arrays also expose polygon footprints. */
export function savedOccupancy(plans:SavedPlan[],zone:number,excludeTopic:string):Rings{
 return plans.filter(p=>baseTopic(p.topic)!==excludeTopic).flatMap(p=>{
  const input=p.inputs as {zone?:number;reserved?:Rings}|undefined;
  if(input?.zone===zone&&input.reserved?.length)return input.reserved;
  if(zone===4&&baseTopic(p.topic)==='solar')return p.layers.filter(l=>l.id.endsWith('solar-blocks')).flatMap(l=>l.features.flatMap(f=>(f.geometry as {rings?:Rings})?.rings??[]));
  return [];
 });
}

export function savedStructures(plans:SavedPlan[]):Rings{
 return plans.flatMap(p=>{
  const input=p.inputs as {buildings?:Rings;site?:{placed?:{ring:Rings[number]}[]}}|undefined;
  if(input?.buildings)return input.buildings;
  if(input?.site?.placed)return input.site.placed.map(o=>o.ring);
  return p.layers?.filter(l=>l.id.endsWith(':mass')||l.id.endsWith('solar-blocks')).flatMap(l=>l.features.flatMap(f=>(f.geometry as {rings?:Rings})?.rings??[]))??[];
 });
}
