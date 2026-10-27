# Хувилбар 3: хэрэглэгчийн ноорог (data/raw/sketch_v3.png)-ийг 8 га · хувилбар 1-ийн улаан хилтэй тулгаж геолавлах
# Арга: v1-ийн UTM хилийг Web Mercator руу хөрвүүлээд зураг дээрх улаан шугамтай chamfer зайгаар тааруулна (масштаб, шилжилт)
import json, math
import numpy as np
from PIL import Image
from scipy import ndimage, optimize
from pyproj import Transformer
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

R = 6378137
utm2ll = Transformer.from_crs(32649, 4326, always_xy=True); ll2utm = Transformer.from_crs(4326, 32649, always_xy=True)
def merc(lon, lat): return (math.radians(lon) * R, R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))
def unmerc(x, y): return (math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2))

im = np.asarray(Image.open("data/raw/sketch_v3.png").convert("RGB")).astype(int)
red = (im[..., 0] > 200) & (im[..., 1] < 80) & (im[..., 2] < 80)
H, W = red.shape
yy, xx = np.mgrid[0:H, 0:W]
v1mask = red & (xx > 440) & (yy > 160)
skmask = red & ~v1mask

fc = json.load(open("web/public/data/site_boundary.geojson", encoding="utf-8"))
v1 = next(f for f in fc["features"] if "хувилбар 3" in f["properties"]["name"])  # зураг дээрх хуучин хувилбар 1["properties"]["utm49"]
# хилийн дагуу 1 м тутам цэг
pts = []
for a, b in zip(v1[:-1], v1[1:]):
    n = max(1, int(math.dist(a, b)))
    pts += [(a[0] + (b[0] - a[0]) * t / n, a[1] + (b[1] - a[1]) * t / n) for t in range(n)]
M = np.array([merc(*utm2ll.transform(*p)) for p in pts])

dist = ndimage.distance_transform_edt(~v1mask)
ys, xs = np.nonzero(v1mask)
def topx(p, M=M):
    a, x0, y0 = p
    return (M[:, 0] - x0) / a, (y0 - M[:, 1]) / a
def cost(p):
    u, v = topx(p)
    ui, vi = np.clip(np.round(u).astype(int), 0, W - 1), np.clip(np.round(v).astype(int), 0, H - 1)
    return float(np.mean(dist[vi, ui] ** 2))
# эхний таамаг: bbox тааруулах
a0 = (M[:, 0].max() - M[:, 0].min()) / (xs.max() - xs.min())
x0 = M[:, 0].min() - xs.min() * a0; y0 = M[:, 1].max() + ys.min() * a0
best = min((optimize.minimize(cost, [a0 * s, x0 + dx, y0 + dy], method="Nelder-Mead", options={"xatol": 1e-3, "fatol": 1e-4, "maxiter": 4000})
            for s in (0.95, 1, 1.05) for dx in (-20, 0, 20) for dy in (-20, 0, 20)), key=lambda r: r.fun)
a, x0, y0 = best.x
print(f"scale {a:.3f} m/px, rms {math.sqrt(best.fun):.2f} px (= {math.sqrt(best.fun) * a:.1f} m)")

# Ноорог: дотор талыг дүүргэж (гаднаас хүрэхгүй пиксел) мөр бүрийн хэсгүүдийг нэгтгэнэ
outside = ndimage.binary_fill_holes(ndimage.binary_dilation(skmask, iterations=2))
rows = []
for v in range(H):
    line = outside[v]
    if not line.any(): continue
    d = np.diff(np.concatenate([[0], line.astype(int), [0]]))
    for s, e in zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]): rows.append(box(s, v, e, v + 1))
poly_px = unary_union(rows).simplify(1.5)
# зураасны өргөний голоор (≈3 px дотогш)
poly_px = poly_px.buffer(-2.5).simplify(1.0)
ring_px = list(poly_px.exterior.coords)
ring = [ll2utm.transform(*unmerc(x0 + u * a, y0 - v * a)) for u, v in ring_px]
sk = Polygon(ring)
print(f"sketch area {sk.area / 1e4:.2f} ha, vertices {len(ring)}")
json.dump({"scale": a, "x0": x0, "y0": y0, "sketch": [list(map(lambda c: round(c, 2), p)) for p in ring]}, open("data/sketch_v3_inputs.json", "w"), indent=1)

# Шалгах зураг: v1-ийг (цэнхэр) ба нооргийг (шар) буцааж зураг дээр зурна
from PIL import ImageDraw
out = Image.open("data/raw/sketch_v3.png").convert("RGB"); dr = ImageDraw.Draw(out)
u, v = topx(best.x)
dr.line(list(zip(u, v)), fill=(0, 200, 255), width=1)
dr.line(ring_px, fill=(255, 230, 0), width=1)
out.save("data/raw/sketch_v3_check.png")
