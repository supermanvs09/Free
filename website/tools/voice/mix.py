import sys, wave, numpy as np
src, out = sys.argv[1], sys.argv[2]
with wave.open(src,'rb') as r: sr=r.getframerate(); v=np.frombuffer(r.readframes(r.getnframes()),dtype=np.int16).astype(np.float32)/32768
n=len(v)+int(sr*1.2); v=np.pad(v,(0,n-len(v))); t=np.arange(n)/sr
chords=[[130.81,164.81,196.0,246.94],[110.0,164.81,220.0,261.63],[87.31,130.81,174.61,220.0],[98.0,146.83,196.0,246.94]]
seg=n/len(chords); pad=np.zeros(n,dtype=np.float32)
for ci,ch in enumerate(chords):
    c0=ci*seg; env=np.clip(1-np.abs(t-(c0+seg/2))/(seg*0.75),0,1)**1.6
    for f in ch:
        for d in (-0.5,0.5):
            pad+=env*(np.sin(2*np.pi*(f+d)*t)+0.25*np.sin(2*np.pi*(2*f+d)*t))*0.05
pad*=0.6+0.4*np.sin(2*np.pi*0.12*t)
# one-pole low-pass ~1.4 kHz
a=np.exp(-2*np.pi*1400/sr); y=np.zeros_like(pad); s=0.0
for i in range(n): s=(1-a)*pad[i]+a*s; y[i]=s
pad=y; pad*=0.1/np.sqrt(np.mean(pad**2)+1e-9)
# duck under the voice
env=np.abs(v); k=np.exp(-1/(0.18*sr)); e=np.zeros_like(env); s=0.0
for i in range(n): s=max(env[i],s*k); e[i]=s
duck=1-0.55*np.clip(e/0.15,0,1)
fade=np.clip(t/1.5,0,1)*np.clip((n/sr-t)/1.6,0,1)
bed=pad*duck*fade
vv=v/ (np.sqrt(np.mean(v[np.abs(v)>0.01]**2))+1e-9)*0.12
mix=vv+bed*0.25
mix/=max(1,np.max(np.abs(mix))/0.9)
with wave.open(out,'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((mix*32767).astype(np.int16).tobytes())
