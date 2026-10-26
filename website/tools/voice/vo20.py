import sys, wave, io, json
import numpy as np
from piper import PiperVoice
model, name = sys.argv[1], sys.argv[2]
SC = {
 'A': ['We built Deep Algorithms because most access in your company no longer belongs to a person.', 'Keys and AI agents hold it now.', 'We find every identity, show you the risk, and fix it before it is used.', 'Trusted by banks, government and enterprises across India.', 'See it on your own identities. Book a demo.'],
 'B': ['Most access in your company no longer belongs to a person.', 'Keys, service accounts and AI agents hold it now, and attackers know it.', 'Deep Algorithms finds every one of them, shows you the risk, and fixes it before it is used.', 'Built in India, and trusted by banks, government and enterprises.', 'Impact the future, today. Book a demo.'],
}[sys.argv[3]]
v = PiperVoice.load(model); sr=None
def synth(t):
    global sr
    b = io.BytesIO()
    with wave.open(b,'wb') as w: v.synthesize_wav(t,w)
    b.seek(0)
    with wave.open(b,'rb') as r: sr=r.getframerate(); return np.frombuffer(r.readframes(r.getnframes()),dtype=np.int16)
synth('x'); out=[np.zeros(int(sr*0.25),dtype=np.int16)]; t=0.25; cues=[]
for s in SC:
    a=synth(s); cues.append([s,round(t,2),round(t+len(a)/sr,2)]); out.append(a); t+=len(a)/sr; g=0.34; out.append(np.zeros(int(sr*g),dtype=np.int16)); t+=g
pcm=np.concatenate(out)
with wave.open(name+'.wav','wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(pcm.tobytes())
print(name, round(t,1),'s', sum(len(s.split()) for s in SC),'words')
json.dump(cues,open(name+'.json','w'))
