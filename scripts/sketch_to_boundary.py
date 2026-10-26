# Зураг 2-ын улаан хилийн пикселийн цэгүүдийг WGS84 / UTM 49N руу хөрвүүлж, 8 га болгох
# Геолавлалт: egazar нэгж талбартай тулгасан (scripts/georef_overlay.py), Web Mercator 1.76 м/px, ±5 м
# Ажиллуулах: python scripts/sketch_to_boundary.py [зорилтот_м2]
import json, math, sys
from pyproj import Transformer
from shapely.geometry import Polygon, LineString, shape, mapping
from shapely.ops import unary_union, transform

R = 6378137
A, MU, MV, MX, MY = 1.76, 373, 413, 12619679.4578, 6318583.8216
SKETCH = [(566,25),(585,60),(598,105),(606,160),(612,228),(606,236),(585,260),(560,285),(530,312),(500,340),
          (478,364),(464,382),(460,356),(445,336),(410,318),(375,305),(354,294),(350,282),(365,265),(390,240),
          (415,205),(432,186),(455,160),(480,130),(510,95),(530,66),(550,40)]
ROAD = [(606,-200),(608,0),(622,120),(625,230),(630,330),(636,450),(640,600)]  # зүүн талын шороон зам (тэнхлэг)
TARGET = float(sys.argv[1]) if len(sys.argv) > 1 else 80000.0
PARCEL_GAP, ROAD_HALF = 8.0, 10.0   # ТААМАГЛАЛ: одоо байгаа нэгж талбараас 8 м, замын тэнхлэгээс 10 м

fwd = Transformer.from_crs(4326, 32649, always_xy=True); inv = Transformer.from_crs(32649, 4326, always_xy=True)
def px2utm(u, v):
    x, y = MX + A*(u-MU), MY - A*(v-MV)
    return fwd.transform(math.degrees(x/R), math.degrees(2*math.atan(math.exp(y/R))-math.pi/2))

sketch = Polygon([px2utm(*p) for p in SKETCH]).buffer(0)
road = LineString([px2utm(*p) for p in ROAD]).buffer(ROAD_HALF)
parcels = json.load(open("data/raw/parcels_4326.json", encoding="utf-8"))["features"]
existing = unary_union([transform(fwd.transform, shape(f["geometry"])) for f in parcels]).buffer(PARCEL_GAP, join_style=2)
blocked = unary_union([road, existing])

def grow(d):
    g = sketch.buffer(d, join_style=1, quad_segs=4).difference(blocked)
    g = max(getattr(g, "geoms", [g]), key=lambda p: p.area)   # хамгийн том хэсэг
    return g.simplify(1.5)

if sketch.area >= TARGET: site = sketch
else:
    lo, hi = 0.0, 150.0
    for _ in range(60):
        mid = (lo+hi)/2
        lo, hi = (mid, hi) if grow(mid).area < TARGET else (lo, mid)
    d = hi; site = grow(d)
    # бага зэргийн зөрүүг төв цэгээс жигд масштабаар засна
    from shapely.affinity import scale
    k = math.sqrt(TARGET/site.area); site = scale(site, k, k, origin="centroid")
    print(f"buffer d={d:.2f} m")
site = Polygon(site.exterior.coords)   # нүхгүй
ring = list(site.exterior.coords)
if site.exterior.is_ccw is False: ring = ring[::-1]
print(f"sketch {sketch.area:.0f} m2 -> site {site.area:.0f} m2, vertices {len(ring)-1}, overlaps existing: {site.intersection(existing.buffer(-PARCEL_GAP)).area:.1f} m2")

def fc(ring_utm, name, src):
    ll = [inv.transform(x, y) for x, y in ring_utm]
    return {"type":"Feature","properties":{"name":name,"area_m2":round(Polygon(ring_utm).area,1),"source":src,
            "utm49":[[round(x,2),round(y,2)] for x,y in ring_utm]},
            "geometry":{"type":"Polygon","coordinates":[[[round(x,8),round(y,8)] for x,y in ll]]}}
sk = list(sketch.exterior.coords); sk = sk if sketch.exterior.is_ccw else sk[::-1]
out = {"type":"FeatureCollection","crs_note":"Геометр WGS84 (EPSG:4326); properties.utm49 = UTM 49N (EPSG:32649), м","features":[
  fc(ring, "Төлөвлөлтийн хил · 8 га", f"ТААМАГЛАЛ: ноорог ({sketch.area/1e4:.1f} га)-ийг жигд тэлж, одоо байгаа нэгж талбараас {PARCEL_GAP:.0f} м, шороон замын тэнхлэгээс {ROAD_HALF:.0f} м зай авч {TARGET:,.0f} м² болгосон"),
  fc(sk, "Хэрэглэгчийн ноорог", "Зураг 2-ын улаан шугам, egazar нэгж талбараар геолавласан (±5 м)")]}
json.dump(out, open("data/site_boundary.geojson","w",encoding="utf-8"), ensure_ascii=False, indent=1)
road_ll = [inv.transform(*px2utm(*p)) for p in ROAD]
json.dump({"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Шороон зам (зурагнаас)","source":"Зураг 2-оос тойм зурсан"},
  "geometry":{"type":"LineString","coordinates":[[round(x,8),round(y,8)] for x,y in road_ll]}}]},
  open("data/dirt_road.geojson","w",encoding="utf-8"), ensure_ascii=False)
