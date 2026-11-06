"""Cut every shot in edl.json from its source at 30 fps, 1920x1080, with one shared grade
(controlled contrast, slightly muted colour, cool shadows and warm skin) and a per-shot exposure trim.
Usage: python prep_shots.py <src-dir> <out-dir>"""
import json, os, subprocess, sys, concurrent.futures as cf
here = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(here, 'edl.json')))
src, out = sys.argv[1], sys.argv[2]
GRADE = ("eq=contrast=1.05:saturation=0.84:brightness={b}:gamma=1.02,"
         "colorbalance=rs=-0.03:gs=-0.005:bs=0.035:rm=0.0:bm=0.0:rh=0.025:gh=0.008:bh=-0.02,"
         "curves=all='0/0.03 0.25/0.23 0.5/0.5 0.78/0.81 1/0.97'")
def cut(s):
    d = os.path.join(out, s['id']); os.makedirs(d, exist_ok=True)
    if len(os.listdir(d)) >= int(s['dur'] * 30) - 1: return s['id'], 'cached'
    vf = f"scale=1920:1080:flags=lanczos,fps=30,{GRADE.format(b=s.get('ev', 0.0) * 0.5)}"
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(s['in']), '-t', str(s['dur'] + 0.1), '-i', os.path.join(src, s['clip'] + '.mp4'),
                    '-vf', vf, '-q:v', '3', os.path.join(d, 'f%04d.jpg')], check=True)
    return s['id'], len(os.listdir(d))
with cf.ThreadPoolExecutor(4) as ex:
    for r in ex.map(cut, E['shots']): print(*r)
