import type {PlanningProfile,PlanningSuitabilitySummary} from '@/lib/planningSuitability';

export type PlanningSuitabilityReports=Partial<Record<PlanningProfile,PlanningSuitabilitySummary>>;
const titles:Record<PlanningProfile,string>={building:'Байршил',road:'Авто зам',utility:'Шугам сүлжээ'};
const percent=(n:number|null)=>n==null?'—':`${(n*100).toFixed(0)}%`;
const fixed=(n:number|null|undefined,suffix:string)=>n==null?'—':`${n.toFixed(1)} ${suffix}`;

export default function PlanningSuitabilityResults({reports}:{reports?:PlanningSuitabilityReports}){
 const rows=(Object.entries(reports??{}) as [PlanningProfile,PlanningSuitabilitySummary][]).filter(([,s])=>s&&s.assessed>0);
 if(!rows.length)return null;
 const missing=[...new Set(rows.flatMap(([,s])=>s.missing))],sources=[...new Set(rows.flatMap(([,s])=>s.sources))],assumptions=[...new Set(rows.flatMap(([,s])=>s.assumptions))];
 return <section aria-label="Тохиромжийн үнэлгээ"><h3>Тохиромжийн үнэлгээ</h3><table className="tbl"><thead><tr><th>Төлөвлөлт</th><th>Дундаж оноо</th><th>Бүс нутгийн GIS хамралт</th><th>DEM тор</th></tr></thead><tbody>{rows.map(([profile,s])=><tr key={profile}><td>{titles[profile]}</td><td>{percent(s.meanScore)}</td><td>{percent(s.environmentCoverage)}</td><td>{s.demCellM} м</td></tr>)}</tbody></table><details><summary>Хэмжилт ба эх өгөгдөл · {missing.length} дутуу</summary><table className="tbl"><thead><tr><th>Шалгуур</th>{rows.map(([p])=><th key={p}>{titles[p]}</th>)}</tr></thead><tbody><tr><td>Гадаргын их налуу</td>{rows.map(([p,s])=><td key={p}>{fixed(s.maxSlopePct,'%')}</td>)}</tr><tr><td>Трассын их налуу</td>{rows.map(([p,s])=><td key={p}>{fixed(s.maxLongitudinalGradePct,'%')}</td>)}</tr><tr><td>Их ус хураах талбай</td>{rows.map(([p,s])=><td key={p}>{fixed(s.maxFlowHa,'га')}</td>)}</tr><tr><td>Шалгасан цэг / байрлал</td>{rows.map(([p,s])=><td key={p}>{s.assessed.toLocaleString()}</td>)}</tr></tbody></table>{missing.length>0&&<><h4>Дутуу өгөгдөл</h4><ul>{missing.map(m=><li key={m}>{m}</li>)}</ul></>}<h4>Таамаглал</h4><ul>{assumptions.map(a=><li key={a}>{a}</li>)}</ul><h4>Эх сурвалж</h4><ul>{sources.map((s,i)=><li key={s}><a href={s} target="_blank" rel="noreferrer">{s.includes('Elevation')||s.includes('Terrain3D')?'Өндөржилт':`GIS давхарга ${i}`} ↗</a></li>)}</ul></details></section>;
}
