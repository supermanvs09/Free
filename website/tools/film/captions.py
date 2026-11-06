"""WebVTT captions from timings.json. Long lines are split into two cues, at a
full stop if there is one (the one nearest the middle), else at the comma or full stop nearest
the middle; each cue is timed by its share of the words.
Usage: python captions.py timings.json out.vtt"""
import json, re, sys
T = json.load(open(sys.argv[1]))
def ts(s):
    h, m = int(s // 3600), int(s % 3600 // 60)
    return f'{h:02d}:{m:02d}:{s % 60:06.3f}'
out = ['WEBVTT', '']
lines = T['lines']
for li, ln in enumerate(lines):
    text, a, b = ln['text'], ln['start'], ln['end']
    nxt = lines[li + 1]['start'] - 0.05 if li + 1 < len(lines) else b + 1.5
    parts = [text]
    if len(text) > 58:
        # a sentence end near the middle beats a comma at the middle
        stops = [m.end() for m in re.finditer(r'\. ', text) if 0.15 < m.end() / len(text) < 0.85]
        cut = stops or [m.end() for m in re.finditer(r'[.,] ', text)]
        if cut:
            mid = min(cut, key=lambda c: abs(c - len(text) / 2))
            parts = [text[:mid].strip(), text[mid:].strip()]
    words = [len(p.split()) for p in parts]; total = sum(words); t = a
    for j, (p, w) in enumerate(zip(parts, words)):
        e = t + (b - a) * w / total
        end = min(e + 0.4, nxt) if j == len(parts) - 1 else e
        out += [f'{ts(t)} --> {ts(end)}', p, '']
        t = e
open(sys.argv[2], 'w').write('\n'.join(out))
print(open(sys.argv[2]).read())
