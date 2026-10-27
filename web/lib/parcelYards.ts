// Detailed, metre-based yard geometry shared by the 2D map and 3D buildings.
import { area, corners, inside, type Multi, type XY } from "./plan.ts";

export const CAR_SIZE = { w: 1.8, d: 4.5, h: 1.5 };
export const GARAGE_SIZE = { w: 4.5, d: 7, h: 3 };
export const PARKING_SIZE = { w: 2.8, d: 5.5 };
export const HOUSE_FLOOR_HEIGHT = 3.2;

export type HouseType = {
  id: string; label: string; w: number; d: number; floors: number;
  shape: "rect" | "l"; roof: "hip" | "gable" | "flat";
  garage: "attached" | "detached" | "open"; colors: string[];
};
export const HOUSE_TYPES: HouseType[] = [
  { id: "family", label: "Гэр бүлийн", w: 12, d: 10, floors: 1, shape: "rect", roof: "hip", garage: "attached", colors: ["#46535d", "#29343e", "#59646b", "#36434c"] },
  { id: "garden", label: "L хэлбэрийн", w: 14, d: 11, floors: 1, shape: "l", roof: "hip", garage: "detached", colors: ["#9c7655", "#74523d", "#b08c68", "#896348"] },
  { id: "modern", label: "Модерн", w: 12, d: 10, floors: 1, shape: "rect", roof: "flat", garage: "attached", colors: ["#b7b7aa", "#8e958c", "#d4d0be", "#a5aa9c"] },
  { id: "veranda", label: "Террастай", w: 15, d: 10, floors: 1, shape: "rect", roof: "gable", garage: "detached", colors: ["#6f7863", "#495540", "#89917d", "#5c6751"] },
  { id: "compact", label: "Компакт", w: 10, d: 10, floors: 1, shape: "rect", roof: "gable", garage: "open", colors: ["#ad6c50", "#854c38", "#c18a68", "#995a41"] },
  { id: "two-storey", label: "Хоёр давхар", w: 11, d: 9, floors: 2, shape: "rect", roof: "hip", garage: "detached", colors: ["#58616c", "#333c48", "#73808c", "#48535e"] },
];
export const GARAGE_LABEL = { attached: "Байшинтай залгаа гараж", detached: "Тусдаа гараж", open: "Ил зогсоол" };
export const PART = {
  house: { n: 1, label: "Амины орон сууц", color: "#3d4851" },
  parking: { n: 2, label: "Гараж, машины зогсоол", color: "#ada99f" },
  paved: { n: 3, label: "Хашаан доторх зам, талбай", color: "#d1cbbb" },
  gazebo: { n: 4, label: "Амрах талбай · асар, BBQ", color: "#ad7546" },
  greenhouse: { n: 5, label: "Хүлэмж · 24 м²", color: "#acd5cf" },
  beds: { n: 6, label: "Ногооны талбай · 144 м²", color: "#72893d" },
  shed: { n: 7, label: "Агуулах · 18 м²", color: "#86755d" },
  lawn: { n: 9, label: "Мод, зүлэг, цэцэрлэг", color: "#56813a" },
  gate: { n: 10, label: "Хашаа, урд талын хаалга", color: "#635947" },
} as const;
export type PartKey = keyof typeof PART;
export type Surface = { r: XY[]; color: string; k: PartKey; role?: "car" };
export type Detail = Surface & { width: number };
export type Yard = {
  id: string; label: XY; frame: YardFrame; houseType: HouseType; houseArea: number; garageArea: number;
  parts: Surface[]; roofs: Surface[]; shadows: Surface[]; details: Detail[];
  bldgs: { k: PartKey; r: XY[]; h: number }[];
  cars: XY[][]; trees: { p: XY; r: number }[]; foliage: Surface[];
  nums: { n: number; p: XY }[];
};
export type YardFrame = { A: XY; u: XY; n: XY; W: number; D: number };

/** Prefer the 40 m frontage, including corner lots with a second street. */
export function frameOf(poly: Multi, streets: Multi): YardFrame | null {
  const c = corners(poly);
  if (c.length < 4) return null;
  const cen: XY = [c.reduce((s, q) => s + q[0], 0) / c.length, c.reduce((s, q) => s + q[1], 0) / c.length];
  let best: Omit<YardFrame, "D"> | null = null;
  for (let i = 0; i < c.length; i++) {
    const a = c[i], b = c[(i + 1) % c.length], W = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (W < 1) continue;
    const u: XY = [(b[0] - a[0]) / W, (b[1] - a[1]) / W];
    let n: XY = [-u[1], u[0]];
    const m: XY = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if ((cen[0] - m[0]) * n[0] + (cen[1] - m[1]) * n[1] < 0) n = [-n[0], -n[1]];
    if (inside([m[0] - n[0] * 3, m[1] - n[1] * 3], streets) &&
      (!best || Math.abs(W - 40) < Math.abs(best.W - 40))) best = { A: a, u, n, W };
  }
  if (!best) return null;
  const f = best;
  const D = Math.max(...c.map((q) => (q[0] - f.A[0]) * f.n[0] + (q[1] - f.A[1]) * f.n[1]));
  return { ...f, D };
}

export function yardOf(id: string, poly: Multi, streets: Multi, house: HouseType): Yard | null {
  const f = frameOf(poly, streets);
  if (!f) return null;
  const sa = f.W / 40, sd = f.D / 50;
  const P = (x: number, y: number): XY => [f.A[0] + f.u[0] * x * sa + f.n[0] * y * sd, f.A[1] + f.u[1] * x * sa + f.n[1] * y * sd];
  const ring = (pts: XY[]): XY[] => [...pts.map(([x, y]) => P(x, y)), P(...pts[0])];
  const R = (x0: number, y0: number, x1: number, y1: number) => ring([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
  const circle = (x: number, y: number, r: number, seed = 0) => ring(Array.from({ length: 16 }, (_, i): XY => {
    const a = i * Math.PI / 8, radius = r * (1 + 0.1 * Math.sin(i * 2.7 + seed));
    return [x + radius * Math.cos(a), y + radius * Math.sin(a)];
  }));
  const out: Yard = { id, frame: f, label: P(14.5, 25), houseType: house, houseArea: 0, garageArea: 0, parts: [], roofs: [], shadows: [], details: [], bldgs: [], cars: [], trees: [], foliage: [], nums: [] };
  const surface = (k: PartKey, color: string, r: XY[]) => out.parts.push({ k, color, r });
  const line = (k: PartKey, color: string, width: number, pts: XY[]) => out.details.push({ k, color, width, r: pts.map(([x, y]) => P(x, y)) });
  const number = (k: PartKey, x: number, y: number) => out.nums.push({ n: PART[k].n, p: P(x, y) });
  const w = house.w / sa, d = house.d / sd;
  // Гүехэн (40 м) хашаанд залгаа гаражийн өмнөх зогсоол багтахаар байшинг арагш шилжүүлнэ: 1 м + зогсоол + гараж + 0.3 м
  const y0 = Math.max(14, (sd + PARKING_SIZE.d + GARAGE_SIZE.d + 0.3) / sd), x0 = 14.5 - w / 2, x1 = x0 + w, y1 = y0 + d;
  // Attached garages share the house's front wall. Detached garages have their own apron and gate.
  const garageW = GARAGE_SIZE.w / sa, garageD = GARAGE_SIZE.d / sd;
  const gx = house.garage === "attached" ? x1 - garageW : 29, gy = house.garage === "attached" ? y0 - garageD : 8;
  const gate0 = gx - .4 / sa, gate1 = gx + garageW + .4 / sa;
  const bayX = gx + (garageW - PARKING_SIZE.w / sa) / 2, bayY = 1;
  out.label = P(14.5, y0 + d / 2);

  // Continuous vehicle access from each gate to the correct garage door.
  for (let x = 1; x < 39; x += 4) surface("lawn", "#638b42", R(x, 1, x + 1.8, 49));
  surface("paved", "#c9c3b5", R(x0 - 1.4, y0 - 1.4, x1 + 1.4, y1 + 1.4));
  surface("paved", "#cec8ba", R(gate0, 0.7, gate1, gy));
  surface("paved", "#cec8ba", R(x1, 12, 29, 13.5));
  surface("paved", "#cec8ba", R(11, 1, 12.5, y0));
  surface("paved", "#cfc8b9", R(23.5, 8, 25, 44));
  surface("paved", "#cfc8b9", R(6, 35, 25, 36.5));
  surface("parking", "#aaa99f", R(bayX, bayY, bayX + PARKING_SIZE.w / sa, bayY + PARKING_SIZE.d / sd));
  for (let y = 1.5; y < gy; y += 1.8) line("paved", "#b6b0a2", 0.25, [[gate0, y], [gate1, y]]);
  for (let x = gate0 + 1; x < gate1; x += 2) line("paved", "#b6b0a2", 0.25, [[x, 0.7], [x, gy]]);
  for (const x of [bayX, bayX + PARKING_SIZE.w / sa]) line("parking", "#eeeadd", 0.65, [[x, bayY], [x, bayY + PARKING_SIZE.d / sd]]);

  // Soil beds with actual planted rows and greenhouse glass ribs.
  surface("beds", "#b09a6b", R(25.5, 22, 37.5, 34));
  for (let x = 26; x < 37; x += 2.8) {
    surface("beds", "#66543a", R(x, 22.5, x + 2.1, 33.5));
    for (const dx of [0.45, 1.05, 1.65]) line("beds", dx === 1.05 ? "#91ad51" : "#4b722d", 0.9, [[x + dx, 23], [x + dx, 33]]);
  }

  const building = (k: PartKey, a: number, b: number, c: number, e: number, h: number, colors: string[], style: HouseType["roof"] = "hip", numbered = true) => {
    const r = R(a, b, c, e), mid = (a + c) / 2, ridge0 = b + Math.min((c - a) / 3, (e - b) / 3), ridge1 = e - (ridge0 - b);
    out.bldgs.push({ k, r, h });
    out.shadows.push({ k, color: "#344529", r: R(a + 0.9, b + 1.1, c + 1.1, e + 1.5) });
    const facets: XY[][] = style === "flat" ? [[[a, b], [c, b], [c, e], [a, e]]] : style === "gable" ? [
      [[a, b], [mid, b], [mid, e], [a, e]], [[mid, b], [c, b], [c, e], [mid, e]],
    ] : [
      [[a, b], [mid, ridge0], [mid, ridge1], [a, e]],
      [[c, b], [c, e], [mid, ridge1], [mid, ridge0]],
      [[a, b], [c, b], [mid, ridge0]], [[a, e], [mid, ridge1], [c, e]],
    ];
    facets.forEach((pts, i) => out.roofs.push({ k, color: colors[i % colors.length], r: ring(pts) }));
    line(k, "#b7bbac", 0.45, [[a, b], [c, b], [c, e], [a, e], [a, b]]);
    if (style === "hip") {
      line(k, "#899097", 0.45, [[a, b], [mid, ridge0], [c, b]]);
      line(k, "#899097", 0.45, [[a, e], [mid, ridge1], [c, e]]);
      line(k, "#a3a6a2", 0.5, [[mid, ridge0], [mid, ridge1]]);
    } else if (style === "gable") line(k, "#b2b4a3", .6, [[mid, b], [mid, e]]);
    else {
      line(k, "#e6e0cc", 1.3, [[a + .35, b + .35], [c - .35, b + .35], [c - .35, e - .35], [a + .35, e - .35], [a + .35, b + .35]]);
      out.roofs.push({ k, color: "#647e82", r: R(a + .6, Math.max(b + .6, e - 2.5), Math.min(a + 2.8, c - .6), e - .6) });
    }
    if (numbered) number(k, mid, (b + e) / 2);
  };
  if (house.shape === "l") {
    building("house", x0 + 4, y0, x1, y1, house.floors * HOUSE_FLOOR_HEIGHT, house.colors, house.roof);
    building("house", x0, y0 + 4, x0 + 4, y1, house.floors * HOUSE_FLOOR_HEIGHT, house.colors, house.roof, false);
    surface("paved", "#b39976", R(x0, y0, x0 + 4, y0 + 4));
  } else building("house", x0, y0, x1, y1, house.floors * HOUSE_FLOOR_HEIGHT, house.colors, house.roof);
  out.houseArea = out.bldgs.reduce((sum, b) => sum + area([[b.r]]), 0);
  if (house.id === "veranda") {
    surface("paved", "#b9976f", R(x0, y0 - 3, x1, y0 - .3));
    for (let x = x0 + .6; x < x1; x += .8) line("paved", "#826c52", .35, [[x, y0 - 3], [x, y0 - .3]]);
  }
  if (house.garage !== "open") {
    building("parking", gx, gy, gx + garageW, gy + garageD, GARAGE_SIZE.h, house.colors, house.roof === "flat" ? "flat" : "gable");
    out.garageArea = area([[out.bldgs[out.bldgs.length - 1].r]]);
    // Centre one 3.2 m door on the wider garage, aligned with the single-car apron.
    const doorW = 3.2 / sa, doorX = gx + (garageW - doorW) / 2;
    line("parking", "#d6d8cd", 1.6, [[doorX, gy], [doorX + doorW, gy]]);
  } else number("parking", gx + garageW / 2, 4);
  surface("paved", "#b39976", R(x0 + 2, y0 - 1, x1 - 2, y0 - 0.3));
  building("gazebo", 4, 38, 10, 42.5, 2.4, ["#bb8957", "#8c5d35", "#d5a46a", "#a47141"]);
  surface("gazebo", "#8d7050", R(4, 36.8, 10, 37.7));
  building("greenhouse", 26, 38, 32, 42, 1.8, ["#a7cfc3", "#76a99f", "#c3ded2", "#a3cabc"]);
  for (let x = 26.6; x < 32; x += 0.9) line("greenhouse", "#edf1dd", 0.55, [[x, 38], [x, 42]]);
  building("shed", 33, 16.5, 37, 21, 2.4, ["#8a7962", "#655b4e", "#a4947a", "#7a6954"]);
  number("paved", 11.8, 8); number("beds", 31.5, 28);
  number("lawn", 5, 29); number("gate", (gate0 + gate1) / 2, 0.8);

  // Exactly one 1.8 × 4.5 m car per yard; use the same metre scale as the house.
  const carW = CAR_SIZE.w / sa, carD = CAR_SIZE.d / sd;
  const carX = gx + (garageW - carW) / 2, carY = 1.5;
  out.cars.push(R(carX, carY, carX + carW, carY + carD));
  out.roofs.push({ k: "parking", role: "car", color: "#e8e8df", r: out.cars[0] });
  for (const dy of [.7, 3.3]) out.roofs.push({ k: "parking", role: "car", color: "#354a54", r: R(carX + .15 / sa, carY + dy / sd, carX + carW - .15 / sa, carY + (dy + .6) / sd) });
  for (const dx of [.1, CAR_SIZE.w - .45]) out.roofs.push({ k: "parking", role: "car", color: "#f8edc9", r: R(carX + dx / sa, carY + carD - .2 / sd, carX + (dx + .35) / sa, carY + carD - .02 / sd) });

  const tree = (x: number, y: number, r: number, seed: number) => {
    x = Math.min(x, 37.5);
    if (x + r > x0 - 1.5 && x - r < x1 + 1.5 && y + r > y0 - 1.5 && y - r < y1 + 1.5) return;
    if (y - r < gy + 1 && x + r > gate0 && x - r < gate1) return;
    const crown = circle(x, y, r + .5);
    if (out.bldgs.some(b => crown.some(p => inside(p, [[b.r]])))) return;
    out.trees.push({ p: P(x, y), r });
    out.foliage.push({ k: "lawn", color: "#344b29", r: circle(x + 0.45, y - 0.45, r * 1.08, seed) });
    out.foliage.push({ k: "lawn", color: ["#3a642d", "#526f2c", "#628539", "#436f37"][seed % 4], r: circle(x, y, r, seed) });
    out.foliage.push({ k: "lawn", color: ["#7e9d48", "#a3ad59", "#91ae57", "#6c984b"][seed % 4], r: circle(x - r * 0.24, y + r * 0.24, r * 0.62, seed + 1) });
  };
  let seed = 0;
  for (let x = 2; x <= 38; x += 4.5) { tree(x, 47.4, 1.5, seed++); if (x < 11 || x > 26) tree(x, 2, 1.3, seed++); }
  for (let y = 8; y <= 43; y += 5) { tree(2, y, 1.4, seed++); tree(38, y, 1.35, seed++); }
  for (const [x, y] of [[6, 15], [6, 29], [16, 40], [20, 45], [34.5, 45]]) tree(x, y, 1.8, seed++);
  // Flower clusters clear of buildings and driveways.
  for (const [x, y] of [[5, 34], [11.5, 39], [20, 36], [25.7, 35.5], [34, 36], [29, 45]]) {
    for (let i = 0; i < 4; i++) out.foliage.push({ k: "lawn", color: ["#d6a2b4", "#f2d6c6", "#b28da9", "#dfc461"][i], r: circle(x + Math.cos(i * 1.6) * 0.5, y + Math.sin(i * 1.6) * 0.5, 0.48, i) });
  }
  // Perimeter fence with a real opening in front of the parking apron.
  line("gate", "#e1d8bd", 1.25, [[gate0, 0.5], [0.5, 0.5], [0.5, 49.5], [39.5, 49.5], [39.5, 0.5], [gate1, 0.5]]);
  line("gate", "#4f5549", 0.85, [[gate0, 0.5], [gate1, 0.5]]);
  for (const x of [gate0, gate1]) surface("gate", "#d2c7ab", R(x - 0.45, 0.1, x + 0.45, 1.2));
  for (let x = gate0 + .5; x < gate1; x += 0.8) line("gate", "#b3b9a6", 0.4, [[x, 0.2], [x, 0.9]]);
  return out;
}

/** Lane markings follow the actual street width at each yard frontage. */
export function yardRoadMarks(yards: Yard[], streets: Multi): XY[][] {
  const marks: XY[][] = [], seen = new Set<string>();
  for (const { frame: f } of yards) {
    const P = (x: number, d: number): XY => [f.A[0] + f.u[0] * x - f.n[0] * d, f.A[1] + f.u[1] * x - f.n[1] * d];
    let width = 3;
    while (width < 30 && inside(P(f.W / 2, width), streets)) width += 0.25;
    if (width >= 30) continue;
    for (let x = 3; x < f.W - 2; x += 7) {
      const a = P(x, width / 2), b = P(Math.min(x + 3, f.W - 1), width / 2);
      const key = a.map((v) => Math.round(v)).join(":");
      if (!seen.has(key) && inside(a, streets) && inside(b, streets)) { marks.push([a, b]); seen.add(key); }
    }
    // White edge lines beside the pedestrian verge.
    marks.push([P(0.7, 2.2), P(f.W - 0.7, 2.2)]);
  }
  return marks;
}

/** Small shared gardens only where a complete 20 m circle fits in green land. */
export function commonGardens(green: Multi, angle: number): Surface[] {
  const result: Surface[] = [], a = angle * Math.PI / 180;
  for (const poly of green) {
    if (area([poly]) < 400) continue;
    const xs = poly[0].map(p => p[0]), ys = poly[0].map(p => p[1]);
    const candidates: XY[] = [];
    for (let x = Math.min(...xs) + 10; x < Math.max(...xs) - 10; x += 5) {
      for (let y = Math.min(...ys) + 10; y < Math.max(...ys) - 10; y += 5) {
        if (Array.from({ length: 24 }, (_, i): XY => [x + 10 * Math.cos(i * Math.PI / 12), y + 10 * Math.sin(i * Math.PI / 12)]).every(p => inside(p, [poly]))) candidates.push([x, y]);
      }
    }
    if (!candidates.length) continue;
    const centre: XY = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    candidates.sort((p, q) => Math.hypot(p[0] - centre[0], p[1] - centre[1]) - Math.hypot(q[0] - centre[0], q[1] - centre[1]));
    const c = candidates[0];
    const P = (x: number, y: number): XY => [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)];
    const circle = (x: number, y: number, r: number, n = 24): XY[] => Array.from({ length: n + 1 }, (_, i) => P(x + r * Math.cos(i * 2 * Math.PI / n), y + r * Math.sin(i * 2 * Math.PI / n)));
    const shape = (k: PartKey, color: string, r: XY[]) => result.push({ k, color, r });
    shape("paved", "#cfc2a2", circle(0, 0, 9));
    shape("lawn", "#668844", circle(0, 0, 7.5));
    shape("gazebo", "#b18550", circle(-3, 0, 3, 6));
    const roof = circle(-3, 0, 3, 6);
    for (let i = 0; i < 6; i++) shape("gazebo", i % 2 ? "#b78750" : "#956535", [P(-3, 0), roof[i], roof[i + 1], P(-3, 0)]);
    shape("paved", "#d6aa65", circle(3.2, 0, 3.5));
    shape("paved", "#63a1af", [P(2, -1), P(4.7, -1), P(4.7, .2), P(2, .2), P(2, -1)]);
    shape("paved", "#ba6641", [P(3.3, -2), P(4.2, -2), P(4.2, 1.8), P(3.3, 1.8), P(3.3, -2)]);
    for (let i = 0; i < 10; i++) {
      const t = i * Math.PI / 5, x = Math.cos(t) * 6.5, y = Math.sin(t) * 6.5;
      if (Math.abs(y) < 3) continue;
      shape("lawn", "#3e6934", circle(x, y, 1.2, 12));
      shape("lawn", i % 2 ? "#92a653" : "#ba9aab", circle(x - .25, y + .25, .7, 12));
    }
  }
  return result;
}
