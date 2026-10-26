"use client";
import {useState} from 'react';
import type {ReportTable} from '@/lib/savedPlans';
export default function PlanTables({tables}:{tables:ReportTable[]}){return <div className="planTables">{tables.map((t,i)=><PlanTable key={i} table={t}/>)}</div>;}
function PlanTable({table:t}:{table:ReportTable}){
 const [search,setSearch]=useState(''),[page,setPage]=useState(0);
 const rows=t.rows.filter(r=>!search||r.some(c=>String(c??'').toLocaleLowerCase().includes(search.toLocaleLowerCase()))),pages=Math.max(1,Math.ceil(rows.length/50)),current=Math.min(page,pages-1);
 return <details className="resultDetails"><summary>{t.title} <span>{t.rows.length}</span></summary>{t.rows.length>50&&<input className="sel" aria-label={`${t.title} хайх`} placeholder="Хайх" value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}}/>}<div className="tableScroll" tabIndex={0}><table className="dataTable"><thead><tr>{t.columns.map((c,i)=><th key={i} scope="col">{c}</th>)}</tr></thead><tbody>{rows.slice(current*50,(current+1)*50).map((r,i)=><tr key={i}>{r.map((c,j)=><td key={j}>{c??'—'}</td>)}</tr>)}</tbody></table></div>{pages>1&&<div className="btnRow"><button className="btn" disabled={!current} onClick={()=>setPage(current-1)}>←</button><span>{current+1} / {pages}</span><button className="btn" disabled={current===pages-1} onClick={()=>setPage(current+1)}>→</button></div>}</details>;
}
