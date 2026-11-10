"""Narration for the product film: one Kokoro voice, one sentence at a time.
Writes <out>/vo.wav and <out>/timings.json (start and end of every line, seconds).
A line may carry "ph": {"word": "IPA"} to pin how a name is said, and "soften": [from_s, to_s, dB] to bring one stressed word level with the rest.
Usage: python tts.py <kokoro-model-dir> <out-dir> [voice] [speed]"""
import json, sys, os
import numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

here = os.path.dirname(os.path.abspath(__file__))
spec = json.load(open(os.path.join(here, 'script.json')))
mdir, out = sys.argv[1], sys.argv[2]
voice = sys.argv[3] if len(sys.argv) > 3 else spec['voice']
speed = float(sys.argv[4]) if len(sys.argv) > 4 else spec['speed']
k = Kokoro(os.path.join(mdir, 'kokoro-v1.0.onnx'), os.path.join(mdir, 'voices-v1.0.bin'))

def trim(a, sr, thr=0.008):
    idx = np.where(np.abs(a) > thr)[0]
    if not len(idx): return a
    s, e = max(0, idx[0] - int(0.02 * sr)), min(len(a), idx[-1] + int(0.06 * sr))
    return a[s:e]

lead = spec.get('lead', 0.6)  # silence before the first line: the cold open plays here
parts, t, cues, sr = [], lead, [], 24000
for ln in spec['lines']:
    if 'ph' in ln:  # {"word": "IPA"}: pin a name's pronunciation, checked with a speech-to-text pass
        ph = k.tokenizer.phonemize(ln['say'], 'en-us')
        for word, ipa in ln['ph'].items():
            ph = ph.replace(k.tokenizer.phonemize(word, 'en-us').strip(' .,'), ipa, 1)
        a, sr = k.create(ph, voice=voice, speed=speed, is_phonemes=True)
    else:
        a, sr = k.create(ln['say'], voice=voice, speed=speed, lang='en-us')
    a = trim(a.astype(np.float32), sr)
    if 'soften' in ln:  # [from_s, to_s, dB]: level a word down smoothly, e.g. a name the voice leans on
        s0, s1, db = ln['soften']; g = np.ones(len(a), np.float32); lo = 10 ** (db / 20)
        i0, i1, ramp = int(s0 * sr), min(len(a), int(s1 * sr)), int(0.12 * sr)
        g[i0:i1] = lo; g[i1:i1 + ramp] = np.linspace(lo, 1, len(g[i1:i1 + ramp]))
        a *= g
    fade = int(0.012 * sr); a[:fade] *= np.linspace(0, 1, fade); a[-fade:] *= np.linspace(1, 0, fade)
    d = len(a) / sr
    cues.append({'id': ln['id'], 'text': ln['text'], 'start': round(t, 3), 'end': round(t + d, 3)})
    parts.append(a); t += d
    gap = ln.get('after', 0.5); parts.append(np.zeros(int(gap * sr), np.float32)); t += gap
pcm = np.concatenate([np.zeros(int(lead * sr), np.float32)] + parts)
os.makedirs(out, exist_ok=True)
sf.write(os.path.join(out, 'vo.wav'), pcm, sr, subtype='PCM_16')
json.dump({'duration': round(t, 3), 'voice': voice, 'speed': speed, 'lines': cues}, open(os.path.join(out, 'timings.json'), 'w'), indent=1)
print(voice, speed, 'total', round(t, 2), 's,', sum(len(l['text'].split()) for l in spec['lines']), 'words')
