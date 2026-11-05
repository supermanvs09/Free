"""Opening shot prep: grade the desk clip, track the monitor per frame and write a
matte (monitor minus the person's silhouette) so the film's own interface can be
keyed into the screen. Usage: python desk_prep.py <raw-dir> <out-dir>"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
raw, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
files = sorted(f for f in os.listdir(raw) if f.startswith('raw'))
rects = []
for i, f in enumerate(files):
    im = Image.open(os.path.join(raw, f)).convert('RGB')
    a = np.asarray(im).astype(np.float32) / 255
    L = a @ np.array([.2126, .7152, .0722], np.float32)
    br = L > 90 / 255
    rows = br[:, 650:1400].mean(1); y0 = int(np.argmax(rows > .3))
    cols = br[y0 + 40:y0 + 380].mean(0); xs = np.where(cols > .25)[0]; x0, x1 = int(xs[0]), int(xs[-1])
    h = (x1 - x0) * .557; y1 = y0 + h
    rects.append([x0, y0, x1 - x0, round(h, 1)])
    # matte: inside the screen rect, keep the screen and drop the dark silhouette
    m = np.zeros_like(L)
    yy0, yy1 = max(0, y0 - 2), min(1080, int(y1) + 2)
    sub = L[yy0:yy1, x0 - 2:x1 + 3]
    sm = np.asarray(Image.fromarray((sub * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(3))).astype(np.float32) / 255
    key = np.clip((sm - .085) / .05, 0, 1)          # silhouette is near black, screen is lit
    # screen = lit pixels connected to the rect's top/left/right edges; the white collar,
    # enclosed by the dark silhouette, is not connected and stays out
    from scipy import ndimage
    lit = key > .5
    lab, n = ndimage.label(lit)
    edge = set(np.unique(np.concatenate([lab[0], lab[:, 0], lab[:, -1], lab[:int(lab.shape[0] * .5), 0]]))) - {0}
    conn = np.isin(lab, list(edge))
    conn = ndimage.binary_closing(conn, iterations=2) & ~ndimage.binary_dilation(~lit & ndimage.binary_fill_holes(~lit), iterations=0) if False else conn
    key = np.where(conn, np.maximum(key, .0), 0) * 1.0
    key = np.where(conn, 1.0, 0.0)
    m[yy0:yy1, x0 - 2:x1 + 3] = key
    mi = Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))
    mi.save(os.path.join(out, f'm{i:03d}.png'), optimize=False, compress_level=1)
    # grade: cool shadows, muted colour, gentle contrast, lifted blacks slightly
    g = a.copy()
    lum = L[..., None]
    g = lum + (g - lum) * .55
    g = np.clip((g - .02) * 1.08, 0, 1) ** 1.06
    g[..., 0] *= .92; g[..., 2] = np.clip(g[..., 2] * 1.06 + .012, 0, 1)
    Image.fromarray((np.clip(g, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, f'f{i:03d}.jpg'), quality=93)
json.dump(rects, open(os.path.join(out, 'rects.json'), 'w'))
print(len(files), rects[0], rects[-1])
