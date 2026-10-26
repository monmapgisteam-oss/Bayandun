import {prepareTrafficNetwork,type TrafficWorkerRequest,type TrafficWorkerResponse} from './trafficPreparation';
const post=(message:TrafficWorkerResponse)=>self.postMessage(message);
self.addEventListener('message',(event:MessageEvent<TrafficWorkerRequest>)=>{
 if(event.data?.type!=='prepare')return;
 try{const network=prepareTrafficNetwork(event.data.roads,progress=>post({type:'progress',progress}));post({type:'ready',network});}
 catch(error){post({type:'error',message:error instanceof Error?error.message:'Хөдөлгөөний сүлжээ бэлтгэгдсэнгүй.'});}
});
