"""Live-action footage for the product film: download each clip in footage.json,
cut its window, give every shot the same grade and write 1920x1080 frames at 30 fps
to <out>/<id>/0001.jpg... render.mjs serves them to film.html as /clips/<id>/NNNN.jpg.
Grade: open shadows, cool shadows, warm-neutral highlights, muted saturation,
so footage from different cameras cuts together and the product colours stay the
only saturated thing on screen.
Usage: python footage.py <cache-dir> <out-dir>"""
import json, os, subprocess, sys
here = os.path.dirname(os.path.abspath(__file__))
cache, out = sys.argv[1], sys.argv[2]
only = set(sys.argv[3:])  # optional: process only these clip ids
os.makedirs(cache, exist_ok=True)
for c in json.load(open(os.path.join(here, 'footage.json')))['clips']:
    if only and c['id'] not in only: continue
    src = os.path.join(cache, c['id'] + '.mp4')
    if not os.path.exists(src):
        subprocess.run(['curl', '-sSfL', '-o', src, c['src']], check=True)
    d = os.path.join(out, c['id']); os.makedirs(d, exist_ok=True)
    for f in os.listdir(d): os.remove(os.path.join(d, f))
    lift = c.get('lift', 0)
    vf = ','.join([
        'fps=30', 'scale=1920:1080:force_original_aspect_ratio=increase:flags=lanczos', 'crop=1920:1080',
        f'eq=contrast=1.05:brightness={lift + 0.035:.3f}:saturation={c.get("sat", 0.82)}:gamma=1.06',
        'colorbalance=rs=-0.01:bs=0.015' if c.get('bright') else 'colorbalance=rs=-0.05:gs=-0.01:bs=0.06:rm=-0.02:bm=0.025:rh=0.02:gh=0.005:bh=-0.02',
        'curves=all=0/0.03 0.25/0.26 0.5/0.54 0.8/0.85 1/0.98',
    ])
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(c['in']), '-t', str(c['dur']), '-i', src,
                    '-vf', vf, '-q:v', '2', os.path.join(d, '%04d.jpg')], check=True)
    print(c['id'], len(os.listdir(d)), 'frames')
