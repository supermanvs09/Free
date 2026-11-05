"""30-second promotional cut from the master: each product's hero beat and its end card,
over a continuous bed from the score that blooms into the finale.
Usage: python cut.py <build-dir>   (needs frames/, stem_*.npy from mix.py with STEMS=1)"""
import os, sys
import numpy as np, soundfile as sf
B = sys.argv[1]; SR = 48000; FPS = 30
SEG = [(2.55, 6.0), (16.3, 19.3), (22.8, 24.6), (29.25, 31.9), (33.5, 35.0), (40.3, 42.7), (45.85, 47.5),
       (54.7, 56.4), (62.15, 63.95), (70.6, 73.6), (78.25, 80.4), (89.55, 95.4)]
VO_SEG = {11}
fr = os.path.join(B, 'cut_frames'); os.makedirs(fr, exist_ok=True)
for f in os.listdir(fr): os.remove(os.path.join(fr, f))
k = 0
for a, b in SEG:
    for f in range(round(a * FPS), round(b * FPS)):
        os.symlink(os.path.join(B, 'frames', f'f{f:05d}.jpg'), os.path.join(fr, f'c{k:05d}.jpg')); k += 1
dur = k / FPS
music, sfx, vo = (np.load(os.path.join(B, f'stem_{n}.npy')) for n in ('music', 'sfx', 'vo'))
pk = float(np.load(os.path.join(B, 'stem_norm.npy'))[0])
N = int(dur * SR) + 1
out = np.zeros((N, 2))
fade = lambda n: np.minimum(1, np.minimum(np.arange(n), np.arange(n)[::-1]) / (0.02 * SR))[:, None]
pos = 0.0
for i, (a, b) in enumerate(SEG):
    i0, i1 = int(a * SR), int(b * SR); n = i1 - i0; p = int(pos * SR)
    x = sfx[i0:i1] * fade(n)
    if i in VO_SEG: x = x + vo[i0:i1] * fade(n)
    out[p:p + n] += x[:N - p]; pos += b - a
# bed: the steady pulse from the AWS and banking chapters, then the finale's bloom
f_start = sum(b - a for a, b in SEG[:-1]); xf = int(0.35 * SR); fs = int(f_start * SR)
bed = music[int(35.2 * SR):int(35.2 * SR) + fs + xf].copy()
fin = music[int(89.55 * SR) - xf:int(89.55 * SR) - xf + (N - fs + xf)].copy()
ramp = np.linspace(0, 1, xf)[:, None]
bed[-xf:] *= 1 - ramp; fin[:xf] *= ramp
out[:len(bed)] += bed[:N]
out[fs - xf:fs - xf + len(fin)] += fin[:N - (fs - xf)]
out = np.tanh(out / pk * 1.3) / np.tanh(1.3)
fo = int(0.6 * SR); out[-fo:] *= np.linspace(1, 0, fo)[:, None]
sf.write(os.path.join(B, 'cut.wav'), out.astype(np.float32), SR, subtype='PCM_24')
print('frames', k, 'seconds', round(dur, 2))
