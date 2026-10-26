# Ноорог зураг (зураг 2) дээр egazar-ын нэгж талбарыг давхарлаж геоchлолыг шалгах
import json, math, sys
from PIL import Image, ImageDraw
R = 6378137
def merc(lon, lat): return (math.radians(lon)*R, R*math.log(math.tan(math.pi/4+math.radians(lat)/2)))
img_path, parcels, out = sys.argv[1], sys.argv[2], sys.argv[3]
a, mu, mv, mx, my = map(float, sys.argv[4:9])
im = Image.open(img_path).convert("RGB"); dr = ImageDraw.Draw(im)
def topx(x, y): return (mu+(x-mx)/a, mv-(y-my)/a)
for f in json.load(open(parcels, encoding="utf-8"))["features"]:
    ring = [topx(*merc(*c)) for c in f["geometry"]["coordinates"][0]]
    dr.line(ring, fill=(0, 255, 255), width=1)
im.save(out)
