"""Sound for the product film (take 9).
- Voice: the take-7 chain (low cut, presence lift around 3 kHz, soft-knee
  compression), the narration people preferred.
- Score: one licensed needle-drop, "Deliberate Thought" by Kevin MacLeod (incompetech.com),
  CC BY 4.0: low, steady and calm, the sound of a system under control. Lower under the opening, lifted with a hit when the first incident
  lands, ducked 8 dB under the voice, faded under the end card.
- Accents, after the enterprise films studied: a soft air whoosh on every chapter
  cut, a small tick as each signal toast drops in, and a two-note confirmation
  chime when the product's card resolves.
Usage: python mix3.py <vo.wav> <timings.json> <music-dir> <out.wav> <length_s>"""
import json, sys, subprocess
import numpy as np, soundfile as sf

vo_path, tim_path, mdir, out_path, L = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], float(sys.argv[5])
T = json.load(open(tim_path)); C = {c['id']: c for c in T['lines']}
SR = 48000; N = int(L * SR); rng = np.random.default_rng(5)

def fft_filter(x, lo=None, hi=None, slope=1.0):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** (4 * slope))
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (4 * slope))
    return np.fft.irfft(X * g, len(x))
def rms_db(a): return 20 * np.log10(np.sqrt(np.mean(a ** 2)) + 1e-9)
def place(bus, a, start):
    s = int(start * SR); e = min(N, s + len(a))
    if 0 <= s < N: bus[s:e] += a[:e - s]

# ---------- voice: the take-7 chain ----------
v, vsr = sf.read(vo_path, dtype='float32')
if v.ndim > 1: v = v.mean(1)
if vsr != SR: v = np.interp(np.linspace(0, len(v) - 1, int(len(v) * SR / vsr)), np.arange(len(v)), v).astype(np.float32)
voice = np.zeros(N); voice[:min(N, len(v))] = v[:N]
voice = fft_filter(voice, lo=85, slope=1.0)
voice = voice + 0.18 * fft_filter(voice, lo=2200, hi=5200)
blk = int(0.01 * SR); nb = N // blk
rms = np.sqrt(np.mean(voice[:nb * blk].reshape(nb, blk) ** 2, 1) + 1e-9)
thr = np.percentile(rms[rms > 1e-3], 70) if np.any(rms > 1e-3) else 0.1
gain_b = np.where(rms > thr, (thr / rms) ** 0.35, 1.0)
gain = np.repeat(gain_b, blk); gain = np.pad(gain, (0, N - len(gain)), constant_values=1.0)
voice *= np.convolve(gain, np.ones(480) / 480, mode='same')
voice /= np.max(np.abs(voice)) + 1e-9
voice *= 10 ** ((-15 - rms_db(voice[np.abs(voice) > 0.02])) / 20)

# ---------- score ----------
cmd = ['ffmpeg', '-v', 'error', '-i', f'{mdir}/DeliberateThought.mp3', '-t', str(L + 1), '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-']
m = np.frombuffer(subprocess.run(cmd, capture_output=True).stdout, dtype=np.float32).reshape(-1, 2)[:N].copy()
m = np.pad(m, ((0, N - len(m)), (0, 0)))
m *= 10 ** ((-19 - rms_db(m)) / 20)
lift = C['c1a']['start'] - 0.3
env = np.ones(N); t = np.arange(N) / SR
env[t < lift] = 0.55                                    # quieter under the opening
env *= np.clip(t / 2.0, 0, 1) ** 2                       # fade in
env *= np.clip((L - t) / 3.0, 0, 1) ** 1.5               # fade under the end card
env = np.convolve(env, np.ones(2400) / 2400, mode='same')
m *= env[:, None]
# duck under the voice
blk2 = int(0.02 * SR); nb2 = N // blk2
speak = np.sqrt(np.mean(voice[:nb2 * blk2].reshape(nb2, blk2) ** 2, 1)) > 0.01
g = np.where(speak, 10 ** (-8 / 20), 1.0); sm = g.copy()
for i in range(1, nb2): sm[i] = sm[i - 1] + (g[i] - sm[i - 1]) * (0.35 if g[i] < sm[i - 1] else 0.06)
dg = np.pad(np.repeat(sm, blk2), (0, N - nb2 * blk2), constant_values=sm[-1])
m *= dg[:, None]

# ---------- accents ----------
fx = np.zeros((N, 2), np.float32)
def whoosh(at, dur=0.7, amp=0.16):
    n = int(dur * SR); x = rng.standard_normal(n)
    k = np.sin(np.linspace(0, np.pi, n)) ** 2
    y = fft_filter(x, lo=500, hi=6000) * k * amp
    place(fx, np.stack([y * 0.9, y], 1).astype(np.float32), at - dur * 0.55)
def tick(at, amp=0.10):
    n = int(0.05 * SR); tt = np.arange(n) / SR
    y = np.sin(2 * np.pi * 2600 * tt) * np.exp(-tt * 90) * amp
    place(fx, np.stack([y, y], 1).astype(np.float32), at)
def chime(at, amp=0.11):
    for f, d in [(1318.5, 0.0), (1975.5, 0.1)]:
        n = int(1.1 * SR); tt = np.arange(n) / SR
        y = (np.sin(2 * np.pi * f * tt) + 0.25 * np.sin(4 * np.pi * f * tt)) * np.exp(-tt * 4.8) * amp
        place(fx, np.stack([y, y], 1).astype(np.float32), at + d)
def boom(at, amp=0.42, f0=52, dur=1.8):
    n = int(dur * SR); tt = np.arange(n) / SR
    fr = f0 * (1 + 1.3 * np.exp(-tt * 9)); y = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-tt * 2.6) * amp
    place(fx, np.stack([y, y], 1).astype(np.float32), at)

boom(lift)
chapters = [('c1a', 'c1b'), ('c2a', 'c2b'), ('c3a', 'c3b'), ('c4a', 'c4b')]
for i, (la, lb) in enumerate(chapters):
    a = C[la]['start'] - 0.3
    if i: whoosh(a)
    if lb: whoosh(C[lb]['start'] - 0.15, amp=0.1)
    tsig = C[la]['start'] + 0.8            # signal toasts arrive during the situation
    for k in range(3): tick(tsig + k * 0.45 + 0.08)
    chime(C[lb]['end'] - 0.6)               # the product's result lands
whoosh(C['brand']['start'] - 0.45, amp=0.2); boom(C['brand']['start'] - 0.45, amp=0.3, f0=60)

mix = m + fx + np.stack([voice, voice], 1)
mix /= max(1.0, np.max(np.abs(mix)) / 0.95)
sf.write(out_path, mix, SR, subtype='PCM_24')
print('mix', L, 's ->', out_path)
