/** Эцсийн хотын анхдагч дүрслэл. Лавлах хил / шинжилгээг тусдаа асаана. */
export const finalLayerFilter=(topic:string)=>(id:string)=>{
 if(topic==='wind')return /^mod:6:(wind-(turbines|overview|access-(?:roads(?:-(?:surface|markings))?|surface|markings))|service-power)$/.test(id);
 if(topic==='solar')return /^mod:7:(solar-(tables-3d|blocks|access-(?:roads(?:-(?:surface|markings))?|surface|markings))|service-power)$/.test(id);
 if(topic.startsWith('urban:'))return /^mod:3:/.test(id)&&/:(streetG|base|over|marks|lanes|mass|trees|nets|stops|(?:external|planned)-roads(?:-(?:surface|markings))?|service-(?:water|power|sewer|heat))$/.test(id);
 if(topic==='infrastructure')return /^mod:5:(cp_(zones|roads|surface|trunks|tl)$|connection-)/.test(id);
 if(topic.startsWith('facility:'))return /^mod:5:facility-/.test(id);
 if(topic.startsWith('topic:'))return /^mod:\d+:/.test(id)&&!/:boundary-/.test(id);
 if(topic==='suitability')return id==='mod:2:urban_suit';
 return false;
};
/** Харагдацын төлөвөөс үл хамаарч эх геометр, хоёр хилийг хадгална. */
export const planningLayerFilter=(topic:string)=>(id:string)=>{
 if(topic.startsWith('urban:'))return /^mod:3:/.test(id);
 if(topic==='wind')return /^mod:6:/.test(id)&&!/:wind-motion$|:gwa$|:flow$/.test(id);
 if(topic==='solar')return /^mod:7:/.test(id);
 if(topic==='infrastructure')return /^mod:5:(cp_|connection-|boundary-)/.test(id);
 return finalLayerFilter(topic)(id);
};
