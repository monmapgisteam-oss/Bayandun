"use client";
// Айл бүрт: геолавласан 2D төлөвлөлт ба ижил суурьтай 3D барилгууд.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Polygon from "@arcgis/core/geometry/Polygon";
import type * as GeoJSON from "geojson";
import { DEFAULT_PARAMS, diff, edgeBand, runPlan, type Multi, type Params, type XY } from "@/lib/plan";
import { CAR_SIZE, GARAGE_SIZE, PARKING_SIZE, HOUSE_TYPES, GARAGE_LABEL, PART, commonGardens, yardOf, yardRoadMarks, type HouseType, type PartKey, type Surface, type Yard } from "@/lib/parcelYards";
import { dropLayer, modId, MOD_TIPS, putLayer, utmLayer } from "@/lib/modmap";
import { fmtN } from "@/lib/geo";
import { toLL } from "@/lib/proj";
import type { Rings } from "@/lib/geom";
import { useMapCtx } from "../MapCtx";
import { KV, Section } from "../ui";
import { useYardArchitecture, YardArchitectureInfo } from "../useYardArchitecture";

type Rec = Partial<Pick<Params, "angle" | "anchor" | "rows" | "localW" | "minLotRatio">>;
const LOTS: Partial<Params> = { mix: null, lotW: 40, lotD: 50, lotsPerBlock: 4, publicLots: 0 };
const HH_SIZE = 3.6;
const L = Object.fromEntries(["green", "gardens", "streets", "asphalt", "roadmarks", "lots", "ground", "shadows", "bldg", "roofs", "cars", "trees", "foliage", "details", "labels", "nums", "site"].map(k => [k, modId(3, `hh-${k}`)]));
const fill = (color: string, outline = color, width = 0) => ({ type: "simple-fill", color, outline: { color: outline, width } });
const unique = (field: string, items: [string, unknown][]) => ({ type: "unique-value", field, uniqueValueInfos: items.map(([value, symbol]) => ({ value, symbol })) });
const surfaces = (items: Surface[], id: string) => items.map(p => ({ g: p.r, a: { k: p.k, color: p.color, id, role: p.role ?? "" } }));
const surfaceFields = [{ name: "k", type: "string" }, { name: "color", type: "string" }, { name: "id", type: "string" }, { name: "role", type: "string" }] as const;
const polygonOf = (m: Multi) => new Polygon({ rings: m.flatMap(p => p.map(r => r.map(toLL))), spatialReference: { wkid: 4326 } });

/** Preview and map share geometry, including all house parameter changes. */
function YardPreview({ yard }: { yard: Yard }) {
  const f = yard.frame;
  const pt = ([x, y]: XY) => {
    const dx = x - f.A[0], dy = y - f.A[1];
    return [(dx * f.u[0] + dy * f.u[1]) * 40 / f.W, 50 - (dx * f.n[0] + dy * f.n[1]) * 50 / f.D];
  };
  const points = (r: XY[]) => r.map(p => pt(p).join(",")).join(" ");
  return <svg className="yardPreview" viewBox="-4 -5 48 61" role="img" aria-label="40 × 50 метр хашааны 2D төлөвлөлт, хэсгүүдийн дугаартай">
    <rect x="0" y="0" width="40" height="50" fill="#527b35" />
    <path d="M0 -2H40M0 -3V-1M40 -3V-1M-2 0V50M-3 0H-1M-3 50H-1" fill="none" stroke="currentColor" strokeWidth=".15" />
    <text x="20" y="-2.8" textAnchor="middle" fontSize="1.8" fill="currentColor">40 м</text>
    <text x="-2.8" y="25" textAnchor="middle" fontSize="1.8" fill="currentColor" transform="rotate(-90 -2.8 25)">50 м</text>
    {[...yard.parts, ...yard.shadows, ...yard.roofs, ...yard.foliage].map((p, i) => <polygon key={i} points={points(p.r)} fill={p.color} />)}
    {yard.details.map((p, i) => <polyline key={i} points={points(p.r)} fill="none" stroke={p.color} strokeWidth={p.width * .12} />)}
    <rect x="-1" y="51" width="42" height="4" fill="#50565a" />
    <path d="M0 53H40" stroke="#f4f0dd" strokeWidth=".16" strokeDasharray="3 2" />
    {yard.nums.map(q => { const [x, y] = pt(q.p); return <g key={q.n} transform={`translate(${x} ${y})`}><circle r="1.5" fill="#8a491b" stroke="#fff9e9" strokeWidth=".18" /><text textAnchor="middle" dominantBaseline="central" fill="white" fontSize="1.8" fontWeight="700">{q.n}</text></g>; })}
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
    try { return { plan: runPlan([ring as Multi[number]], { ...DEFAULT_PARAMS, ...recs[version], ...LOTS }), error: "" }; }
    catch { return { plan: null, error: "Энэ хилийн нэгж талбарын хуваалтыг тооцож чадсангүй." }; }
  }, [ring, version, recs]);
  const { plan } = result;
  const yards = useMemo(() => plan ? plan.lots.map((l, i) => {
    const key = houseTypes[l.id] ?? (scheme === "mixed" ? HOUSE_TYPES[i % HOUSE_TYPES.length].id : scheme);
    const type = HOUSE_TYPES.find(t => t.id === key) ?? HOUSE_TYPES[0];
    return yardOf(l.id, l.poly, plan.streets, { ...type, garage: garageTypes[l.id] ?? type.garage });
  }).filter((y): y is Yard => !!y) : [], [plan, scheme, houseTypes, garageTypes]);
  const asphalt = useMemo(() => plan ? diff(plan.streets, edgeBand(plan.streets, 1.8)) : [], [plan]);
  const roadmarks = useMemo(() => plan ? yardRoadMarks(yards, plan.streets) : [], [plan, yards]);
  const gardens = useMemo(() => plan ? commonGardens(plan.green, plan.params.angle) : [], [plan]);
  const preview = yards.find(y => y.id === selected) ?? yards[0];
  const architecture = useYardArchitecture({ map, view, active, yards, prefix: modId(3, "hh") });
  const rendered = useRef<{ map: typeof map; view: typeof view; plan: typeof plan; yards: Yard[]; dim: typeof dim } | null>(null);

  useEffect(() => {
    const ids = Object.values(L);
    if (!map) return;
    const visible = (on: boolean) => ids.forEach(id => { const layer = map.findLayerById(id); if (layer) layer.visible = on; });
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
    putLayer(map, utmLayer({ id: L.gardens, title: "Нийтийн амрах талбай, тоглоомын хэсэг", geom: "polygon", fields: [...surfaceFields], rows: surfaces(gardens, "Нийтийн талбай"), renderer: unique("color", [...new Set(gardens.map(p => p.color))].map(c => [c, fill(c)])) }));
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
    rendered.current = { map, view, plan, yards, dim };
    }, 150);
    return () => { window.clearTimeout(redraw); visible(false); };
  }, [map, view, plan, yards, asphalt, roadmarks, gardens, active, dim]);
  useEffect(() => () => { Object.values(L).forEach(id => dropLayer(map, id)); rendered.current = null; }, [map]);

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
    <Section title="Нэг хашааны төлөвлөлт · 2,000 м²">
      <div className="yardFocus"><select className="sel" aria-label="Харах айлын хашаа" value={preview?.id ?? ""} onChange={e => focusYard(e.target.value)}>{yards.map(y => <option key={y.id} value={y.id}>{y.id}</option>)}</select><button className="btn" disabled={!preview} onClick={() => preview && focusYard(preview.id)}>Газрын зурагт ойртуулах</button></div>
      {preview && <label className="yardTypeSelect"><span>{preview.id} · энэ айлын байшингийн төрөл</span><select className="sel" value={preview.houseType.id} onChange={e => setHouseTypes(current => ({ ...current, [preview.id]: e.target.value }))}>{HOUSE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>}
      {preview && <label className="yardTypeSelect"><span>{preview.id} · гаражийн хувилбар</span><select className="sel" value={preview.houseType.garage} onChange={e => setGarageTypes(current => ({ ...current, [preview.id]: e.target.value as HouseType["garage"] }))}>{(Object.keys(GARAGE_LABEL) as HouseType["garage"][]).map(k => <option key={k} value={k}>{GARAGE_LABEL[k]} · {k === "open" ? "1 машин" : `${GARAGE_SIZE.w * GARAGE_SIZE.d} м², 1 машин`}</option>)}</select></label>}
      {preview && <YardPreview yard={preview} />}
      {preview && <div className="yardDimensions"><b>Бүгд ижил масштабтай · нэг айлд нэг машин</b><KV rows={[
        ["Хашаа", "40 × 50 м · 2,000 м²"],
        ["Байшин", `${preview.houseType.w} × ${preview.houseType.d} м · ${fmtN(preview.houseArea)} м² суурь`],
        [preview.houseType.garage === "open" ? "Зогсоол" : "Гараж", preview.houseType.garage === "open" ? `${PARKING_SIZE.w} × ${PARKING_SIZE.d} м · ${fmtN(PARKING_SIZE.w * PARKING_SIZE.d, 1)} м²` : `${GARAGE_SIZE.w} × ${GARAGE_SIZE.d} м · ${fmtN(preview.garageArea, 1)} м²`],
        ["Нэг машин", `${CAR_SIZE.w} × ${CAR_SIZE.d} м · ${fmtN(CAR_SIZE.w * CAR_SIZE.d, 1)} м²`],
      ]} /></div>}
      <ol className="yardLegend">{(Object.keys(PART) as PartKey[]).map(k => <li key={k}><span>{PART[k].n}</span><i style={{ background: PART[k].color }} /><span>{k === "parking" && preview ? GARAGE_LABEL[preview.houseType.garage] : PART[k].label}{k === "house" && preview && <small>{fmtN(preview.houseArea)} м² суурь · {preview.houseType.floors} давхар · {fmtN(preview.houseArea * preview.houseType.floors)} м² нийт</small>}{k === "parking" && preview && <small>{preview.garageArea ? `${fmtN(preview.garageArea, 1)} м² · ` : ""}1 машин · гудамж руу харсан гарц</small>}</span></li>)}</ol>
    </Section>
    <Section title="Газрын баланс">
      <KV rows={[["Нийт талбай", `${fmtN(plan.metrics.site / 1e4, 2)} га`], ["Айлын хашаа", `${fmtN(plan.metrics.res)} м²`], ["Дотоод зам, явган зам", `${fmtN(plan.metrics.streets)} м²`], ["Нийтийн ногоон талбай", `${fmtN(plan.metrics.green)} м²`], ["Байшингийн суурь · нийт", `${fmtN(yards.reduce((s, y) => s + y.houseArea, 0))} м²`], ["Байшингийн давхрын талбай · нийт", `${fmtN(yards.reduce((s, y) => s + y.houseArea * y.houseType.floors, 0))} м²`], ["Залгаа гараж", `${yards.filter(y => y.houseType.garage === "attached").length} айл`], ["Тусдаа гараж", `${yards.filter(y => y.houseType.garage === "detached").length} айл`], ["Ил зогсоол", `${yards.filter(y => y.houseType.garage === "open").length} айл`], ["Хүн ам · өрх × 3.6", `${fmtN(pop)} хүн`]]} />
      {yards.length < n && <p className="statusErr">{n - yards.length} хашаанд гудамж руу харсан ирмэг олдсонгүй.</p>}
    </Section>
  </div>;
}
