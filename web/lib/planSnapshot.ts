import Polygon from '@arcgis/core/geometry/Polygon';
import type Point from '@arcgis/core/geometry/Point';
import {facilityModel,modelRenderer} from './renewableModels';
import {topicAppearance} from './topicAppearance';
import type EsriMap from "@arcgis/core/Map";
import SimpleRenderer, {type SimpleRendererProperties} from "@arcgis/core/renderers/SimpleRenderer";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import ElevationInfo from "@arcgis/core/symbols/support/ElevationInfo";
import Field from "@arcgis/core/layers/support/Field";
import LabelClass from "@arcgis/core/layers/support/LabelClass";
import * as rendererJSON from "@arcgis/core/renderers/support/jsonUtils";
import Graphic from "@arcgis/core/Graphic";
import type {SavedLayer,SavedPlan} from "./savedPlans";
const json=(v:unknown)=>JSON.parse(JSON.stringify(v));
export async function captureLayers(map:EsriMap,accept:(id:string)=>boolean):Promise<SavedLayer[]>{
 const layers=map.layers.toArray().filter((l)=>accept(l.id)&&l.type==="feature") as FeatureLayer[];
 return snapshotLayers(layers);
}
export async function snapshotLayers(layers:FeatureLayer[]):Promise<SavedLayer[]>{
 const result:SavedLayer[]=[];
 for(const l of layers){
  if(!l.source?.length||!l.renderer)continue;
  result.push({id:l.id,title:l.title??l.id,geometryType:l.geometryType,spatialReference:l.spatialReference.toJSON(),fields:l.fields.map((f)=>f.toJSON()),features:l.source.toArray().map((g)=>g.toJSON()),renderer:l.renderer.toJSON(),elevationInfo:json(l.elevationInfo),labelingInfo:l.labelingInfo?.map((v)=>v.toJSON())??[],opacity:l.opacity,minScale:l.minScale,maxScale:l.maxScale});
 }
 return result;
}
export function restoreLayer(saved:SavedLayer,topic:string,dimension="3d",plan?:SavedPlan){
 // 2D дүрслэл эсвэл шинэ үйлдвэрийн загварт ашиглахгүй GLB renderer-ийг задлахгүй.
 let original:SimpleRenderer|undefined;
 // Шинэ хэлбэрийг хуучин хадгалалтын байршил, хэмжээсийг хөдөлгөхгүй сэргээнэ.
 if(dimension==='3d'&&/:facility-.+:buildings$/.test(saved.id)&&saved.geometryType==='point'){
  const a=saved.features[0]?.attributes as Record<string,unknown>|undefined;
  const site=(plan?.inputs as {sites?:{programme:{id:string;zone:number;role?:string;appearance?:string;kind:string;width:number;depth:number;height:number;docks?:number};placed:{heading:number}[]}[]}|undefined)?.sites?.find(s=>saved.id.includes(`facility-${s.programme.id}:`));
  const p=site?.programme,w=Number(a?.width_m??p?.width),d=Number(a?.depth_m??p?.depth),h=Number(a?.height_m??p?.height);
  const kind=topicAppearance(Number(a?.zone??p?.zone),p?.role??saved.id.match(/-([a-z]+):buildings$/)?.[1],String(a?.appearance??p?.appearance??p?.kind??'process'));
  if([w,d,h].every(v=>Number.isFinite(v)&&v>0))original=new SimpleRenderer(modelRenderer(facilityModel(kind,w,d,h,Number(a?.docks??p?.docks)||undefined),Number(a?.heading??site?.placed[0]?.heading??(saved.renderer.symbol as {symbolLayers?:{heading?:number}[]})?.symbolLayers?.[0]?.heading??0)) as SimpleRendererProperties);
 }
 const color=topic.startsWith("facility:")?"#477c93":topic.startsWith("urban:")?"#a6804a":topic==="solar"?"#315a87":"#007ac2";
 const footprints=dimension==='2d'&&saved.geometryType==='point'&&/:facility-.+:buildings$/.test(saved.id)&&saved.features.every(f=>{const a=f.attributes as Record<string,unknown>|undefined;return[a?.width_m,a?.depth_m].every(v=>Number.isFinite(Number(v))&&Number(v)>0);});
 const flat=dimension==="2d"&&(saved.geometryType==="point"||JSON.stringify(saved.renderer).includes("Extrude"));
 const renderer=flat?new SimpleRenderer({symbol:saved.geometryType==="point"&&!footprints?{type:"simple-marker",size:7,color,outline:{color:"#fff",width:1}}:{type:"simple-fill",color,outline:{color:"#fff",width:0.5}}}):original??rendererJSON.fromJSON(saved.renderer);
 const extra:Record<string,string|number>=plan?{plan_name:plan.title,plan_revision:plan.revision,boundary:plan.boundary?.mode==='recreated'?'Шинэ хил':'Одоогийн хил'}:{};
 // Өмнөх жишиг хадгалалтад хэмжээс атрибутгүй байсан: зөвхөн хадгалсан оролтоос нөхнө.
 const inputs=plan?.inputs as {turbine?:{rated:number;hub:number;rotor:number};portrait?:number;perRow?:number;wp?:number;tilt?:number}|undefined;
 if(/wind-turbines$/.test(saved.id)&&inputs?.turbine){const t=inputs.turbine;if([t.rated,t.hub,t.rotor].every(Number.isFinite))Object.assign(extra,{rated_mw:t.rated,hub_m:t.hub,rotor_m:t.rotor});}
 if(/solar-tables-3d$/.test(saved.id)&&[inputs?.portrait,inputs?.perRow,inputs?.wp,inputs?.tilt].every(v=>typeof v==='number'&&Number.isFinite(v)))Object.assign(extra,{modules:inputs!.portrait!*inputs!.perRow!,kwp:inputs!.portrait!*inputs!.perRow!*inputs!.wp!/1000,tilt:inputs!.tilt!});
 const extraFields=Object.entries(extra).filter(([name])=>!saved.fields.some(f=>f.name===name)).map(([name,v])=>new Field({name,type:typeof v==='number'?'double':'string'}));
 const source=saved.features.map(f=>{const graphic=Graphic.fromJSON(f);graphic.attributes={...extra,...graphic.attributes};
  if(footprints){const a=graphic.attributes,point=graphic.geometry as Point,angle=-Number(a.heading??(saved.renderer.symbol as {symbolLayers?:{heading?:number}[]})?.symbolLayers?.[0]?.heading??0)*Math.PI/180,w=Number(a.width_m)/2,d=Number(a.depth_m)/2;
   const ring=[[-w,-d],[-w,d],[w,d],[w,-d],[-w,-d]].map(([x,y])=>[point.x+x*Math.cos(angle)-y*Math.sin(angle),point.y+x*Math.sin(angle)+y*Math.cos(angle)]);graphic.geometry=new Polygon({rings:[ring],spatialReference:saved.spatialReference});
  }return graphic;});
 return new FeatureLayer({id:`mod:90:${topic}:${saved.id}`,title:saved.title,source,fields:[...saved.fields.map((f)=>Field.fromJSON(f)),...extraFields],objectIdField:"oid",geometryType:(footprints?"polygon":saved.geometryType) as never,spatialReference:saved.spatialReference,
 renderer,elevationInfo:ElevationInfo.fromJSON(saved.elevationInfo),labelingInfo:saved.labelingInfo.map((l)=>LabelClass.fromJSON(l)),opacity:saved.opacity,minScale:saved.minScale,maxScale:saved.maxScale,outFields:["*"],popupEnabled:false,visible:true});
}
export {finalLayerFilter,planningLayerFilter} from './planLayerFilters';
