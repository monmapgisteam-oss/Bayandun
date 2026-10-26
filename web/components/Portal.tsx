"use client";
// Баяндун — Бөөрөлжүүт-ын Portal-ын бүтэц: толгой · цэс · газрын зураг · самбар.
// 01 Нэгж талбарын хуваалт (lib/plan.ts) · 02 Суурьшлын бүсийн загвар (Бөөрөлжүүт-ын UrbanPlan) — нэг ArcGIS газрын зураг.
import {MasterPlanProvider} from './MasterPlanContext';
import AnalysisWorkspace from "./AnalysisWorkspace";
import WorkspaceIcon from "./WorkspaceIcon";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type EsriMap from "@arcgis/core/Map";
import MapCanvas, { type AnyView, type Dim, type Pick } from "./MapCanvas";
import type { Zone } from "./sections/UrbanPlan";
import MapTools from "./MapTools";
import LayerSwatch from "./LayerSwatch";
import { MapCtx, type MapState } from "./MapCtx";
import {PlanningProvider} from "./PlanningContext";
import { ALWAYS_ON_IDS, INITIAL_VISIBLE, LAYER_BY_ID, SECTIONS, ZONE_LAYER_URL, ZONE_WHERE } from "@/lib/layers";
import { cleanName as clean } from "@/lib/zones";

const loading = () => <div className="panelBody" role="status">Ачаалж байна…</div>;
const UrbanPlan = dynamic(() => import("./sections/UrbanPlan"), { loading });
const Workspace = dynamic(() => import("./Workspace"), { loading });
const LayerCatalog = dynamic(() => import("./LayerCatalog"), { loading });
const OpacityPanel = dynamic(() => import("./OpacityPanel"), { loading });

const ICON = { 1: "overview", 3: "urban" } as const;

/** Зөвхөн анх нээхэд ачаална; хэсэг солиход хадгалаагүй ажлыг хэвээр үлдээнэ. */
function Visited({ active, children }: { active: boolean; children: ReactNode }) {
  const [visited, setVisited] = useState(active);
  useEffect(() => { if (active) setVisited(true); }, [active]);
  return active || visited ? <>{children}</> : null;
}

const fmt = (v: unknown, unit?: string) => {
  if (v == null || v === "") return "—";
  const s = typeof v === "number" ? v.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(v);
  return unit ? `${s} ${unit}` : s;
};
const HIDDEN = /^(OBJECTID|oid|Shape__|Shape_Le|Join_Count|TARGET_FID|gid)$/;

export default function Portal() {
  return <MasterPlanProvider><PlanningProvider><PortalShell /></PlanningProvider></MasterPlanProvider>;
}

function PortalShell() {
  const [dim, setDim] = useState<Dim>("2d");
  const [visible, setVisible] = useState<string[]>(INITIAL_VISIBLE);
  const [opacity, setOpacity] = useState<Record<string, number>>({});
  const [catalogOn, setCatalogOn] = useState(false);
  const [opacityOn, setOpacityOn] = useState(false);
  const [picked, setPicked] = useState<Pick | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [zones, setZones] = useState<Zone[] | null>(null);
  const [urbanZoneSel, setUrbanZoneSel] = useState<number | null>(null);
  const [sec, setSec] = useState(1);
  const [map, setMap] = useState<EsriMap | null>(null);
  const [view, setView] = useState<AnyView | null>(null);
  const api = useRef<{ home: () => void } | null>(null);
  const ctx = useMemo<MapState>(() => ({
    map, view, dim, setDim,
    showLayers: (ids) => setVisible((v) => [...new Set([...v, ...ids])]),
  }), [map, view, dim]);

  // Бүсийн жагсаалт — локал FeatureServer (app/api/site)
  useEffect(() => {
    const q = new URLSearchParams({ where: ZONE_WHERE, outFields: "OBJECTID,ID,Name,Hectare,Type", returnGeometry: "false", f: "json" });
    fetch(`${ZONE_LAYER_URL}/query?${q}`).then((r) => r.json())
      .then((d: { features?: { attributes: Record<string, unknown> }[] }) => {
        setZones((d.features ?? []).map(({ attributes: a }) => ({ oid: Number(a.OBJECTID), id: Number(a.ID), name: clean(a.Name), ha: Number(a.Hectare), type: clean(a.Type) })));
      }).catch(() => setZones([]));
  }, []);

  useEffect(() => { try { const t = localStorage.getItem("theme"); if (t === "light" || t === "dark") setTheme(t); } catch {} }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem("theme", theme); } catch {} }, [theme]);

  const onPick = (p: Pick | null) => {
    if (p?.layerId === "plan_zone") { setUrbanZoneSel(Number(p.attrs.OBJECTID)); setPicked(null); return; }
    setPicked(p);
  };
  const def = picked ? LAYER_BY_ID[picked.layerId] : null;
  const onIds = [...ALWAYS_ON_IDS, ...visible];
  // Хэсэг солих товч (хуучин зүүн цэсний оронд самбарын дээд хэсэгт)
  const tabs = (
    <div className="secTabs" role="tablist" aria-label="Төлөвлөлтийн хэсгүүд">
      {SECTIONS.map((m) => (
        <button key={m.n} role="tab" aria-selected={m.n === sec} className={`secTab ${m.n === sec ? "on" : ""}`} disabled={!m.ready} onClick={() => { setSec(m.n); setPicked(null); }}>
          <WorkspaceIcon name={ICON[m.n as keyof typeof ICON] ?? "urban"} />
          <span className="secTabN">{m.label}</span>
          <span>{m.title}</span>
        </button>
      ))}
    </div>
  );

  return (
    <MapCtx.Provider value={ctx}>
    <div className="shell shellNoNav">
      <header className="head">
        <div className="brand">
          <img className="brandEmblem" src="/brand/logo.png" alt="Дорнод аймаг, Баяндун сумын сүлд" width={46} height={46} />
          <div className="brandSub"><b>БАЯНДУН</b><small>Дорнод аймаг</small></div>
        </div>
        <span className="headSpacer" />
        <button className="iconBtn" onClick={() => setTheme(theme === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Гэрэл горим" : "Харанхуй горим"} title="Өнгөний горим">
          <WorkspaceIcon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </header>


      {/* Нэг ArcGIS газрын зураг (2D/3D) хоёр хэсэгт: давхарга нь mod:<хэсэг>:* — идэвхтэй хэсгийнх л харагдана */}
      <main className="map">
        <MapCanvas dim={dim} visible={visible} opacity={opacity} selected={picked} onPick={onPick}
          hideOriginalBoundaries={sec === 1} zoneFilter={urbanZoneSel} onReady={(a) => { api.current = a; }}
          onView={(v, m) => { setView(v); setMap(m); }} activeMod={sec} />
        <MapTools dim={dim} setDim={setDim} catalogOn={catalogOn} setCatalogOn={setCatalogOn}
          opacityOn={opacityOn} setOpacityOn={setOpacityOn} visibleCount={visible.length} onHome={() => api.current?.home()} />
        {catalogOn && <LayerCatalog visible={visible} setVisible={setVisible} onClose={() => setCatalogOn(false)} />}
        {opacityOn && <OpacityPanel ids={onIds} opacity={opacity} setOpacity={setOpacity} onClose={() => setOpacityOn(false)} />}
      </main>
      <aside className="panel">
        {tabs}
        <div className="panelSection pz" hidden={sec !== 1 || !!(picked && def)}>
          <Workspace egazarOn={visible.includes("egazar_parcel")} setEgazarOn={(on) => setVisible((v) => on ? [...new Set([...v, "egazar_parcel"])] : v.filter((x) => x !== "egazar_parcel"))} />
        </div>
        <Visited active={sec === 3}>
          <div className="panelSection" hidden={sec !== 3 || !!(picked && def)}>
            <AnalysisWorkspace section={3}><div className="panelBody planPanel">
              <UrbanPlan active={sec === 3} zones={zones} zoneSel={urbanZoneSel} setZoneSel={(oid) => {
                setUrbanZoneSel(oid);
                if (oid != null && !visible.includes("plan_zone")) setVisible([...visible, "plan_zone"]);
              }} />
            </div></AnalysisWorkspace>
          </div>
        </Visited>
        {picked && def && (
          <>
            <div className="panelHead">
              <span className="panelTitle"><LayerSwatch d={def} />{def.title}</span>
              <button className="iconBtn" onClick={() => setPicked(null)} aria-label="Хаах">✕</button>
            </div>
            <div className="panelBody">
              <div className="kv kvMain">{def.tip.map((t) => <div key={t.field}><span>{t.label}</span><b>{fmt(picked.attrs[t.field], t.unit)}</b></div>)}</div>
              <h3>Бүх талбар</h3>
              <div className="kv">{Object.entries(picked.attrs).filter(([k, v]) => !HIDDEN.test(k) && v != null && v !== "").map(([k, v]) => <div key={k}><span>{k}</span><b>{fmt(v)}</b></div>)}</div>
            </div>
          </>
        )}
      </aside>
    </div>
    </MapCtx.Provider>
  );
}
