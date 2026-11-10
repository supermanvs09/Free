"""Sound for the product film: narration over a quiet generated score.
- Score: a slow progression of soft, detuned pads (Dmaj9, Bm11, Gmaj9, A6sus2)
  with a sub bass; a gentle eighth-note pulse joins when the brand appears.
- Accents: airy whooshes on scene changes, a chime on the brand reveal, a low
  impact with a short riser into each worst-case beat (the silent incident before
  every product line) and a low swell under the closing card.
- The score ducks under the voice. Output is 48 kHz stereo WAV; loudness is
  normalised afterwards with ffmpeg (see README).
Usage: python mix.py <vo.wav> <timings.json> <out.wav> [length_seconds]"""
import json, sys
import numpy as np, soundfile as sf

vo_path, tim_path, out_path = sys.argv[1:4]
T = json.load(open(tim_path))
SR = 48000
L = float(sys.argv[4]) if len(sys.argv) > 4 else T['duration'] + 2.2
N = int(L * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(7)
cue = {c['id']: c for c in T['lines']}

def fft_filter(x, lo=None, hi=None, slope=1.0):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); g = np.ones_like(f)
    if hi: g *= 1 / np.sqrt(1 + (f / hi) ** (4 * slope))
    if lo: g *= 1 / np.sqrt(1 + (lo / np.maximum(f, 1e-3)) ** (4 * slope))
    return np.fft.irfft(X * g, len(x))

def env_adsr(n, a, r):
    e = np.ones(n); na = min(int(a * SR), n // 2); nr = min(int(r * SR), n - na)
    e[:na] = np.linspace(0, 1, na) ** 2; e[-nr:] *= np.linspace(1, 0, nr) ** 2
    return e

# ---------- voice ----------
v, vsr = sf.read(vo_path, dtype='float32')
if vsr != SR: v = np.interp(np.linspace(0, len(v) - 1, int(len(v) * SR / vsr)), np.arange(len(v)), v).astype(np.float32)
voice = np.zeros(N); voice[:min(N, len(v))] = v[:N]
voice = fft_filter(voice, lo=85, slope=1.0)
# gentle presence lift around 3 kHz, done as a broad parallel band
voice = voice + 0.18 * fft_filter(voice, lo=2200, hi=5200)
# soft knee compression (envelope follower on 10 ms blocks)
blk = int(0.01 * SR); nb = N // blk
rms = np.sqrt(np.mean(voice[:nb * blk].reshape(nb, blk) ** 2, 1) + 1e-9)
thr = np.percentile(rms[rms > 1e-3], 70) if np.any(rms > 1e-3) else 0.1
gain_b = np.where(rms > thr, (thr / rms) ** 0.35, 1.0)
gain = np.repeat(gain_b, blk); gain = np.pad(gain, (0, N - len(gain)), constant_values=1.0)
gain = np.convolve(gain, np.ones(480) / 480, mode='same')
voice *= gain
voice /= np.max(np.abs(voice)) + 1e-9

# ---------- score ----------
def note(freq, start, dur, amp, detune=0.12, bright=1400, attack=1.6, release=2.2):
    s, n = int(start * SR), int(dur * SR)
    if s >= N: return
    n = min(n, N - s); tt = np.arange(n) / SR
    w = np.zeros(n)
    for d in (-detune, 0, detune):
        f = freq * 2 ** (d / 12)
        ph = rng.random() * 2 * np.pi
        # soft saw from a few harmonics
        for h in range(1, 7): w += np.sin(2 * np.pi * f * h * tt + ph * h) / (h ** 1.35)
    w = fft_filter(w, hi=bright, slope=0.8) * env_adsr(n, attack, release) * amp
    score_l[s:s + n] += w * 0.9; score_r[s:s + n] += w * 1.0

score_l = np.zeros(N); score_r = np.zeros(N)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)
CH = [  # midi notes
    [50, 57, 62, 64, 66, 69],      # Dmaj9 (D A D E F# A)
    [47, 54, 59, 62, 64, 69],      # Bm11
    [43, 50, 57, 59, 62, 66],      # Gmaj9
    [45, 52, 57, 59, 64, 66],      # A6sus2
]
bar = 7.4
i = 0; start = 0.0
while start < L:
    ch = CH[i % 4]
    for k, m in enumerate(ch):
        a = 0.05 if k == 0 else 0.022
        note(hz(m), start, bar + 2.4, a, bright=900 if k == 0 else 1600, attack=2.2, release=2.6)
    note(hz(ch[0] - 12), start, bar + 1.5, 0.06, detune=0.0, bright=220, attack=1.2, release=1.8)
    start += bar; i += 1

# eighth-note pulse from the brand moment to the end card
pulse_s, pulse_e = cue['brand']['start'] - 0.4, cue['cta']['start'] + 0.2
eighth = 60 / 96 / 2
p = pulse_s
while p < pulse_e:
    bar_i = int(p // bar) % 4
    m = CH[bar_i][3] + 12
    n = int(0.22 * SR); s = int(p * SR)
    if s + n < N:
        tt = np.arange(n) / SR
        w = np.sin(2 * np.pi * hz(m) * tt) * np.exp(-tt * 18) + 0.3 * np.sin(2 * np.pi * hz(m) * 2 * tt) * np.exp(-tt * 26)
        lvl = 0.016 * min(1, (p - pulse_s) / 2.5) * min(1, (pulse_e - p) / 1.5)
        pan = 0.7 if int(p / eighth) % 2 else 0.3
        score_l[s:s + n] += w * lvl * (1 - pan) * 2; score_r[s:s + n] += w * lvl * pan * 2
    p += eighth

# ---------- accents ----------
def whoosh(at, dur=1.1, amp=0.05):
    s, n = int((at - dur * 0.7) * SR), int(dur * SR)
    if s < 0: n += s; s = 0
    x = rng.standard_normal(n)
    low, high = fft_filter(x, lo=250, hi=1100, slope=0.7), fft_filter(x, lo=1800, hi=7500, slope=0.7)
    sweep = np.linspace(0, 1, n) ** 1.5
    out = low / (np.std(low) + 1e-9) * (1 - sweep) + high / (np.std(high) + 1e-9) * sweep * 0.7
    e = np.sin(np.linspace(0, np.pi, n)) ** 2
    w = out * e * amp
    score_l[s:s + n] += w * (0.6 + 0.4 * sweep); score_r[s:s + n] += w * (1.0 - 0.4 * sweep)

def chime(at, amp=0.05):
    for m, a, dec in ((86, 1.0, 1.4), (93, 0.55, 1.8), (98, 0.35, 2.2), (74, 0.5, 2.6)):
        n = int(3.2 * SR); s = int(at * SR); tt = np.arange(n) / SR
        w = (np.sin(2 * np.pi * hz(m) * tt) + 0.2 * np.sin(2 * np.pi * hz(m) * 2.01 * tt)) * np.exp(-tt * dec) * a * amp
        w *= np.minimum(1, tt / 0.004)
        score_l[s:s + n] += w; score_r[s:s + n] += w * 0.92

def swell(at, dur=3.5, amp=0.08):
    n = int(dur * SR); s = int(at * SR); tt = np.arange(n) / SR
    w = sum(np.sin(2 * np.pi * hz(m) * tt) / (1 + j) for j, m in enumerate((38, 50, 57)))
    w *= np.sin(np.linspace(0, np.pi, n)) ** 1.5 * amp
    score_l[s:s + n] += w; score_r[s:s + n] += w

fx_l = np.zeros(N); fx_r = np.zeros(N)  # impacts sit on their own bus, set against the voice, not the score

def impact(at, amp=0.16):
    # sub drop + filtered noise thump + a dry tick: the moment a worst case appears
    n = int(2.6 * SR); s = int(at * SR)
    if s + n > N: n = N - s
    tt = np.arange(n) / SR
    f = 46 * np.exp(-tt * 1.6) + 30
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 1.9)
    thump = fft_filter(rng.standard_normal(n), hi=380, slope=1.0); thump = thump / (np.std(thump) + 1e-9) * np.exp(-tt * 9) * 0.35
    tick = fft_filter(rng.standard_normal(n), lo=2500, hi=9000, slope=0.8); tick = tick / (np.std(tick) + 1e-9) * np.exp(-tt * 60) * 0.12
    w = (sub + thump + tick) * amp * np.minimum(1, tt / 0.003)
    fx_l[s:s + n] += w; fx_r[s:s + n] += w

def riser(end, dur=0.9, amp=0.03):
    n = int(dur * SR); s = int((end - dur) * SR); tt = np.arange(n) / SR
    x = fft_filter(rng.standard_normal(n), lo=900, hi=6000, slope=0.7); x /= np.std(x) + 1e-9
    w = x * (tt / dur) ** 2.2 * amp
    fx_l[s:s + n] += w * 0.9; fx_r[s:s + n] += w

def pulse(a, b, bpm=96, amp=0.09):
    # a low heartbeat under a worst-case beat: tension without music
    beat = 60 / bpm; p = a + beat
    while p < b - 0.1:
        for off, g in ((0, 1.0), (0.18, 0.6)):
            n = int(0.35 * SR); s = int((p + off) * SR)
            if s + n > N: break
            tt = np.arange(n) / SR
            w = np.sin(2 * np.pi * 52 * tt) * np.exp(-tt * 14) * g * amp
            fx_l[s:s + n] += w; fx_r[s:s + n] += w
        p += beat

# worst-case beats: they start just after the line before them ends (Film.jsx: inc1..inc4)
CHAP = [k for k in ('fraud', 'zenstra', 'cirm', 'botshield', 'icms') if k in cue]  # Film.jsx CHAPTERS, in order
INC = [(cue['brand']['end'] + 0.8 if i == 0 else cue[CHAP[i - 1]]['end'] + 0.25, k) for i, k in enumerate(CHAP)]
for a0, k in INC:
    pulse(a0, cue[k]['start'] + 0.6)
for at, _ in INC:
    riser(at); impact(at)
impact(0.45, amp=0.12)  # cold open: the night begins
if 'recap' in cue: chime(cue['recap']['start'] - 0.4, amp=0.045)  # the morning after
for k in ('shift', 'login', 'trust'):
    whoosh(cue[k]['start'] - 0.15, amp=0.035)
for k in CHAP:  # into each product: the answer arrives
    whoosh(cue[k]['start'] + 0.6, dur=0.8, amp=0.04)

# drive under the answers: a filtered 16th-note arpeggio on the chord tones, from the first
# product scene to the recap, so the product chapters move forward instead of drifting
def arp(a, b, amp=0.022, bpm=112):
    step = 60 / bpm / 4; p = a; i = 0
    while p < b:
        ch = CH[int(p // bar) % 4]
        m = ch[2 + (i % 4)] + 12
        n = int(step * 0.9 * SR); s0 = int(p * SR)
        if s0 + n >= N: break
        tt = np.arange(n) / SR
        w = sum(np.sin(2 * np.pi * hz(m) * h * tt) / h for h in (1, 2, 3, 4)) * np.exp(-tt * 22)
        lvl = amp * min(1, (p - a) / 1.5) * min(1, (b - p) / 1.5) * (1.15 if i % 4 == 0 else 0.8)
        pan = 0.35 + 0.3 * ((i // 2) % 2)
        score_l[s0:s0 + n] += w * lvl * (1 - pan) * 2; score_r[s0:s0 + n] += w * lvl * pan * 2
        p += step; i += 1
if CHAP:
    arp(cue[CHAP[0]]['start'] + 0.6, cue['recap']['start'] - 0.3 if 'recap' in cue else cue[CHAP[-1]]['end'])

def hit(at, amp=0.1):
    # a tight low tom-like hit: the product lands
    n = int(0.9 * SR); s0 = int(at * SR); tt = np.arange(n) / SR
    f = 95 * np.exp(-tt * 9) + 48
    w = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt * 7) * amp * np.minimum(1, tt / 0.002)
    fx_l[s0:s0 + n] += w * 0.6; fx_r[s0:s0 + n] += w * 0.6
for k in CHAP:
    hit(cue[k]['start'] + 0.6)
chime(cue['brand']['start'] - 0.25, amp=0.06)
whoosh(cue['brand']['start'] - 0.3, dur=1.6, amp=0.05)
swell(cue['cta']['start'] - 0.6, dur=6.5, amp=0.06)

# ---------- duck the score under the voice ----------
ve = np.abs(voice)
k = int(0.05 * SR)
ve = np.convolve(ve, np.ones(k) / k, mode='same')
att = np.convolve(ve > 0.02, np.ones(int(0.25 * SR)) / int(0.25 * SR), mode='same')
duck = 1 - 0.5 * np.clip(att, 0, 1)
score = np.stack([score_l, score_r], 1) * duck[:, None]

# fades
fade = np.clip(t / 1.2, 0, 1) * np.clip((L - t) / 2.0, 0, 1)
score *= fade[:, None]

# level the score against the voice: 18 dB under it while she speaks
speaking = att > 0.5
v_rms = np.sqrt(np.mean((voice[speaking] * 0.62) ** 2))
s_rms = np.sqrt(np.mean(score[speaking] ** 2))
score *= (v_rms / s_rms) * 10 ** (-15 / 20)  # music 15 dB under the voice
fx = np.stack([fx_l, fx_r], 1)
fx *= (np.max(np.abs(voice)) * 0.62 * 0.7) / (np.max(np.abs(fx)) + 1e-9)  # impacts peak 3 dB under the voice
mix = voice[:, None] * 0.62 + score + fx
mix /= max(1.0, np.max(np.abs(mix)) / 0.95)
sf.write(out_path, mix.astype(np.float32), SR, subtype='PCM_24')
s2 = np.sqrt(np.mean(score[speaking] ** 2)); gaps = np.sqrt(np.mean(score[~speaking] ** 2))
print(f'length {L:.2f}s  voice {20*np.log10(v_rms):.1f} dBFS  score under voice {20*np.log10(s2):.1f} dBFS  score in gaps {20*np.log10(gaps):.1f} dBFS  peak {20*np.log10(np.max(np.abs(mix))):.1f} dBFS')
