import json, wave, subprocess, sys, io
import numpy as np
from piper import PiperVoice
MODEL = sys.argv[1] if len(sys.argv) > 1 else 'en_US-lessac-high.onnx'
SEGS = [
  ('title', ['The identity shift.']),
  ('shift', ['Not long ago, identity meant people. One person, one login, a handful of apps.', 'Then the cloud added service accounts, keys and tokens. They multiplied, and nobody was counting.', 'Now people are creating AI agents, and they act on their own, with credentials no one has reviewed.']),
  ('attack', ['Attackers noticed.', 'They no longer break in. They log in, with a key nobody owns, and no alert is raised.']),
  ('discover', ['Deep Algorithms starts by finding every identity: people, service accounts, keys and AI agents.', 'Each one gets an owner, a type, and a clear view of what it can reach.']),
  ('understand', ['Then it shows you the risk, and why, in plain language your team can act on.']),
  ('fix', ['It recommends the exact fix, and for AI agents it checks every action before it runs.']),
  ('prove', ['And every decision is recorded, so your auditor gets evidence they can read.']),
  ('close', ['Deep Algorithms. Identity security for the AI era.', 'Impact the future, today.']),
]
TAIL = {'attack': 1.2, 'discover': 1.4, 'understand': 3.2, 'fix': 3.4, 'prove': 2.8}  # silence after a scene so the picture can land
v = PiperVoice.load(MODEL)
sr = None
def synth(t):
    global sr
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w: v.synthesize_wav(t, w)
    buf.seek(0)
    with wave.open(buf, 'rb') as r:
        sr = r.getframerate(); return np.frombuffer(r.readframes(r.getnframes()), dtype=np.int16)
def sil(sec): return np.zeros(int(sr * sec), dtype=np.int16)
synth('x')
out = [sil(0.5)]; t = 0.5; cues = []
for sid, sents in SEGS:
    seg = {'id': sid, 'start': t, 'sentences': []}
    for k, s in enumerate(sents):
        a = synth(s); st = t; out.append(a); t += len(a) / sr
        seg['sentences'].append({'text': s, 'start': round(st, 2), 'end': round(t, 2)})
        gap = 0.28 if k < len(sents) - 1 else TAIL.get(sid, 0.9)
        out.append(sil(gap)); t += gap
    seg['end'] = round(t - TAIL.get(sid, 0.9), 2); seg['start'] = round(seg['start'], 2); cues.append(seg)
out.append(sil(0.6)); t += 0.6
pcm = np.concatenate(out)
with wave.open('vo.wav', 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
json.dump({'duration': round(t, 2), 'segments': cues}, open('vo.json', 'w'), indent=1)
print(round(t, 2)); [print(c['id'], c['start'], c['end']) for c in cues]
