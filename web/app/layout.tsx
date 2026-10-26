import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "./booroljuut.css";
import "./workspace.css";
import "./parcel.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin", "cyrillic"], display: "swap" });
const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin", "cyrillic"], display: "swap" });

export const metadata: Metadata = {
  title: "Баяндун — Хойд хэсгийн төлөвлөлт",
  description: "Дорнод аймгийн Баяндун сумын хойд хэсгийн 8 га газрын нэгж талбарын хуваалт ба суурьшлын бүсийн загвар",
};

// Hydration-оос өмнө theme тавих (анивчихгүй) — Бөөрөлжүүт-тай ижил
const THEME_INIT = `try{var t=localStorage.getItem('theme');document.documentElement.dataset.theme=(t==='light'||t==='dark')?t:'light'}catch(e){document.documentElement.dataset.theme='light'}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME_INIT }} /></head>
      <body className={`${inter.variable} ${manrope.variable}`}>{children}</body>
    </html>
  );
}
