"""Captions from the narration script and the edit: python captions.py <vo-dir> <out-prefix>
Splits each line at punctuation into cues of at most ~42 characters, timed by character share."""
import json, os, re, sys
here = os.path.dirname(os.path.abspath(__file__))
E = json.load(open(os.path.join(here, 'edl.json'))); V = json.load(open(os.path.join(here, 'vo_script.json')))
L = {l['id']: l for l in json.load(open(os.path.join(sys.argv[1], 'lines.json')))['lines']}
cues = []
for ln in V['lines']:
    t0 = E['vo'][ln['id']]; d = L[ln['id']]['dur']; text = ln['text']
    parts = [p.strip() for p in re.split(r'(?<=[.,:])\s+', text) if p.strip()]
    chunks = []
    for p in parts:
        if chunks and len(chunks[-1]) + len(p) + 1 <= 42: chunks[-1] += ' ' + p
        else: chunks.append(p)
    tot = sum(len(c) for c in chunks); t = t0
    for k, c in enumerate(chunks):
        dt = d * len(c) / tot; cues.append((t, t + dt + (0.15 if k == len(chunks) - 1 else 0), c)); t += dt
def ts(x, sep): h, r = divmod(x, 3600); m, s = divmod(r, 60); return f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace('.', sep)
out = sys.argv[2]
with open(out + '.vtt', 'w') as f:
    f.write('WEBVTT\n\n')
    for a, b, c in cues: f.write(f"{ts(a, '.')} --> {ts(b, '.')}\n{c}\n\n")
with open(out + '.srt', 'w') as f:
    for i, (a, b, c) in enumerate(cues, 1): f.write(f"{i}\n{ts(a, ',')} --> {ts(b, ',')}\n{c}\n\n")
print(len(cues), 'cues')
