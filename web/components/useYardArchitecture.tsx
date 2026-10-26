"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type EsriMap from "@arcgis/core/Map";
import type SceneView from "@arcgis/core/views/SceneView";
import type MapView from "@arcgis/core/views/MapView";
import Multipoint from "@arcgis/core/geometry/Multipoint";
import { dropLayer, MOD_TIPS, putLayer, utmLayer } from "@/lib/modmap";
import { CAR_SIZE, HOUSE_FLOOR_HEIGHT, PART, type Yard } from "@/lib/parcelYards";
import { yardBuildingModel, yardCarModel, yardTreeModel, type YardBuildingKind, type YardModel } from "@/lib/yardModels";
import { levelBuildingGroups, trueTerrainHeading, type TerrainLevel, type TerrainSample } from "@/lib/yardTerrain";
import type { XY } from "@/lib/plan";
import { fmtN } from "@/lib/geo";

type Placement = { id: string; group: string; yard: Yard; kind: YardBuildingKind | "car"; ring: XY[]; center: XY; width: number; depth: number; heading: number; model: YardModel };
type HouseHeight = { id: string; name: string; wall: number; foundation: number; roof: number; total: number };
export type YardArchitectureReport = { status: "idle" | "loading" | "ready" | "relative"; houses: HouseHeight[]; groundMin?: number; groundMax?: number; resolution?: number; maxRelief?: number; error?: string };
const idle: YardArchitectureReport = { status: "idle", houses: [] };
const EMPTY_TREES: { p: XY; k: string }[] = [];
const round = (v: number) => Math.round(v * 1000) / 1000;
const terrainCache = new WeakMap<object, Map<string, Map<string, TerrainLevel>>>();

function placements(yards: Yard[]): Placement[] {
  return yards.flatMap(yard => {
    const frame = yard.frame;
    const make = (kind: Placement["kind"], ring: XY[], i: number, wall = 0): Placement => {
      const points = ring.slice(0, -1), center: XY = [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
      const horizontal = points.map(p => (p[0] - frame.A[0]) * frame.u[0] + (p[1] - frame.A[1]) * frame.u[1]);
      const vertical = points.map(p => (p[0] - frame.A[0]) * frame.n[0] + (p[1] - frame.A[1]) * frame.n[1]);
      const width = round(Math.max(...horizontal) - Math.min(...horizontal)), depth = round(Math.max(...vertical) - Math.min(...vertical));
      const model = kind === "car" ? yardCarModel() : yardBuildingModel(kind, width, depth, wall, kind === "house" ? yard.houseType.roof : kind === "parking" ? (yard.houseType.roof === "flat" ? "flat" : "gable") : "hip", yard.houseType.colors);
      return { id: `${yard.id}:${kind}:${i}`, group: kind === "house" || kind === "parking" && yard.houseType.garage === "attached" ? `${yard.id}:home` : `${yard.id}:${kind}:${i}`, yard, kind, ring, center, width, depth, heading: trueTerrainHeading(center, frame.n), model };
    };
    const result = yard.bldgs.flatMap((b, i) => b.k === "house" || b.k === "parking" || b.k === "gazebo" || b.k === "greenhouse" || b.k === "shed" ? [make(b.k, b.r, i, round(b.h))] : []);
    return [...result, ...yard.cars.map((r, i) => make("car", r, i))];
  });
}

function terrainPoints(ring: XY[], center: XY): XY[] {
  const p = ring.slice(0, -1);
  return [...p, ...p.map((a, i): XY => [(a[0] + p[(i + 1) % p.length][0]) / 2, (a[1] + p[(i + 1) % p.length][1]) / 2]), center];
}

export async function sampleTerrainLevels(map: EsriMap, items: { id: string; group: string; ring: XY[]; center: XY }[], signal: AbortSignal) {
  const key = items.map(p => `${p.id}:${p.group}:${p.ring.map(q => q.map(round).join(",")).join(";")}`).join("|");
  let cache = terrainCache.get(map.ground);
  if (!cache) { cache = new Map(); terrainCache.set(map.ground, cache); }
  const saved = cache.get(key);
  if (saved) return saved;
  const rows = items.map(p => ({ ...p, points: terrainPoints(p.ring, p.center) }));
  const points = rows.flatMap(p => p.points);
  const controller = new AbortController(), cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  const timeout = window.setTimeout(cancel, 15000);
  try {
    const result = await map.ground.queryElevation(new Multipoint({ points, spatialReference: { wkid: 32649 } }), { demResolution: "finest-contiguous", noDataValue: -999999, returnSampleInfo: true, signal: controller.signal });
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    const sampled = result.geometry.points;
    if (sampled.length !== points.length) throw new Error("DEM цэгийн тоо зөрсөн.");
    let offset = 0;
    const records = rows.map(p => {
      const samples: TerrainSample[] = p.points.map(() => {
        const i = offset++, z = sampled[i][2];
        if (z === result.noDataValue) throw new Error("DEM өндөр дутуу байна.");
        return { z, resolution: result.sampleInfo?.[i]?.demResolution ?? -1 };
      });
      return { id: p.id, group: p.group, samples };
    });
    const levels = levelBuildingGroups(records);
    cache.set(key, levels);
    if (cache.size > 8) cache.delete(cache.keys().next().value!);
    return levels;
  } finally { window.clearTimeout(timeout); signal.removeEventListener("abort", cancel); }
}

// ArcGIS data: URI-тай GLB загвар бүрийг ≈3 с гол урсгалд боловсруулж 3D-г гацаадаг байсан — нэг удаа blob: URL болгоно
const blobUrls = new Map<string, string>();
function modelUrl(href: string) {
  let url = blobUrls.get(href);
  if (!url) {
    const bin = atob(href.slice(href.indexOf(",") + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    url = URL.createObjectURL(new Blob([bytes], { type: "model/gltf-binary" }));
    blobUrls.set(href, url);
  }
  return url;
}

export function symbol(model: YardModel, shadows = true) {
  return { type: "point-3d", symbolLayers: [{ type: "object", resource: { href: modelUrl(model.href) }, anchor: "origin", height: model.height, width: null, depth: null, heading: 0, castShadows: shadows }] };
}

function houseReport(items: Placement[]): HouseHeight[] {
  const out = new Map<string, HouseHeight>();
  for (const p of items.filter(p => p.kind === "house")) {
    const prev = out.get(p.yard.houseType.id);
    if (!prev || prev.total < p.model.height) out.set(p.yard.houseType.id, { id: p.yard.houseType.id, name: p.yard.houseType.label, wall: p.model.wallHeight, foundation: p.model.foundationHeight, roof: p.model.roofRise, total: p.model.height });
  }
  return [...out.values()];
}

export function useYardArchitecture({ map, view, active, yards, prefix, extraTrees = EMPTY_TREES }: { map: EsriMap | null; view: MapView | SceneView | null; active: boolean; yards: Yard[]; prefix: string; extraTrees?: { p: XY; k: string }[] }) {
  const [report, setReport] = useState<YardArchitectureReport>(idle);
  const [revision, setRevision] = useState(0);
  const recalculate = useCallback(() => { if (map) terrainCache.delete(map.ground); setRevision(n => n + 1); }, [map]);
  const cache = useRef<{ map: EsriMap; yards: Yard[]; revision: number; report: YardArchitectureReport } | null>(null);
  const ids = ["buildings", "cars", "foundations", "fences", "trees"].map(k => `${prefix}-real-${k}`);
  useEffect(() => {
    if (!map) return;
    const visible = (on: boolean) => ids.forEach(id => { const l = map.findLayerById(id); if (l) l.visible = on; });
    if (!active || view?.type !== "3d" || !view.ready || !yards.length) { visible(false); return; }
    const prior = cache.current;
    if (prior?.map === map && prior.yards === yards && prior.revision === revision && ids.every(id => !!map.findLayerById(id))) {
      visible(true); setReport(prior.report); return () => visible(false);
    }
    visible(false);
    const controller = new AbortController();
    setReport({ status: "loading", houses: [] });
    void (async () => {
      const items = placements(yards);
      let levels: Map<string, TerrainLevel> | null = null, error = "";
      try { levels = await sampleTerrainLevels(map, items, controller.signal); }
      catch (e) { if (controller.signal.aborted) return; error = e instanceof Error ? e.message : String(e); }
      if (controller.signal.aborted) return;
      const absolute = !!levels;
      const elevationInfo = { mode: absolute ? "absolute-height" : "relative-to-ground", unit: "meters", featureExpressionInfo: { expression: "$feature.base_m" } };
      const modelRows = (group: Placement[]) => group.map(p => {
        const level = levels?.get(p.id), base = level?.base ?? 0;
        return { g: p.center, a: { id: p.id, plot: p.yard.id, kind: p.kind, name: p.kind === "car" ? "Машин" : PART[p.kind].label, model: `${p.kind}:${p.width}:${p.depth}:${p.model.wallHeight}:${p.yard.houseType.roof}:${p.yard.houseType.colors.join(",")}`, heading: p.heading, base_m: base, ground_m: level?.min ?? null, top_m: level ? base + p.model.height : null, resolution_m: level?.resolution ?? null, foundation_m: p.model.foundationHeight, wall_m: p.model.wallHeight, roof_m: p.model.roofRise, height_m: p.model.height, width_m: p.width, depth_m: p.depth } };
      });
      const fields = ["id", "plot", "kind", "name", "model"].map(name => ({ name, type: "string" as const })).concat([]);
      const numeric = ["heading", "base_m", "ground_m", "top_m", "resolution_m", "foundation_m", "wall_m", "roof_m", "height_m", "width_m", "depth_m"].map(name => ({ name, type: "double" as const }));
      for (const [id, group, title] of [[ids[0], items.filter(p => p.kind !== "car"), "Амины байшин · дээвэр, фасад, цонх, хаалга"], [ids[1], items.filter(p => p.kind === "car"), "Нэг айл · нэг бодит хэмжээтэй машин"]] as const) {
        const rows = modelRows([...group]), models = new Map<string, YardModel>();
        group.forEach((p, i) => models.set(rows[i].a.model, p.model));
        putLayer(map, utmLayer({ id, title, geom: "point", fields: [...fields, ...numeric], rows, elevationInfo, renderer: { type: "unique-value", field: "model", uniqueValueInfos: [...models].map(([value, model]) => ({ value, symbol: symbol(model) })), visualVariables: [{ type: "rotation", field: "heading", rotationType: "geographic", axis: "heading" }] } }));
        MOD_TIPS.set(id, a => ({ title: `${a.name} · ${a.plot}`, hue: "#657a70", rows: [["Хэмжээ", `${fmtN(Number(a.width_m), 1)} × ${fmtN(Number(a.depth_m), 1)} м`], ["Суурь / хана / дээвэр", `${fmtN(Number(a.foundation_m), 2)} / ${fmtN(Number(a.wall_m), 2)} / ${fmtN(Number(a.roof_m), 2)} м`], ["Нийт өндөр", `${fmtN(Number(a.height_m), 2)} м`], ...(a.top_m != null ? [["Суурийн DEM Z", `${fmtN(Number(a.base_m), 2)} м`], ["Оройн DEM Z", `${fmtN(Number(a.top_m), 2)} м`], ["DEM нягтрал", `${fmtN(Number(a.resolution_m))} м`]] as [string, string][] : [["Газрын өндөр", "DEM баталгаажаагүй"]] as [string, string][])] }));
      }
      const pads = items.flatMap(p => {
        const level = levels?.get(p.id);
        return level ? [{ g: p.ring, a: { base_m: level.min - .15, h: level.relief + .15, plot: p.yard.id } }] : [];
      });
      putLayer(map, utmLayer({ id: ids[2], title: "Газарт тулсан тэгш суурь", geom: "polygon", fields: [{ name: "base_m", type: "double" }, { name: "h", type: "double" }, { name: "plot", type: "string" }], rows: pads, elevationInfo: { mode: "absolute-height", unit: "meters", featureExpressionInfo: { expression: "$feature.base_m" } }, renderer: { type: "simple", symbol: { type: "polygon-3d", symbolLayers: [{ type: "extrude", material: { color: "#918b7e" }, edges: { type: "solid", color: "#776f63", size: .3 } }] }, visualVariables: [{ type: "size", field: "h", valueUnit: "meters" }] } }));
      const fences: { g: XY[]; a: { k: string; h: number } }[] = [];
      for (const y of yards) {
        for (const d of y.details.filter(d => d.k === "gate" && (d.r.length > 2 || d.color === "#4f5549"))) {
          for (let i = 1; i < d.r.length; i++) {
            const a = d.r[i - 1], b = d.r[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (length < .1) continue;
            const nx = -(b[1] - a[1]) / length * .07, ny = (b[0] - a[0]) / length * .07, gate = d.r.length === 2;
            fences.push({ g: [[a[0]+nx,a[1]+ny],[b[0]+nx,b[1]+ny],[b[0]-nx,b[1]-ny],[a[0]-nx,a[1]-ny],[a[0]+nx,a[1]+ny]], a: { k: gate ? "gate" : "fence", h: gate ? 1.5 : 1.6 } });
            for (let t = 0; t <= length; t += 4) { const x = a[0] + (b[0]-a[0])*t/length, z = a[1] + (b[1]-a[1])*t/length; fences.push({ g: [[x-.11,z-.11],[x+.11,z-.11],[x+.11,z+.11],[x-.11,z+.11],[x-.11,z-.11]], a: { k: "post", h: 1.8 } }); }
          }
        }
      }
      putLayer(map, utmLayer({ id: ids[3], title: "Хашаа 1.6 м · хаалга 1.5 м", geom: "polygon", fields: [{ name: "k", type: "string" }, { name: "h", type: "double" }], rows: fences, renderer: { type: "unique-value", field: "k", uniqueValueInfos: [["fence","#b7aa91"],["gate","#485651"],["post","#dbd2bc"]].map(([value,color]) => ({ value, symbol: { type: "polygon-3d", symbolLayers: [{ type: "extrude", material: { color } }] } })), visualVariables: [{ type: "size", field: "h", valueUnit: "meters" }] } }));
      const treeModels = new Map<string, YardModel>();
      const treeRows = [...yards.flatMap(y => y.trees.map((t, i) => ({ p: t.p, kind: i % 4 === 0 ? "conifer" as const : "deciduous" as const, h: 4.5 + (i % 3) * .6, d: round(t.r * 2) }))), ...extraTrees.map((t, i) => ({ p: t.p, kind: t.k === "windbreak" ? "conifer" as const : "deciduous" as const, h: 5.4 + i % 3 * .5, d: 3 }))].map(t => { const key = `${t.kind}:${t.h}:${t.d}`; if (!treeModels.has(key)) treeModels.set(key, yardTreeModel(t.kind,t.h,t.d)); return { g: t.p, a: { model: key } }; });
      putLayer(map, utmLayer({ id: ids[4], title: "Мод · иш, мөчир, титэм", geom: "point", fields: [{ name: "model", type: "string" }], rows: treeRows, renderer: { type: "unique-value", field: "model", uniqueValueInfos: [...treeModels].map(([value, model]) => ({ value, symbol: symbol(model, false) })) } }));
      const values = levels ? [...levels.values()] : [];
      const next: YardArchitectureReport = { status: absolute ? "ready" : "relative", houses: houseReport(items), ...(values.length ? { groundMin: Math.min(...values.map(v => v.min)), groundMax: Math.max(...values.map(v => v.max)), resolution: Math.max(...values.map(v => v.resolution)), maxRelief: Math.max(...values.map(v => v.relief)) } : {}), error };
      cache.current = { map, yards, revision, report: next }; setReport(next);
    })().catch(e => { if (!controller.signal.aborted) setReport({ status: "relative", houses: [], error: e instanceof Error ? e.message : String(e) }); });
    return () => { controller.abort(); visible(false); };
  // IDs are derived solely from prefix; no per-render arrays in dependencies.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, view, active, yards, prefix, extraTrees, revision]);
  useEffect(() => () => { ids.forEach(id => dropLayer(map, id)); cache.current = null; }, [map, prefix]);
  return { report, recalculate };
}

export function YardArchitectureInfo({ report, recalculate }: { report: YardArchitectureReport; recalculate: () => void }) {
  if (report.status === "idle") return null;
  return <details className="yardHeightInfo" open><summary>3D өндөр · метрээр</summary>
    {report.status === "loading" ? <p role="status">3D загвар, газрын өндрийг тооцож байна…</p> : <>
      <p>Давхар тус бүр {HOUSE_FLOOR_HEIGHT} м. Нийт өндөр = суурь + хана + дээвэр.</p>
      <table className="tbl"><thead><tr><th>Байшин</th><th>Хана</th><th>Дээвэр</th><th>Нийт</th></tr></thead><tbody>{report.houses.map(h => <tr key={h.id}><td>{h.name}</td><td>{fmtN(h.wall,1)}</td><td>{fmtN(h.roof,2)}</td><td>{fmtN(h.total,2)}</td></tr>)}</tbody></table>
      {report.status === "ready" ? <p>DEM суурийн Z: {fmtN(report.groundMin!,1)}–{fmtN(report.groundMax!,1)} м. DEM нягтрал {fmtN(report.resolution!)} м; хэмжилтийн баталгаатай өндөр биш.</p> : <p className="statusErr">Газрын өндрийг уншиж чадсангүй. Загвар газрын гадаргыг дагаж байрласан; суурийн Z баталгаажаагүй.</p>}
      <button className="btn" onClick={recalculate}>Өндрийг дахин тооцох</button>
    </>}
  </details>;
}
