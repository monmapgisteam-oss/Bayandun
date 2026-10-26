"use client";

import { LAYER_BY_ID } from "@/lib/layers";
import LayerSwatch from "./LayerSwatch";
import { LEVELS } from "@/lib/urbanSuit";

// Шинжилгээний үр дүнгийн давхарга (каталогт байхгүй)
type Extra = { id: string; title: string; def: number };
const RAMP = `linear-gradient(90deg, ${LEVELS.map((l) => l.color).join(", ")})`;

export default function OpacityPanel({
  ids, opacity, setOpacity, onClose, extra = [],
}: {
  extra?: Extra[];
  ids: string[];
  opacity: Record<string, number>;
  setOpacity: (o: Record<string, number>) => void;
  onClose: () => void;
}) {
  const defs = ids.map((id) => LAYER_BY_ID[id]).filter(Boolean);
  return (
    <div className="floatPanel">
      <div className="catHead">
        <div><b>Тунгалаг байдал</b><span>Асаалттай давхарга</span></div>
        <button className="iconBtn" onClick={onClose} aria-label="Хаах">✕</button>
      </div>
      {!defs.length && !extra.length && <p className="muted">Асаалттай давхарга алга.</p>}
      {extra.map((x) => {
        const v = Math.round((opacity[x.id] ?? x.def) * 100);
        return (
          <label key={x.id} className="opRow" style={{ ["--tone" as string]: LEVELS[4].color }}>
            <span className="opName"><span className="swatch swatchArea" style={{ background: RAMP, borderColor: "transparent" }} />{x.title}<em>{v}%</em></span>
            <input type="range" min={0} max={100} step={5} value={v}
              onChange={(e) => setOpacity({ ...opacity, [x.id]: Number(e.target.value) / 100 })} />
          </label>
        );
      })}
      {defs.map((d) => {
        const v = Math.round((opacity[d.id] ?? 1) * 100);
        return (
          <label key={d.id} className="opRow" style={{ ["--tone" as string]: d.hue }}>
            <span className="opName"><LayerSwatch d={d} />{d.title}<em>{v}%</em></span>
            <input type="range" min={0} max={100} step={5} value={v}
              onChange={(e) => setOpacity({ ...opacity, [d.id]: Number(e.target.value) / 100 })} />
          </label>
        );
      })}
    </div>
  );
}
