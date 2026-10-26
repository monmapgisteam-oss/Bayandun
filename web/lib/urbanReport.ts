import type {Plan} from './urban';
import type {PlanReport,ReportTable} from './savedPlans';
const f=(v:number|null|undefined,d=1)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('en-US',{maximumFractionDigits:d});
const length=(p:number[][])=>p.reduce((n,v,i)=>n+(i?Math.hypot(v[0]-p[i-1][0],v[1]-p[i-1][1]):0),0);
const uses:Record<string,string>={res:'Орон сууц',com:'Худалдаа, үйлчилгээ',edu:'Боловсрол',school:'Сургууль',kinder:'Цэцэрлэг',health:'Эрүүл мэнд',clinic:'Эмнэлэг',park:'Парк',protect:'Хамгаалалтын ногоон',eng:'Инженерийн бүс',road:'Гудамж, зам'};
const streetNames:Record<string,string>={arterial:'Магистраль',collector:'Цуглуулах',local:'Дотоод'};
export function urbanReport(p:Plan):PlanReport {
 const t=p.t;
 const kv=(title:string,rows:(string|number|null)[][]):ReportTable=>({title,columns:['Үзүүлэлт','Утга','Нэгж'],rows});
 return {tables:[
  kv('Хүн ам ба барилга',[
   ['Зорилтот хүн ам',p.inp.pop,'хүн'],['Төлөвлөсөн багтаамж',Math.round(t.pop),'хүн'],['Зорилтын зөрүү',Math.round(t.pop-p.inp.pop),'хүн'],
   ['Өрх',Math.round(t.hh),'өрх'],['Ажлын байр',Math.round(t.jobs),'ажлын байр'],['Барилга',p.bldgs.length,'ш'],['Блок',p.lots.length,'ш'],
   ['Төлөвлөх талбай',f(p.siteArea/1e4),'га'],['Барилгын суурийн талбай',f(t.foot),'м²'],['Нийт давхрын талбай',f(t.gfa),'м²'],['Орон сууцны талбай',f(t.gfaRes),'м²'],['Нийт нягтрал',f(t.densGross),'хүн/га'],['Цэвэр нягтрал',f(t.densNet),'хүн/га'],['FAR',f(t.far,2),''],['Орон сууцны BCR',f(t.bcrRes*100),'%']]),
  {title:'Газрын баланс',columns:['Зориулалт','Талбай, га','Эзлэх хувь, %'],rows:Object.entries(p.land).map(([k,v])=>[uses[k]??k,f(v/1e4,2),f(v/p.siteArea*100)])},
  {title:'Гудамж ба төлөвлөсөн улаан шугам',columns:['№','Ангилал','Урт, м','Улаан шугамын өргөн, м','Холболт'],rows:p.streets.map(s=>[s.id,streetNames[s.cls],f(length(s.path)),s.w,s.ext?'Гадна':'Дотор'])},
  {title:'Блокийн дэлгэрэнгүй',columns:['Блок','Зориулалт','Талбай, га','Барилга','Хүн ам','Өрх'],rows:p.lots.map(l=>{const b=p.bldgs.filter(b=>b.lot===l.id);return[l.id,uses[l.use],f(l.area/1e4,2),b.length,Math.round(b.reduce((s,b)=>s+b.pop,0)),Math.round(b.reduce((s,b)=>s+b.hh,0))];})},
  {title:'Барилгын бүртгэл',columns:['№','Блок','Зориулалт','Давхар','Өндөр, м','Суурь, м²','Нийт, м²','Хүн ам','Өрх','Ажил'],rows:p.bldgs.map(b=>[b.id,b.lot,uses[b.use],b.floors,f(b.h),f(b.foot),f(b.gfa),Math.round(b.pop),Math.round(b.hh),Math.round(b.jobs)])},
  kv('Ногоон байгууламж ба хүртээмж',[
   ['Нийтийн ногоон талбай',f(t.greenPublic/1e4,2),'га'],['Нийт ногоон гадаргуу',f(t.greenSurface/1e4,2),'га'],['Ногоон талбай / хүн',f(t.greenPP),'м²/хүн'],['Мод',t.trees,'ш'],
   ['Паркийн хамрагдалт',f(t.parkCover),'%'],['Сургуулийн хамрагдалт',f(t.schoolCover),'%'],['Цэцэрлэгийн хамрагдалт',f(t.kinderCover),'%'],['Нийтийн тээврийн хамрагдалт',f(t.transitCover),'%'],['15 минутын хүртээмж',f(t.walk15),'%']]),
  kv('Явган, дугуй ба зогсоол',[
   ['Явган зам',f(t.walkKm,2),'км'],['Дугуйн зам',f(t.bikeKm,2),'км'],['Зогсоолын хэрэгцээ',Math.ceil(t.parkingNeed),'зай'],['Төлөвлөсөн зогсоол',t.parkSupply,'зай'],['Зогсоолын зөрүү',t.parkSupply-Math.ceil(t.parkingNeed),'зай'],['Ил зогсоол',t.stalls,'зай'],['Далд зогсоол',t.stallsUnder,'зай'],['Хүртээмжтэй зогсоол',t.parkAccess,'зай'],['EV цэнэглэх',t.parkEv,'зай'],['Дугуйн зогсоол',t.parkBike,'зай']]),
  kv('Инженерийн хэрэгцээ',[
   ['Цэвэр ус',f(t.water),'м³/хон'],['Бохир ус',f(t.sewer),'м³/хон'],['Цахилгаан',f(t.elecMw,2),'МВт'],['Дулаан',f(t.heatMw,2),'МВт'],
   ...Object.entries(p.nets).map(([k,v])=>[({water:'Цэвэр усны шугам',sewer:'Бохирын шугам',power:'Цахилгааны шугам',heat:'Дулааны шугам',storm:'Борооны усны шугам'} as Record<string,string>)[k]??k,v?f(v.len/1000,2):'—','км'])]),
  kv('Инженерийн бэлтгэл',[
   ['Ухалт',f(p.ibah.cut),'м³'],['Дүүргэлт',f(p.ibah.fill),'м³'],['Шорооны баланс',f(p.ibah.cut-p.ibah.fill),'м³'],['Урсацын коэффициент',f(t.runoff,2),'']]),
 ]};
}
