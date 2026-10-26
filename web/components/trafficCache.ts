import {DESIGN_VEHICLES,type MotionPath} from '../lib/vehiclePaths';
import type {Road,RoadNetwork} from '../lib/roadTraffic';
import {TRAFFIC_ALGORITHM_SHA256} from './trafficCacheIdentity';

export const TRAFFIC_CACHE_SCHEMA='booroljuut-traffic-network-v1';
export const TRAFFIC_MOTION_PROFILE='full-body-0.20m-car-and-SU30-v1';
export type TrafficCacheIdentity={schema:string;motionProfile:string;algorithmSha256:string;vehicleProfileSha256:string;roadsSha256:string;roadCount:number;source:{sha256:string;generated:string}};
export type TrafficCacheManifest=TrafficCacheIdentity&{asset:{url:string;sha256:string;bytes:number}};
const hashPattern=/^[a-f0-9]{64}$/;
const abortError=()=>new DOMException('Цуцалсан','AbortError');
const assertActive=(signal:AbortSignal)=>{if(signal.aborted)throw abortError();};
export async function trafficSha256(text:string){const bytes=new TextEncoder().encode(text),digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
export const trafficVehicleSignature=()=>trafficSha256(JSON.stringify({profile:TRAFFIC_MOTION_PROFILE,vehicles:DESIGN_VEHICLES}));
/** Дараалал, ID, өргөн, хурд, хучилтыг бүгдийг хадгална; тоймлох/эрэмбэлэхгүй. */
export const canonicalTrafficRoads=(roads:Road[])=>JSON.stringify(roads.map(r=>({id:r.id,path:r.path,width:r.width,lanes:r.lanes,median:r.median??null,turnSurface:r.turnSurface??null,speed:r.speed,use:r.use})),(_key,value)=>{if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Хөдөлгөөний замд хүчинтэй бус тоо байна.');return value;});
export const trafficRoadsSignature=(roads:Road[])=>trafficSha256(canonicalTrafficRoads(roads));

export function trafficCacheText(identity:TrafficCacheIdentity,network:RoadNetwork){
 const encoded={...network,junctions:[...network.junctions],motions:[...network.motions],turns:[...network.turns],rejectedTurns:[...network.rejectedTurns],rejectedLanes:[...network.rejectedLanes]};
 return JSON.stringify({...identity,network:encoded},(_key,value)=>{
  if(value===Infinity)return{__trafficNumber:'Infinity'};
  if(typeof value==='number'&&!Number.isFinite(value))throw new Error('Хөдөлгөөний кэш хүчинтэй бус тоотой.');return value;
 });
}
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const finite=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);
const positive=(value:unknown)=>finite(value)&&value>0;
const radius=(value:unknown)=>value===Infinity||positive(value);
const point=(value:unknown)=>Array.isArray(value)&&value.length===2&&value.every(finite);
const points=(value:unknown,min=0)=>Array.isArray(value)&&value.length>=min&&value.every(point);
const index=(value:unknown,size:number):value is number=>typeof value==='number'&&Number.isInteger(value)&&value>=0&&value<size;
const sameLength=(a:number,b:number)=>Math.abs(a-b)<=Math.max(1e-7,Math.max(a,b)*1e-10);
function validMotion(value:unknown):value is MotionPath{
 if(value===null)return true;
 if(!object(value)||!Array.isArray(value.segments)||!Array.isArray(value.ends)||value.ends.length!==value.segments.length||!finite(value.length)||value.length<0||!radius(value.minRadius))return false;
 let length=0;
 for(let i=0;i<value.segments.length;i++){
  const segment=value.segments[i];if(!object(segment)||!positive(segment.length))return false;length+=segment.length as number;
  if(!finite(value.ends[i])||!sameLength(value.ends[i],length))return false;
  if(segment.kind==='line'){if(!point(segment.a)||!point(segment.b))return false;}
  else if(segment.kind==='arc'){if(!point(segment.center)||!positive(segment.radius)||!finite(segment.angle)||!finite(segment.sweep))return false;}
  else if(segment.kind==='cubic'){
   if(!points(segment.p,4)||(segment.p as unknown[]).length!==4||!radius(segment.minRadius)||!Array.isArray(segment.table)||segment.table.length<2||segment.table[0]!==0)return false;
   const table=segment.table;if(!table.every((n,i)=>finite(n)&&(i===0||n>=table[i-1]))||!sameLength(table.at(-1) as number,segment.length as number))return false;
  }else return false;
 }
 return sameLength(length,value.length);
}
/** Геометрийг дахин тооцохгүй; бүрэн кэш, индекс, төрөл, уртыг шалгаж сэргээнэ. */
export function restoreTrafficNetwork(value:unknown):RoadNetwork|null{
 if(!object(value)||!points(value.nodes)||!Array.isArray(value.lanes)||!Array.isArray(value.out)||value.out.length!==(value.nodes as unknown[]).length||!Number.isInteger(value.components)||Number(value.components)<0||!Array.isArray(value.pavement)||!value.pavement.every(r=>points(r,4)))return null;
 const nodes=value.nodes as RoadNetwork['nodes'],lanes=value.lanes as RoadNetwork['lanes'],out=value.out as number[][];
 if(!lanes.every((l,i)=>object(l)&&l.id===i&&typeof l.roadId==='string'&&index(l.from,nodes.length)&&index(l.to,nodes.length)&&points(l.path,2)&&finite(l.length)&&l.length>=0&&finite(l.speed)&&l.speed>=0&&finite(l.priority)&&['residential','industrial','connector'].includes(l.use)))return null;
 const seen=new Set<number>();for(let node=0;node<out.length;node++){if(!Array.isArray(out[node]))return null;for(const id of out[node]){if(!index(id,lanes.length)||lanes[id].from!==node||seen.has(id))return null;seen.add(id);}}if(seen.size!==lanes.length)return null;
 if(!Array.isArray(value.entries)||!value.entries.every(i=>index(i,lanes.length))||!Array.isArray(value.junctions)||!value.junctions.every(i=>index(i,nodes.length)))return null;
 const motionMap=(input:unknown)=>{
  if(!Array.isArray(input))return null;const result=new Map<string,MotionPath|null>();
  for(const entry of input){if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||result.has(entry[0])||!validMotion(entry[1]))return null;result.set(entry[0],entry[1]);}return result;
 };
 const motions=motionMap(value.motions),turns=motionMap(value.turns);if(!motions||!turns)return null;
 const laneKeys=new Set<string>(),turnKeys=new Set<string>();
 for(const kind of ['car','truck'])for(const lane of lanes){laneKeys.add(`${kind}:${lane.id}`);for(const to of out[lane.to])if(lanes[to].to!==lane.from)turnKeys.add(`${kind}:${lane.id}:${to}`);}
 if(motions.size!==laneKeys.size||turns.size!==turnKeys.size||[...laneKeys].some(k=>!motions.has(k))||[...turnKeys].some(k=>!turns.has(k)))return null;
 const rejected=(raw:unknown,cache:Map<string,MotionPath|null>)=>Array.isArray(raw)&&raw.every(k=>typeof k==='string'&&cache.has(k)&&cache.get(k)===null)&&new Set(raw).size===raw.length&&raw.length===[...cache.values()].filter(v=>v===null).length;
 if(!rejected(value.rejectedLanes,motions)||!rejected(value.rejectedTurns,turns))return null;
 return{nodes,lanes,out,components:Number(value.components),entries:value.entries as number[],pavement:value.pavement as RoadNetwork['pavement'],junctions:new Set(value.junctions as number[]),motions,turns,rejectedLanes:new Set(value.rejectedLanes as string[]),rejectedTurns:new Set(value.rejectedTurns as string[])};
}
export function parseTrafficCache(text:string){return JSON.parse(text,(_key,value)=>object(value)&&Object.keys(value).length===1&&value.__trafficNumber==='Infinity'?Infinity:value) as unknown;}
const sameIdentity=(a:Record<string,unknown>,b:TrafficCacheIdentity)=>['schema','motionProfile','algorithmSha256','vehicleProfileSha256','roadsSha256','roadCount'].every(key=>a[key]===b[key as keyof TrafficCacheIdentity])&&object(a.source)&&a.source.sha256===b.source.sha256&&a.source.generated===b.source.generated;
let resident:{roadsSha256:string;assetSha256:string;sourceSha256:string;generated:string;network:RoadNetwork}|undefined;
export async function loadPreparedTraffic(roads:Road[],signal:AbortSignal,expectedAlgorithm=TRAFFIC_ALGORITHM_SHA256):Promise<RoadNetwork|null>{
 assertActive(signal);if(!hashPattern.test(expectedAlgorithm)||!globalThis.crypto?.subtle)return null;
 try{
  const response=await fetch('/default-traffic-network.manifest.json',{cache:'no-cache',signal});assertActive(signal);if(!response.ok)return null;
  const raw:unknown=await response.json();assertActive(signal);
  if(!object(raw)||raw.schema!==TRAFFIC_CACHE_SCHEMA||raw.motionProfile!==TRAFFIC_MOTION_PROFILE||raw.algorithmSha256!==expectedAlgorithm||raw.roadCount!==roads.length||typeof raw.roadsSha256!=='string'||!hashPattern.test(raw.roadsSha256)||!object(raw.source)||typeof raw.source.sha256!=='string'||!hashPattern.test(raw.source.sha256)||typeof raw.source.generated!=='string'||!object(raw.asset)||typeof raw.asset.url!=='string'||!/^\/default-traffic-network\.[a-f0-9]{16}\.json$/.test(raw.asset.url)||typeof raw.asset.sha256!=='string'||!hashPattern.test(raw.asset.sha256)||!finite(raw.asset.bytes)||raw.asset.bytes<=0||raw.asset.bytes>64*1024*1024)return null;
  const manifest=raw as unknown as TrafficCacheManifest,[roadsSha256,vehicleProfileSha256]=await Promise.all([trafficRoadsSignature(roads),trafficVehicleSignature()]);assertActive(signal);
  if(roadsSha256!==manifest.roadsSha256||vehicleProfileSha256!==manifest.vehicleProfileSha256)return null;
  if(resident?.roadsSha256===roadsSha256&&resident.assetSha256===manifest.asset.sha256&&resident.sourceSha256===manifest.source.sha256&&resident.generated===manifest.source.generated)return resident.network;
  const asset=await fetch(manifest.asset.url,{cache:'force-cache',signal});assertActive(signal);if(!asset.ok)return null;const text=await asset.text();assertActive(signal);
  if(new TextEncoder().encode(text).length!==manifest.asset.bytes||await trafficSha256(text)!==manifest.asset.sha256)return null;assertActive(signal);
  const decoded=parseTrafficCache(text);if(!object(decoded)||!sameIdentity(decoded,manifest))return null;
  const network=restoreTrafficNetwork(decoded.network),ids=new Set(roads.map(r=>r.id));if(!network||network.lanes.some(l=>!ids.has(l.roadId)))return null;assertActive(signal);
  resident={roadsSha256,assetSha256:manifest.asset.sha256,sourceSha256:manifest.source.sha256,generated:manifest.source.generated,network};return network;
 }catch(error){if(signal.aborted)throw abortError();return null;}
}
