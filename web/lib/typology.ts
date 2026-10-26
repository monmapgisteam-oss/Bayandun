// 03. Суурьшлын бүсийн загвар — хөдөөгийн сумын төвийн 8 га хорооллын 10 загвар (typology).
// Загвар бүр = геометрийн горим + барилгын төрөл (давхар, BCR, хэмжээ) + хүн амын зорилт + параметрийн багц.
// Бөөрөлжүүт-ын 16 хотын загварыг (Парис, Токио, TOD, супер блок…) сумын төвд тохирох хэлбэрээр сольсон.
// Параметрийн утга нь тухайн загварын зарчмыг илэрхийлэх ТААМАГЛАЛ — БНбД-ийн яг заалт биш (ШАЛГАХ).
import type { Inputs } from "./urban";

export type Typo = {
  k: string; n: number; label: string; en: string; idea: string; examples: string;
  set: Partial<Inputs>; fromJobs?: boolean; note?: string;
};

export const TYPES: Typo[] = [
  { k: "ger", n: 1, label: "Гэр хорооллын хашаат суурьшил", en: "Ger-yard district", idea: "Хашаа бүрт гэр эсвэл жижиг байшин, нэг давхар; сумын төвийн уламжлалт хэлбэр", examples: "Монголын сумын төвүүд",
    set: { mode: "grid", gridStep: 110, pop: 300, hhSize: 4, m2pp: 15, floorsRes: 1, bcrRes: 16, setback: 5, depth: 8, maxLen: 10, gapEnd: 10, resBlock: 7000, resShare: 55, greenShare: 20, pubShare: 8, parking: 0.5, comGround: false },
    note: "Барилга = гэр/жижиг байшин (≈8×10 м); хашааны үлдсэн хэсэг нь хашааны талбай." },
  { k: "house", n: 2, label: "Амины орон сууцны хороолол", en: "Detached houses", idea: "1–2 давхар тусдаа байшин, хашаатай; төвлөрсөн шугамд холбогдох боломжтой", examples: "Аймгийн төвийн шинэ хорооллууд",
    set: { mode: "grid", gridStep: 110, pop: 350, hhSize: 3.8, m2pp: 30, floorsRes: 2, bcrRes: 18, setback: 6, depth: 10, maxLen: 12, gapEnd: 12, resBlock: 6000, resShare: 50, greenShare: 25, comGround: false } },
  { k: "row", n: 3, label: "Эгнээ байшин (таунхаус)", en: "Row houses", idea: "2 давхар хананы холбоотой байшингууд — дулаан хэмнэлттэй, газар бага эзэлнэ", examples: "Хүйтэн бүсийн таунхаус",
    set: { mode: "grid", gridStep: 110, pop: 500, m2pp: 28, floorsRes: 2, bcrRes: 30, setback: 5, depth: 10, maxLen: 40, gapEnd: 8, resBlock: 6000, comGround: false },
    note: "Хананы холбоос нь гадна талбайг багасгаж дулааны алдагдлыг бууруулна (ТААМАГЛАЛ)." },
  { k: "lowrise", n: 4, label: "Нам давхрын орон сууц (3 давхар)", en: "Low-rise apartments", idea: "3 давхар блок орон сууц, хашаандаа тоглоомын талбай, зогсоолтой", examples: "Сумын төвийн 3 давхар орон сууц",
    set: { mode: "grid", gridStep: 120, pop: 600, floorsRes: 3, bcrRes: 25, depth: 12, maxLen: 36, resBlock: 6000 } },
  { k: "center", n: 5, label: "Сумын төвийн компакт хороолол", en: "Compact soum centre", idea: "4 давхар орон сууц, доод давхарт дэлгүүр, үйлчилгээ; төвдөө талбай", examples: "Сумын төвийн гол талбай орчим",
    set: { mode: "organic", pop: 800, floorsRes: 4, bcrRes: 30, comGround: true, pubShare: 14, comSplit: 50, parkCenter: true, resBlock: 6000 } },
  { k: "street", n: 6, label: "Гол гудамжийн дагуух суурьшил", en: "Main-street settlement", idea: "Нэг гол гудамжийг даган байшин, үйлчилгээ — шороон замаас орох нэг тэнхлэг", examples: "Замын дагуух сум, тосгон",
    set: { mode: "linear", gridStep: 150, pop: 450, floorsRes: 2, bcrRes: 25, comGround: true, resBlock: 6000 } },
  { k: "cold", n: 7, label: "Хүйтэн, салхинд зохицсон хороолол", en: "Cold-climate layout", idea: "Хойд, баруун талд салхины хамгаалалтын мод, урд тал нь нээлттэй хашаа, нарны тал руу цонх", examples: "Хойд бүсийн хотхонууд",
    set: { mode: "grid", gridStep: 120, pop: 500, floorsRes: 3, bcrRes: 25, windbreak: 20, openSouth: true, greenShare: 30, resBlock: 6000 },
    note: "Салхины хамгаалалтын зурвас 20 м; барилга хоорондын зай нь нарны тусгалыг харгалзана." },
  { k: "eco", n: 8, label: "Бие даасан инженерийн шийдэлтэй", en: "Off-grid / eco", idea: "Дээврийн нарны хавтан, ногоон дээвэр, ойрын цэвэрлэх байгууламж — төвлөрсөн сүлжээ хязгаарлагдмал", examples: "Алслагдсан сум, тосгон",
    set: { mode: "grid", gridStep: 110, pop: 400, floorsRes: 2, bcrRes: 22, pvShare: 0.7, greenRoof: 0.2, parking: 0.6, resBlock: 6000 },
    note: "ДУТУУ ӨГӨГДӨЛ: сумын цахилгаан, ус хангамжийн чадал — нарны хавтан, ногоон дээврийн эзлэх хувиар л илэрхийлэв." },
  { k: "agro", n: 9, label: "Хашаандаа аж ахуйтай суурьшил", en: "Agro-residential", idea: "Том хашаа (хүлэмж, хүнсний ногоо, мал), нэг давхар байшин", examples: "Хөдөө аж ахуйн сумын төв",
    set: { mode: "grid", gridStep: 120, pop: 200, hhSize: 4, m2pp: 30, floorsRes: 1, bcrRes: 12, setback: 6, depth: 9, maxLen: 12, gapEnd: 15, resBlock: 9000, resShare: 60, greenShare: 15, pubShare: 6, comGround: false } },
  { k: "phased", n: 10, label: "Үе шаттай тэлэх хороолол", en: "Phased extension", idea: "Тэгш өнцөгт тор — эхний үе шатыг замын дэргэд, дараагийнхыг хойш тэлэх", examples: "Сумын ерөнхий төлөвлөгөөний тэлэлт",
    set: { mode: "grid", gridStep: 100, pop: 450, floorsRes: 2, bcrRes: 25, resBlock: 6000 },
    note: "Гудамжны тор нь дараагийн үе шатанд хойд зүг рүү сунгах боломжтой." },
];
export const TYPE = Object.fromEntries(TYPES.map((t) => [t.k, t])) as Record<string, Typo>;

// «8 га-д систем өөрөө» горим: ямар ч загвар сонгосон орон сууцны барилга нь амины байшин (1 давхар, ≈12×10 м).
// ТААМАГЛАЛ: байшин 12 × 10 м, гудамжнаас 6 м, хоорондын зай 12 м; доод давхарт үйлчилгээгүй.
// Айл бүр хашаатай тул бүсчлэлд орон сууц 60%, нийтийн ногоон 15% (Бөөрөлжүүт-ын хотын норм 40/30%).
export const SINGLE_HOUSE: Partial<Inputs> = { floorsRes: 1, floorGrad: 0, depth: 10, maxLen: 12, gapEnd: 12, setback: 6, comGround: false, m2pp: 30, underShare: 0, bcrRes: 25,
  resShare: 60, greenShare: 15, pubShare: 8, parkCenter: false };
