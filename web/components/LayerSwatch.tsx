import type { LayerDef } from "@/lib/layers";

// Газрын зурагтай ижил өнгөтэй жижиг тэмдэг
export default function LayerSwatch({ d }: { d: LayerDef }) {
  if (d.geom === "point") {
    return <svg className="swatch" viewBox="0 0 16 16"><circle cx="8" cy="8" r="4.5" fill={d.hue} stroke="#fff" strokeWidth="1.3" /></svg>;
  }
  if (d.geom === "line" && d.casing && d.ties) {
    // Газрын зурагтай ижил: бараан хүрээ, өнгөт шугам, цайвар тасархай дэр мод
    const p = "M1 12 C 5 3, 10 14, 15 4";
    return (
      <svg className="swatch" viewBox="0 0 16 16">
        <path d={p} fill="none" stroke={d.casing} strokeOpacity={0.8} strokeWidth={4.5} />
        <path d={p} fill="none" stroke={d.hue} strokeWidth={3.2} />
        <path d={p} fill="none" stroke={d.ties} strokeWidth={1.6} strokeDasharray="2.5 2.5" />
      </svg>
    );
  }
  if (d.geom === "line") {
    return (
      <svg className="swatch" viewBox="0 0 16 16">
        <path d="M1 12 C 5 3, 10 14, 15 4" fill="none" stroke={d.hue} strokeWidth={Math.min(3, (d.width ?? 1.2) + 0.6)}
          strokeDasharray={d.dash ? "3 2" : undefined} strokeLinecap="round" />
      </svg>
    );
  }
  const a = d.paint && !d.paint.values ? 0.55 : Math.max(d.fill ?? 0.3, 0.08);
  return (
    <span className="swatch swatchArea"
      style={{ background: `color-mix(in srgb, ${d.hue} ${a * 100}%, transparent)`, borderColor: d.hue,
        borderStyle: d.dash ? "dashed" : "solid" }} />
  );
}
