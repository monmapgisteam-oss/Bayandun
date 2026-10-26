"use client";

import { useMemo, useState } from "react";
import { ALWAYS_ON_IDS, GROUPS, LAYERS } from "@/lib/layers";
import LayerSwatch from "./LayerSwatch";

export default function LayerCatalog({
  visible, setVisible, onClose,
}: {
  visible: string[];
  setVisible: (v: string[]) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ plan: true, infra: true, admin: true });
  const on = new Set(visible);
  const catalog = LAYERS.filter((l) => !ALWAYS_ON_IDS.includes(l.id));
  const hits = useMemo(
    () => catalog.filter((l) => !q || l.title.toLowerCase().includes(q.toLowerCase())),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q],
  );

  const toggle = (id: string) => setVisible(on.has(id) ? visible.filter((v) => v !== id) : [...visible, id]);
  const toggleGroup = (key: string) => {
    const ids = catalog.filter((l) => l.group === key).map((l) => l.id);
    const allOn = ids.every((id) => on.has(id));
    setVisible(allOn ? visible.filter((v) => !ids.includes(v)) : [...new Set([...visible, ...ids])]);
  };

  return (
    <div className="catPop">
      <div className="catHead">
        <div>
          <b>Давхарга</b>
          <span>{catalog.length} нийт · {catalog.filter((l) => on.has(l.id)).length} асаалттай</span>
        </div>
        <button className="iconBtn" onClick={onClose} aria-label="Хаах">✕</button>
      </div>
      <input className="catSearch" placeholder="Давхарга хайх…" value={q} onChange={(e) => setQ(e.target.value)} />
      <button className="catAllOff" onClick={() => setVisible([])}>Бүх давхаргыг унтраах</button>

      <div className="catBody">
        {GROUPS.map((g) => {
          const rows = hits.filter((l) => l.group === g.key);
          if (!rows.length) return null;
          const n = rows.filter((l) => on.has(l.id)).length;
          const isOpen = q ? true : open[g.key];
          return (
            <div className="group" key={g.key} style={{ ["--tone" as string]: g.hue }}>
              <div className="groupHead">
                <button className="groupTitle" onClick={() => toggleGroup(g.key)} title="Бүлгийг бүхэлд нь асаах/унтраах">
                  <i />{g.title}<span className="count">{n}/{rows.length}</span>
                </button>
                <button className={`caret ${isOpen ? "caretOpen" : ""}`} onClick={() => setOpen({ ...open, [g.key]: !isOpen })}
                  aria-label="Нээх/хаах">▾</button>
              </div>
              {isOpen && rows.map((l) => (
                <button key={l.id} role="switch" aria-checked={on.has(l.id)}
                  className={`row ${on.has(l.id) ? "rowOn" : ""}`} style={{ ["--hue" as string]: l.hue }}
                  onClick={() => toggle(l.id)}>
                  <LayerSwatch d={l} />
                  <span className="rowName">{l.title}{l.note && <small>{l.note}</small>}</span>
                  <span className="dot" />
                </button>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
