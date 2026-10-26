"use client";

import type { ReactNode } from "react";

export type Flag = "ТААМАГЛАЛ" | "ШАЛГАХ" | "ДУТУУ ӨГӨГДӨЛ" | "ЭХ СУРВАЛЖ";

export function Badge({ f, title }: { f: Flag; title?: string }) {
  const cls = f === "ТААМАГЛАЛ" ? "bAssume" : f === "ШАЛГАХ" ? "bCheck" : f === "ДУТУУ ӨГӨГДӨЛ" ? "bMissing" : "bSource";
  return <span className={`badgeF ${cls}`} title={title}>{f}</span>;
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="sec">
      <div className="secHead"><h3>{title}</h3>{right}</div>
      {children}
    </section>
  );
}

export function Disclosure({title,children,defaultOpen=false}:{title:string;children:ReactNode;defaultOpen?:boolean}){
  return <details className="suitDisclosure" open={defaultOpen}><summary>{title}</summary><div className="suitDisclosureBody">{children}</div></details>;
}

export function Num({
  label, value, onChange, unit, step = 1, min, max, flag, hint, placeholder, disabled,
}: {
  label: string; value: number | ""; onChange: (v: number | "") => void; unit?: string; step?: number;
  min?: number; max?: number; disabled?: boolean; flag?: Flag; hint?: string; placeholder?: string;
}) {
  return (
    <label className="num">
      <span className="numLabel">{label}{flag && <Badge f={flag} title={hint} />}</span>
      <span className="numBox">
        <input type="number" disabled={disabled} value={value} step={step} min={min} max={max} placeholder={placeholder ?? "—"}
          onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />
        {unit && <em>{unit}</em>}
      </span>
    </label>
  );
}

export function Stats({ items }: { items: { v: string; l: string; flag?: Flag }[] }) {
  return (
    <div className="stats">
      {items.map((s) => (
        <div className="stat" key={s.l}><b>{s.v}</b><span>{s.l}{s.flag && <> <Badge f={s.flag} /></>}</span></div>
      ))}
    </div>
  );
}

export function Btn({ children, onClick, primary, disabled }: {
  children: ReactNode; onClick: () => void; primary?: boolean; disabled?: boolean;
}) {
  return <button className={`btn ${primary ? "btnPrimary" : ""}`} onClick={onClick} disabled={disabled}>{children}</button>;
}

export function Status({ busy, text, error }: { busy?: boolean; text?: string | null; error?: string | null }) {
  if (error) return <p className="status statusErr">{error}</p>;
  if (!text) return null;
  return <p className="status">{busy && <span className="spinner" />}{text}</p>;
}

export function Bars({ rows, unit, max }: { rows: { label: string; v: number; color?: string }[]; unit?: string; max?: number }) {
  const m = max ?? Math.max(1, ...rows.map((r) => r.v));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="barRow" key={r.label}>
          <span className="barLabel"><i style={{ background: r.color ?? "var(--hue)" }} />{r.label}</span>
          <b>{r.v.toLocaleString("en-US", { maximumFractionDigits: 1 })}{unit && ` ${unit}`}</b>
          <span className="barTrack"><span style={{ width: `${(r.v / m) * 100}%`, background: r.color ?? "var(--hue)" }} /></span>
        </div>
      ))}
    </div>
  );
}

export function Note({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  if(tone === "info") return null;
  return <p className={`noteBox ${tone === "warn" ? "noteWarn" : ""}`}>{children}</p>;
}

export function KV({ rows }: { rows: [string, ReactNode][] }) {
  return <div className="kv">{rows.map(([k, v]) => <div key={k}><span>{k}</span><b>{v}</b></div>)}</div>;
}
