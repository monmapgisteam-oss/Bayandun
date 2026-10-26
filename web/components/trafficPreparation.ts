import {roadNetwork,trafficLaneMotion,trafficTurnMotion,type Road,type RoadNetwork} from '../lib/roadTraffic';
import type {VehicleKind} from '../lib/vehiclePaths';
export type TrafficProgress={phase:'network'|'vehicles';done:number;total:number};
export type TrafficWorkerRequest={type:'prepare';roads:Road[]};
export type TrafficWorkerResponse={type:'progress';progress:TrafficProgress}|{type:'ready';network:RoadNetwork}|{type:'error';message:string};
/** Бүтэн оврын бүх шалгалт worker-д хийгдэнэ; animation frame зөвхөн бэлэн замыг хэрэглэнэ. */
export function prepareTrafficNetwork(roads:Road[],progress:(value:TrafficProgress)=>void=()=>{}){
 progress({phase:'network',done:0,total:1});const net=roadNetwork(roads),kinds:VehicleKind[]=['car','truck'];
 const turns=net.lanes.flatMap(lane=>net.out[lane.to].filter(id=>net.lanes[id].to!==lane.from).map(to=>({from:lane.id,to}))),total=(net.lanes.length+turns.length)*kinds.length;let done=0;
 const advance=()=>{done++;if(done%16===0||done===total)progress({phase:'vehicles',done,total});};
 for(const kind of kinds){for(const lane of net.lanes){trafficLaneMotion(net,lane.id,kind);advance();}for(const turn of turns){trafficTurnMotion(net,turn.from,turn.to,kind);advance();}}
 return net;
}
