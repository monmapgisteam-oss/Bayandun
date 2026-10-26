// Нийтийн ногоон талбайн хөлбөмбөг, сагсан бөмбөгийн талбай, амрах талбай (lib/communitySpaces.ts) — 02 хэсгийн хоёр горимд.
import type EsriMap from "@arcgis/core/Map";
import { MOD_TIPS, putLayer, utmLayer } from "@/lib/modmap";
import { yardAmenityModel } from "@/lib/yardModels";
import type { CommunitySpaces } from "@/lib/communitySpaces";
import { symbol } from "./useYardArchitecture";

export const COMMUNITY_KEYS = ["courts", "courtLines", "courtObjects", "courtLabels"] as const;
export const EMPTY_SPACES: CommunitySpaces = { surfaces: [], lines: [], venues: [], objects: [] };
const OBJECT_2D: Record<string, string> = { "football-goal": "#ffffff", "basketball-stand": "#e36b2c", bench: "#7a5634", pergola: "#8b6a46" };
const HUE: Record<string, string> = { football: "#4f7e42", basketball: "#b86f50", rest: "#cfc2a2" };
const unique = (field: string, items: [string, unknown][]) => ({ type: "unique-value", field, uniqueValueInfos: items.map(([value, symbol]) => ({ value, symbol })) });

export function drawCommunity(map: EsriMap, spaces: CommunitySpaces, ids: Record<(typeof COMMUNITY_KEYS)[number], string>, is3d: boolean) {
  const venue = new Map(spaces.venues.map(v => [v.id, v]));
  const colors = [...new Set(spaces.surfaces.map(s => s.color))];
  putLayer(map, utmLayer({ id: ids.courts, title: "Хөлбөмбөг, сагсан бөмбөгийн талбай, амрах талбай", geom: "polygon", fields: [{ name: "venue", type: "string" }, { name: "color", type: "string" }],
    rows: spaces.surfaces.map(s => ({ g: s.r, a: { venue: s.venue, color: s.color } })),
    renderer: unique("color", colors.map(c => [c, { type: "simple-fill", color: c, outline: { color: c, width: 0 } }])) }));
  const styles = [...new Set(spaces.lines.map(l => `${l.color}:${l.width}`))];
  putLayer(map, utmLayer({ id: ids.courtLines, title: "Талбайн шугам", geom: "polyline", fields: [{ name: "venue", type: "string" }, { name: "style", type: "string" }],
    rows: spaces.lines.map(l => ({ g: l.r, a: { venue: l.venue, style: `${l.color}:${l.width}` } })),
    renderer: unique("style", styles.map(s => { const [color, width] = s.split(":"); return [s, { type: "simple-line", color, width: Math.max(.6, Number(width) * 1.4) }]; })) }));
  const kinds = [...new Set(spaces.objects.map(o => o.kind))];
  putLayer(map, utmLayer({ id: ids.courtObjects, title: "Хаалга, сагс, сандал, асар", geom: "point", fields: [{ name: "venue", type: "string" }, { name: "kind", type: "string" }, { name: "heading", type: "double" }],
    rows: spaces.objects.map(o => ({ g: o.p, a: { venue: o.venue, kind: o.kind, heading: o.heading } })),
    renderer: is3d
      ? { ...unique("kind", kinds.map(k => [k, symbol(yardAmenityModel(k))])), visualVariables: [{ type: "rotation", field: "heading", rotationType: "geographic", axis: "heading" }] }
      : unique("kind", kinds.map(k => [k, { type: "simple-marker", style: "square", size: k === "pergola" ? 0 : 5, color: OBJECT_2D[k], outline: { color: "#2b2b2b", width: .5 } }])) }));
  putLayer(map, utmLayer({ id: ids.courtLabels, title: "Нийтийн талбайн нэр", geom: "point", fields: [{ name: "label", type: "string" }], minScale: 4000,
    rows: spaces.venues.map(v => ({ g: v.center, a: { label: v.label } })), renderer: { type: "simple", symbol: { type: "simple-marker", size: 0, color: [0, 0, 0, 0] } },
    labelingInfo: [{ labelPlacement: "center-center", labelExpressionInfo: { expression: "$feature.label" }, symbol: { type: "text", color: "#18271b", haloColor: "#fffdf2", haloSize: 1, font: { size: 9, weight: "bold" } } }] }));
  const tip = (a: Record<string, unknown>) => { const v = venue.get(String(a.venue)); return { title: v?.label ?? "Нийтийн талбай", hue: HUE[v?.kind ?? "rest"], rows: [] as [string, string][] }; };
  for (const id of [ids.courts, ids.courtLines, ids.courtObjects]) MOD_TIPS.set(id, tip);
}
