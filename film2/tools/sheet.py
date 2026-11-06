"""Contact sheet of stills: python sheet.py out.jpg a.jpg b.jpg ... (3 per row, 640 px wide each)"""
import sys
from PIL import Image, ImageDraw
out, fs = sys.argv[1], sys.argv[2:]
W, H = 640, 360
rows = (len(fs) + 2) // 3
sh = Image.new('RGB', (W * 3, H * rows), (30, 30, 30))
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((W, H))
    ImageDraw.Draw(im).text((8, 6), f.split('/')[-1], fill=(255, 255, 0))
    sh.paste(im, ((i % 3) * W, (i // 3) * H))
sh.save(out, quality=88)
