"""Synthesise each narration line separately with Kokoro (Apache-2.0).
Writes <out>/<id>.wav and <out>/lines.json with each line's duration.
Usage: python tts.py <model-dir> <out-dir>"""
import json, os, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
here = os.path.dirname(os.path.abspath(__file__))
spec = json.load(open(os.path.join(here, 'vo_script.json')))
mdir, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
k = Kokoro(os.path.join(mdir, 'kokoro-v1.0.onnx'), os.path.join(mdir, 'voices-v1.0.bin'))
def trim(a, sr, thr=0.008):
    i = np.where(np.abs(a) > thr)[0]
    return a[max(0, i[0] - int(.02 * sr)):min(len(a), i[-1] + int(.08 * sr))] if len(i) else a
res = []
for ln in spec['lines']:
    if 'ph' in ln:
        ph = k.tokenizer.phonemize(ln['say'], 'en-us')
        for w, ipa in ln['ph'].items():
            ph = ph.replace(k.tokenizer.phonemize(w, 'en-us').strip(' .,'), ipa, 1)
        a, sr = k.create(ph, voice=spec['voice'], speed=ln.get('speed', spec['speed']), is_phonemes=True)
    else:
        a, sr = k.create(ln['say'], voice=spec['voice'], speed=ln.get('speed', spec['speed']), lang='en-us')
    a = trim(a.astype(np.float32), sr)
    f = int(.012 * sr); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
    sf.write(os.path.join(out, ln['id'] + '.wav'), a, sr, subtype='PCM_16')
    res.append({'id': ln['id'], 'at': ln['at'], 'dur': round(len(a) / sr, 3), 'end': round(ln['at'] + len(a) / sr, 3), 'text': ln['text']})
json.dump({'sr': sr, 'lines': res}, open(os.path.join(out, 'lines.json'), 'w'), indent=1)
for r in res: print(r['id'], r['at'], r['dur'], r['end'])
