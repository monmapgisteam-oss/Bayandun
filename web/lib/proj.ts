// WGS84 ↔ UTM 49N (EPSG:32649). Баяндун сум ~113.36°E тул 49-р бүс (108–114°E).
import proj4 from "proj4";
import type { Multi, XY } from "./plan.ts";

export const UTM49 = "+proj=utm +zone=49 +datum=WGS84 +units=m +no_defs";
const P = proj4("EPSG:4326", UTM49);
export const toUtm = (ll: XY): XY => P.forward(ll) as XY;
export const toLL = (xy: XY): XY => P.inverse(xy) as XY;
export const multiToLL = (m: Multi): Multi => m.map((p) => p.map((r) => r.map(toLL)));
export const multiToUtm = (m: Multi): Multi => m.map((p) => p.map((r) => r.map(toUtm)));
