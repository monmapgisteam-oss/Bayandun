"use client";
import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from "react";
import {createPortal} from "react-dom";
const ResultsContext=createContext<{target:HTMLDivElement|null;actions:HTMLDivElement|null;setReady:(v:boolean)=>void}|null>(null);
export function analysisComplete(section:number){window.dispatchEvent(new CustomEvent("planning:complete",{detail:section}));}
export function useAnalysisReady(ready:boolean){
 const ctx=useContext(ResultsContext);
 useEffect(()=>{ctx?.setReady(ready);},[ready,ctx?.setReady]);
}
export function AnalysisResults({children}:{children:ReactNode}){
 const ctx=useContext(ResultsContext);return ctx?.target?createPortal(children,ctx.target):null;
}
export function AnalysisActions({children}:{children:ReactNode}){
 const ctx=useContext(ResultsContext);return ctx?.actions?createPortal(children,ctx.actions):null;
}
export default function AnalysisWorkspace({section,children,results,onTarget}:{section:number;children:ReactNode;results?:ReactNode;onTarget?:(el:HTMLDivElement|null)=>void}){
 const [mode,setMode]=useState<"config"|"results">("config"),[ready,setReady]=useState(false),[target,setTarget]=useState<HTMLDivElement|null>(null);
 const [actions,setActions]=useState<HTMLDivElement|null>(null);
 const previous=useRef(false);
 useEffect(()=>{if(ready&&!previous.current)setMode("results");if(!ready)setMode("config");previous.current=ready;},[ready]);
 useEffect(()=>{const done=(e:Event)=>{if((e as CustomEvent).detail===section){setMode("results");setReady(true);}};window.addEventListener("planning:complete",done);return()=>window.removeEventListener("planning:complete",done);},[section]);
 useEffect(()=>{onTarget?.(target);},[target,onTarget]);
 return <ResultsContext.Provider value={{target,actions,setReady}}><div className="analysisWorkspace" data-section={section}>
  <div className="analysisTabs" role="tablist" aria-label="Шинжилгээний самбар" onKeyDown={e=>{
   if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;
   e.preventDefault();const next=ready?(e.key==="Home"?"config":e.key==="End"?"results":mode==="config"?"results":"config"):"config";
   setMode(next);document.getElementById(`analysis-tab-${section}-${next}`)?.focus();
  }}>
   <button id={`analysis-tab-${section}-config`} role="tab" aria-controls={`analysis-config-${section}`} tabIndex={mode==="config"?0:-1} aria-selected={mode==="config"} onClick={()=>setMode("config")}>Тохиргоо</button>
   <button id={`analysis-tab-${section}-results`} role="tab" aria-controls={`analysis-panel-${section}`} tabIndex={mode==="results"?0:-1} aria-selected={mode==="results"} disabled={!ready} onClick={()=>setMode("results")}>Үр дүн</button>
  </div>
  <div className="analysisActions" ref={setActions}/>
  <div id={`analysis-config-${section}`} className="analysisConfig" role="tabpanel" aria-labelledby={`analysis-tab-${section}-config`} hidden={mode!=="config"}>{children}</div>
  <div id={`analysis-panel-${section}`} className="analysisResults planPanel" role="tabpanel" aria-labelledby={`analysis-tab-${section}-results`} hidden={mode!=="results"}>
   {results}<div id={`analysis-results-${section}`} ref={setTarget} />
  </div>
 </div></ResultsContext.Provider>;
}
