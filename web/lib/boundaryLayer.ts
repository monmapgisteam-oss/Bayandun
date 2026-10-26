import {utmLayer} from './modmap';
import {FN} from './masterplan';
import {area,type Rings} from './geom';
export function boundaryLayer(id:string,rings:Record<number,Rings>,ids:number[],variant:string,selected:boolean,dashed=false){
 return utmLayer({id,title:variant,geom:'polygon',fields:[{name:'zone',type:'integer'},{name:'__activeBoundary',type:'integer'},{name:'topic',type:'string'},{name:'label',type:'string'},{name:'boundary',type:'string'},{name:'area_ha',type:'double'}],
  rows:ids.map(zone=>({g:rings[zone],a:{zone,__activeBoundary:selected?1:0,topic:FN[zone].name,label:`${String(zone).padStart(2,'0')} · ${FN[zone].short}`,boundary:variant,area_ha:area(rings[zone])/1e4}})),
  renderer:{type:'unique-value',field:'zone',uniqueValueInfos:ids.map(zone=>{const color=FN[zone].color;return{value:zone,label:FN[zone].name,symbol:{type:'simple-fill',color:selected?`${color}24`:[0,0,0,0],outline:{color:selected?color:'#b5c2cd',width:selected?2:1,style:dashed?'dash':'solid'}}};})},
  labelingInfo:selected?[{labelExpressionInfo:{expression:'$feature.label'},labelPlacement:'always-horizontal',minScale:180000,symbol:{type:'text',color:'#f8fafc',haloColor:'#172b38',haloSize:1.5,font:{family:'Arial',size:10,weight:'bold'}}}]:[]});
}
