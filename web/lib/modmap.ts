// Модулиудын газрын зургийн давхарга: id = "mod:<N>:<name>"
import type EsriMap from "@arcgis/core/Map";
import type Layer from "@arcgis/core/layers/Layer";
import Graphic from "@arcgis/core/Graphic";
import Polygon from "@arcgis/core/geometry/Polygon";
import Point from "@arcgis/core/geometry/Point";
import Polyline from "@arcgis/core/geometry/Polyline";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import type { XY } from "./geo";

export type TipInfo = { title: string; hue: string; rows: [string, string][] };
/** Модулийн давхаргын hover tooltip */
// pt = хулганы цэг (view-ийн SR) — модуль цэг дээр шууд тооцоо хийхэд ашиглана
export const MOD_TIPS = new Map<string, (a: Record<string, unknown>, pt?: Point | null) => TipInfo>();

/** Модулийн давхарга дээр дарахад дуудагдах функц (жишээ нь бүс сонгох) */
export const MOD_CLICKS = new Map<string, (a: Record<string, unknown>) => void>();

export const modId = (n: number, name: string) => `mod:${n}:${name}`;
export const modOf = (id: string) => (id.startsWith("mod:") ? Number(id.split(":")[1]) : null);

export function putLayer<T extends Layer>(map: EsriMap, layer: T): T {
  const old = map.findLayerById(layer.id);
  if (old) { map.remove(old); old.destroy(); }
  map.add(layer);
  return layer;
}

export function dropLayer(map: EsriMap | null, id: string) {
  const old = map?.findLayerById(id);
  if (old && map) { map.remove(old); old.destroy(); }
  MOD_TIPS.delete(id);
  MOD_CLICKS.delete(id);
}

type FieldDef = { name: string; type: "string" | "double" | "integer" };
const SR = { wkid: 32649 };

/** UTM координаттай client-side FeatureLayer (view руу автоматаар проекцлогдоно) */
export function utmLayer(opts: {
  id: string; title: string; geom: "polygon" | "point" | "polyline";
  fields: FieldDef[]; rows: { g: XY[] | XY[][] | XY; a: Record<string, unknown> }[];
  renderer: unknown; elevationInfo?: unknown; labelingInfo?: unknown; opacity?: number;
  minScale?: number; maxScale?: number;
}) {
  const source = opts.rows.map((r, i) => {
    const geometry = opts.geom === "point"
      ? new Point({ x: (r.g as XY)[0], y: (r.g as XY)[1], spatialReference: SR })
      : opts.geom === "polyline"
        ? new Polyline({ paths: [r.g as XY[]], spatialReference: SR })
        : new Polygon({ rings: Array.isArray((r.g as XY[][])[0][0]) ? (r.g as XY[][]) : [r.g as XY[]], spatialReference: SR });
    return new Graphic({ geometry, attributes: { oid: i + 1, ...r.a } });
  });
  return new FeatureLayer({
    id: opts.id, title: opts.title, geometryType: opts.geom, spatialReference: SR,
    objectIdField: "oid", fields: [{ name: "oid", type: "oid" }, ...opts.fields] as never,
    source, outFields: ["*"], renderer: opts.renderer as never, popupEnabled: false,
    elevationInfo: (opts.elevationInfo ?? { mode: "on-the-ground" }) as never,
    labelingInfo: opts.labelingInfo as never, opacity: opts.opacity ?? 1,
    minScale: opts.minScale ?? 0, maxScale: opts.maxScale ?? 0,
  });
}

// Тохиромжийн 5 анги (улаанаас ногоон) + хориглосон
export const SUIT_CLASSES = [
  { min: 0.8, label: "Маш тохиромжтой", color: "#1a9850" },
  { min: 0.6, label: "Тохиромжтой", color: "#91cf60" },
  { min: 0.4, label: "Дунд", color: "#fee08b" },
  { min: 0.2, label: "Тохиромж муу", color: "#fc8d59" },
  { min: 0, label: "Тохиромжгүй", color: "#d73027" },
];
export const EXCLUDED = { label: "Хориглосон бүс", color: "#4b5563" };
export const classOf = (s: number) => SUIT_CLASSES.findIndex((c) => s >= c.min);
