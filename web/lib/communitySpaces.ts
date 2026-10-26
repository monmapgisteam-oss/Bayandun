// Metre-scale community courts. Playing fields never shrink to fit a leftover polygon.
import { area, inside, inter, type Multi, type XY } from "./plan.ts";
import { trueTerrainHeading } from "./yardTerrain.ts";
import { yardAmenityModel } from "./yardModels.ts";

export type CommunitySurface = { r: XY[]; color: string; venue: string };
export type CommunityLine = CommunitySurface & { width: number };
export type CommunityVenue = { id: string; kind: "football" | "basketball" | "rest"; label: string; ring: XY[]; center: XY };
export type CommunityObject = { kind: "football-goal" | "basketball-stand" | "bench" | "pergola"; p: XY; heading: number; venue: string };
export type CommunitySpaces = { surfaces: CommunitySurface[]; lines: CommunityLine[]; venues: CommunityVenue[]; objects: CommunityObject[] };
type Source = { key: string; poly: Multi; minX: number; maxX: number; minY: number; maxY: number };
type Rect = { x: number; y: number; w: number; d: number; source: Source };

export function communitySpaces(areas: Multi[], angle: number): CommunitySpaces {
  const result: CommunitySpaces = { surfaces: [], lines: [], venues: [], objects: [] };
  if (!Number.isFinite(angle)) throw new Error("Community court angle must be finite.");
  const origin = areas.find(m => m[0]?.[0]?.length)?.[0][0][0];
  if (!origin) return result;
  const radians = angle * Math.PI / 180, u: XY = [Math.cos(radians), Math.sin(radians)], v: XY = [-u[1], u[0]];
  const local = (p: XY): XY => [(p[0] - origin[0]) * u[0] + (p[1] - origin[1]) * u[1], (p[0] - origin[0]) * v[0] + (p[1] - origin[1]) * v[1]];
  const P = (x: number, y: number): XY => [origin[0] + x * u[0] + y * v[0], origin[1] + x * u[1] + y * v[1]];
  const ring = (x: number, y: number, w: number, d: number): XY[] => [P(x, y), P(x + w, y), P(x + w, y + d), P(x, y + d), P(x, y)];
  const sources: Source[] = [];
  areas.forEach((m, i) => m.forEach((poly, j) => {
    if (!poly[0]?.length || area([poly]) < 20) return;
    const pts = poly[0].map(local), xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    sources.push({ key: `${i}:${j}`, poly: [poly], minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) });
  }));
  const occupied: Rect[] = [];
  const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + .8 && a.x + a.w > b.x - .8 && a.y < b.y + b.d + .8 && a.y + a.d > b.y - .8;
  const fits = (r: Rect) => {
    if (occupied.some(other => overlaps(r, other))) return false;
    // Corners, midpoint and 2 m edge samples keep complete runoffs inside concave land.
    const probes: XY[] = [P(r.x + r.w / 2, r.y + r.d / 2)];
    for (let k = 0; k <= Math.ceil(r.w / 2); k++) {
      const x = r.x + r.w * k / Math.ceil(r.w / 2);
      probes.push(P(x, r.y), P(x, r.y + r.d));
    }
    for (let k = 0; k <= Math.ceil(r.d / 2); k++) {
      const y = r.y + r.d * k / Math.ceil(r.d / 2);
      probes.push(P(r.x, y), P(r.x + r.w, y));
    }
    if (!probes.every(p => inside(p, r.source.poly))) return false;
    // Also catch holes lying between the probes.
    return r.w * r.d - area(inter([[ring(r.x, r.y, r.w, r.d)]], r.source.poly)) < .05;
  };
  const find = (source: Source, w: number, d: number, edge = false): Rect | null => {
    const x0 = source.minX + .4, x1 = source.maxX - w - .4, y0 = source.minY + .4, y1 = source.maxY - d - .4;
    if (x1 < x0 || y1 < y0) return null;
    const tx = (x0 + x1) / 2, ty = edge ? y0 : (y0 + y1) / 2;
    const positions: XY[] = [[tx, ty], [tx, y0], [tx, y1], [x0, y0], [x1, y1]];
    for (let x = x0; x <= x1 + .001; x += 2) for (let y = y0; y <= y1 + .001; y += 2) positions.push([x, y]);
    positions.sort((a, b) => (a[0] - tx) ** 2 + (a[1] - ty) ** 2 - (b[0] - tx) ** 2 - (b[1] - ty) ** 2);
    for (const [x, y] of positions) { const r = { x, y, w, d, source }; if (fits(r)) return r; }
    return null;
  };
  const choose = (dimensions: [number, number][], available: Source[], edge = false) => {
    for (const source of available) for (const [w, d] of dimensions) { const r = find(source, w, d, edge); if (r) return r; }
    return null;
  };
  const surface = (venue: string, r: XY[], color: string) => result.surfaces.push({ venue, r, color });
  const line = (venue: string, r: XY[], color = "#f5f1dd", width = .65) => result.lines.push({ venue, r, color, width });
  const object = (venue: string, kind: CommunityObject["kind"], p: XY, inward: XY) => result.objects.push({ venue, kind, p, heading: trueTerrainHeading(p, [-inward[0], -inward[1]]) });

  const court = (rect: Rect, kind: "football" | "basketball", length: number, width: number) => {
    const id = `${kind}-1`, cx = rect.x + rect.w / 2, cy = rect.y + rect.d / 2, longX = rect.w > rect.d;
    const along: XY = longX ? [1, 0] : [0, 1], across: XY = [-along[1], along[0]];
    const at = (l: number, a: number): XY => P(cx + along[0] * l + across[0] * a, cy + along[1] * l + across[1] * a);
    const rectangle = (l0: number, a0: number, l1: number, a1: number): XY[] => [at(l0, a0), at(l1, a0), at(l1, a1), at(l0, a1), at(l0, a0)];
    const circle = (l: number, a: number, radius: number, start = 0, end = Math.PI * 2): XY[] => Array.from({ length: 49 }, (_, i) => at(l + radius * Math.cos(start + (end - start) * i / 48), a + radius * Math.sin(start + (end - start) * i / 48)));
    const footprint = rectangle(-length / 2, -width / 2, length / 2, width / 2);
    result.venues.push({ id, kind, label: kind === "football" ? "Хөлбөмбөг · 40 × 20 м" : "Сагсан бөмбөг · 28 × 15 м", ring: footprint, center: at(0, 0) });
    surface(id, ring(rect.x, rect.y, rect.w, rect.d), kind === "football" ? "#7c9160" : "#b5a085");
    surface(id, footprint, kind === "football" ? "#4f7e42" : "#b86f50");
    if (kind === "football") {
      for (let l = -length / 2; l < length / 2; l += 10) surface(id, rectangle(l, -width / 2, l + 5, width / 2), "#638b4a");
      line(id, footprint); line(id, [at(0, -width / 2), at(0, width / 2)]); line(id, circle(0, 0, 3));
      for (const side of [-1, 1]) {
        line(id, rectangle(side < 0 ? -20 : 15, -6, side < 0 ? -15 : 20, 6));
        line(id, rectangle(side < 0 ? -20 : 18, -3, side < 0 ? -18 : 20, 3));
        const mouthOffset = yardAmenityModel("football-goal").frontPlaneOffset!;
        const p = at(side * (length / 2 + mouthOffset), 0);
        const inward: XY = [-(u[0] * along[0] + v[0] * along[1]) * side, -(u[1] * along[0] + v[1] * along[1]) * side];
        object(id, "football-goal", p, inward);
      }
    } else {
      for (const side of [-1, 1]) {
        const l0 = side < 0 ? -14 : 8.2, l1 = side < 0 ? -8.2 : 14;
        const key = rectangle(l0, -2.45, l1, 2.45);
        surface(id, key, "#70969a"); line(id, key); line(id, circle(side * 8.2, 0, 1.8));
        line(id, circle(side * (14 - 1.575), 0, 6.75, side > 0 ? Math.PI / 2 : -Math.PI / 2, side > 0 ? Math.PI * 1.5 : Math.PI / 2));
        // Model origin is its centred bounds, not the support pole. Align the rim,
        // then the native model places its pole 1 m outside the playing baseline.
        const rimOffset = yardAmenityModel("basketball-stand").rimOffset!;
        const p = at(side * (length / 2 - (1.575 - rimOffset)), 0);
        const inward: XY = [-(u[0] * along[0] + v[0] * along[1]) * side, -(u[1] * along[0] + v[1] * along[1]) * side];
        object(id, "basketball-stand", p, inward);
      }
      line(id, footprint); line(id, [at(0, -width / 2), at(0, width / 2)]); line(id, circle(0, 0, 1.8));
    }
    occupied.push(rect);
  };

  const football = choose([[44, 24], [24, 44]], sources);
  if (football) court(football, "football", 40, 20);
  // Keep the two playing fields in separate land components/plots.
  const basketball = choose([[34, 19], [19, 34]], sources.filter(s => s.key !== football?.source.key), true);
  if (basketball) court(basketball, "basketball", 28, 15);

  const restSources = basketball ? [basketball.source, ...sources.filter(s => s !== basketball.source)] : sources;
  const rest = choose([[14, 12], [12, 10], [10, 8], [8, 8], [6, 4]], restSources);
  if (rest) {
    const id = "rest-1", cx = rest.x + rest.w / 2, cy = rest.y + rest.d / 2, center = P(cx, cy), footprint = ring(rest.x, rest.y, rest.w, rest.d);
    result.venues.push({ id, kind: "rest", label: "Амрах талбай · асар, сандал", ring: footprint, center });
    surface(id, footprint, "#cfc2a2");
    line(id, footprint, "#a69675", .35);
    if (rest.w >= 8 && rest.d >= 8) {
      surface(id, ring(cx - 3.2, cy - 2.7, 6.4, 5.4), "#ac8963");
      object(id, "pergola", center, [-v[0], -v[1]]);
      for (const side of [-1, 1]) object(id, "bench", P(cx, cy + side * Math.min(rest.d / 2 - .55, 4)), [-side * v[0], -side * v[1]]);
    } else {
      for (const side of [-1, 1]) object(id, "bench", P(cx, cy + side * .9), [-side * v[0], -side * v[1]]);
    }
    occupied.push(rest);
  }
  return result;
}
