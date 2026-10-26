"use client";
// «8 га-д систем өөрөө»: Бөөрөлжүүт-ын алхамт арга зүйгээр сумын төвийн амины байшинтай хороолол (lib/soumPlan.ts).
import { useEffect, useMemo, useRef, useState } from "react";
import Polygon from "@arcgis/core/geometry/Polygon";
import type * as GeoJSON from "geojson";
import { area, diff, edgeBand, type Multi, type Params, type XY } from "@/lib/plan";
import { CAR_SIZE, GARAGE_SIZE, PART, commonGardens, type PartKey, type Surface } from "@/lib/parcelYards";
import { FAC, PLOTS, runSoum, SOUM_DEFAULT, type FacKey, type SoumIn, type SoumPlan } from "@/lib/soumPlan";
import { dropLayer, modId, MOD_TIPS, putLayer, utmLayer } from "@/lib/modmap";
import { fmtN } from "@/lib/geo";
import { toLL } from "@/lib/proj";
import type { Rings } from "@/lib/geom";
import siteData from "@/lib/siteData.json";
import { useMapCtx } from "../MapCtx";
import { KV, Section } from "../ui";
import { useYardArchitecture, YardArchitectureInfo } from "../useYardArchitecture";

type Rec = Partial<Pick<Params, "angle" | "anchor" | "localW">>;
const ROAD = siteData.road as XY[];
const STEPS = [{ n: 1, t: "Бүгд" }, { n: 2, t: "Гудамж" }, { n: 4, t: "Хашаа" }, { n: 0, t: "Норм" }];
const C = { plot: "#f5d9a8", plotLine: "#7a4b1e", street: "#6b7280", windbreak: "#2f6b3a", house: "#8d5b3e", garage: "#a89a8a", water: "#1e88e5", power: "#e0a100", site: "#ff3b30", tree: "#3f7d3a" };
const ZONE_COLOR: Record<string, string> = { res: C.plot, green: "#4f9d52", windbreak: C.windbreak, ...Object.fromEntries((Object.keys(FAC) as FacKey[]).map((k) => [k, FAC[k].color])) };
const FAC_MAP_LABEL: Record<FacKey, string> = { kinder: "Цэцэрлэг", shop: "Худалдаа", park: "Тоглоомын талбай", eng: "Инженерийн талбай" };
const BLD_LABEL: Record<string, string> = { house: "Амины байшин", garage: "Гараж", gazebo: PART.gazebo.label, greenhouse: PART.greenhouse.label, shed: PART.shed.label, kinder: FAC.kinder.label, shop: FAC.shop.label, eng: "Худгийн байр, дэд станц" };
const BLD_COLOR: Record<string, string> = { house: C.house, garage: C.garage, gazebo: PART.gazebo.color, greenhouse: PART.greenhouse.color, shed: PART.shed.color, kinder: FAC.kinder.color, shop: FAC.shop.color, eng: FAC.eng.color };
const L = Object.fromEntries(["zones", "gardens", "streets", "asphalt", "plots", "yardGround", "yardShadows", "bldg", "yardRoofs", "yardFoliage", "yardDetails", "cars", "trees", "center", "connector", "labels", "parts", "facilityLabels", "site"].map((k) => [k, modId(3, `sp-${k}`)]));
const rgba = (hex: string, a: number) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a]; };
const fill = (color: string, a: number, line = color, width = 0) => ({ type: "simple-fill", color: rgba(color, a), outline: { color: rgba(line, 1), width } });
const unique = (field: string, items: [string, unknown][]) => ({ type: "unique-value", field, uniqueValueInfos: items.map(([value, symbol]) => ({ value, symbol })) });
const polygonOf = (m: Multi) => new Polygon({ rings: m.flatMap((p) => p.map((r) => r.map(toLL))), spatialReference: { wkid: 4326 } });
const EMPTY_YARDS: SoumPlan["yards"] = [];
// polygon-clipping: гадна цагийн зүүний эсрэг, нүх цагийн зүүгээр; ArcGIS эсрэгээр уншдаг тул нүх (блок) будагдана
const signed = (r: XY[]) => r.reduce((t, a, i) => { const b = r[(i + 1) % r.length]; return t + a[0] * b[1] - b[0] * a[1]; }, 0);
const esri = (p: XY[][]) => p.map((r, i) => (signed(r) > 0) === (i === 0) ? [...r].reverse() : r);

export default function SoumPlanner({ ring, version, active, focusKey = 0 }: { ring: Rings | null; version: number | null; active: boolean; focusKey?: number }) {
  const { map, view, dim } = useMapCtx();
  const [recs, setRecs] = useState<Record<number, Rec>>({});
  const inp: SoumIn = SOUM_DEFAULT;
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState("");
  const [sp, setSp] = useState<SoumPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const extraTrees = useMemo(() => sp?.trees.filter(t => t.k !== "yard") ?? [], [sp]);
  const architecture = useYardArchitecture({ map, view, active: active && step !== 2, yards: sp?.yards ?? EMPTY_YARDS, prefix: modId(3, "sp"), extraTrees });
  const computed = useRef<{ ring: Rings; version: number; inp: SoumIn; rec: Rec } | null>(null);
  const rendered = useRef<{ map: typeof map; view: typeof view; plan: SoumPlan; step: number; dim: typeof dim } | null>(null);
  const asphalt = useMemo(() => sp ? diff(sp.plan.streets, edgeBand(sp.plan.streets, 1.8)) : [], [sp]);
  const gardens = useMemo(() => sp ? commonGardens([...sp.facLots.park.flatMap(l => l.poly), ...sp.plan.green], sp.plan.params.angle) : [], [sp]);
  useEffect(() => { if (active) setStep(1); }, [active, focusKey]);
  useEffect(() => {
    if (!map || !active) return;
    const zone = map.findLayerById("plan_zone") as import("@arcgis/core/layers/FeatureLayer").default | undefined;
    if (!zone) return;
    const labels = zone.labelsVisible;
    zone.labelsVisible = false;
    return () => { zone.labelsVisible = labels; };
  }, [map, active]);

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/data/site_boundary.geojson", { signal: ctl.signal }).then((r) => r.json() as Promise<GeoJSON.FeatureCollection>).then((b) => {
      const out: Record<number, Rec> = {};
      for (const f of b.features) {
        const n = Number(/хувилбар (\d+)/.exec(String(f.properties?.name ?? ""))?.[1] ?? 0), pr = f.properties ?? {};
        if (n) out[n] = Object.fromEntries((["angle", "anchor", "localW"] as const).filter((k) => pr[k] != null).map((k) => [k, pr[k]]));
      }
      setRecs(out);
    }).catch((e) => { if (!ctl.signal.aborted) setErr(String(e.message)); });
    return () => ctl.abort();
  }, []);

  // Recompute the street/block arrangement, then fill residential plots with the shared yard model.
  useEffect(() => {
    if (!active) { setBusy(false); return; }
    if (!ring?.length || version == null || !recs[version]) return;
    const prev = computed.current;
    if (prev?.ring === ring && prev.version === version && prev.inp === inp && prev.rec === recs[version]) return;
    setBusy(true);
    const t = window.setTimeout(() => {
      try { setSp(runSoum([ring as Multi[number]], inp, recs[version], ROAD)); computed.current = { ring, version, inp, rec: recs[version] }; setErr(""); }
      catch (e) { console.error(e); setErr("Энэ хилд төлөвлөгөө тооцож чадсангүй."); setSp(null); }
      setBusy(false);
    }, 120);
    return () => window.clearTimeout(t);
  }, [active, ring, version, recs, inp]);

  useEffect(() => {
    const ids = Object.values(L);
    if (!map) return;
    const visible = (on: boolean) => ids.forEach(id => { const layer = map.findLayerById(id); if (layer) layer.visible = on; });
    // Wait for the matching view before giving ArcGIS its 2D or 3D symbols.
    if (!active || !sp || !view?.ready || view.type !== dim) { visible(false); return; }
    const prev = rendered.current;
    if (prev?.map === map && prev.view === view && prev.plan === sp && prev.step === step && prev.dim === dim) {
      visible(true);
      return () => visible(false);
    }
    // Detach the old scene from rendering before retiring its feature workers.
    visible(false);
    const redraw = window.setTimeout(() => {
    ids.forEach(id => dropLayer(map, id));
    const is3d = dim === "3d", show = (...s: number[]) => step === 1 || step === 0 || s.includes(step);
    const polys = (m: Multi, a: Record<string, unknown> = {}) => m.map((p) => ({ g: esri(p), a }));
    putLayer(map, utmLayer({ id: L.zones, title: "Бүсчлэл", geom: "polygon", fields: [{ name: "k", type: "string" }, { name: "lbl", type: "string" }, { name: "area", type: "double" }],
      rows: [...sp.zones.filter((z) => z.k !== "res").flatMap((z) => polys(z.poly, { k: z.k, lbl: z.label, area: Math.round(z.area) })),
        ...sp.plan.green.flatMap((p) => polys([p], { k: "green", lbl: "Үлдэгдэл ногоон (хилийн булан)", area: Math.round(area([p])) }))],
      renderer: unique("k", Object.entries(ZONE_COLOR).map(([k, c]) => [k, fill(c, 0.6, "#ffffff", 0.6)])) }));
    putLayer(map, utmLayer({ id: L.streets, title: "Явган зам, хашлага", geom: "polygon", fields: [], rows: polys(sp.plan.streets), renderer: { type: "simple", symbol: fill("#d3cdbb", 1) } }));
    putLayer(map, utmLayer({ id: L.asphalt, title: "Дотоод авто зам", geom: "polygon", fields: [], rows: polys(asphalt), renderer: { type: "simple", symbol: fill("#555b5d", 1) } }));
    putLayer(map, utmLayer({ id: L.plots, title: "Айлын хашаа", geom: "polygon", fields: [{ name: "id", type: "string" }, { name: "area", type: "double" }],
      rows: sp.plots.map((l) => ({ g: esri(l.poly[0]), a: { id: l.id, area: Math.round(l.area) } })), renderer: { type: "simple", symbol: fill(show(4) ? "#527b35" : C.plot, 1, show(4) ? "#e2d6b8" : C.plotLine, .6) } }));
    const connectorRows: { g: XY[][]; a: Record<string, unknown> }[] = [];
    if (sp.connector) {
      const [a, b] = [sp.connector[0], sp.connector.at(-1)!], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length > .1) { const nx = -(b[1] - a[1]) / length * 6, ny = (b[0] - a[0]) / length * 6;
        connectorRows.push({ g: esri([[[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny], [a[0] + nx, a[1] + ny]]]), a: {} }); }
    }
    putLayer(map, utmLayer({ id: L.connector, title: "Шороон зам руу холбох зам · 12 м", geom: "polygon", fields: [], rows: connectorRows, renderer: { type: "simple", symbol: fill("#555b5d", 1, "#d3cdbb", .5) } }));
    putLayer(map, utmLayer({ id: L.center, title: "Замын тэмдэглэгээ", geom: "polyline", fields: [], rows: sp.plan.centerlines.map((g) => ({ g, a: {} })), renderer: { type: "simple", symbol: { type: "simple-line", color: "#f4f0da", width: .7, style: "dash" } } }));
    if (show(4)) {
      const fields = [{ name: "k", type: "string" }, { name: "color", type: "string" }, { name: "plot", type: "string" }, { name: "role", type: "string" }] as const;
      const surfaces = (key: string, title: string, items: (Surface & { plot: string })[]) => putLayer(map, utmLayer({ id: L[key], title, geom: "polygon", fields: [...fields], rows: items.map(p => ({ g: esri([p.r]), a: { k: p.k, color: p.color, plot: p.plot, role: p.role ?? "" } })), renderer: unique("color", [...new Set(items.map(p => p.color))].map(c => [c, fill(c, 1)])) }));
      const decoration = (key: string, title: string, field: "parts" | "shadows" | "roofs" | "foliage") => surfaces(key, title, sp.yards.flatMap(y => y[field].map(p => ({ ...p, plot: y.id }))));
      surfaces("gardens", "Нийтийн амрах, тоглох хэсэг", gardens.map(p => ({ ...p, plot: "Нийтийн талбай" })));
      decoration("yardGround", "Хашааны зам, зогсоол, ногооны талбай", "parts");
      if (!is3d) decoration("yardShadows", "Барилгын сүүдэр", "shadows");
      const rows = sp.buildings.map(b => ({ g: esri([b.r]), a: { k: b.k, color: b.color ?? BLD_COLOR[b.k], h: b.h, floors: b.floors, plot: b.plot, area: area([[b.r]]) } }));
      const colors = [...new Set(rows.map(b => b.a.color))];
      if (!is3d) putLayer(map, utmLayer({ id: L.bldg, title: "Амины байшин, гараж, нийтийн барилга", geom: "polygon", fields: [{ name: "k", type: "string" }, { name: "color", type: "string" }, { name: "h", type: "double" }, { name: "floors", type: "integer" }, { name: "plot", type: "string" }, { name: "area", type: "double" }], rows,
        renderer: is3d ? { ...unique("color", colors.map(color => [color, { type: "polygon-3d", symbolLayers: [{ type: "extrude", size: 1, material: { color }, edges: { type: "solid", color: "#363d38", size: 0.4 } }] }])), visualVariables: [{ type: "size", field: "h", valueUnit: "meters" }] }
          : unique("color", colors.map(c => [c, fill(c, 1)])) }));
      if (!is3d) {
        decoration("yardRoofs", "Дээврийн налуу, нэг айлын нэг машин", "roofs");
        decoration("yardFoliage", "Модны титэм, цэцэг", "foliage");
        const details = sp.yards.flatMap(y => y.details.map(p => ({ g: p.r, a: { style: `${p.color}:${p.width}`, k: p.k, plot: y.id } })));
        putLayer(map, utmLayer({ id: L.yardDetails, title: "Хашаа, хаалга, дээвэр, хүлэмжийн хийц", geom: "polyline", fields: [{ name: "style", type: "string" }, { name: "k", type: "string" }, { name: "plot", type: "string" }], rows: details, renderer: unique("style", [...new Set(details.map(p => p.a.style))].map(s => { const [color, width] = s.split(":"); return [s, { type: "simple-line", color, width: Number(width) }]; })) }));
      }
      putLayer(map, utmLayer({ id: L.parts, title: "Хашааны хэсгийн дугаар", geom: "point", fields: [{ name: "n", type: "integer" }], minScale: 850,
        rows: sp.yards.flatMap(y => y.nums.map(q => ({ g: q.p, a: { n: q.n } }))), renderer: { type: "simple", symbol: { type: "simple-marker", size: 17, color: "#8a491b", outline: { color: "#fff9e9", width: 1 } } },
        labelingInfo: [{ labelPlacement: "center-center", deconflictionStrategy: "none", labelExpressionInfo: { expression: "Text($feature.n)" }, symbol: { type: "text", color: "#ffffff", font: { size: 9, weight: "bold" } } }] }));
    }
    if (show(4) && !is3d) putLayer(map, utmLayer({ id: L.trees, title: "Мод", geom: "point", fields: [{ name: "k", type: "string" }], rows: sp.trees.filter(t => t.k !== "yard").map((t) => ({ g: t.p, a: { k: t.k } })),
      renderer: is3d ? { type: "simple", symbol: { type: "point-3d", symbolLayers: [{ type: "object", resource: { primitive: "cone" }, material: { color: C.tree }, height: 6, width: 3, anchor: "bottom" }] } }
        : { type: "simple", symbol: { type: "simple-marker", size: 4, color: rgba(C.tree, 0.9), outline: { color: [255, 255, 255, 0.7], width: 0.4 } } } }));
    else dropLayer(map, L.trees);
    putLayer(map, utmLayer({ id: L.labels, title: "Хашааны дугаар", geom: "point", fields: [{ name: "id", type: "string" }], maxScale: 850,
      rows: sp.yards.map(y => ({ g: y.label, a: { id: y.id } })), renderer: { type: "simple", symbol: { type: "simple-marker", size: 0, color: [0, 0, 0, 0] } },
      labelingInfo: [{ labelPlacement: "center-center", labelExpressionInfo: { expression: "$feature.id" }, symbol: { type: "text", color: "#18271b", backgroundColor: "#fffdf2", borderLineColor: "#d8d4c5", borderLineSize: .5, font: { size: 9, weight: "bold" } } }] }));
    putLayer(map, utmLayer({ id: L.facilityLabels, title: "Нийтийн байгууламжийн нэр", geom: "point", fields: [{ name: "label", type: "string" }], rows: (Object.keys(FAC) as FacKey[]).flatMap(k => sp.facLots[k][0] ? [{ g: sp.facLots[k][0].c, a: { label: FAC_MAP_LABEL[k] } }] : []), renderer: { type: "simple", symbol: { type: "simple-marker", size: 0, color: [0, 0, 0, 0] } }, labelingInfo: [{ labelPlacement: "above-center", labelExpressionInfo: { expression: "$feature.label" }, symbol: { type: "text", color: "#18271b", haloColor: "#fffdf2", haloSize: 1, font: { size: 9, weight: "bold" } } }] }));
    putLayer(map, utmLayer({ id: L.site, title: "Төлөвлөлтийн хил", geom: "polygon", fields: [], rows: polys(sp.site), renderer: { type: "simple", symbol: fill(C.site, 0, C.site, 3) } }));
    MOD_TIPS.set(L.zones, (a) => ({ title: String(a.lbl), hue: ZONE_COLOR[String(a.k)], rows: [["Талбай", `${fmtN(Number(a.area))} м²`]] }));
    MOD_TIPS.set(L.plots, (a) => ({ title: `${a.id} · айлын хашаа`, hue: C.plot, rows: [["Талбай", `${fmtN(Number(a.area))} м²`]] }));
    MOD_TIPS.set(L.bldg, (a) => ({ title: `${BLD_LABEL[String(a.k)]} · ${a.plot}`, hue: String(a.color), rows: [["Суурь", `${fmtN(Number(a.area), 1)} м²`], ["Давхар", String(a.floors)], ["Өндөр", `${fmtN(Number(a.h), 1)} м`]] }));
    const carTip = (a: Record<string, unknown>) => ({ title: `Машин · ${a.plot}`, hue: "#677c85", rows: [["Хэмжээ", `${CAR_SIZE.w} × ${CAR_SIZE.d} м`], ["Нэг айлд", "1 машин"]] as [string, string][] });
    MOD_TIPS.set(L.cars, carTip);
    for (const key of ["yardGround", "yardRoofs", "yardFoliage", "yardDetails"]) MOD_TIPS.set(L[key], a => {
      if (a.role === "car") return carTip(a);
      const k = a.k as PartKey;
      return { title: `${PART[k].n}. ${PART[k].label} · ${a.plot}`, hue: PART[k].color, rows: [] };
    });
    rendered.current = { map, view, plan: sp, step, dim };
    }, 150);
    return () => { window.clearTimeout(redraw); visible(false); };
  }, [map, view, sp, asphalt, gardens, active, dim, step]);
  useEffect(() => () => { Object.values(L).forEach(id => dropLayer(map, id)); rendered.current = null; }, [map]);

  const fitted = useRef<{ view: typeof view; plan: SoumPlan; key: number } | null>(null);
  useEffect(() => {
    if (!active) { fitted.current = null; return; }
    if (!view || !sp || view.type !== dim || (fitted.current?.view === view && fitted.current.plan === sp && fitted.current.key === focusKey)) return;
    fitted.current = { view, plan: sp, key: focusKey };
    void view.when(() => view.goTo(polygonOf(sp.site).extent!.expand(1.18), { duration: 450 })).catch(() => {});
  }, [view, sp, active, dim, focusKey]);

  const m = sp?.metrics;
  const pct = (v: number) => m ? `${fmtN((v / m.site) * 100, 1)}%` : "";
  const bad = sp?.checks.filter((c) => c.ok === false).length ?? 0;
  if (err) return <p className="statusErr" role="alert">{err}</p>;
  if (!ring) return <p className="muted">Бүс сонгоно уу.</p>;
  if (!sp || !m) return <p className="muted" role="status">Төлөвлөж байна…</p>;

  return <div className="soumPlanner">
    {dim === "3d" && step !== 2 && <YardArchitectureInfo {...architecture} />}
    <div className="stepper" role="tablist">
      {STEPS.map((s) => <button key={s.n} role="tab" aria-selected={step === s.n} className={`stepBtn ${step === s.n ? "stepOn" : ""}`} onClick={() => setStep(s.n)} title={s.t}><em>{s.n || "∑"}</em><span>{s.t}</span></button>)}
    </div>
    {busy && <p className="muted" role="status">Дахин тооцож байна…</p>}

    {(step === 1 || step === 4) && <Section title="Амины байшинтай хотхоны төлөвлөлт">
      <KV rows={[["Айлын хашаа", `${m.hh} айл · ${fmtN(m.plot)} м² тус бүр`], ["Байшингийн төрөл", "6 загварыг хольж байрлуулсан"], ["Нэг айлд", "1 машин · 1.8 × 4.5 м"], ["Гараж", `${GARAGE_SIZE.w} × ${GARAGE_SIZE.d} м · ${GARAGE_SIZE.w * GARAGE_SIZE.d} м²`]]} />
      <div className="yardFocus"><select className="sel" aria-label="Авто төлөвлөлтөөс харах хашаа" value={sp.plots.some(l => l.id === selected) ? selected : sp.plots[0]?.id ?? ""} onChange={e => setSelected(e.target.value)}>{sp.plots.map(l => <option key={l.id} value={l.id}>{l.id}</option>)}</select><button className="btn" onClick={() => { const lot = sp.plots.find(l => l.id === selected) ?? sp.plots[0]; if (lot && view) void view.goTo({ target: polygonOf(lot.poly), scale: 650 }, { duration: 450 }).catch(() => {}); }}>Хашааг ойртуулах</button></div>
      <button className="btn" onClick={() => { if (view) void view.goTo(polygonOf(sp.site).extent!.expand(1.18), { duration: 450 }).catch(() => {}); }}>Хотхоныг бүтнээр харах</button>
    </Section>}


    {step === 2 && <Section title="2. Гудамжны сүлжээ, орох гарц">
      <KV rows={[["Гудамжны тэнхлэгийн урт", `${fmtN(m.roadLen)} м`], ["Гудамжны талбай", `${fmtN(m.streets)} м² · ${pct(m.streets)}`], ["Гол гудамж / туслах гудамж", `${sp.plan.params.mainW} м / ${sp.plan.params.localW} м`], ["Тор хэвтээ тэнхлэгийн өнцөг", `${fmtN(sp.plan.params.angle, 1)}°`], ["Шороон зам руу холбох", sp.connector ? `${fmtN(m.connector)} м` : "—"]]} />
      <p className="muted">Хашааны чиг нь хөрш олгосон нэгж талбаруудын чигтэй ижил (01 хэсэгтэй адил). Орох гарцыг шороон замд хамгийн ойр гудамжны тэнхлэгээс авна.</p>
    </Section>}


    {step === 4 && <Section title="4. Айлын хашаа">
      <KV rows={[["Хашааны тоо", `${m.hh}`], ["Нэг хашаа", `${fmtN(m.plot)} м² · ${PLOTS[m.plot].join(" × ")} м`], ["Хашааны нийт талбай", `${fmtN(m.res)} м² · ${pct(m.res)}`], ["Блок дахь эгнээ", sp.chosen.rows === "double" ? "2 (ар араасаа)" : "1 (гудамж бүрт)"]]} />
    </Section>}





    {step === 0 && <Section title="Норм, шалгалт" right={<span className="muted">{bad} зөрчил</span>}>
      <table className="tbl">
        <thead><tr><th>Үзүүлэлт</th><th>Утга</th><th>Норм</th></tr></thead>
        <tbody>{sp.checks.map((c) => <tr key={c.label} className={c.ok === false ? "rowBad" : ""}>
          <td>{c.label}<small>{c.src}</small></td><td className="tnum">{c.value}</td>
          <td><span className={`chk ${c.ok == null ? "" : c.ok ? "chkOk" : "chkBad"}`}>{c.ok == null ? "?" : c.ok ? "✓" : "✕"}</span>{c.norm}</td>
        </tr>)}</tbody>
      </table>
    </Section>}
  </div>;
}
