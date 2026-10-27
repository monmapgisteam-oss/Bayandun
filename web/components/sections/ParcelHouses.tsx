"use client";
// Айл бүрт: геолавласан 2D төлөвлөлт ба ижил суурьтай 3D барилгууд.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Polygon from "@arcgis/core/geometry/Polygon";
import type * as GeoJSON from "geojson";
import { DEFAULT_PARAMS, diff, edgeBand, runPlan, type Multi, type Params, type XY } from "@/lib/plan";
import { CAR_SIZE, GARAGE_SIZE, PARKING_SIZE, HOUSE_TYPES, GARAGE_LABEL, PART, yardOf, yardRoadMarks, type HouseType, type PartKey, type Surface, type Yard } from "@/lib/parcelYards";
import { dropLayer, modId, MOD_CLICKS, MOD_TIPS, putLayer, utmLayer } from "@/lib/modmap";
import { fmtN } from "@/lib/geo";
import { toLL } from "@/lib/proj";
import type { Rings } from "@/lib/geom";
import { useMapCtx } from "../MapCtx";
import { KV, Section } from "../ui";
import { useYardArchitecture, YardArchitectureInfo } from "../useYardArchitecture";
import { communitySpaces } from "@/lib/communitySpaces";
import { COMMUNITY_KEYS, drawCommunity, EMPTY_SPACES } from "../communityLayers";

type Rec = Partial<Pick<Params, "angle" | "anchor" | "rows" | "localW" | "minLotRatio">>;
// Айл бүрийн хашааны хэмжээ: 700 м² нь egazar-ын хөрш нэгж талбартай ижил 20×35 м; 5,000 м² нь урд 40×50 хашаа + тариалан
const SIZES = { 700: { w: 20, d: 35, lpb: 8 }, 2000: { w: 40, d: 50, lpb: 4 }, 5000: { w: 100, d: 50, lpb: 2 } } as const;
type Size = keyof typeof SIZES;
const lotsOf = (size: Size): Partial<Params> => ({ mix: null, lotW: SIZES[size].w, lotD: SIZES[size].d, lotsPerBlock: SIZES[size].lpb, publicLots: 0 });
const HH_SIZE = 3.6;
const L = Object.fromEntries(["green", ...COMMUNITY_KEYS, "streets", "asphalt", "roadmarks", "lots", "ground", "shadows", "bldg", "roofs", "cars", "trees", "foliage", "details", "labels", "nums", "site"].map(k => [k, modId(3, `hh-${k}`)]));
const fill = (color: string, outline = color, width = 0) => ({ type: "simple-fill", color, outline: { color: outline, width } });
const unique = (field: string, items: [string, unknown][]) => ({ type: "unique-value", field, uniqueValueInfos: items.map(([value, symbol]) => ({ value, symbol })) });
const surfaces = (items: Surface[], id: string) => items.map(p => ({ g: p.r, a: { k: p.k, color: p.color, id, role: p.role ?? "" } }));
const surfaceFields = [{ name: "k", type: "string" }, { name: "color", type: "string" }, { name: "id", type: "string" }, { name: "role", type: "string" }] as const;
// Сонгосон хашааны тодруулга (үндсэн давхаргуудаас тусдаа — сонголт солиход бүгдийг дахин зурахгүй)
const SEL = modId(3, "hh-selected"), NUM_IDS = [L.labels, L.nums];
const polygonOf = (m: Multi) => new Polygon({ rings: m.flatMap(p => p.map(r => r.map(toLL))), spatialReference: { wkid: 4326 } });

/** Preview and map share geometry, including all house parameter changes. */
function YardPreview({ yard }: { yard: Yard }) {
  const f = yard.frame, W = Math.round(f.W), D = Math.round(f.D), k = Math.max(W, D) / 50;
  const pt = ([x, y]: XY) => {
    const dx = x - f.A[0], dy = y - f.A[1];
    return [(dx * f.u[0] + dy * f.u[1]) * W / f.W, D - (dx * f.n[0] + dy * f.n[1]) * D / f.D];
  };
  const points = (r: XY[]) => r.map(p => pt(p).join(",")).join(" ");
  return <svg className="yardPreview" viewBox={`${-4 * k} ${-5 * k} ${W + 8 * k} ${D + 11 * k}`} role="img" aria-label={`${W} × ${D} метр хашааны 2D төлөвлөлт, хэсгүүдийн дугаартай`}>
    <rect x="0" y="0" width={W} height={D} fill="#527b35" />
    <path d={`M0 ${-2 * k}H${W}M0 ${-3 * k}V${-k}M${W} ${-3 * k}V${-k}M${-2 * k} 0V${D}M${-3 * k} 0H${-k}M${-3 * k} ${D}H${-k}`} fill="none" stroke="currentColor" strokeWidth={.15 * k} />
    <text x={W / 2} y={-2.8 * k} textAnchor="middle" fontSize={1.8 * k} fill="currentColor">{W} м</text>
    <text x={-2.8 * k} y={D / 2} textAnchor="middle" fontSize={1.8 * k} fill="currentColor" transform={`rotate(-90 ${-2.8 * k} ${D / 2})`}>{D} м</text>
    {[...yard.parts, ...yard.shadows, ...yard.roofs, ...yard.foliage].map((p, i) => <polygon key={i} points={points(p.r)} fill={p.color} />)}
    {yard.details.map((p, i) => <polyline key={i} points={points(p.r)} fill="none" stroke={p.color} strokeWidth={p.width * .12} />)}
    <rect x={-k} y={D + k} width={W + 2 * k} height={4 * k} fill="#50565a" />
    <path d={`M0 ${D + 3 * k}H${W}`} stroke="#f4f0dd" strokeWidth={.16 * k} strokeDasharray={`${3 * k} ${2 * k}`} />
    {yard.nums.map((q, i) => { const [x, y] = pt(q.p); return <g key={i} transform={`translate(${x} ${y})`}><circle r={1.5 * Math.min(k, 1.4)} fill="#8a491b" stroke="#fff9e9" strokeWidth=".18" /><text textAnchor="middle" dominantBaseline="central" fill="white" fontSize={1.8 * Math.min(k, 1.4)} fontWeight="700">{q.n}</text></g>; })}
  </svg>;
}

export default function ParcelHouses({ ring, version, active, focusKey = 0 }: { ring: Rings | null; version: number | null; active: boolean; focusKey?: number }) {
  const { map, view, dim } = useMapCtx();
  const [recs, setRecs] = useState<Record<number, Rec>>({});
  const [scheme, setScheme] = useState("mixed");
  const [houseTypes, setHouseTypes] = useState<Record<string, string>>({});
  const [garageTypes, setGarageTypes] = useState<Record<string, HouseType["garage"]>>({});
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState("");
  const [size, setSize] = useState<Size>(2000);
  const [showNums, setShowNums] = useState(true);
  const numsOn = useRef(showNums);
  numsOn.current = showNums;
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/site_boundary.geojson", { signal: controller.signal }).then(async r => {
      if (!r.ok) throw new Error("Төлөвлөлтийн өгөгдлийг уншиж чадсангүй.");
      return r.json() as Promise<GeoJSON.FeatureCollection>;
    }).then(b => {
      const out: Record<number, Rec> = {};
      for (const f of b.features) {
        const n = Number(/хувилбар (\d+)/.exec(String(f.properties?.name ?? ""))?.[1] ?? 0), pr = f.properties ?? {};
        if (n) out[n] = Object.fromEntries((["angle", "anchor", "rows", "localW", "minLotRatio"] as const).filter(k => pr[k] != null).map(k => [k, pr[k]]));
      }
      setRecs(out);
    }).catch(e => { if (!controller.signal.aborted) setLoadError(String(e.message)); });
    return () => controller.abort();
  }, []);
  const result = useMemo(() => {
    if (!ring?.length || version == null || !recs[version]) return { plan: null, error: "" };
    try { return { plan: runPlan([ring as Multi[number]], { ...DEFAULT_PARAMS, ...recs[version], ...lotsOf(size) }), error: "" }; }
    catch { return { plan: null, error: "Энэ хилийн нэгж талбарын хуваалтыг тооцож чадсангүй." }; }
  }, [ring, version, recs, size]);
  const { plan } = result;
  const yards = useMemo(() => plan ? plan.lots.map((l, i) => {
    const key = houseTypes[l.id] ?? (scheme === "mixed" ? HOUSE_TYPES[i % HOUSE_TYPES.length].id : scheme);
    const type = HOUSE_TYPES.find(t => t.id === key) ?? HOUSE_TYPES[0];
    return yardOf(l.id, l.poly, plan.streets, { ...type, garage: garageTypes[l.id] ?? type.garage }, SIZES[size].w);
  }).filter((y): y is Yard => !!y) : [], [plan, scheme, houseTypes, garageTypes, size]);
  const asphalt = useMemo(() => plan ? diff(plan.streets, edgeBand(plan.streets, 1.8)) : [], [plan]);
  const roadmarks = useMemo(() => plan ? yardRoadMarks(yards, plan.streets) : [], [plan, yards]);
  // Нийтийн ногоонд: хөлбөмбөг 40×20 м, сагсан бөмбөг 28×15 м, амрах талбай (багтвал)
  const spaces = useMemo(() => plan ? communitySpaces([plan.green], plan.params.angle) : EMPTY_SPACES, [plan]);
  const preview = yards.find(y => y.id === selected) ?? yards[0];
  const architecture = useYardArchitecture({ map, view, active, yards, prefix: modId(3, "hh") });
  const rendered = useRef<{ map: typeof map; view: typeof view; plan: typeof plan; yards: Yard[]; dim: typeof dim } | null>(null);

  useEffect(() => {
    const ids = Object.values(L);
    if (!map) return;
    const visible = (on: boolean) => ids.forEach(id => { const layer = map.findLayerById(id); if (layer) layer.visible = on && (numsOn.current || !NUM_IDS.includes(id)); });
    if (!active || !plan || !view?.ready || view.type !== dim) { visible(false); return; }
    const prev = rendered.current;
    if (prev?.map === map && prev.view === view && prev.plan === plan && prev.yards === yards && prev.dim === dim) {
      visible(true);
      return () => visible(false);
    }
    visible(false);
    // Coalesce rapid dropdown changes before rebuilding ArcGIS feature sources.
    const redraw = window.setTimeout(() => {
    ids.forEach(id => dropLayer(map, id));
    const is3d = dim === "3d";
    const polys = (m: Multi) => m.map(p => ({ g: p as XY[][], a: {} }));
    const add = (key: string, title: string, m: Multi, color: string) => putLayer(map, utmLayer({ id: L[key], title, geom: "polygon", fields: [], rows: polys(m), renderer: { type: "simple", symbol: fill(color) } }));
    const decoration = (key: string, title: string, field: "parts" | "shadows" | "roofs" | "foliage") => {
      const items = yards.flatMap(y => surfaces(y[field], y.id));
      putLayer(map, utmLayer({ id: L[key], title, geom: "polygon", fields: [...surfaceFields], rows: items,
        renderer: unique("color", [...new Set(items.map(p => p.a.color))].map(c => [c, fill(c)])) }));
    };
    add("green", "Нийтийн ногоон талбай", plan.green, "#517539");
    drawCommunity(map, spaces, L as Record<(typeof COMMUNITY_KEYS)[number], string>, is3d);
    add("streets", "Явган зам, хашлага", plan.streets, "#d3cdbb");
    add("asphalt", "Дотоод авто зам", asphalt, "#555b5d");
    putLayer(map, utmLayer({ id: L.roadmarks, title: "Замын тэмдэглэгээ", geom: "polyline", fields: [], rows: roadmarks.map(g => ({ g, a: {} })), renderer: { type: "simple", symbol: { type: "simple-line", color: "#f4f0da", width: 0.7 } } }));
    putLayer(map, utmLayer({ id: L.lots, title: "Айлын хашаа", geom: "polygon", fields: [{ name: "id", type: "string" }, { name: "area", type: "double" }],
      rows: plan.lots.map(l => ({ g: l.poly[0] as XY[][], a: { id: l.id, area: Math.round(l.area) } })), renderer: { type: "simple", symbol: fill("#527b35", "#e2d6b8", 0.6) } }));
    decoration("ground", "Хашааны зам, ногооны талбай", "parts");
    if (!is3d) decoration("shadows", "Барилгын сүүдэр", "shadows");
    const buildings = yards.flatMap(y => y.bldgs.map(b => ({ g: b.r, a: { k: b.k, id: y.id, h: b.h, color: b.k === "house" || b.k === "parking" ? y.houseType.colors[0] : PART[b.k].color } })));
    const buildingColors = [...new Set(buildings.map(b => b.a.color))];
    if (!is3d) putLayer(map, utmLayer({ id: L.bldg, title: "Байшингийн 6 загвар, залгаа ба тусдаа гараж", geom: "polygon", fields: [{ name: "k", type: "string" }, { name: "id", type: "string" }, { name: "h", type: "double" }, { name: "color", type: "string" }], rows: buildings,
      renderer: is3d ? { ...unique("color", buildingColors.map(color => [color, { type: "polygon-3d", symbolLayers: [{ type: "extrude", size: 1, material: { color }, edges: { type: "solid", color: "#363d38", size: 0.4 } }] }])), visualVariables: [{ type: "size", field: "h", valueUnit: "meters" }] }
        : unique("color", buildingColors.map(color => [color, fill(color)])) }));
    if (!is3d) {
      decoration("roofs", "Дээврийн налуу, машины дүрслэл", "roofs");
      decoration("foliage", "Модны титэм, цэцэг", "foliage");
      const details = yards.flatMap(y => y.details.map(p => ({ g: p.r, a: { style: `${p.color}:${p.width}`, k: p.k, id: y.id } })));
      putLayer(map, utmLayer({ id: L.details, title: "Хашаа, дээвэр, хүлэмжийн хийц", geom: "polyline", fields: [{ name: "style", type: "string" }, { name: "k", type: "string" }, { name: "id", type: "string" }], rows: details,
        renderer: unique("style", [...new Set(details.map(p => p.a.style))].map(s => { const [color, width] = s.split(":"); return [s, { type: "simple-line", color, width: Number(width) }]; })) }));
    }
    putLayer(map, utmLayer({ id: L.labels, title: "Айлын дугаар", geom: "point", fields: [{ name: "id", type: "string" }], maxScale: 850,
      rows: yards.map(y => ({ g: y.label, a: { id: y.id } })), renderer: { type: "simple", symbol: { type: "simple-marker", size: 0, color: [0, 0, 0, 0] } },
      labelingInfo: [{ labelPlacement: "center-center", deconflictionStrategy: "none", labelExpressionInfo: { expression: "$feature.id" }, symbol: { type: "text", color: "#18271b", backgroundColor: "#fffdf2", borderLineColor: "#d8d4c5", borderLineSize: 0.5, font: { size: 9, weight: "bold" } } }] }));
    putLayer(map, utmLayer({ id: L.nums, title: "Хашааны хэсгийн дугаар", geom: "point", fields: [{ name: "n", type: "integer" }], minScale: 850,
      rows: yards.flatMap(y => y.nums.map(q => ({ g: q.p, a: { n: q.n } }))), renderer: { type: "simple", symbol: { type: "simple-marker", size: 17, color: "#8a491b", outline: { color: "#fff9e9", width: 1 } } },
      labelingInfo: [{ labelPlacement: "center-center", deconflictionStrategy: "none", labelExpressionInfo: { expression: "Text($feature.n)" }, symbol: { type: "text", color: "#ffffff", font: { size: 9, weight: "bold" } } }] }));
    putLayer(map, utmLayer({ id: L.site, title: "Төлөвлөлтийн улаан хил", geom: "polygon", fields: [], rows: polys(plan.site), renderer: { type: "simple", symbol: fill("#00000000", "#ff3026", 2.8) } }));
    const byId = new Map(yards.map(y => [y.id, y]));
    MOD_TIPS.set(L.bldg, a => {
      const k = a.k as PartKey, y = byId.get(String(a.id));
      return { title: `${PART[k].n}. ${k === "parking" && y ? GARAGE_LABEL[y.houseType.garage] : PART[k].label} · ${a.id}`, hue: PART[k].color,
        rows: k === "house" && y ? [["Загвар", y.houseType.label], ["Суурийн талбай", `${fmtN(y.houseArea)} м²`], ["Давхар", String(y.houseType.floors)]] : [["Өндөр", `${fmtN(Number(a.h), 1)} м`]] };
    });
    const carTip = (a: Record<string, unknown>) => ({ title: `Машин · ${a.id}`, hue: "#677c85", rows: [["Хэмжээ", `${CAR_SIZE.w} × ${CAR_SIZE.d} м · ${fmtN(CAR_SIZE.w * CAR_SIZE.d, 1)} м²`], ["Нэг айлд", "1 машин"]] as [string, string][] });
    MOD_TIPS.set(L.cars, carTip);
    for (const key of ["ground", "roofs", "foliage", "details"]) MOD_TIPS.set(L[key], a => { if (a.role === "car") return carTip(a); const k = a.k as PartKey; return { title: `${PART[k].n}. ${PART[k].label} · ${a.id}`, hue: PART[k].color, rows: [] }; });
    MOD_TIPS.set(L.lots, a => ({ title: `${a.id} · айлын хашаа`, hue: "#527b35", rows: [["Талбай", `${fmtN(Number(a.area))} м²`]] }));
    // Хашааны аль ч хэсэг дээр дарахад тэр хашаа сонгогдоно
    for (const key of ["lots", "ground", "bldg", "roofs", "foliage", "details"]) MOD_CLICKS.set(L[key], a => setSelected(String(a.id)));
    for (const id of NUM_IDS) { const layer = map.findLayerById(id); if (layer) layer.visible = numsOn.current; }
    const sel = map.findLayerById(SEL);
    if (sel) map.reorder(sel, map.layers.length - 1);
    rendered.current = { map, view, plan, yards, dim };
    }, 150);
    return () => { window.clearTimeout(redraw); visible(false); };
  }, [map, view, plan, yards, asphalt, roadmarks, spaces, active, dim]);
  useEffect(() => () => { Object.values(L).forEach(id => dropLayer(map, id)); rendered.current = null; }, [map]);
  useEffect(() => {
    if (!map) return;
    for (const id of NUM_IDS) { const layer = map.findLayerById(id); if (layer && active) layer.visible = showNums; }
  }, [map, active, showNums]);
  // 3D байшин, машин дээр дарахад мөн сонгоно
  useEffect(() => {
    if (architecture.report.status === "ready" || architecture.report.status === "relative")
      for (const id of [modId(3, "hh-real-buildings"), modId(3, "hh-real-cars")]) MOD_CLICKS.set(id, a => setSelected(String(a.plot)));
  }, [architecture.report.status]);
  const selectedLot = plan?.lots.find(l => l.id === (selected || yards[0]?.id));
  useEffect(() => {
    if (!map) return;
    if (!active || !selectedLot || !view?.ready || view.type !== dim) { dropLayer(map, SEL); return; }
    putLayer(map, utmLayer({ id: SEL, title: "Сонгосон хашаа", geom: "polygon", fields: [{ name: "id", type: "string" }], rows: [{ g: selectedLot.poly[0] as XY[][], a: { id: selectedLot.id } }],
      renderer: { type: "simple", symbol: fill("rgba(255,214,10,0.18)", "#ffd60a", 3.5) } }));
    MOD_TIPS.set(SEL, a => ({ title: `${a.id} · сонгосон хашаа`, hue: "#ffd60a", rows: [["Талбай", `${fmtN(selectedLot.area)} м²`]] }));
    return () => dropLayer(map, SEL);
  }, [map, view, active, dim, selectedLot]);

  const overview = useCallback(() => {
    if (!view || !plan) return;
    void view.when(() => view.goTo(polygonOf(plan.site).extent!.expand(1.18), { duration: 450 })).catch(() => {});
  }, [view, plan]);
  const fitted = useRef<{ view: typeof view; plan: typeof plan; key: number } | null>(null);
  useEffect(() => {
    if (!active) { fitted.current = null; return; }
    if (!view || !plan || view.type !== dim) return;
    if (fitted.current?.view === view && fitted.current.plan === plan && fitted.current.key === focusKey) return;
    fitted.current = { view, plan, key: focusKey };
    overview();
  }, [view, plan, active, dim, focusKey, overview]);
  const focusYard = (id: string) => {
    setSelected(id);
    const lot = plan?.lots.find(l => l.id === id);
    if (view && lot) void view.goTo({ target: polygonOf(lot.poly), scale: 650 }, { duration: 500 }).catch(() => {});
  };
  if (loadError || result.error) return <p className="statusErr" role="alert">{loadError || result.error}</p>;
  if (!ring) return <p className="muted">Бүс сонгоно уу.</p>;
  if (!plan) return <p className="muted" role="status">Нэгж талбар хувааж байна…</p>;
  const n = plan.metrics.resCount, pop = n * HH_SIZE;
  return <div className="parcelHouses">
    {dim === "3d" && <YardArchitectureInfo {...architecture} />}
    <div className="segTabs yardSizes" role="tablist" aria-label="Айлын хашааны хэмжээ">
      {(Object.keys(SIZES).map(Number) as Size[]).map(k => <button key={k} role="tab" aria-selected={size === k} className={size === k ? "on" : ""} onClick={() => { setSize(k); setSelected(""); }}>{fmtN(k)} м²<small>{SIZES[k].w}×{SIZES[k].d} м</small></button>)}
    </div>
    <Section title={`Нэг хашааны төлөвлөлт · ${fmtN(size)} м²`}>
      <div className="yardFocus"><select className="sel" aria-label="Харах айлын хашаа" value={preview?.id ?? ""} onChange={e => focusYard(e.target.value)}>{yards.map(y => <option key={y.id} value={y.id}>{y.id}</option>)}</select><button className="btn" disabled={!preview} onClick={() => preview && focusYard(preview.id)}>Газрын зурагт ойртуулах</button></div>
      <label className="suitChk"><input type="checkbox" checked={showNums} onChange={e => setShowNums(e.target.checked)} />Газрын зураг дээрх дугаарыг харуулах</label>
      {preview && <label className="yardTypeSelect"><span>{preview.id} · энэ айлын байшингийн төрөл</span><select className="sel" value={preview.houseType.id} onChange={e => setHouseTypes(current => ({ ...current, [preview.id]: e.target.value }))}>{HOUSE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
      {preview && <label className="yardTypeSelect"><span>{preview.id} · гаражийн хувилбар</span><select className="sel" value={preview.houseType.garage} onChange={e => setGarageTypes(current => ({ ...current, [preview.id]: e.target.value as HouseType["garage"] }))}>{(Object.keys(GARAGE_LABEL) as HouseType["garage"][]).map(k => <option key={k} value={k}>{GARAGE_LABEL[k]} · {k === "open" ? "1 машин" : `${GARAGE_SIZE.w * GARAGE_SIZE.d} м², 1 машин`}</option>)}</select></label>}
      {preview && <YardPreview yard={preview} />}
      {preview && <div className="yardDimensions"><b>Бүгд ижил масштабтай · нэг айлд нэг машин</b><KV rows={[
        ["Хашаа", `${SIZES[size].w} × ${SIZES[size].d} м · ${fmtN(size)} м²${size === 5000 ? " (урд 40×50 хашаа + тариалан)" : ""}`],
        ["Байшин", `${preview.houseType.w} × ${preview.houseType.d} м · ${fmtN(preview.houseArea)} м² суурь`],
        [preview.houseType.garage === "open" ? "Зогсоол" : "Гараж", preview.houseType.garage === "open" ? `${PARKING_SIZE.w} × ${PARKING_SIZE.d} м · ${fmtN(PARKING_SIZE.w * PARKING_SIZE.d, 1)} м²` : `${GARAGE_SIZE.w} × ${GARAGE_SIZE.d} м · ${fmtN(preview.garageArea, 1)} м²`],
        ["Нэг машин", `${CAR_SIZE.w} × ${CAR_SIZE.d} м · ${fmtN(CAR_SIZE.w * CAR_SIZE.d, 1)} м²`],
      ]} /></div>}
      <ol className="yardLegend">{(Object.keys(PART) as PartKey[]).filter(k => !preview || preview.nums.some(q => q.n === PART[k].n) || preview.bldgs.some(b => b.k === k)).map(k => <li key={k}><span>{PART[k].n}</span><i style={{ background: PART[k].color }} /><span>{k === "parking" && preview ? GARAGE_LABEL[preview.houseType.garage] : PART[k].label}{k === "house" && preview && <small>{fmtN(preview.houseArea)} м² суурь · {preview.houseType.floors} давхар · {fmtN(preview.houseArea * preview.houseType.floors)} м² нийт</small>}{k === "parking" && preview && <small>{preview.garageArea ? `${fmtN(preview.garageArea, 1)} м² · ` : ""}1 машин · гудамж руу харсан гарц</small>}</span></li>)}</ol>
    </Section>
    <Section title="Газрын баланс">
      <KV rows={[["Нийт талбай", `${fmtN(plan.metrics.site / 1e4, 2)} га`], ["Айлын хашаа", `${fmtN(plan.metrics.res)} м²`], ["Дотоод зам, явган зам", `${fmtN(plan.metrics.streets)} м²`], ["Нийтийн ногоон талбай", `${fmtN(plan.metrics.green)} м²`], ["Байшингийн суурь · нийт", `${fmtN(yards.reduce((s, y) => s + y.houseArea, 0))} м²`], ["Байшингийн давхрын талбай · нийт", `${fmtN(yards.reduce((s, y) => s + y.houseArea * y.houseType.floors, 0))} м²`], ["Залгаа гараж", `${yards.filter(y => y.houseType.garage === "attached").length} айл`], ["Тусдаа гараж", `${yards.filter(y => y.houseType.garage === "detached").length} айл`], ["Ил зогсоол", `${yards.filter(y => y.houseType.garage === "open").length} айл`], ["Хүн ам · өрх × 3.6", `${fmtN(pop)} хүн`]]} />
      {yards.length < n && <p className="statusErr">{n - yards.length} хашаанд гудамж руу харсан ирмэг олдсонгүй.</p>}
    </Section>
  </div>;
}
