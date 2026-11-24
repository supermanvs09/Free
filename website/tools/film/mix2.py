"""Sound for the product film (take 8): narration over a licensed cinematic score.
- Score, three cues by Kevin MacLeod (incompetech.com), CC BY 4.0:
  "Hiding Your Reality" under the real incidents (tension),
  "Impact Moderato" from the brand reveal through the five products (drive),
  "Heroic Age" from the recap to the end card (resolution).
  Each change lands on a hit, so the move between keys is masked.
- Accents: a low impact on every incident cut, a riser and a hit into the brand,
  and a soft two-note chime each time a product contains its threat.
- The score ducks under the voice; output is 48 kHz stereo WAV, loudness is
  normalised afterwards with ffmpeg (-16 LUFS).
Usage: python mix2.py <vo.wav> <timings.json> <music-dir> <out.wav> <length_s>"""
import json, sys, subprocess
import numpy as np, soundfile as sf

vo_path, tim_path, mdir, out_path, L = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5])
T = json.load(open(tim_path)); C = {c['id']: c for c in T['lines']}
SR = 48000; N = int(L * SR); rng = np.random.default_rng(3)

def load(path, offset=0.0, dur=None):
    cmd = ['ffmpeg', '-v', 'error', '-ss', str(offset), '-i', path] + (['-t', str(dur)] if dur else []) + ['-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
    a = np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, dtype=np.float32).reshape(-1, 2).copy()
    return a

def fade(a, fin, fout):
    n = len(a); i, o = int(fin * SR), int(fout * SR)
    if i: a[:i] *= np.linspace(0, 1, i)[:, None] ** 2
    if o: a[-o:] *= np.linspace(1, 0, o)[:, None] ** 1.5
    return a

def rms_db(a): return 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)

def place(bus, a, start):
    s = int(start * SR); e = min(N, s + len(a))
    if s < N: bus[s:e] += a[:e - s]

# ---------- the score ----------
brand, recap = C['brand']['start'] - 0.55, C['recap']['start'] - 0.35
music = np.zeros((N, 2), np.float32)
cues = [  # file, offset into the track, start in the film, end in the film, fade in, fade out, level dB
    ('HidingYourReality.mp3', 18.0, 0.0, brand + 0.05, 2.2, 0.35, -21),
    ('ImpactModerato.mp3', 0.0, brand, recap + 0.15, 0.05, 0.9, -20),
    ('HeroicAge.mp3', 54.0, recap, L, 0.25, 2.6, -19),
]
for f, off, a0, a1, fi, fo, lvl in cues:
    a = load(f'{mdir}/{f}', off, a1 - a0 + 0.1)[: int((a1 - a0) * SR)]
    a *= 10 ** ((lvl - rms_db(a)) / 20)
    place(music, fade(a, fi, fo), a0)

# ---------- accents ----------
fx = np.zeros((N, 2), np.float32)
def boom(start, amp=0.5, f0=58, dur=1.6):
    n = int(dur * SR); tt = np.arange(n) / SR
    f = f0 * (1 + 1.4 * np.exp(-tt * 9))
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 2.6) * amp
    noise = rng.standard_normal(n) * np.exp(-tt * 18) * amp * 0.25
    x = (w + noise).astype(np.float32); place(fx, np.stack([x, x], 1), start)
def riser(end, dur=1.4, amp=0.18):
    n = int(dur * SR); tt = np.arange(n) / SR
    noise = rng.standard_normal(n); k = np.linspace(0, 1, n) ** 2.2
    # crude high-pass by differencing, swept louder towards the hit
    x = (np.diff(noise, prepend=0) * k * amp).astype(np.float32); place(fx, np.stack([x, x * 0.9], 1), end - dur)
def chime(start, amp=0.12):
    for i, (f, d) in enumerate([(1318.5, 0.0), (1975.5, 0.11)]):
        n = int(1.2 * SR); tt = np.arange(n) / SR
        x = (np.sin(2 * np.pi * f * tt) + 0.3 * np.sin(2 * np.pi * f * 2 * tt)) * np.exp(-tt * 4.5) * amp
        place(fx, np.stack([x, x], 1).astype(np.float32), start + d)

for k, back in [('hook', 0.3), ('hook2', 0.2), ('mgm', 0.25), ('snow', 0.2), ('drift', 0.2), ('india', 0.2)]:
    boom(C[k]['start'] - back, amp=0.32)
riser(brand); boom(brand, amp=0.55, f0=50, dur=2.2); boom(recap, amp=0.4, f0=55)
# product outcomes, the same fractions Film.jsx uses
order = ['cirm', 'fraud', 'zenstra', 'botshield', 'icms']; fr = [0.68, 0.74, 0.62, 0.66, 0.7]
for i, k in enumerate(order):
    pa = C[k]['start'] - (0.5 if i == 0 else 0.4)
    pb = C[order[i + 1]]['start'] - 0.4 if i < 4 else recap
    chime(pa + (pb - pa) * fr[i])

# ---------- voice ----------
v, vsr = sf.read(vo_path, dtype='float32')
if v.ndim > 1: v = v.mean(1)
if vsr != SR: v = np.interp(np.linspace(0, len(v) - 1, int(len(v) * SR / vsr)), np.arange(len(v)), v).astype(np.float32)
voice = np.zeros(N, np.float32); voice[:min(N, len(v))] = v[:N]
voice *= 10 ** ((-16 - rms_db(voice[np.abs(voice) > 0.01])) / 20)

# duck the score under the voice: 8 dB down while speaking, smooth attack and release
blk = int(0.02 * SR); nb = N // blk
env = np.sqrt(np.mean(voice[:nb * blk].reshape(nb, blk) ** 2, 1)) > 0.01
g = np.where(env, 10 ** (-8 / 20), 1.0)
sm = np.copy(g)
for i in range(1, nb):  # fast attack (down), slow release (up)
    a = 0.35 if g[i] < sm[i - 1] else 0.06
    sm[i] = sm[i - 1] + (g[i] - sm[i - 1]) * a
gain = np.repeat(sm, blk); gain = np.pad(gain, (0, N - len(gain)), constant_values=gain[-1])
music *= gain[:, None]

mix = music + fx + np.stack([voice, voice], 1)
mix /= max(1.0, np.max(np.abs(mix)) / 0.95)
sf.write(out_path, mix, SR, subtype='PCM_24')
print('mix', L, 's ->', out_path)
