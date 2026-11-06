"""Labelled thumbnail sheets for footage review: python thumbsheet.py <foot-dir> <prefix> id1 id2 ..."""
import sys, os
from PIL import Image, ImageDraw, ImageFont
d, pre, ids = sys.argv[1], sys.argv[2], sys.argv[3:]
W, H, COLS, ROWS = 300, 169, 7, 6
f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 15)
for s in range(0, len(ids), COLS * ROWS):
    sh = Image.new('RGB', (W * COLS, H * ROWS), (20, 20, 20)); g = ImageDraw.Draw(sh)
    for i, k in enumerate(ids[s:s + COLS * ROWS]):
        p = os.path.join(d, 'th', k + '.jpg')
        try: im = Image.open(p).convert('RGB').resize((W - 4, H - 4))
        except Exception: continue
        x, y = (i % COLS) * W, (i // COLS) * H; sh.paste(im, (x + 2, y + 2))
        g.rectangle([x + 2, y + 2, x + 2 + 8 * len(k) + 8, y + 22], fill=(0, 0, 0)); g.text((x + 6, y + 4), k, fill=(255, 230, 0), font=f)
    sh.save(os.path.join(d, f'{pre}_{s // (COLS * ROWS)}.jpg'), quality=80)
