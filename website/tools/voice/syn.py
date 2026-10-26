import sys, wave
from piper import PiperVoice
model, text, out = sys.argv[1:4]
v = PiperVoice.load(model)
with wave.open(out, 'wb') as w:
    v.synthesize_wav(text, w)
print(out)
