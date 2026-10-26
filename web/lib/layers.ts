// Баяндун — давхаргын бүртгэл (Бөөрөлжүүт-ын services.ts загвараар).
// Эх өгөгдлийг Booroljuut шиг FeatureServer-ээр уншина: app/api/site/FeatureServer нь lib/siteData.json (8 га хил, шороон зам)
// болон egazar.gov.mn-ээс татсан нэгж талбарыг ArcGIS REST хэлбэрээр өгнө. Давхаргын дугаар Booroljuut-тай ижил (25 = авто зам, 41 = бүс).
import site from "./siteData.json";

const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;
export const SERVICE_URL = `${origin}/api/site/FeatureServer`;
export const ZONE_SERVICE_URL = SERVICE_URL;
export const ZONE_LAYER_URL = `${ZONE_SERVICE_URL}/41`;
export const PARCEL_LAYER = 50; // egazar.gov.mn — одоо байгаа нэгж талбар
// ID = 17 нь "Бүх талбай" (бүх бүсийн нэгдэл) — жагсаалт, газрын зурагт оруулахгүй
export const SITE_ID = 17;
export const ZONE_WHERE = `ID <> ${SITE_ID}`;

export const ELEVATION_URL =
  "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer";

export type Geom = "area" | "line" | "point";

export type LayerDef = {
  id: string;
  n: number; // FeatureServer layer index
  url?: string; // SERVICE_URL-аас өөр сервис бол давхаргын бүтэн URL
  where?: string; // үндсэн definitionExpression
  title: string;
  group: string;
  geom: Geom;
  hue: string;
  width?: number;
  dash?: boolean;
  casing?: string; // шугамын бараан хүрээ (төмөр замын тэмдэг)
  ties?: string; // шугамын голын цайвар тасархай — дэр мод
  fill?: number; // полигон дүүргэлтийн alpha (0 = зөвхөн хүрээ)
  size?: number;
  paint?: { field: string; values?: Record<string, string> }; // unique-value; values байхгүй бол автоматаар
  label?: string; // шошгоны талбар
  tip: { field: string; label: string; unit?: string }[]; // tooltip/дэлгэрэнгүйн талбар
  note?: string;
};

export type Group = { key: string; title: string; hue: string };

export const GROUPS: Group[] = [
  { key: "plan", title: "Төлөвлөлт", hue: "#f97316" },
  { key: "infra", title: "Дэд бүтэц", hue: "#e11d48" },
  { key: "admin", title: "Засаг захиргаа", hue: "#94a3b8" },
  { key: "env", title: "Байгаль орчин", hue: "#16a34a" },
];

export const ROAD_COLORS: Record<string, string> = {
  "Хурдны зам": "#b91c1c",
  "Олон улсын чанартай авто зам": "#ef4444",
  "Улсын чанартай авто зам": "#f97316",
  "Хоёрдогч авто зам": "#eab308",
  "Гуравдагч зам": "#cbd5e1",
  "Үйлчилгээний зам": "#94a3b8",
  "Авто зам": "#cbd5e1",
  "Замын холбоос": "#cbd5e1",
  "Гол хөрсөн зам": "#c08457",
  "Хөрсөн зам": "#d6b48a",
  "Явган хүний зам": "#4ade80",
};

// Ангиллын давхаргын автомат палитр
export const PALETTE = ["#2e7f8b", "#f59e0b", "#8b5cf6", "#10b981", "#ef4444", "#3b82f6",
  "#ec4899", "#84cc16", "#f97316", "#14b8a6", "#a855f7", "#eab308"];

export const BOUNDARY_ID = "plan_boundary";

export const LAYERS: LayerDef[] = [
  { id: BOUNDARY_ID, n: -1, title: "Төлөвлөлтийн хил", group: "plan", geom: "area", hue: "#f97316",
    fill: 0.15, width: 2.5, tip: [{ field: "name", label: "Нэр" }, { field: "area_ha", label: "Талбай", unit: "га" }] },
  { id: "plan_zone", n: 41, url: ZONE_LAYER_URL, where: ZONE_WHERE, title: "Төлөвлөлтийн бүс", group: "plan",
    geom: "area", hue: "#f59e0b", fill: 0.35, width: 1, paint: { field: "Name" }, label: "ID",
    tip: [{ field: "ID", label: "Дугаар" }, { field: "Name", label: "Бүс" }, { field: "Hectare", label: "Талбай", unit: "га" },
      { field: "Type", label: "Төлөв" }] },
  { id: "road", n: 25, title: "Авто зам", group: "infra", geom: "line", hue: "#f97316", width: 1.6,
    paint: { field: "roadtype", values: ROAD_COLORS },
    tip: [{ field: "roadtype", label: "Ангилал" }, { field: "soum_name", label: "Сум" }], note: "Зураг 3-аас тойм зурсан, ±5 м" },
  { id: "egazar_parcel", n: PARCEL_LAYER, title: "Одоо байгаа нэгж талбар (egazar)", group: "admin", geom: "area", hue: "#cbd5e1",
    fill: 0.25, width: 0.8, tip: [{ field: "parcel_id", label: "Нэгж талбар" }, { field: "landuse", label: "Зориулалт" },
      { field: "area_m2", label: "Талбай", unit: "м²" }, { field: "address", label: "Хаяг" }] },
];

export const LAYER_BY_ID: Record<string, LayerDef> = Object.fromEntries(LAYERS.map((l) => [l.id, l]));
export const INITIAL_VISIBLE = ["plan_zone", "road", "egazar_parcel"];
// Баяндун: хил нь хэсэг бүрийн өөрийн давхаргаар (хувилбар 1/2) зурагдана — нийтлэг хилийн давхарга зөвхөн home extent-д
export const ALWAYS_ON_IDS: string[] = [];

// Зурах дараалал: талбай < шугам < цэг
export const drawOrder = (d: LayerDef) => (d.id === BOUNDARY_ID ? 3 : { area: 0, line: 1, point: 2 }[d.geom]);

// Төлөвлөлтийн хилийн эргэлтийн цэг, EPSG:32649 [Easting, Northing] — lib/siteData.json (web/scripts/design-site.mjs)
export const PLAN_BOUNDARY: [number, number][] = (site.ring as [number, number][]).slice(0, -1);
export const PLAN_NAME = site.name;
export const PLAN_HA = site.areaHa;

// Функциональ бүс (га)
export const ZONES: { name: string; ha: number; built?: boolean }[] = [
  { name: "Суурьшлын бүс", ha: site.areaHa },
];

// Навигацийн үндсэн бүлэг
export const SECTIONS = [
  { n: 1, label: "01", title: "Нэгж талбарын хуваалт", ready: true },
  { n: 3, label: "02", title: "Суурьшлын бүсийн загвар", ready: true },
];

// Модулиуд (CLAUDE.md) — хувилбарын бүртгэлд модулийн дугаараар ашиглана
export const MODULES = [
  { n: 0, title: "Өгөгдлийн төв", ready: true },
  { n: 1, title: "Хот төлөвлөлтийн тохиромж" },
  { n: 2, title: "Блок хуваалт ба 3D" },
  { n: 3, title: "Хүн ам, хэрэгцээ" },
  { n: 4, title: "Инженерийн шугам сүлжээ" },
  { n: 5, title: "Тээвэр" },
  { n: 6, title: "Эрчим хүчний тохиромж" },
  { n: 7, title: "Салхи, нарны шинжилгээ" },
  { n: 8, title: "СЭХ тооцоолуур" },
  { n: 9, title: "Хувилбар, dashboard" },
];
