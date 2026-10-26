// Хөрш (олгогдсон) нэгж талбарын тор: бүлэг бүрийн чиглэл, нүүр/гүн, эгнээний давтамж, зангуу цэг (UTM 49N).
// Бүлэг = нүүрний ирмэгийн чиглэл ±1°-д ижил талбарууд. Нүүр = богино тал (Сансар гудамжинд 40 м), гүн = урт тал (50 м).
import type { XY } from "./plan.ts";

export type NeighborGroup = { angle: number; n: number; dist: number; lotW: number; lotD: number; pitch: number; anchor: XY; ids: string[] };

const rot = ([x, y]: XY, t: number): XY => [x * Math.cos(t) - y * Math.sin(t), x * Math.sin(t) + y * Math.cos(t)];

export function neighborGroups(parcels: { id: string; ring: XY[] }[], center: XY, radius = 450): NeighborGroup[] {
  const near = parcels.map((p) => {
    const r = p.ring.length > 1 && p.ring[0][0] === p.ring.at(-1)![0] && p.ring[0][1] === p.ring.at(-1)![1] ? p.ring.slice(0, -1) : p.ring;
    const c = r.reduce((s, q) => [s[0] + q[0] / r.length, s[1] + q[1] / r.length] as XY, [0, 0] as XY);
    const edges = r.map((q, i) => { const n = r[(i + 1) % r.length]; return { L: Math.hypot(n[0] - q[0], n[1] - q[1]), a: ((Math.atan2(n[1] - q[1], n[0] - q[0]) * 180) / Math.PI % 180 + 180) % 180 }; }).filter((e) => e.L > 1);
    return { id: p.id, r, c, edges, dist: Math.hypot(c[0] - center[0], c[1] - center[1]) };
  }).filter((p) => p.dist < radius && p.edges.length === 4);
  const groups: { angle: number; items: typeof near }[] = [];
  for (const p of near) {
    const short = p.edges.reduce((a, e) => (e.L < a.L ? e : a));
    const g = groups.find((q) => Math.abs(q.angle - short.a) < 1 || Math.abs(Math.abs(q.angle - short.a) - 180) < 1);
    if (g) g.items.push(p); else groups.push({ angle: short.a, items: [p] });
  }
  return groups.filter((g) => g.items.length >= 3).map((g) => {
    const t = (-g.angle * Math.PI) / 180;
    const ext = g.items.map((p) => { const cs = p.r.map((q) => rot(q, t)); return { u0: Math.min(...cs.map((q) => q[0])), u1: Math.max(...cs.map((q) => q[0])), v0: Math.min(...cs.map((q) => q[1])), v1: Math.max(...cs.map((q) => q[1])) }; });
    const lotW = median(ext.map((e) => e.u1 - e.u0)), lotD = median(ext.map((e) => e.v1 - e.v0));
    // Эгнээний доод ирмэг (v0)-ийг 1 м-ээр бүлэглэж давтамжийг олно: ар араасаа залгасан эгнээ (зөрүү ≈ гүн) бол хос эгнээ
    const vs: number[] = [];
    for (const v of ext.map((e) => e.v0).sort((a, b) => a - b)) if (!vs.length || v - vs.at(-1)! > 1) vs.push(v);
    const diffs = vs.slice(1).map((v, i) => v - vs[i]);
    const gaps = diffs.filter((d) => d > lotD + 2), paired = diffs.some((d) => Math.abs(d - lotD) < 2);
    const pitch = gaps.length ? median(gaps) + (paired ? lotD : 0) : 0;
    const u0 = Math.min(...ext.map((e) => e.u0));
    return { angle: Math.round(g.angle * 10) / 10, n: g.items.length, dist: Math.round(Math.min(...g.items.map((p) => p.dist))), lotW: Math.round(lotW * 10) / 10, lotD: Math.round(lotD * 10) / 10, pitch: Math.round(pitch * 10) / 10, anchor: rot([u0, vs[0]], -t), ids: g.items.map((p) => p.id) };
  }).sort((a, b) => a.dist - b.dist);
}
function median(a: number[]) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }
