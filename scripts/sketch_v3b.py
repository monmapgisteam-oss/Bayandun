# Хувилбар 3 (засвар): хэрэглэгчийн утасны дэлгэцийн зураг (data/raw/sketch_v3b.jpg) дээрх урт тэгш өнцөгтийг геолавлах.
# Хувилбар 1-ийн улаан хилтэй chamfer зайгаар тааруулна (sketch_v3.py-тэй ижил арга).
import json, math
import numpy as np
from PIL import Image
from scipy import ndimage, optimize
from pyproj import Transformer
from shapely.geometry import MultiPoint, Polygon

R = 6378137
utm2ll = Transformer.from_crs(32649, 4326, always_xy=True); ll2utm = Transformer.from_crs(4326, 32649, always_xy=True)
def merc(lon, lat): return (math.radians(lon) * R, R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))
def unmerc(x, y): return (math.degrees(x / R), math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2))

im = np.asarray(Image.open("data/raw/sketch_v3b.jpg").convert("RGB")).astype(int)
r, g, b = im[..., 0], im[..., 1], im[..., 2]
red = (r > 170) & (g < 110) & (b < 110) & (r - g > 80)
cyan = (g > 170) & (b > 150) & (r < 140)
lab, n = ndimage.label(red, structure=np.ones((3, 3)))
sizes = ndimage.sum(red, lab, range(1, n + 1))
comps = sorted(((s, i + 1) for i, s in enumerate(sizes)), reverse=True)[:4]
for s, i in comps:
    ys, xs = np.nonzero(lab == i); print(f"comp {i}: {int(s)} px, x {xs.min()}-{xs.max()}, y {ys.min()}-{ys.max()}")
# v1 = баруун доод талын улбар шар хашаатай хэсэг (x 175–230, y 140–215 px); дотор нь сонгосон ягаан хашааг (дүүрэг) хасна
yy, xx = np.mgrid[0:red.shape[0], 0:red.shape[1]]
region = (xx >= 175) & (xx <= 230) & (yy >= 140) & (yy <= 215)
filled = ndimage.binary_opening(red, iterations=2)
v1mask = red & region & ~filled
rect_i = max(((s, i) for s, i in comps if np.nonzero(lab == i)[1].mean() < 175 and np.nonzero(lab == i)[0].mean() < 230), key=lambda t: t[0])[1]
print("v1 px", int(v1mask.sum()), "rect comp", rect_i)
H, W = red.shape

fc = json.load(open("web/public/data/site_boundary.geojson", encoding="utf-8"))
v1 = next(f for f in fc["features"] if "хувилбар 3" in f["properties"]["name"])  # зураг дээрх хуучин хувилбар 1["properties"]["utm49"]
pts = []
for a_, b_ in zip(v1[:-1], v1[1:]):
    k = max(1, int(math.dist(a_, b_)))
    pts += [(a_[0] + (b_[0] - a_[0]) * t / k, a_[1] + (b_[1] - a_[1]) * t / k) for t in range(k)]
# Тулгах цэг: v1-ийн булангууд (зураг 4× томруулж уншсан, ±1 px ≈ ±10 м) ↔ UTM; зураг хойд зүг дээш, эргэлтгүй
TIE = [((198.0, 157.0), (672136.8, 5459176.7)),   # хойд орой
       ((216.3, 171.3), (672298.1, 5459065.8)),   # зүүн хойд булан
       ((199.3, 201.8), (672138.2, 5458734.7)),   # урд орой
       ((183.8, 185.0), (671986.3, 5458839.1))]   # баруун орой
A_, B_ = [], []
for (u, v), q in TIE:
    X, Y = merc(*utm2ll.transform(*q)); A_ += [[u, 1, 0], [-v, 0, 1]]; B_ += [X, Y]
sol, res, *_ = np.linalg.lstsq(np.array(A_, float), np.array(B_, float), rcond=None)
a, x0, y0 = sol
err = np.array(A_) @ sol - np.array(B_)
print(f"scale {a:.2f} m/px, tie rms {math.sqrt(np.mean(err ** 2)):.1f} merc-m")
toutm = lambda u, v: ll2utm.transform(*unmerc(x0 + u * a, y0 - v * a))

# Тэгш өнцөгт: зураасны пикселийн хамгийн бага эргэлттэй тэгш өнцөгт, зураасны хагас өргөнөөр дотогш
ys, xs = np.nonzero(lab == rect_i)
stroke = float(np.median(ndimage.distance_transform_edt(lab == rect_i)[lab == rect_i])) * 2 + 1
outer = MultiPoint([toutm(u + .5, v + .5) for u, v in zip(xs, ys)]).minimum_rotated_rectangle
rect = outer.buffer(-stroke * a / 2, join_style=2)
c = list(rect.exterior.coords)[:4]
e = [math.dist(c[i], c[(i + 1) % 4]) for i in range(4)]
long_i = int(np.argmax(e[:2]))
ang = math.degrees(math.atan2(c[long_i + 1][1] - c[long_i][1], c[long_i + 1][0] - c[long_i][0])) % 180
print(f"rect: {max(e):.0f} x {min(e):.0f} m, area {rect.area / 1e4:.1f} ha, long axis {ang:.1f} deg, stroke {stroke:.1f}px")
cy_ys, cy_xs = np.nonzero(cyan)
cy = MultiPoint([toutm(u + .5, v + .5) for u, v in zip(cy_xs, cy_ys)]).convex_hull if len(cy_xs) > 2 else None
print("cyan", len(cy_xs), "px", f"{cy.area:.0f} m2 at {cy.centroid.x:.0f},{cy.centroid.y:.0f}" if cy else "")
json.dump({"scale": a, "tie_rms_merc_m": float(math.sqrt(np.mean(err ** 2))), "rect": [list(map(lambda q: round(q, 2), p)) for p in rect.exterior.coords], "long_axis_deg": ang,
           "cyan": [list(map(lambda q: round(q, 2), p)) for p in cy.exterior.coords] if cy else None}, open("data/sketch_v3b_inputs.json", "w"), indent=1)

# Шалгах зураг: v1 (цэнхэр) ба тэгш өнцөгтийг (шар) буцааж зурж 4× томруулна
from PIL import ImageDraw
ll = lambda p: merc(*utm2ll.transform(*p))
topix = lambda p: ((ll(p)[0] - x0) / a, (y0 - ll(p)[1]) / a)
out = Image.open("data/raw/sketch_v3b.jpg").convert("RGB"); dr = ImageDraw.Draw(out)
dr.line([topix(p) for p in v1], fill=(0, 200, 255), width=1)
dr.line([topix(p) for p in rect.exterior.coords], fill=(255, 230, 0), width=1)
out.crop((90, 90, 260, 230)).resize((680, 560), Image.LANCZOS).save("data/raw/sketch_v3b_check.png")
