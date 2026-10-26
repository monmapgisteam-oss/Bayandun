// Алхам 5–7: CGA маягийн дүрмүүд — тогтмол бус блок дээр (Selbe CE_PROJECT/rules):
//   lot_chat.cga (offset → BuildingRing → Courtyard), building_apartment.cga (давхраар), building_commercial.cga,
//   Pocket_Park.cga, zoning.cga (TreeDistribution), reparking.cga, road/Sidewalk/Bike_road/Lane_with_Crosswalk.
import {
  add, area, bbox, bufMany, bufPath, bufPoly, circle, clipPath, diff, dot, inside, inter, labelPt, lineThrough, mul, norm,
  obb, orientedRect, parts, pathLength, perp, rng, sub, unionAll, along, type Path, type Rings, type XY,
} from "./geom";
import type { Lot, LotUse, Street, StreetCls } from "./layout";
import type { Graph } from "./network";
import { GROUND, TREE, type GroundKind, type MassKind } from "./zoning";

export type Attrs = {
  acceptFootprint?: (rings:Rings)=>boolean;
  setback: number; depth: number; maxLen: number; gapEnd: number; floorsRes: number; floorH: number; sunK: number;
  bcrRes: number; openSouth: boolean; comGround: boolean;
  floorsCom: number; bcrCom: number; comPodium: number; floorsSchool: number; floorsKinder: number; floorsClinic: number;
  walkW: number; bikeW: number; laneW: number; treeSp: number; parkBays: number; pvShare: number; greenRoof: number;
  stopSp: number;
  floorGrad: number; hubs?: XY[]; hubR?: number; // төвөөс холдох тусам давхар буурах (0 = жигд)
};

export type GroundF = { rings: Rings; k: GroundKind; lot: number };
export type MarkF = { rings: Rings; k: "cross" | "stall" };
export type LaneF = { path: Path; k: "center" | "lane" | "edge" };
export type MassF = { rings: Rings; z0: number; h: number; k: MassKind; bid: number; fl: number };
export type TreeF = { x: number; y: number; t: number; h: number; r: number };
export type BldgF = {
  id: number; lot: number; use: LotUse; kind: MassKind; floors: number; fh: number; h: number; podium: number;
  foot: number; gfa: number; gfaRes: number; gfaCom: number; roof: MassKind; rings: Rings; c: XY;
};
export type Report = Record<string, number>;
export type Scene = {
  streets: GroundF[]; base: GroundF[]; over: GroundF[]; marks: MarkF[]; lanes: LaneF[]; masses: MassF[]; trees: TreeF[];
  bldgs: BldgF[]; stops: XY[]; rep: Report; lotBcr: Map<number, number>;
};

class Gen {
  s: Scene = { streets: [], base: [], over: [], marks: [], lanes: [], masses: [], trees: [], bldgs: [], stops: [], rep: {}, lotBcr: new Map() };
  rnd = rng(1);
  lot = 0;
  a: Attrs;
  constructor(a: Attrs) { this.a = a; }
  report(k: string, v: number) { this.s.rep[k] = (this.s.rep[k] ?? 0) + v; }
  /** Суурь гадаргуу */
  base(k: GroundKind, r: Rings) { if (!r.length) return; this.s.base.push({ rings: r, k, lot: this.lot }); this.report(`g.${k}`, area(r)); }
  /** Дээр давхарласан гадаргуу — доорхоос талбайг хасна */
  over(k: GroundKind, r: Rings, under: GroundKind) {
    if (!r.length) return 0;
    const a = area(r);
    this.s.over.push({ rings: r, k, lot: this.lot }); this.report(`g.${k}`, a); this.report(`g.${under}`, -a);
    return a;
  }
  tree(x: number, y: number, t: number, s = 1) {
    const k = s * (0.8 + 0.4 * this.rnd());
    this.s.trees.push({ x, y, t, h: TREE[t].h * k, r: TREE[t].r * k });
    this.report("trees", 1);
  }
  pick(mix: number[]) { let x = this.rnd() * mix.reduce((s, v) => s + v, 0); for (let i = 0; i < mix.length; i++) { x -= mix[i]; if (x <= 0) return i; } return 0; }
  /** scatter(surface) — jitter тор, avoid-оос зайлсхийнэ */
  scatter(r: Rings, sp: number, mix = [0.35, 0.45, 0.2], avoid: Rings = []) {
    const b = bbox(r);
    for (let x = b.x0 + sp / 2; x < b.x1; x += sp) for (let y = b.y0 + sp / 2; y < b.y1; y += sp) {
      const px = x + (this.rnd() - 0.5) * sp * 0.7, py = y + (this.rnd() - 0.5) * sp * 0.7;
      if (inside(px, py, r) && !(avoid.length && inside(px, py, avoid))) this.tree(px, py, this.pick(mix));
    }
  }
  /** Шугамын дагуу модны эгнээ */
  row(path: Path, sp: number, t: number, within: Rings, avoid: Rings = []) {
    const L = pathLength(path);
    for (let s = sp / 2; s < L; s += sp) {
      const { pt } = along(path, s);
      if (inside(pt[0], pt[1], within) && !(avoid.length && inside(pt[0], pt[1], avoid))) this.tree(pt[0], pt[1], t);
    }
  }
  /** extrude(Floors × FloorHeight) → split(y){ FloorHeight : Floor }* + парапет */
  building(rings: Rings, o: { use: LotUse; kind: MassKind; floors: number; fh: number; podium?: number; roof?: MassKind; under?: GroundKind }) {
    const foot = area(rings);
    if (foot < 40 || this.a.acceptFootprint && !this.a.acceptFootprint(rings)) return null;
    const id = this.s.bldgs.length + 1, podium = Math.min(o.podium ?? 0, o.floors);
    for (let i = 0; i < o.floors; i++) this.s.masses.push({ rings, z0: i * o.fh, h: o.fh, k: i < podium ? "com" : o.kind, bid: id, fl: i + 1 });
    const x = this.rnd();
    const roof: MassKind = o.roof ?? (x < this.a.pvShare ? "pv" : x < this.a.pvShare + this.a.greenRoof ? "groof" : "roof");
    this.s.masses.push({ rings, z0: o.floors * o.fh, h: 0.4, k: roof, bid: id, fl: 0 });
    const gfa = foot * o.floors, gfaCom = foot * podium;
    const b: BldgF = {
      id, lot: this.lot, use: o.use, kind: o.kind, floors: o.floors, fh: o.fh, h: o.floors * o.fh + 0.4, podium,
      foot, gfa, gfaRes: o.kind === "res" ? gfa - gfaCom : 0, gfaCom, roof, rings, c: labelPt(rings),
    };
    this.s.bldgs.push(b);
    this.report("foot", foot); this.report(`roof.${roof}`, foot);
    if (o.under) this.report(`g.${o.under}`, -foot);
    return b;
  }
  /** reparking.cga — асфальт + 2.5 м тутамд зураас (урд ирмэгээс 5 м) */
  parking(r: Rings, under: GroundKind) {
    if (!r.length) return 0;
    this.over("parking", r, under);
    const b = bbox(r);
    let n = 0;
    for (let x = b.x0 + 1.25; x < b.x1; x += 2.5) {
      const stripe: Rings = [orientedRect([x, b.y0 + 3], [0, 1], 5, 0.12)];
      if ([[x, b.y0 + 1], [x, b.y0 + 5]].every(([px, py]) => inside(px, py, r))) { this.s.marks.push({ rings: stripe, k: "stall" }); n++; }
    }
    this.report("stalls", n);
    return n;
  }
}

// ---------- Барилгын цагираг (lot_chat.cga BuildingRing) ----------
/** offset(-setback) хүрээнээс гүнээр цагираг гаргаж, ирмэг бүрт maxLen тутамд гарц үлдээн секцэд хуваана */
function ringSections(B0: Rings, B1: Rings, depth: number, maxLen: number, gap: number): Rings[] {
  const ring = B1.length ? diff(B0, B1) : B0;
  const gaps: Rings[] = [];
  for (const r of B0) for (let i = 0; i + 1 < r.length; i++) {
    const e = sub(r[i + 1], r[i]), L = Math.hypot(e[0], e[1]);
    if (L < 1) continue;
    const u = norm(e), n = Math.ceil((L + gap) / (maxLen + gap));
    for (let k = 1; k < n; k++) {
      const p = add(r[i], mul(u, (L * k) / n));
      gaps.push([orientedRect(p, u, gap, depth * 3)]);
    }
  }
  const cutR = gaps.length ? diff(ring, unionAll(gaps)) : ring;
  // Баяндун: амины байшин, гэр (≈8×10 м) зэрэг жижиг барилгыг хаяхгүйн тулд доод хэмжээг барилгын хэмжээнээс (Бөөрөлжүүт: 120 м²)
  return parts(cutR).filter((q) => area(q) > Math.min(120, 0.6 * depth * maxLen));
}

/** Хашааны дотор урд зүгт харсан (Зүүн–Баруун) эгнээнүүд — нарны зай sunK × H */
function interiorBars(B1: Rings, depth: number, gap: number, sunGap: number, maxLen: number, first = sunGap): Rings[] {
  if (!B1.length) return [];
  const inner = bufPoly(B1, -gap);
  if (!inner.length) return [];
  const b = bbox(B1);
  const out: Rings[] = [];
  for (let y = b.y1 - first; y - depth > b.y0 + (first ? Math.max(22, 0.6 * sunGap) : 0); y -= sunGap + depth) {
    const strip: Rings = [orientedRect([(b.x0 + b.x1) / 2, y - depth / 2], [1, 0], b.x1 - b.x0 + 10, depth)];
    for (const q of parts(inter(inner, strip))) {
      const bb = bbox(q), W = bb.x1 - bb.x0;
      if (W < Math.min(20, maxLen)) continue; // Баяндун: жижиг байшинд (Бөөрөлжүүт: 20 м)
      const n = Math.ceil((W + gap) / (maxLen + gap));
      const cuts: Rings[] = [];
      for (let k = 1; k < n; k++) cuts.push([orientedRect([bb.x0 + (W * k) / n, y - depth / 2], [1, 0], gap, depth * 2)]);
      out.push(...parts(cuts.length ? diff(q, unionAll(cuts)) : q).filter((x) => area(x) > Math.min(150, 0.6 * depth * maxLen)));
    }
  }
  return out;
}

/** Хашаан доторх lot_chat CourtyardArea: хөндлөн зам, төв талбай/тоглоом, зогсоол, мод */
function courtyard(g: Gen, CY: Rings, play: boolean, bays: number, avoid: Rings) {
  if (!CY.length || area(CY) < 300) return;
  let yard = CY;
  if (bays > 0) {
    const b = bbox(CY);
    const band: Rings = [orientedRect([(b.x0 + b.x1) / 2, b.y0 + 5.5], [1, 0], b.x1 - b.x0 + 10, 11)];
    const pk = inter(CY, band);
    if (area(pk) > 150) { g.parking(pk, "grass"); yard = diff(CY, band); }
  }
  const o = obb(yard);
  const paths = [...clipPath([lineThrough(o.c, o.u, o.len)], yard), ...clipPath([lineThrough(o.c, o.v, o.wid)], yard)];
  const walk = bufMany(paths.map((p) => ({ paths: [p], d: 1.5 })));
  const cr = Math.min(14, Math.sqrt(area(yard)) / 5);
  const plaza = inter([circle(labelPt(yard), cr)], yard);
  g.over("walk", diff(walk, plaza), "grass");
  g.over(play ? "play" : "plaza", plaza, "grass");
  g.scatter(yard, 10, [0.3, 0.5, 0.2], unionAll([walk, plaza, avoid]));
}

// ---------- Дүрмүүд ----------
/** Орон сууцны давхар: төвд floorsRes × (1 + grad/2), захад × (1 − grad/2) */
function resFloors(a: Attrs, c: XY) {
  if (!a.floorGrad || !a.hubs?.length || !a.hubR) return a.floorsRes;
  const d = Math.min(...a.hubs.map((h) => Math.hypot(h[0] - c[0], h[1] - c[1])));
  const t = Math.max(0, 1 - d / a.hubR);
  return Math.max(2, Math.round(a.floorsRes * (1 + a.floorGrad * (t - 0.5))));
}

function residential(g: Gen, L: Lot) {
  const a = g.a, floors = resFloors(a, L.c), H = floors * a.floorH;
  g.base("grass", L.rings);
  const B0 = bufPoly(L.rings, -a.setback), B1 = bufPoly(L.rings, -(a.setback + a.depth));
  g.row(L.rings[0] ?? [], a.treeSp, 1, diff(L.rings, B0));
  if (!B0.length) return;
  const cen = labelPt(L.rings);
  const target = (a.bcrRes / 100) * L.area;
  // Баяндун: амины байшингийн горим (≤2 давхар, байшин ≤15 м) — блокийг байшин бүрт хашааны зайтай жигд тороор дүүргэнэ.
  // Нэг байшингийн хашаа ≈ (урт + зай) × (гүн + max(зай, нарны зай)) — ТААМАГЛАЛ, нэгж талбарын хил биш.
  if (floors <= 2 && a.maxLen <= 15) {
    const o = obb(L.rings), sx = a.maxLen + a.gapEnd, sy = a.depth + Math.max(a.gapEnd, a.sunK * H);
    const nx = Math.ceil(o.len / 2 / sx), ny = Math.ceil(o.wid / 2 / sy);
    let foot = 0;
    for (let j = -ny; j <= ny; j++) for (let i = -nx; i <= nx; i++) {
      const r: Rings = [orientedRect(add(o.c, add(mul(o.u, i * sx), mul(o.v, j * sy))), o.u, a.maxLen, a.depth)];
      if (!r[0].every((p) => inside(p[0], p[1], B0)) || foot + area(r) > target) continue;
      if (g.building(r, { use: "res", kind: "res", floors, fh: a.floorH, podium: 0, under: "grass" })) foot += area(r);
    }
    g.s.lotBcr.set(L.id, foot / L.area);
    return;
  }
  // (A) Хашаат: цагираг + дотор эгнээ; (B) Зэрэгцээ эгнээ: B0 даяар урд зүгт харсан секц. Зорилтод ойр нь.
  let secs = ringSections(B0, B1, a.depth, a.maxLen, a.gapEnd);
  // Урд тал нээлттэй (U): урд талын секцүүдийг хасна
  if (a.openSouth && B1.length) secs = secs.filter((q) => { const d = sub(labelPt(q), cen); return !(d[1] < -0.55 * Math.hypot(d[0], d[1])); });
  secs.sort((p, q) => labelPt(q)[1] - labelPt(p)[1]); // хойд талаас эхэлнэ
  const podiumA = a.comGround && L.edge !== "local" && floors > 1 ? 1 : 0; // Баяндун: 1 давхар байшинг бүхэлд нь үйлчилгээ болгохгүй
  const candA = [...secs.map((q) => [q, podiumA] as const), ...interiorBars(B1, a.depth, a.gapEnd, a.sunK * H, a.maxLen).map((q) => [q, 0] as const)];
  const candB = interiorBars(B0, a.depth, a.gapEnd, a.sunK * H, a.maxLen, a.gapEnd).map((q, i) => [q, i === 0 ? podiumA : 0] as const);
  const cap = (c: readonly (readonly [Rings, number])[]) => { let s = 0; for (const [q] of c) { const x = area(q); if (s + x * 0.5 <= target) s += x; } return s; };
  const cand = Math.abs(cap(candB) - target) < Math.abs(cap(candA) - target) - 0.05 * target ? candB : candA;
  // BCR-ийн зорилтод хүртэл секц нэмнэ
  let foot = 0;
  const built: Rings[] = [];
  for (const [q, podium] of cand) {
    const fa = area(q);
    if (foot + fa * 0.5 > target) continue;
    if (g.building(q, { use: "res", kind: "res", floors, fh: a.floorH, podium, under: "grass" })) { foot += fa; built.push(q); }
  }
  g.s.lotBcr.set(L.id, foot / L.area);
  const bu = unionAll(built);
  courtyard(g, diff(B1.length ? B1 : B0, bu), true, a.parkBays, bu);
}

function commercial(g: Gen, L: Lot) {
  const a = g.a;
  g.base("plaza", L.rings);
  const B0 = bufPoly(L.rings, -Math.max(3, a.setback * 0.5)), B1 = bufPoly(L.rings, -(Math.max(3, a.setback * 0.5) + 16));
  g.row(L.rings[0] ?? [], a.treeSp * 1.2, 1, diff(L.rings, B0));
  if (!B0.length) return;
  const secs = ringSections(B0, B1, 16, a.maxLen * 1.5, a.gapEnd);
  const target = (a.bcrCom / 100) * L.area;
  let foot = 0;
  const built: Rings[] = [];
  for (const q of secs.sort((p, q2) => area(q2) - area(p))) {
    if (foot + area(q) * 0.5 > target) continue;
    const upper: MassKind = g.rnd() < 0.5 ? "res" : "office";
    if (g.building(q, { use: "com", kind: upper, floors: a.floorsCom, fh: 3.3, podium: a.comPodium, under: "plaza" })) { foot += area(q); built.push(q); }
  }
  g.s.lotBcr.set(L.id, foot / L.area);
  const bu = unionAll(built);
  const CY = diff(B1.length ? B1 : [], bu);
  if (CY.length) { courtyard(g, CY, false, a.parkBays, bu); }
}

/** OBB-ийн хойд талд байрлах тэгш өнцөгт барилга */
function northBar(L: Lot, B0: Rings, len: number, depth: number, offset = 0): Rings {
  const o = obb(B0.length ? B0 : L.rings);
  const nv = dot(o.v, [0, 1]) >= 0 ? o.v : mul(o.v, -1);
  const c = add(o.c, mul(nv, o.wid / 2 - depth / 2 - offset));
  return inter([orientedRect(c, o.u, Math.min(len, o.len * 0.8), depth)], B0);
}

function school(g: Gen, L: Lot) {
  const a = g.a;
  g.base("grass", L.rings);
  const B0 = bufPoly(L.rings, -a.setback);
  g.row(L.rings[0] ?? [], a.treeSp, 1, diff(L.rings, B0));
  if (!B0.length) return;
  const main = northBar(L, B0, 90, 16);
  const blds: Rings[] = [];
  if (g.building(main, { use: "school", kind: "school", floors: a.floorsSchool, fh: 3.6, under: "grass" })) blds.push(main);
  const o = obb(B0), nv = dot(o.v, [0, 1]) >= 0 ? o.v : mul(o.v, -1);
  // Спорт талбай + гүйлтийн зам (урд тал)
  const fc = add(o.c, mul(nv, -o.wid / 4));
  for (const [fl, fw] of [[80, 50], [60, 38], [40, 26]]) {
    const f: Rings = [orientedRect(fc, o.u, fl, fw)];
    if (area(inter(f, B0)) > 0.97 * fl * fw) {
      g.over("track", diff(f, bufPoly(f, -4)), "grass");
      g.over("sport", bufPoly(f, -4), "grass");
      blds.push(f);
      break;
    }
  }
  const front = inter([orientedRect(add(o.c, mul(nv, o.wid / 2 - 22)), o.u, 30, 10)], B0);
  g.over("plaza", diff(front, unionAll(blds)), "grass");
  g.scatter(B0, 11, [0.3, 0.5, 0.2], bufPoly(unionAll([...blds, front]), 3));
}

function kinder(g: Gen, L: Lot) {
  const a = g.a;
  g.base("grass", L.rings);
  const B0 = bufPoly(L.rings, -4);
  if (!B0.length) return;
  const bar = northBar(L, B0, 45, 14);
  g.building(bar, { use: "kinder", kind: "kinder", floors: a.floorsKinder, fh: 3.3, under: "grass" });
  const o = obb(B0), nv = dot(o.v, [0, 1]) >= 0 ? o.v : mul(o.v, -1);
  const pc = add(o.c, mul(nv, -o.wid / 5));
  const plays: Rings[] = [];
  for (const k of [-1, 0, 1]) {
    const p = inter([orientedRect(add(pc, mul(o.u, k * Math.min(22, o.len / 3.5))), o.u, 16, 12)], B0);
    if (area(p) > 60) { g.over("play", p, "grass"); plays.push(p); }
  }
  g.scatter(B0, 8, [0.2, 0.5, 0.3], bufPoly(unionAll([bar, ...plays]), 2));
}

function clinic(g: Gen, L: Lot) {
  const a = g.a;
  g.base("grass", L.rings);
  const B0 = bufPoly(L.rings, -a.setback);
  if (!B0.length) return;
  const bar = northBar(L, B0, 70, 18);
  g.building(bar, { use: "clinic", kind: "clinic", floors: a.floorsClinic, fh: 3.6, under: "grass" });
  const b = bbox(B0);
  const pk = inter(B0, [orientedRect([(b.x0 + b.x1) / 2, b.y0 + 5.5], [1, 0], b.x1 - b.x0 + 10, 11)]);
  g.parking(diff(pk, bar), "grass");
  g.scatter(B0, 9, [0.3, 0.5, 0.2], bufPoly(unionAll([bar, pk]), 2));
}

/** Pocket_Park.cga: захын ногоон, тойрог зам, загалмай зам, төв талбай */
function park(g: Gen, L: Lot) {
  g.base("grass", L.rings);
  const inner = bufPoly(L.rings, -10);
  const o = obb(L.rings);
  const loop = inner.length ? bufPath(inner.map((r) => r), 1.8) : [];
  const cross = bufMany([...clipPath([lineThrough(o.c, o.u, o.len)], L.rings), ...clipPath([lineThrough(o.c, o.v, o.wid)], L.rings)].map((p) => ({ paths: [p], d: 2 })));
  const plaza = inter([circle(labelPt(L.rings), Math.min(22, Math.sqrt(L.area) / 8))], L.rings);
  g.over("walk", diff(unionAll([loop, cross]), plaza), "grass");
  g.over("plaza", plaza, "grass");
  g.scatter(L.rings, 13, [0.4, 0.45, 0.15], bufPoly(unionAll([loop, cross, plaza]), 2));
}

/** zoning.cga ProtectiveGreenSpace — TreeDistribution(Tree_Count × 2): шилмүүст модны эгнээ */
function protect(g: Gen, L: Lot) {
  g.base("protect", L.rings);
  const o = obb(L.rings);
  for (let t = -o.wid / 2; t < o.wid / 2; t += 6) {
    const p = clipPath([lineThrough(add(o.c, mul(o.v, t)), o.u, o.len)], L.rings);
    for (const q of p) g.row(q, 5, 0, L.rings);
  }
}

/** Инженерийн байгууламж: 0 цэвэрлэх байгууламж, 1 усан сан, 2 дулааны станц, 3 дэд станц */
function eng(g: Gen, L: Lot) {
  g.base("yard", L.rings);
  const c = labelPt(L.rings), f = (L.fac ?? 0) % 4, o = obb(L.rings);
  const put = (r: Rings, h: number, roof: MassKind = "roof") => g.building(inter(r, L.rings), { use: "eng", kind: "eng", floors: 1, fh: h, roof, under: "yard" });
  if (f === 0) {
    for (const k of [-1, 1]) put([circle(add(c, mul(o.u, k * 18)), 12)], 4);
    put([orientedRect(add(c, mul(o.v, 25)), o.u, 24, 12)], 6);
  } else if (f === 1) {
    put([circle(c, 16)], 6);
  } else if (f === 2) {
    put([orientedRect(c, o.u, 36, 22)], 12);
    put([circle(add(c, mul(o.u, 26)), 2.5, 12)], 45);
  } else {
    put([orientedRect(c, o.u, 22, 12)], 6);
  }
  g.row(L.rings[0] ?? [], 7, 0, L.rings);
}

const RULES: Record<LotUse, (g: Gen, l: Lot) => void> = { res: residential, com: commercial, school, kinder, clinic, park, protect, eng };

// ---------- Гудамж (road.cga, Sidewalk_ob.cga, Bike_road.cga, Lane_with_Crosswalk.cga) ----------
export function section(cls: StreetCls, W: number, a: Attrs) {
  const walk = cls === "local" ? Math.max(2, a.walkW - 0.5) : a.walkW;
  const bike = cls === "local" ? 0 : a.bikeW;
  const median = cls === "arterial" ? 4 : 0;
  let lanes = cls === "arterial" ? 2 : 1; // нэг чиглэлд
  let verge = 0;
  for (;;) { verge = (W - 2 * (walk + bike) - 2 * lanes * a.laneW - median) / 2; if (verge >= 0 || lanes === 1) break; lanes--; }
  verge = Math.max(0, verge);
  const road = lanes * a.laneW + median / 2; // тэнхлэгээс замын ирмэг хүртэл
  return { walk, bike, verge, median, lanes, road, half: W / 2 };
}

function streets(g: Gen, list: Street[], graph: Graph, site: Rings) {
  const a = g.a;
  const S = list.map((s) => ({ s, x: section(s.cls, s.w, a) }));
  const inSite = (r: Rings, ext?: boolean) => (ext ? r : inter(r, site));
  const jn = graph.nodes.filter((n) => n.deg >= 3);
  const discs = unionAll(jn.map((n) => [circle([n.x, n.y], n.r + 1, 16)]));
  for (const ext of [false, true]) {
    const T = S.filter((q) => !!q.s.ext === ext);
    if (!T.length) continue;
    const U = (f: (q: (typeof S)[number]) => number) => inSite(bufMany(T.map((q) => ({ paths: [q.s.path], d: f(q) }))), ext);
    const u1 = U((q) => q.x.half), u2 = U((q) => (q.x.bike ? q.x.half - q.x.walk : 0));
    const u3 = U((q) => q.x.half - q.x.walk - q.x.bike), u4 = U((q) => q.x.road), u5 = diff(U((q) => q.x.median / 2), discs);
    const put = (k: GroundKind, r: Rings) => { if (r.length) { g.s.streets.push({ rings: r, k, lot: 0 }); g.report(`${ext ? "x" : "g"}.${k}`, area(r)); } };
    put("sidewalk", diff(u1, unionAll([u2, u3])));
    put("bike", diff(u2, u3));
    put("verge", diff(u3, u4));
    put("road", diff(u4, u5));
    put("verge", u5);
  }
  // Уулзвар дотор ногоон тусгаарлах зурвас ба эгнээний зураас үргэлжлэхгүй.
  for (const { s, x } of S) {
    if (s.ext) continue;
    // Эгнээний зураас — offset шугам (тэнхлэгээс ±k × laneW)
    const offs: [number, LaneF["k"]][] = s.cls === "arterial"
      ? [...Array.from({ length: x.lanes - 1 }, (_, k) => [x.median / 2 + (k + 1) * a.laneW, "lane"] as [number, LaneF["k"]])]
      : [[0, "center"]];
    offs.push([x.road - .2, "edge"]);
    if(x.median)offs.push([x.median/2+.2,"edge"]);
    for (const [d, k] of offs) for (const sign of d ? [1, -1] : [1]) {
      const p = s.path.map((pt, i) => {
        const dir = norm(sub(s.path[Math.min(i + 1, s.path.length - 1)], s.path[Math.max(i - 1, 0)]));
        return add(pt, mul(perp(dir), sign * d));
      });
      for (const q of clipPath([p], diff(site, discs))) g.s.lanes.push({ path: q, k });
    }
    // Замын мод — ногоон зурвасын голоор
    if (x.verge >= 2) for (const sign of [1, -1]) {
      const d = x.road + x.verge / 2;
      const p = s.path.map((pt, i) => {
        const dir = norm(sub(s.path[Math.min(i + 1, s.path.length - 1)], s.path[Math.max(i - 1, 0)]));
        return add(pt, mul(perp(dir), sign * d));
      });
      g.row(p, a.treeSp, x.verge >= 4 ? 1 : 2, site, discs);
    }
    // Автобусны буудал (магистраль, цуглуулах)
    if (s.cls !== "local") for (let t = 150; t < pathLength(s.path); t += a.stopSp) {
      const { pt, dir } = along(s.path, t);
      const q = add(pt, mul(perp(dir), x.road + 1));
      if (inside(q[0], q[1], site) && !inside(q[0], q[1], discs)) g.s.stops.push(q);
    }
  }
  const carriageways=unionAll(g.s.streets.filter(s=>s.k==="road").map(s=>s.rings));
  // Явган гарц: уулзвар бүрийн ирмэг тус бүрт
  for (let ni = 0; ni < graph.nodes.length; ni++) {
    const n = graph.nodes[ni];
    if (n.deg < 3 || n.cls === "local") continue;
    for (const ek of graph.adj[ni]) {
      const e = graph.edges[ek], m = graph.nodes[e.a === ni ? e.b : e.a];
      const d = norm(sub([m.x, m.y], [n.x, n.y]));
      const x = section(e.cls, e.w, a);
      const c = add([n.x, n.y], mul(d, n.r + 4));
      let k = 0;
      for (let t = -x.road + 0.5; t < x.road; t += 1.0) {
        const stripe=inter([orientedRect(add(c, mul(perp(d), t)), d, 4, 0.5)],carriageways);
        if(stripe.length){g.s.marks.push({ rings:stripe, k:"cross" });k++;}
      }
      if (k) g.report("crosswalks", 1);
    }
  }
  g.report("junctions", jn.length);
  for (const s of list) if (!s.ext) g.report(`len.${s.cls}`, pathLength(s.path));
}

/** Бүх lot, гудамжинд дүрэм ажиллуулна */
export function generate(lots: Lot[], streetList: Street[], graph: Graph, site: Rings, a: Attrs, walkCuts: Path[]): Scene {
  const g = new Gen(a);
  streets(g, streetList, graph, site);
  // Lot хоорондын явган зам (сургууль, инженерийн lot, цэцэрлэгийн хэсэг)
  const wk = inter(bufMany(walkCuts.map((p) => ({ paths: [p], d: 3 }))), site);
  if (wk.length) { g.s.base.push({ rings: wk, k: "walk", lot: 0 }); g.report("g.walk", area(wk)); }
  for (const l of lots) {
    g.lot = l.id; g.rnd = rng(l.id);
    RULES[l.use](g, l);
  }
  return g.s;
}

/** Урсацын жигнэсэн коэффициент (дээвэр 0.9) — rational method жишиг, ТААМАГЛАЛ */
export function runoffC(rep: Report) {
  let s = 0, A = 0;
  for (const [k, v] of Object.entries(GROUND)) { const x = rep[`g.${k}`] ?? 0; s += x * v.C; A += x; }
  s += (rep.foot ?? 0) * 0.9; A += rep.foot ?? 0;
  return A ? s / A : 0;
}

