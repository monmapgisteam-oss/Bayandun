"use client";

// Самбарын жижиг график — SVG, hover tooltip-тэй. Өнгө нь тухайн ангиллын (бүс, гадаргуу) тогтмол өнгө.
import { useState } from "react";

const f = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d });

export type Slice = { label: string; value: number; color: string };

/** Donut — хэсгийн хувь. Төвд гол тоо, доор нь legend (≥2 цуврал) */
export function Donut({ data, center, sub, unit = "" }: { data: Slice[]; center: string; sub: string; unit?: string }) {
  const [hi, setHi] = useState<number | null>(null);
  const tot = data.reduce((s, d) => s + (Number.isFinite(d.value) && d.value > 0 ? d.value : 0), 0) || 1;
  const R = 52, r = 40, C = 60;
  let a0 = -Math.PI / 2;
  const gap = 0.02;
  const arcs = data.map((d, i) => {
    if (!Number.isFinite(d.value) || d.value <= 0) return null;
    const a = (d.value / tot) * Math.PI * 2, inset = Math.min(gap,a/4), s = a0 + inset / 2, e = a0 + a - inset / 2;
    a0 += a;
    const large = e - s > Math.PI ? 1 : 0;
    const p = (ang: number, rr: number) => `${C + rr * Math.cos(ang)},${C + rr * Math.sin(ang)}`;
    return { i, d: `M${p(s, R)} A${R},${R} 0 ${large} 1 ${p(e, R)} L${p(e, r)} A${r},${r} 0 ${large} 0 ${p(s, r)} Z` };
  });
  const h = hi == null ? null : data[hi];
  return (
    <div className="donut">
      <svg viewBox="0 0 120 120" width="120" height="120" role="img" aria-label={`${center} ${sub}`}>
        <circle cx={60} cy={60} r={46} fill="none" stroke="var(--surface-2)" strokeWidth={12}/>
        {arcs.map((a) => a && (
          <path key={a.i} d={a.d} fill={data[a.i].color} opacity={hi == null || hi === a.i ? 1 : 0.35}
            onMouseEnter={() => setHi(a.i)} onMouseLeave={() => setHi(null)} />
        ))}
        <text x="60" y="58" textAnchor="middle" className="donutV">{h ? `${f((h.value / tot) * 100, 1)}%` : center}</text>
        <text x="60" y="73" textAnchor="middle" className="donutS">{h ? f(h.value, 1) + unit : sub}</text>
      </svg>
      <ul className="legend">
        {data.map((d, i) => (
          <li key={d.label} tabIndex={0} onFocus={() => setHi(i)} onBlur={() => setHi(null)} onMouseEnter={() => setHi(i)} onMouseLeave={() => setHi(null)} className={hi === i ? "legOn" : ""} title={`${d.label}: ${f(d.value,1)} ${unit}`}>
            <i style={{ background: d.color }} /><span>{d.label}</span><b>{f((d.value / tot) * 100, 1)}%</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bullet — утга ба нормын муж (саарал зурвас), зорилтын шугам */
export function Bullet({ label, value, unit, band, target, max, ok }: {
  label: string; value: number; unit: string; band?: [number, number]; target?: number; max: number; ok?: boolean | null;
}) {
  const x = (v: number) => `${Math.max(0, Math.min(100, (v / max) * 100))}%`;
  return (
    <div className="bullet" title={`${label}: ${f(value, 1)} ${unit}${band ? ` · норм ${band[0]}–${band[1]}` : ""}`}>
      <div className="bulletHead"><span>{label}</span><b className={ok == null ? "" : ok ? "okT" : "badT"}>{f(value, 1)} <em>{unit}</em></b></div>
      <div className="bulletTrack">
        {band && <span className="bulletBand" style={{ left: x(band[0]), width: `calc(${x(band[1])} - ${x(band[0])})` }} />}
        <span className="bulletBar" style={{ width: x(value) }} />
        {target != null && <span className="bulletTarget" style={{ left: x(target) }} />}
      </div>
    </div>
  );
}

/** Хэвтээ багана — ангилал бүр өөрийн өнгөтэй */
export function HBars({ rows, unit = "", digits = 0 }: { rows: { label: string; v: number; color: string; note?: string }[]; unit?: string; digits?: number }) {
  const m = Math.max(1e-9, ...rows.map((r) => r.v));
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div className="hbar" key={r.label} title={`${r.label}: ${f(r.v, digits)} ${unit}`}>
          <span className="hbarL"><i style={{ background: r.color }} />{r.label}</span>
          <b>{f(r.v, digits)}{unit && <em> {unit}</em>}</b>
          <span className="hbarT"><span style={{ width: `${(r.v / m) * 100}%`, background: r.color }} /></span>
          {r.note && <small>{r.note}</small>}
        </div>
      ))}
    </div>
  );
}
