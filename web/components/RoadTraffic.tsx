'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Point from '@arcgis/core/geometry/Point';
import * as reactiveUtils from '@arcgis/core/core/reactiveUtils';
import proj4 from 'proj4';
import {useMapCtx} from './MapCtx';
import {stepTraffic,vehiclePose,type Road,type Traffic} from '@/lib/roadTraffic';
import {DESIGN_VEHICLES} from '@/lib/vehiclePaths';
import {deferredTraffic} from '@/lib/deferredTraffic';
import {prepareTrafficInWorker} from './trafficWorkerClient';
import type {TrafficProgress} from './trafficPreparation';
const UTM='+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs';
const afterPaint=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
export default function RoadTraffic({roads,active=true,perHour=120,truckShare=.1,module}:{roads:Road[];active?:boolean;perHour?:number;truckShare?:number;module:number}){
 const {view,dim,setDim}=useMapCtx(),[playing,setPlaying]=useState(false),[preparing,setPreparing]=useState(false),[error,setError]=useState(''),[speed,setSpeed]=useState(1),[flow,setFlow]=useState(perHour),[share,setShare]=useState(truckShare),[sim,setSim]=useState<Traffic|null>(null),[stats,setStats]=useState({cars:0,done:0,blocked:0,restricted:0});
 const [progress,setProgress]=useState<TrafficProgress|null>(null);
 const preparation=useMemo(()=>deferredTraffic(roads,afterPaint,(items,signal)=>prepareTrafficInWorker(items,signal,setProgress)),[roads]),net=sim?.net;
 const startAfterViewChange=useRef(false),startId=useRef(0),mounted=useRef(false),current=useRef({preparation,active,dim,view});current.current={preparation,active,dim,view};
 const settings=useRef({speed,flow,truckShare:share});settings.current={speed,flow,truckShare:share};
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 useEffect(()=>{setShare(Math.min(1,Math.max(0,truckShare)));},[truckShare]);
 useEffect(()=>{setFlow(Number.isFinite(perHour)?Math.min(3600,Math.max(0,Math.round(perHour))):120);},[perHour]);
 useEffect(()=>{startId.current++;setSim(null);setPreparing(false);setError('');setPlaying(false);setStats({cars:0,done:0,blocked:0,restricted:0});startAfterViewChange.current=false;return()=>preparation.cancel();},[preparation]);
 const start=useCallback(async()=>{
  if(!current.current.active)return;const id=++startId.current;setPreparing(true);setProgress(null);setError('');
  const valid=()=>mounted.current&&startId.current===id&&current.current.preparation===preparation;
  try{const result=await preparation.prepare();if(!valid()||!current.current.active||current.current.dim!=='2d'||current.current.view?.type!=='2d'||!result)return;setSim(result);setPlaying(result.net.lanes.length>0);}
  catch(e){if(valid())setError(e instanceof Error?e.message:'Хөдөлгөөний сүлжээг бэлтгэж чадсангүй.');}
  finally{if(valid())setPreparing(false);}
 },[preparation]);
 useEffect(()=>{
  if(!active){startAfterViewChange.current=false;startId.current++;preparation.cancel();setPreparing(false);setPlaying(false);}
  else if(dim==='2d'&&view?.type==='2d'&&startAfterViewChange.current){startAfterViewChange.current=false;void start();}
  else if(dim!=='2d'){startId.current++;preparation.cancel();setPreparing(false);setPlaying(false);}
 },[active,dim,view,preparation,start]);
 useEffect(()=>{if(!view||view.type!=='2d'||!active||!sim||!sim.net.lanes.length)return;const host=view.container;if(!host||typeof host==='string')return;
  const canvas=document.createElement('canvas');canvas.className='roadTrafficCanvas';canvas.setAttribute('aria-hidden','true');host.appendChild(canvas);const ctx=canvas.getContext('2d');if(!ctx){canvas.remove();return;}
  const projection=view.spatialReference.wkid===32649?null:proj4(UTM,view.spatialReference.wkid===4326?'EPSG:4326':'EPSG:3857');const point=new Point({spatialReference:view.spatialReference});
  const screen=(x:number,y:number)=>{const p=projection?projection.forward([x,y]):[x,y];point.x=p[0];point.y=p[1];return view.toScreen(point);};let frame=0,last=0,lastStats=0;
  const visible=()=>view.map?.layers.some(l=>l.id.startsWith(`mod:${module}:`)&&l.visible);
  const requestPaint=()=>{if(!frame)frame=requestAnimationFrame(draw);};
  const draw=(now:number)=>{frame=0;const dt=last?Math.min(.1,(now-last)/1000):0;last=now;const opt=settings.current;
   if(document.hidden||!visible()||!view.ready){last=0;ctx.clearRect(0,0,canvas.width,canvas.height);return;}
   if(playing)stepTraffic(sim,dt*opt.speed,opt.flow,opt.truckShare);
   const w=host.clientWidth,h=host.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
   ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
   for(const car of sim.cars){const pose=vehiclePose(sim,car),p=screen(...pose.point),front=screen(pose.point[0]+pose.dir[0]*car.length,pose.point[1]+pose.dir[1]*car.length);if(!p||!front||p.x< -20||p.y< -20||p.x>w+20||p.y>h+20)continue;const length=Math.hypot(front.x-p.x,front.y-p.y),width=length*DESIGN_VEHICLES[car.kind].width/car.length;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(Math.atan2(front.y-p.y,front.x-p.x));ctx.fillStyle=car.kind==='truck'?'#d5d8d4':['#e8e5db','#4b718e','#cf934f','#485254'][car.id%4];ctx.strokeStyle='#17252b';ctx.lineWidth=.5;
    if(length<3){ctx.fillRect(-1,-1,2,2);}else{ctx.fillRect(-length/2,-width/2,length,width);ctx.strokeRect(-length/2,-width/2,length,width);ctx.fillStyle='#273e49';ctx.fillRect(length*.15,-width*.4,length*.15,width*.8);if(car.kind==='truck'){ctx.fillStyle='#617686';ctx.fillRect(length*.3,-width/2,length*.2,width);}if(car.speed<.4){ctx.fillStyle='#ef5348';ctx.fillRect(-length/2,-width/2,Math.max(.7,length*.07),width);}}ctx.restore();
   }
   if(now-lastStats>500){lastStats=now;setStats({cars:sim.cars.length,done:sim.completed,blocked:sim.blocked,restricted:sim.net.rejectedTurns.size+sim.net.rejectedLanes.size});}
   if(playing)requestPaint();
  };
  // Түр зогссон үед зөвхөн газрын зураг/давхарга өөрчлөгдөхөд дахин зурна.
  const watch=reactiveUtils.watch(()=>[view.extent?.xmin,view.extent?.ymin,view.extent?.xmax,view.extent?.ymax,view.rotation,view.width,view.height,view.ready,visible()],requestPaint);
  const visibility=()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;ctx.clearRect(0,0,canvas.width,canvas.height);}else requestPaint();};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('resize',requestPaint);requestPaint();
  return()=>{cancelAnimationFrame(frame);watch.remove();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',requestPaint);canvas.remove();};
 },[view,active,dim,sim,module,playing]);
 if(!roads.length)return null;
 return <details className="trafficPanel" open><summary>Замын хөдөлгөөн · 2D</summary><div className="btnRow"><button className={playing?'btn':'btn btnPrimary'} disabled={!active||preparing||!!net&&!net.lanes.length} onClick={()=>{if(playing){setPlaying(false);return;}if(dim!=='2d'||view?.type!=='2d'){startAfterViewChange.current=true;setDim('2d');}else void start();}}>{preparing?(progress?.phase==='vehicles'?`Эргэлт ${progress.done} / ${progress.total}`:'Сүлжээ бэлтгэж байна…'):dim!=='2d'?'▶ 2D нээгээд тоглуулах':playing?'Ⅱ Түр зогсоох':'▶ Тоглуулах'}</button><button className="btn" aria-label="Хөдөлгөөнийг эхнээс нь эхлүүлэх" onClick={()=>{startAfterViewChange.current=false;startId.current++;setPlaying(false);setPreparing(false);setError('');setSim(preparation.reset());setStats({cars:0,done:0,blocked:0,restricted:0});}}>↺</button><select className="sel" aria-label="Хөдөлгөөний хурд" value={speed} onChange={e=>setSpeed(+e.target.value)}>{[1,2,5,10].map(n=><option key={n} value={n}>{n}×</option>)}</select></div><label className="num"><span>ТААМАГЛАЛ · машин/цаг</span><input className="sel" type="number" min={0} max={3600} value={flow} onChange={e=>setFlow(Number.isFinite(+e.target.value)?Math.min(3600,Math.max(0,+e.target.value)):0)}/></label><label className="num"><span>Ачааны машин · SU-30 · 9.14 × 2.59 м</span><input className="sel" aria-label="Ачааны машины хувь" type="number" min={0} max={100} value={Math.round(share*100)} onChange={e=>setShare(Math.max(0,Math.min(100,+e.target.value||0))/100)}/></label><small>{stats.cars} машин · {stats.done} аялал · {Math.round(share*100)}% ачааны</small>{error&&<p role="alert" className="statusErr">{error}</p>}{net&&!net.lanes.length&&<p className="statusErr">Хөдөлгөөн тоглуулах хүчинтэй замын тэнхлэг алга.</p>}{net&&net.components>1&&<p className="statusErr">{net.components} тусдаа замын сүлжээ · завсрыг автоматаар холбохгүй</p>}{stats.restricted>0&&<small className="statusErr">Радиус / бүтэн оврын зай хүрэлцээгүй: {stats.restricted} хөдөлгөөн хориглосон</small>}{stats.blocked>0&&<small>Нэвтрэлт хүлээсэн / дүрслэлийн хязгаар: {stats.blocked}</small>}</details>;
}
