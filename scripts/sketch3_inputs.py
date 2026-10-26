# Зураг 3 (2 дахь ноорог)-ыг геолавлаж, шороон зам ба ноорог хилийг UTM 49N-ээр гаргах
# Геолавлалт: egazar нэгж талбартай тулгасан (georef_overlay.py), Web Mercator 1.76 м/px, ±5 м
import json, math
from pyproj import Transformer
R = 6378137
A, MU, MV, MX, MY = 1.76, 401, 519, 12619709.8988, 6318546.5666
SKETCH = [(602,40),(560,48),(520,62),(470,85),(420,110),(380,135),(333,170),(360,215),(395,265),(430,305),(420,320),
          (385,340),(358,378),(395,400),(470,456),(530,440),(624,428),(615,300),(608,150)]
ROAD = [(630,0),(637,150),(650,300),(658,430),(662,500),(650,589)]   # шороон замын тэнхлэг
fwd = Transformer.from_crs(4326, 32649, always_xy=True); inv = Transformer.from_crs(32649, 4326, always_xy=True)
def px2utm(u, v):
    x, y = MX + A*(u-MU), MY - A*(v-MV)
    return fwd.transform(math.degrees(x/R), math.degrees(2*math.atan(math.exp(y/R))-math.pi/2))
road = [px2utm(*p) for p in ROAD]
# Төгсгөлийг 300 м-ээр сунгана (зургийн хүрээнээс гадна шулуун гэж үзэв — ТААМАГЛАЛ)
def ext(a, b, d=300):
    L = math.hypot(b[0]-a[0], b[1]-a[1]); return (b[0]+(b[0]-a[0])/L*d, b[1]+(b[1]-a[1])/L*d)
road = [ext(road[1], road[0])] + road + [ext(road[-2], road[-1])]
sketch = [px2utm(*p) for p in SKETCH]
json.dump({"road": road, "sketch": sketch}, open("data/sketch3_inputs.json", "w"), indent=1)
json.dump({"type":"FeatureCollection","features":[{"type":"Feature","properties":{"name":"Шороон зам","source":"Зураг 3-аас тойм зурсан, ±5 м; төгсгөлийг 300 м шулуунаар сунгасан"},
  "geometry":{"type":"LineString","coordinates":[[round(c,8) for c in inv.transform(*p)] for p in road]}}]},
  open("data/dirt_road.geojson","w",encoding="utf-8"), ensure_ascii=False)
s = sum(sketch[i-1][0]*sketch[i][1]-sketch[i][0]*sketch[i-1][1] for i in range(len(sketch)))/2
print("sketch3 area", round(abs(s)), "m2; road dir", round(math.degrees(math.atan2(road[-1][1]-road[0][1], road[-1][0]-road[0][0])),1))
