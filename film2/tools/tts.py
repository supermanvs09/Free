"""Narration: Kokoro (Apache-2.0) with a blended voice style, one line at a time.
Writes <out>/<id>.wav and <out>/lines.json (durations). Usage: python tts.py <model-dir> <out-dir>"""
import json, os, sys
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro
spec = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'vo_script.json')))
mdir, out = sys.argv[1], sys.argv[2]; os.makedirs(out, exist_ok=True)
k = Kokoro(os.path.join(mdir, 'kokoro-v1.0.onnx'), os.path.join(mdir, 'voices-v1.0.bin'))
style = sum(k.get_voice_style(v) * w for v, w in spec['voice'].items())
def trim(a, sr, thr=0.008):
    i = np.where(np.abs(a) > thr)[0]
    return a[max(0, i[0] - int(.02 * sr)):min(len(a), i[-1] + int(.1 * sr))] if len(i) else a
res = []
for ln in spec['lines']:
    sp = ln.get('speed', spec['speed'])
    if 'ph' in ln:
        ph = k.tokenizer.phonemize(ln['say'], 'en-us')
        for w, ipa in ln['ph'].items(): ph = ph.replace(k.tokenizer.phonemize(w, 'en-us').strip(' .,'), ipa, 1)
        a, sr = k.create(ph, voice=style, speed=sp, is_phonemes=True)
    else:
        a, sr = k.create(ln['say'], voice=style, speed=sp, lang='en-us')
    a = trim(a.astype(np.float32), sr); f = int(.012 * sr); a[:f] *= np.linspace(0, 1, f); a[-f:] *= np.linspace(1, 0, f)
    sf.write(os.path.join(out, ln['id'] + '.wav'), a, sr, subtype='PCM_16')
    res.append({'id': ln['id'], 'scene': ln['scene'], 'dur': round(len(a) / sr, 3), 'text': ln['text']})
json.dump({'sr': sr, 'lines': res}, open(os.path.join(out, 'lines.json'), 'w'), indent=1)
for r in res: print(r['id'], r['scene'], r['dur'])
print('total', round(sum(r['dur'] for r in res), 1))
