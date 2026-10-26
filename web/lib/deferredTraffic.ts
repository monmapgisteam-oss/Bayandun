import {createTraffic,roadNetwork,type Road,type Traffic} from './roadTraffic';

/** Traffic topology is built only after Play; changing roads cancels queued work. */
export function deferredTraffic(roads:Road[],yieldToUI:()=>Promise<void>,build:(roads:Road[],signal:AbortSignal)=>Traffic|Promise<Traffic>=(roads)=>createTraffic(roadNetwork(roads))){
 let simulation:Traffic|null=null,pending:Promise<Traffic|null>|null=null,generation=0,controller:AbortController|null=null;
 const cancel=()=>{generation++;controller?.abort();controller=null;pending=null;};
 return{
  current:()=>simulation,
  prepare():Promise<Traffic|null>{
   if(simulation)return Promise.resolve(simulation);
   if(pending)return pending;
   const run=generation,abort=new AbortController();controller=abort;
   const task=yieldToUI().then(async()=>{if(run!==generation)return null;const result=await build(roads,abort.signal);if(run!==generation||abort.signal.aborted)return null;simulation=result;return simulation;}).catch(error=>{if(run!==generation||abort.signal.aborted)return null;throw error;});
   pending=task;void task.then(()=>{if(pending===task)pending=null;},()=>{if(pending===task)pending=null;});
   return task;
  },
  cancel,
  reset(){cancel();if(simulation)simulation=createTraffic(simulation.net);return simulation;},
 };
}
