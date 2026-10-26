"use client";

import { useEffect, useRef, useState } from "react";
import { applyModuleVisibility } from "@/lib/moduleVisibility";
import "@arcgis/core/assets/esri/themes/light/main.css";
import Map from "@arcgis/core/Map";
import {watch} from "@arcgis/core/core/reactiveUtils";
import {inspectionPriority,inspectionRows} from "@/lib/mapInspection";
import Basemap from "@arcgis/core/Basemap";
import Ground from "@arcgis/core/Ground";
import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import type Extent from "@arcgis/core/geometry/Extent";
import type Point from "@arcgis/core/geometry/Point";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type FeatureLayerView from "@arcgis/core/views/layers/FeatureLayerView";
import MapView from "@arcgis/core/views/MapView";
import SceneView from "@arcgis/core/views/SceneView";
import Expand from "@arcgis/core/widgets/Expand";
import BasemapGallery from "@arcgis/core/widgets/BasemapGallery";
import LocalBasemapsSource from "@arcgis/core/widgets/BasemapGallery/support/LocalBasemapsSource";
import {
  ALWAYS_ON_IDS, BOUNDARY_ID, ELEVATION_URL, LAYER_BY_ID, LAYERS, PALETTE, PLAN_BOUNDARY, PLAN_HA, PLAN_NAME,
  SERVICE_URL, drawOrder, type LayerDef,
} from "@/lib/layers";
import { MOD_CLICKS, MOD_TIPS, modOf, type TipInfo } from "@/lib/modmap";

export type Dim = "2d" | "3d";
export type Pick = { layerId: string; attrs: Record<string, unknown> };
export type AnyView = MapView | SceneView;
type Tip = { x: number; y: number } & TipInfo;

// Map нэг удаа үүсч, view солигдоход амьд үлдэнэ (Selbe mapCache загвар)
let mapCache: Map | null = null;
let homeExtent: Extent | null = null;

// Бүх вектор давхарга газрын гадаргуу дээр наалдана
const ON_GROUND = { mode: "on-the-ground" } as const;

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
};

function symbolOf(d: LayerDef, color = d.hue) {
  if (d.geom === "point") {
    return { type: "simple-marker", color, size: d.size ?? 7, outline: { color: "#fff", width: 1.2 } };
  }
  if (d.geom === "line") {
    return { type: "simple-line", color, width: d.width ?? 1.2, style: d.dash ? "dash" : "solid" };
  }
  return {
    type: "simple-fill",
    color: rgba(color, d.fill ?? 0.3),
    outline: { color, width: d.width ?? 0.8, style: d.dash ? "dash" : "solid" },
  };
}

function rendererOf(d: LayerDef, values?: string[]) {
  if (d.paint) {
    const map = d.paint.values ?? Object.fromEntries((values ?? []).map((v, i) => [v, PALETTE[i % PALETTE.length]]));
    return {
      type: "unique-value",
      field: d.paint.field,
      defaultSymbol: symbolOf(d, "#94a3b8"),
      defaultLabel: "Бусад",
      uniqueValueInfos: Object.entries(map).map(([value, color]) => ({
        value, label: value,
        symbol: d.id === "road"
          ? { type: "simple-line", color, width: value.includes("өрсөн") ? 0.7 : 1.6, style: value.includes("өрсөн") ? "short-dash" : "solid" }
          : symbolOf(d, color),
      })),
    };
  }
  // Төмөр замын тэмдэг (casing/ties): бараан хүрээ дээр өнгөт шугам, голд нь цайвар тасархай дэр мод
  if (d.casing && d.ties) return railRenderer(d, "2d");
  return { type: "simple", symbol: symbolOf(d) };
}

// CIMLineSymbol нь SceneView-д дэмжигдэхгүй (1px хар шугам болно) — 3D-д LineSymbol3D
function railRenderer(d: LayerDef, dim: Dim) {
  const [casing, line, ties] = [d.casing!, d.hue, d.ties!];
  if (dim === "3d") {
    // Нааж зурсан шугамд дараагийн symbolLayer дээр нь зурагдана
    return { type: "simple", symbol: { type: "line-3d", symbolLayers: [
      { type: "line", size: 6, material: { color: rgba(casing, 0.8) }, cap: "butt" },
      { type: "line", size: 4.2, material: { color: line }, cap: "butt" },
      { type: "line", size: 2.2, material: { color: ties }, cap: "butt", pattern: { type: "style", style: "dash" } },
    ] } };
  }
  // CIM-д эхний symbolLayer хамгийн дээр
  const c = (hex: string, a = 1) => { const [r, g, b] = rgba(hex, a); return [r, g, b, Math.round(a * 255)]; };
  return { type: "simple", symbol: { type: "cim", data: { type: "CIMSymbolReference", symbol: { type: "CIMLineSymbol", symbolLayers: [
    { type: "CIMSolidStroke", enable: true, width: 2.2, color: c(ties), capStyle: "Butt",
      effects: [{ type: "CIMGeometricEffectDashes", dashTemplate: [5, 5], lineDashEnding: "NoConstraint" }] },
    { type: "CIMSolidStroke", enable: true, width: 4.2, color: c(line), capStyle: "Butt" },
    { type: "CIMSolidStroke", enable: true, width: 6, color: c(casing, 0.8), capStyle: "Butt" },
  ] } } } };
}

function labelOf(d: LayerDef) {
  if (!d.label) return undefined;
  return [{
    labelExpressionInfo: { expression: `$feature.${d.label}` },
    symbol: { type: "text", color: "#f8fafc", haloColor: "#0f1720", haloSize: 1.2, font: { size: 11, weight: "bold" } },
  }];
}

function buildLayers(): FeatureLayer[] {
  const out: FeatureLayer[] = [];
  for (const d of [...LAYERS].sort((a, b) => drawOrder(a) - drawOrder(b))) {
    let fl: FeatureLayer;
    if (d.id === BOUNDARY_ID) {
      // Хил сервист байхгүй — EPSG:32649 цэгүүдээс client-side давхарга
      const geometry = new Polygon({ rings: [[...PLAN_BOUNDARY, PLAN_BOUNDARY[0]]], spatialReference: { wkid: 32649 } });
      fl = new FeatureLayer({
        id: d.id, title: d.title, geometryType: "polygon", spatialReference: { wkid: 32649 },
        objectIdField: "oid",
        fields: [{ name: "oid", type: "oid" }, { name: "name", type: "string" }, { name: "area_ha", type: "double" }],
        source: [new Graphic({ geometry, attributes: { oid: 1, name: PLAN_NAME, area_ha: PLAN_HA } })],
      });
    } else {
      fl = new FeatureLayer({
        id: d.id, url: d.url ?? `${SERVICE_URL}/${d.n}`, title: d.title, outFields: ["*"],
        definitionExpression: d.where,
      });
    }
    fl.visible = false;
    fl.popupEnabled = false;
    fl.elevationInfo = ON_GROUND as never;
    fl.renderer = rendererOf(d) as never;
    const labels = labelOf(d);
    if (labels) fl.labelingInfo = labels as never;
    // Автомат ангилал: давхаргын утгуудыг уншаад unique-value renderer-ийг шинэчилнэ
    if (d.paint && !d.paint.values) {
      fl.when(async () => {
        const r = await fl.queryFeatures({
          where: d.where ?? "1=1", outFields: [d.paint!.field], returnDistinctValues: true, returnGeometry: false,
        } as never);
        const vals = r.features.map((f) => String(f.attributes[d.paint!.field])).filter((v) => v && v !== "null").sort();
        fl.renderer = rendererOf(d, vals) as never;
      }).catch(() => {});
    }
    out.push(fl);
  }
  return out;
}

const fmt = (v: unknown, unit?: string) => {
  if (v == null || v === "") return "—";
  const s = typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(v);
  return unit ? `${s} ${unit}` : s;
};

export default function MapCanvas({
  dim, visible, opacity, selected, onPick, onReady, onView, activeMod = -1, zoneFilter = null, hideOriginalBoundaries = false,
}: {
  dim: Dim;
  visible: string[];
  opacity: Record<string, number>;
  selected: Pick | null;
  onPick: (p: Pick | null) => void;
  onReady?: (api: { home: () => void }) => void;
  onView?: (view: AnyView | null, map: Map) => void;
  activeMod?: number;
  hideOriginalBoundaries?: boolean;
  zoneFilter?: number | null; // Төлөвлөлтийн бүсийн OBJECTID (ID давхардсан тул OBJECTID-аар шүүнэ)
}) {
  const el = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const viewRef = useRef<AnyView | null>(null);
  const hiddenModules = useRef(new WeakMap<{id:string;visible:boolean},boolean>());
  const lastExtent = useRef<Extent | null>(null);
  const [ready, setReady] = useState(false);
  const [tip, setTip] = useState<Tip | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // View үүсгэх: dim солигдох бүрт view-г шинээр, map-ийг хэвээр
  useEffect(() => {
    if (!el.current) return;
    if (!mapCache || mapCache.destroyed) {
      mapCache = new Map({
        basemap: Basemap.fromId("satellite"),
        ground: new Ground({ layers: [new ElevationLayer({ url: ELEVATION_URL })] }),
        layers: buildLayers(),
      });
    }
    const map = mapCache;
    // Map нь view солигдоход хэвээр тул төмөр замын тэмдгийг dim-д тааруулна
    for (const d of LAYERS) {
      const lyr = d.casing && d.ties ? (map.findLayerById(d.id) as FeatureLayer | undefined) : undefined;
      if (lyr) lyr.renderer = railRenderer(d, dim) as never;
    }
    setReady(false);
    setErr(null);

    const view: AnyView = dim === "3d"
      ? new SceneView({
          container: el.current, map, popupEnabled: false, qualityProfile: "high",
          camera: { position: { longitude: 113.3672, latitude: 49.2594, z: 1800 }, tilt: 60, heading: 0 },
          environment: { atmosphereEnabled: true, lighting: { type: "virtual", directShadowsEnabled: true } } as never,
        } as never)
      : new MapView({
          container: el.current, map, popupEnabled: false,
          center: [113.3672, 49.2594], zoom: 16,
          // Yard details need scales between basemap levels and beyond its last tile.
          constraints: { rotationEnabled: false, snapToZoom: false, maxScale: 100 },
        } as never);
    viewRef.current = view;
    // Zoom/compass баруун доод буланд — зүүн дээд талд хэрэгслийн самбар байрлана
    view.ui.move(["zoom", "navigation-toggle", "compass"], "bottom-right");

    // Суурь зураг — портал нэвтрэлтгүй ажиллах локал жагсаалт
    const gallery = new BasemapGallery({
      view,
      source: new LocalBasemapsSource({
        basemaps: ["satellite", "hybrid", "topo-vector", "streets-vector", "gray-vector", "dark-gray-vector", "osm"]
          .map((id) => Basemap.fromId(id)).filter((b): b is Basemap => !!b),
      }),
    });
    view.ui.add(new Expand({ view, content: gallery, expandTooltip: "Суурь зураг", group: "tr" }), "top-right");

    // Бүтэн дэлгэц
    const fsBtn = document.createElement("div");
    fsBtn.className = "esri-widget--button esri-widget";
    fsBtn.title = "Бүтэн дэлгэц";
    fsBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4"/></svg>`;
    fsBtn.onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else wrap.current?.requestFullscreen();
    };
    view.ui.add(fsBtn, "top-right");

    view.when(async () => {
      const b = map.findLayerById(BOUNDARY_ID) as FeatureLayer;
      if (!homeExtent) {
        try { homeExtent = (await b.queryExtent()).extent; } catch { /* Keep the default camera if the service is unavailable. */ }
      }
      if ((lastExtent.current || homeExtent) && !view.destroyed) {
        const target = lastExtent.current?.clone() ?? homeExtent!.clone().expand(dim === "3d" ? 2.2 : 1.8);
        await view.goTo(dim === "3d" ? ({ target, tilt: 60 } as never) : target, { animate: false }).catch(() => {});
      }
      if (view.destroyed) return;
      setReady(true);
      onView?.(view, map);
    }, (e: Error) => setErr(e?.name?.startsWith("webgl") ? "WebGL дэмжигдэхгүй байна" : String(e?.message ?? e)));

    onReady?.({
      home: () => {
        if (!homeExtent || view.destroyed) return;
        const target = homeExtent.clone().expand(dim === "3d" ? 2.2 : 1.8);
        view.goTo(dim === "3d" ? ({ target, tilt: 60 } as never) : target, { duration: 1400, easing: "ease-in-out" }).catch(() => {});
      },
    });

    // Hover tooltip
    const pickHit = (r: Awaited<ReturnType<AnyView["hitTest"]>>) => {
      for (const h of [...r.results].sort((a,b)=>{
        const priority=(h:typeof a)=>h.type==="graphic"?inspectionPriority(String(h.graphic.layer?.id??""),h.graphic.geometry?.type??"",h.graphic.attributes??{}):-1;
        return priority(b)-priority(a);
      })) {
        if (h.type !== "graphic") continue;
        const id = String(h.graphic.layer?.id ?? "");
        if (!(h.graphic.layer as FeatureLayer)?.visible) continue;
        const attrs = h.graphic.attributes ?? {};
        const modTip = MOD_TIPS.get(id);
        if (modTip) return { id, attrs, info: modTip(attrs, (h as { mapPoint?: Point | null }).mapPoint), catalog: false };
        const def = LAYER_BY_ID[id];
        if (def) {
          const info: TipInfo = { title: def.title, hue: def.hue, rows: def.tip.map((t) => [t.label, fmt(attrs[t.field], t.unit)]) };
          return { id, attrs, info, catalog: true };
        }
        if(modOf(id)!==null){
          const layer=h.graphic.layer as FeatureLayer;
          const rows=inspectionRows(attrs,Object.fromEntries((layer.fields??[]).map(f=>[f.name,f.alias||f.name])));
          return {id,attrs,info:{title:String(attrs.source_title||layer.title||"Төлөвлөсөн байгууламж"),hue:"#23a6a0",rows:rows.length?rows:[["Давхарга",layer.title||"Төлөвлөлт"]] as [string,string][]},catalog:false};
        }
      }
      return null;
    };
    let busy=false,disposed=false,pointer:{x:number;y:number}|null=null,version=0,frame=0;
    const inspect=()=>{
      if(busy||!pointer||disposed)return;
      busy=true;const pos={...pointer},request=version;
      view.hitTest(pos).then(r=>{
        if(disposed||request!==version)return;
        const hit=pickHit(r);setTip(hit?{...pos,...hit.info}:null);
        if(el.current)el.current.style.cursor=hit?'pointer':'';
      }).catch(()=>{}).finally(()=>{busy=false;if(!disposed&&request!==version&&pointer)frame=requestAnimationFrame(()=>{frame=0;inspect();});});
    };
    const move=view.on('pointer-move',e=>{pointer={x:e.x,y:e.y};version++;if(!frame)frame=requestAnimationFrame(()=>{frame=0;inspect();});});
    const leave=view.on('pointer-leave',()=>{pointer=null;version++;setTip(null);if(el.current)el.current.style.cursor='';});
    // Scroll/zoom дуусахад заагчийн доорх шинэ объектын мэдээллийг дахин уншина.
    const stationary=watch(()=>view.stationary,value=>{version++;if(value)inspect();else setTip(null);});
    const click = view.on("click", (e) => {
      view.hitTest(e).then((r) => {
        const hit = pickHit(r);
        if (hit && !hit.catalog) MOD_CLICKS.get(hit.id)?.(hit.attrs);
        onPickRef.current(hit?.catalog ? { layerId: hit.id, attrs: hit.attrs } : null);
      }).catch(() => {});
    });

    return () => {
      disposed=true;cancelAnimationFrame(frame);stationary.remove();move.remove(); leave.remove(); click.remove(); setTip(null);
      if (view.extent) lastExtent.current = view.extent.clone();
      onView?.(null, map);
      // view.destroy() нь map-ийг хамт устгадаг тул эхлээд салгана
      view.container = null as never;
      (view as unknown as { map: Map | null }).map = null;
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dim]);

  // Харагдах байдал: visible[] массиваас
  useEffect(() => {
    if (!mapCache) return;
    const on = new Set([...visible, ...ALWAYS_ON_IDS]);
    for (const l of mapCache.layers.toArray()) if (LAYER_BY_ID[String(l.id)]) l.visible = on.has(String(l.id)) && !((activeMod === 90||hideOriginalBoundaries) && l.id === "plan_zone");
  }, [visible, ready, activeMod,hideOriginalBoundaries]);

  // Модулийн давхарга: зөвхөн идэвхтэй модулийнх харагдана (шинээр нэмэгдсэн давхаргад ч)
  useEffect(() => {
    const map = mapCache;
    if (!map) return;
    const apply = () => {
      applyModuleVisibility(map.layers.toArray(),activeMod,hiddenModules.current);
    };
    apply();
    const h = map.layers.on("change", apply);
    return () => h.remove();
  }, [activeMod, ready]);

  // Төлөвлөлтийн бүсийн шүүлтүүр: сонгосон бүсийг л үлдээж, түүн рүү ойртоно
  useEffect(() => {
    if (!mapCache || !ready) return;
    const lyr = mapCache.findLayerById("plan_zone") as FeatureLayer | undefined;
    if (!lyr) return;
    const base = LAYER_BY_ID.plan_zone.where ?? "1=1";
    lyr.definitionExpression = zoneFilter == null ? base : `(${base}) AND OBJECTID = ${zoneFilter}`;
    const view = viewRef.current;
    if (zoneFilter == null || !view) return;
    lyr.queryExtent({ where: lyr.definitionExpression } as never).then(({ extent }) => {
      if (extent && !view.destroyed) view.goTo(extent.clone().expand(1.6), { duration: 900 }).catch(() => {});
    }).catch(() => {});
  }, [zoneFilter, ready, dim]);

  // Тунгалаг байдал
  useEffect(() => {
    if (!mapCache) return;
    for (const l of mapCache.layers.toArray()) if (LAYER_BY_ID[String(l.id)]) l.opacity = opacity[String(l.id)] ?? 1;
  }, [opacity, ready]);

  // Сонгосон объектын highlight (2D, 3D аль алинд layerView.highlight)
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !ready || !selected || !mapCache) return;
    const lyr = mapCache.findLayerById(selected.layerId) as FeatureLayer | undefined;
    if (!lyr) return;
    let handle: { remove(): void } | null = null;
    let cancelled = false;
    view.whenLayerView(lyr).then((lv) => {
      if (cancelled) return;
      const oid = selected.attrs[lyr.objectIdField] as number;
      if (oid != null) handle = (lv as FeatureLayerView).highlight(oid);
    }).catch(() => {});
    return () => { cancelled = true; handle?.remove(); };
  }, [selected, ready, dim]);

  return (
    <div className="mapWrap" ref={wrap}>
      <div className="mapView" ref={el} />
      {!ready && !err && <div className="mapLoading"><span className="spinner" />Газрын зураг ачаалж байна…</div>}
      {err && <div className="mapWarn">{err}</div>}
      {tip && (
        <div className="mapTip" style={{ left: Math.min(tip.x,Math.max(0,(wrap.current?.clientWidth??800)-345)), top: Math.min(tip.y,Math.max(0,(wrap.current?.clientHeight??600)-340)), ["--tone" as string]: tip.hue }}>
          <b>{tip.title}</b>
          {tip.rows.map(([k, v]) => (
            <div key={k} className="tipRow"><span>{k}</span><em>{v}</em></div>
          ))}
        </div>
      )}
    </div>
  );
}
