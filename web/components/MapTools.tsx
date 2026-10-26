"use client";

import { useState } from "react";
import type { Dim } from "./MapCanvas";

const Ico = {
  layers: <path d="M8 1.5 1.5 5 8 8.5 14.5 5 8 1.5ZM1.5 8 8 11.5 14.5 8M1.5 11 8 14.5 14.5 11" />,
  opacity: <><circle cx="8" cy="8" r="6" /><path d="M8 2v12M8 2a6 6 0 0 1 0 12" fill="currentColor" /></>,
  home: <path d="M2 7.5 8 2l6 5.5M3.5 6.5V14h9V6.5" />,
};

function Btn({ icon, label, on, badge, onClick }: {
  icon: keyof typeof Ico; label: string; on?: boolean; badge?: number; onClick: () => void;
}) {
  return (
    <button className={`toolBtn ${on ? "toolOn" : ""}`} onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"
        strokeLinejoin="round">{Ico[icon]}</svg>
      <span>{label}</span>
      {!!badge && <em className="badge">{badge}</em>}
    </button>
  );
}

export default function MapTools({
  dim, setDim, catalogOn, setCatalogOn, opacityOn, setOpacityOn, visibleCount, onHome,
}: {
  dim: Dim; setDim: (d: Dim) => void;
  catalogOn: boolean; setCatalogOn: (v: boolean) => void;
  opacityOn: boolean; setOpacityOn: (v: boolean) => void;
  visibleCount: number;
  onHome: () => void;
}) {
  const [barOn, setBarOn] = useState(true);
  return (
    <>
      {barOn ? (
        <div className="tools">
          <div className="toolsHead">
            <span>Хэрэгсэл</span>
            <button className="iconBtn" onClick={() => setBarOn(false)} aria-label="Хураах">‹</button>
          </div>
          <Btn icon="layers" label="Давхарга" on={catalogOn} badge={visibleCount}
            onClick={() => { setCatalogOn(!catalogOn); setOpacityOn(false); }} />
          <Btn icon="opacity" label="Тунгалаг" on={opacityOn}
            onClick={() => { setOpacityOn(!opacityOn); setCatalogOn(false); }} />
          <Btn icon="home" label="Төлөвлөлтийн хил" onClick={onHome} />
        </div>
      ) : (
        <button className="toolsTab" onClick={() => setBarOn(true)} aria-label="Хэрэгсэл нээх">›</button>
      )}
      <div className="dimsBar" role="tablist">
        {(["2d", "3d"] as Dim[]).map((d) => (
          <button key={d} role="tab" aria-selected={dim === d} className={dim === d ? "dimOn" : ""} onClick={() => setDim(d)}>
            {d.toUpperCase()}
          </button>
        ))}
      </div>
    </>
  );
}
