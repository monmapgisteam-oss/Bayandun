import type { SVGProps } from "react";

const paths = {
  overview: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  suitability: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  urban: "M3 21V9l6-5v17M9 12l7-5v14M16 12h5v9M1 21h22M5 10h1M5 14h1M12 13h1M12 17h1",
  nature: "M20 3C9 2 3 7 5 14c2 6 14 7 15-11ZM4 21l11-12",
  wind: "M3 7h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 17h6a3 3 0 1 1-3 3",
  solar: "M12 2v2M3 6l2 2M21 6l-2 2M8 8a4 4 0 0 1 8 0M5 12h14l2 8H3l2-8ZM12 12v8M4 16h16M12 20v2",
  hydrogen: "M9 3h6M10 3v6L4 19a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3M7 15h10",
  factory: "M3 21V10l6 3V8l6 4V3h4l2 18H3ZM7 17h1M12 17h1M17 17h1",
  connections: "M9 7V3H3v6h6V7Zm6 10v4h6v-6h-6v2ZM9 6h9v9M6 9v9h9",
  final: "m12 3 9 5v10l-9 4-9-4V8l9-5Zm0 10 9-5M12 13 3 8M12 13v9",
  menu: "M4 6h16M4 12h16M4 18h16",
  moon: "M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z",
  sun: "M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
};
export type WorkspaceIconName = keyof typeof paths;
export default function WorkspaceIcon({name,...props}:{name:WorkspaceIconName}&SVGProps<SVGSVGElement>){
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]}/></svg>;
}
export const sectionPresentation: Record<number,{icon:WorkspaceIconName;short:string}> = {
  1:{icon:"overview",short:"Ерөнхий"},2:{icon:"suitability",short:"Тохиромж"},3:{icon:"urban",short:"Суурьшил"},102:{icon:"nature",short:"Ногоон бүс"},
  4:{icon:"wind",short:"Салхи"},104:{icon:"solar",short:"Нар"},204:{icon:"hydrogen",short:"Устөрөгч"},
  105:{icon:"nature",short:"Хөрс, бордоо"},106:{icon:"factory",short:"Нүүрс хатаах"},107:{icon:"factory",short:"Кокс"},108:{icon:"hydrogen",short:"Метанол"},
  109:{icon:"factory",short:"Шингэрүүлсэн хий"},110:{icon:"hydrogen",short:"Хүхрийн хүчил"},111:{icon:"hydrogen",short:"Аммонийн нитрат"},112:{icon:"factory",short:"Нүүрс шингэрүүлэх"},
  113:{icon:"hydrogen",short:"Судалгаа"},114:{icon:"urban",short:"Дата төв"},115:{icon:"connections",short:"Логистик"},116:{icon:"factory",short:"Цахилгаан станц"},
  5:{icon:"connections",short:"Холболт"},7:{icon:"final",short:"Эцсийн хот"},
};
