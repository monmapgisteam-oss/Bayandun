"use client";
// 01 · Нэгж талбарын хуваалт — самбар. Газрын зураг нь 02-той нэг ArcGIS MapCanvas (2D/3D); давхарга нь mod:1:* (lib/modmap).
import type * as GeoJSON from "geojson";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Polygon from "@arcgis/core/geometry/Polygon";
import { corners, DEFAULT_PARAMS, MIX_DEFAULT, runPlan, type Multi, type Params, type Plan, type XY } from "@/lib/plan";
import { toLL, toUtm } from "@/lib/proj";
import { dropLayer, modId, MOD_CLICKS, MOD_TIPS, putLayer, utmLayer } from "@/lib/modmap";
import { useMapCtx } from "./MapCtx";

type FC = GeoJSON.FeatureCollection;
// Гүн 50 м (хөрш нэгж талбартай ижил), нүүр нь хэмжээнээс; 700 м² нь egazar-ын хөрш нэгж талбартай ижил 20×35 м
const DIMS: Record<number, [number, number]> = { 700: [20, 35] };
const PRESETS = [700, 2000, 4000, 5000].map((size) => {
  const [w, d] = DIMS[size] ?? [size / 50, 50];
  return { k: `${size.toLocaleString("en-US")} м²`, w, d, t: `${w}×${d} м`,
    note: size === 2000 ? "Хөршийн жишиг — Сансар гудамжны одоо байгаа нэгж талбартай ижил" : size === 700 ? "Хөршийн жишиг — egazar-ын 700 м² нэгж талбарууд (2112002309 г.м.) 20×35 м" : "" };
});
const f0 = (v: number) => Math.round(v).toLocaleString("en-US");
const f1 = (v: number, d = 1) => v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number, t: number) => (t ? (100 * v) / t : 0);
const ringUtm = (ll: XY[]): Multi => [[[...ll.map(toUtm), toUtm(ll[0])]]];
// goTo-д WGS84 (UTM 49N-ээс Web Mercator руу проекцийн модульгүйгээр)
const llPolygon = (utm: XY[][]) => new Polygon({ rings: utm.map((r) => r.map(toLL)), spatialReference: { wkid: 4326 } });
type Group = { angle: number; n: number; dist: number; lotW: number; lotD: number; pitch: number; anchor: XY; example: string };
// Хилийн файлд хадгалсан санал болгох тохиргоо (web/scripts/design-site-*.mjs)
type Recommended = Partial<Pick<Params, "angle" | "lotW" | "lotD" | "lotsPerBlock" | "mix" | "minLotRatio" | "anchor" | "rows" | "localW">>;
const SIZES = [700, 2000, 4000, 5000];
const INITIAL_LOTS: Partial<Params> = { mix: null, lotW: 40, lotD: 50, lotsPerBlock: 4 };
// Хилийн хувилбар солиход зөвхөн хил/гудамжны тохиргоо солигдоно — нэгж талбарын хэмжээний сонголт хэвээр
const boundaryRec = ({ angle, anchor, rows, localW, minLotRatio }: Recommended): Recommended =>
  Object.fromEntries(Object.entries({ angle, anchor, rows, localW, minLotRatio }).filter(([, v]) => v != null));

// Газрын зургийн дүрслэл (өнгө нь «Таних тэмдэг»-ийн --lot, --street, --green-тэй ижил)
const COLOR = { lot: "#f5d9a8", lotLine: "#7a4b1e", street: "#6b7280", green: "#4f9d52", site: "#ff3b30", sel: "#e11d48" };
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]; };
const fill = (color: string, a: number, line = color, width = 0) => ({ type: "simple-fill", color: rgba(color, a), outline: { color: rgba(line, 1), width } });
const outline = (color: string, width: number) => ({ type: "simple-fill", color: [0, 0, 0, 0], outline: { color, width } });
const L = { site: modId(1, "site"), streets: modId(1, "streets"), green: modId(1, "green"), lots: modId(1, "lots"), sel: modId(1, "selected") };

function Num({ label, value, onChange, step = 1, min, max, unit }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string }) {
  return (
    <label className="num">
      <span>{label}</span>
      <span className="numIn"><input type="number" value={value} step={step} min={min} max={max} onChange={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v)) onChange(v); }} />{unit && <i>{unit}</i>}</span>
    </label>
  );
}
function Sec({ n, title, children, open = true }: { n: string; title: string; children: ReactNode; open?: boolean }) {
  return <details className="sec" open={open}><summary><span className="secN">{n}</span>{title}</summary><div className="secBody">{children}</div></details>;
}

export default function Workspace({ egazarOn, setEgazarOn }: { egazarOn: boolean; setEgazarOn: (on: boolean) => void }) {
  const { map, view } = useMapCtx();
  // Хилийн хувилбарууд (site_boundary.geojson: «8 га · хувилбар N»), тус бүр өөрийн санал болгосон тохиргоотой
  const [boundary, setBoundary] = useState<{ versions: { n: number; ring: XY[]; rec: Recommended }[]; groups: Group[] } | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [ring, setRing] = useState<XY[]>([]);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/data/site_boundary.geojson").then((r) => r.json())
      .then((b: FC) => {
        const ringOf = (f: GeoJSON.Feature) => ((f.geometry as GeoJSON.Polygon).coordinates[0] as XY[]).slice(0, -1);
        const recOf = (pr: Record<string, unknown>): Recommended => Object.fromEntries((["angle", "lotW", "lotD", "lotsPerBlock", "mix", "minLotRatio", "anchor", "rows", "localW"] as const).filter((k) => pr[k] != null).map((k) => [k, pr[k]]));
        const versions = b.features.map((f) => ({ f, n: Number(/хувилбар (\d+)/.exec(String(f.properties?.name ?? ""))?.[1] ?? 0) })).filter((v) => v.n > 0)
          .map(({ f, n }) => ({ n, ring: ringOf(f), rec: recOf(f.properties ?? {}) })).sort((a, c) => a.n - c.n);
        // Анх ачаалахад: хувилбар 1, нэг хэмжээ 2,000 м² (40×50 м), блокийн эгнээнд 4
        const cur = versions.find((v) => v.n === 1) ?? versions[0];
        setBoundary({ versions, groups: (b.features[0].properties?.neighborGroups as Group[] | undefined) ?? [] });
        setVersion(cur.n); setRing(cur.ring); setParams((p) => ({ ...p, ...boundaryRec(cur.rec), ...INITIAL_LOTS }));
      })
      .catch((e) => setErr(String(e)));
  }, []);

  const dRing = useDeferredValue(ring), dParams = useDeferredValue(params);
  const { plan, planErr } = useMemo((): { plan: Plan | null; planErr: string | null } => {
    if (dRing.length < 3) return { plan: null, planErr: null };
    try { return { plan: runPlan(ringUtm(dRing), dParams), planErr: null }; } catch (e) { return { plan: null, planErr: `Төлөвлөлт тооцоход алдаа: ${(e as Error).message}` }; }
  }, [dRing, dParams]);

  // ---------- Газрын зургийн давхарга (mod:1:*) ----------
  useEffect(() => {
    if (!map || !plan) return;
    const polys = (m: Multi) => m.map((p) => ({ g: p as XY[][], a: {} }));
    putLayer(map, utmLayer({ id: L.green, title: "Ногоон, нээлттэй талбай", geom: "polygon", fields: [], rows: polys(plan.green), renderer: { type: "simple", symbol: fill(COLOR.green, 0.75) } }));
    putLayer(map, utmLayer({ id: L.streets, title: "Гудамж, зам", geom: "polygon", fields: [], rows: polys(plan.streets), renderer: { type: "simple", symbol: fill(COLOR.street, 0.85) } }));
    // Нэгж талбар хамгийн дээр — дарах/hover нь хилийг биш талбарыг барина
    putLayer(map, utmLayer({ id: L.site, title: "Төлөвлөлтийн хил", geom: "polygon", fields: [], rows: polys(plan.site), renderer: { type: "simple", symbol: outline(COLOR.site, 3) } }));
    putLayer(map, utmLayer({
      id: L.lots, title: "Нэгж талбар", geom: "polygon",
      fields: [{ name: "id", type: "string" }, { name: "area", type: "double" }, { name: "size", type: "double" }, { name: "block", type: "string" }, { name: "dims", type: "string" }],
      rows: plan.lots.map((l) => ({ g: l.poly[0] as XY[][], a: { id: l.id, area: Math.round(l.area), size: l.size, block: l.block, dims: `${f0(l.front)} × ${f0(l.depth)} м` } })),
      renderer: { type: "simple", symbol: fill(COLOR.lot, 0.82, COLOR.lotLine, 1.2) },
      labelingInfo: [{
        labelExpressionInfo: { expression: "$feature.id + TextFormatting.NewLine + Text($feature.area, '#,###') + ' м²'" },
        symbol: { type: "text", color: "#3a2510", haloColor: "#ffffff", haloSize: 1, font: { size: 8, weight: "normal" } }, minScale: 8000,
      }],
    }));
    MOD_TIPS.set(L.lots, (a) => ({ title: `${a.id} · гэр, орон сууцны хашаа`, hue: COLOR.lotLine, rows: [["Талбай", `${f0(Number(a.area))} м²`], ["Хэмжээ", String(a.dims)], ["Блок", String(a.block)]] }));
    MOD_CLICKS.set(L.lots, (a) => setSelected(String(a.id)));
    return () => { for (const id of [L.green, L.streets, L.lots, L.site]) dropLayer(map, id); };
  }, [map, plan]);

  const sel = plan?.lots.find((l) => l.id === selected) ?? null;
  useEffect(() => {
    if (!map) return;
    if (sel) putLayer(map, utmLayer({ id: L.sel, title: "Сонгосон нэгж талбар", geom: "polygon", fields: [], rows: [{ g: sel.poly[0] as XY[][], a: {} }], renderer: { type: "simple", symbol: outline(COLOR.sel, 3.5) } }));
    else dropLayer(map, L.sel);
    return () => dropLayer(map, L.sel);
  }, [map, sel]);

  // Хувилбар солиход (мөн анх) хил рүү ойртоно
  const fitted = useRef<number | null>(null);
  useEffect(() => {
    if (!view || version == null || ring.length < 3 || fitted.current === version) return;
    const first = fitted.current == null;
    fitted.current = version;
    const g = new Polygon({ rings: [[...ring, ring[0]]], spatialReference: { wkid: 4326 } });
    const go = () => view.goTo(g.extent!.clone().expand(1.5), { duration: 600 }).catch(() => {});
    // Анх: MapCanvas-ийн home ойртолт (төслийн хүрээ) дууссаны дараа
    let t = 0;
    view.when(() => { if (first) t = window.setTimeout(go, 1500); else go(); }).catch(() => {});
    return () => window.clearTimeout(t);
  }, [view, version, ring]);

  const set = <K extends keyof Params>(k: K, v: Params[K]) => setParams((p) => ({ ...p, [k]: v }));
  // Жагсаалтаас сонгоход тухайн талбар руу ойртоно
  const focusLot = (id: string) => {
    setSelected(id);
    const l = plan?.lots.find((q) => q.id === id);
    if (view && l) view.goTo({ target: llPolygon(l.poly[0]).extent!.clone().expand(4) }, { duration: 500 }).catch(() => {});
  };
  const m = plan?.metrics;
  const balance = m ? [
    { k: "Гэр, орон сууцны хашаа", v: m.res, c: "var(--lot)" },
    { k: "Гудамж, зам", v: m.streets, c: "var(--street)" },
    { k: "Ногоон, нээлттэй талбай", v: m.green, c: "var(--green)" },
  ] : [];

  return (
    <>
      {(err || planErr) && <div className="warn">{err ?? planErr}</div>}

      {sel && (
        <div className="card">
          <button className="x" onClick={() => setSelected(null)} aria-label="Хаах">×</button>
          <b className="cardT">{sel.id} · Гэр, орон сууцны хашааны газар</b>
          <div className="kv"><span>Талбай</span><b>{f1(sel.area)} м²</b></div>
          <div className="kv"><span>Блок</span><b>{sel.block}</b></div>
          <div className="kv"><span>Хэмжээ (нэрлэсэн)</span><b>{f0(sel.front)} × {f0(sel.depth)} м · {f0(sel.size)} м²</b></div>
          <table className="tbl coords">
            <thead><tr><th>#</th><th>E (UTM 49N)</th><th>N (UTM 49N)</th></tr></thead>
            <tbody>{corners(sel.poly).map((q, i) => <tr key={i}><td>{i + 1}</td><td>{f1(q[0], 2)}</td><td>{f1(q[1], 2)}</td></tr>)}</tbody>
          </table>
        </div>
      )}

      <Sec n="1" title="Төлөвлөлтийн хил">
        <div className="btnRow">
          {boundary?.versions.map((v) => (
            <button key={v.n} className={version === v.n ? "btn on" : "btn ghost"} onClick={() => { setVersion(v.n); setRing(v.ring); setParams((p) => ({ ...p, ...boundaryRec(v.rec) })); setSelected(null); }}>8 га хувилбар {v.n}</button>
          ))}
        </div>
      </Sec>

      <Sec n="2" title="Нэгж талбар">
        <div className="seg">
          <button className={params.mix ? "" : "on"} onClick={() => set("mix", null)}>Нэг хэмжээ</button>
          <button className={params.mix ? "on" : ""} onClick={() => set("mix", params.mix ?? MIX_DEFAULT)}>Холимог хэмжээ</button>
        </div>
        {params.mix ? <>
          <table className="tbl mix">
            <thead><tr><th>Хэмжээ</th><th>Нүүр × гүн</th><th>Талбайн хувь</th></tr></thead>
            <tbody>{SIZES.map((size) => { const row = params.mix!.find((q) => q.size === size), on = !!row && row.share > 0; return (
              <tr key={size}>
                <td><label className="check"><input type="checkbox" checked={on} onChange={(e) => set("mix", [...params.mix!.filter((q) => q.size !== size), { size, share: e.target.checked ? 25 : 0 }].sort((a, b) => a.size - b.size))} /> {f0(size)} м²</label></td>
                <td>{f1(size / params.lotD, 0)} × {f0(params.lotD)} м</td>
                <td><span className="numIn"><input type="number" min={0} max={100} step={5} value={row?.share ?? 0} disabled={!on} onChange={(e) => { const v = Math.max(0, parseFloat(e.target.value) || 0); set("mix", params.mix!.map((q) => (q.size === size ? { ...q, share: v } : q))); }} /><i>%</i></span></td>
              </tr>); })}</tbody>
          </table>
          <div className="grid2">
            <Num label="Гүн (бүх хэмжээнд)" value={params.lotD} onChange={(v) => set("lotD", Math.max(8, v))} unit="м" />
            <Num label="Блокийн урт" value={params.lotsPerBlock * params.lotW} step={params.lotW} onChange={(v) => set("lotsPerBlock", Math.max(1, Math.round(v / params.lotW)))} unit="м" />
          </div>
        </> : <>
          <div className="presets">
            {PRESETS.map((p) => (
              <button key={p.k} className={params.lotW === p.w && params.lotD === p.d ? "preset on" : "preset"} onClick={() => setParams((q) => ({ ...q, lotW: p.w, lotD: p.d }))} title={p.note}>
                <b>{p.k}</b><small>{p.t}</small>
              </button>
            ))}
          </div>
          <div className="grid2">
            <Num label="Блокийн нэг эгнээнд" value={params.lotsPerBlock} onChange={(v) => set("lotsPerBlock", Math.max(1, Math.round(v)))} unit="ш" />
          </div>
        </>}
      </Sec>

      {m && plan && <Sec n="3" title="Газрын баланс">
        <table className="tbl">
          <thead><tr><th>Зориулалт</th><th>м²</th><th>%</th></tr></thead>
          <tbody>
            {balance.map((b) => <tr key={b.k}><td><i className="sw" style={{ background: b.c }} />{b.k}</td><td>{f0(b.v)}</td><td>{f1(pct(b.v, m.site))}</td></tr>)}
            <tr className="tot"><td>Нийт</td><td>{f0(m.site)}</td><td>100.0</td></tr>
          </tbody>
        </table>
        {m.bySize.length > 1 && <table className="tbl">
          <thead><tr><th>Нэгж талбар</th><th>Тоо</th><th>м²</th><th>%</th></tr></thead>
          <tbody>
            {m.bySize.map((b) => <tr key={b.size}><td>{f0(b.size)} м²</td><td>{b.count}</td><td>{f0(b.area)}</td><td>{f1(pct(b.area, m.res))}</td></tr>)}
            <tr className="tot"><td>Нийт</td><td>{m.resCount}</td><td>{f0(m.res)}</td><td>100.0</td></tr>
          </tbody>
        </table>}
        <div className="kv"><span>Үүнээс гол гудамж</span><b>{f0(m.main)} м²</b></div>
        <div className="kv"><span>Талбайн хэмжээ (бага–их)</span><b>{f0(m.minLot)} – {f0(m.maxLot)} м²</b></div>
        <div className="kv"><span>Блок</span><b>{plan.blocks.length}</b></div>
        {plan.warnings.map((w) => <div key={w} className="warn soft">{w}</div>)}
      </Sec>}

      {plan && <Sec n="4" title={`Нэгж талбарын жагсаалт · ${plan.lots.length}`} open={false}>
        <div className="tblWrap">
          <table className="tbl lots">
            <thead><tr><th>Дугаар</th><th>Блок</th><th>Хэмжээ</th><th>м²</th></tr></thead>
            <tbody>
              {plan.lots.map((l) => (
                <tr key={l.id} className={l.id === selected ? "selRow" : ""} onClick={() => focusLot(l.id)}>
                  <td><b>{l.id}</b></td><td>{l.block}</td><td>{`${f0(l.front)}×${f0(l.depth)}`}</td><td>{f0(l.area)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Sec>}

      <Sec n="5" title="Таних тэмдэг">
        <div className="legend">
          <span><i style={{ background: "var(--lot)" }} />Хашаа</span>
          <span><i style={{ background: "var(--street)" }} />Гудамж</span>
          <span><i style={{ background: "var(--green)" }} />Ногоон</span>
          <span><i className="ln" />Хил</span>
        </div>
        <label className="check"><input type="checkbox" checked={egazarOn} onChange={(e) => setEgazarOn(e.target.checked)} /><i className="swEgazar" />egazar-ын одоо байгаа нэгж талбар</label>
      </Sec>
    </>
  );
}
