"""Original score, sound design and narration mix for the brand film.
Everything is synthesised here (no samples), then cut to the film's own event list.
Usage: python mix.py <events.json> <vo-dir> <out.wav> [duration]"""
import json, os, sys
import numpy as np, soundfile as sf
from scipy import signal

SR = 48000
ev_path, vo_dir, out = sys.argv[1], sys.argv[2], sys.argv[3]
DUR = float(sys.argv[4]) if len(sys.argv) > 4 else 96.0
N = int(DUR * SR)
rs = np.random.default_rng(7)
music = np.zeros((N, 2)); sfx = np.zeros((N, 2)); vo = np.zeros((N, 2)); verb_send = np.zeros((N, 2))

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12)
def env_adsr(n, a, d, s, r, sr=SR):
    a, d, r = int(a * sr), int(d * sr), int(r * sr)
    e = np.full(n, s, float)
    e[:a] = np.linspace(0, 1, max(a, 1))[:len(e[:a])]
    e[a:a + d] = np.linspace(1, s, max(d, 1))[:len(e[a:a + d])]
    if r: e[-r:] *= np.linspace(1, 0, r)[-len(e[-r:]):]
    return e
def place(buf, x, t, gain=1.0, pan=0.0, send=0.0):
    i = int(t * SR)
    if i >= N or i + len(x) <= 0: return
    if x.ndim == 1:
        l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
        x = np.stack([x * l, x * r], 1) * 1.414
    j0 = max(0, -i); x = x[j0:]; i = max(i, 0); n = min(len(x), N - i)
    buf[i:i + n] += x[:n] * gain
    if send: verb_send[i:i + n] += x[:n] * gain * send
def tt(n): return np.arange(n) / SR
def lp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'low', fs=SR, output='sos'), x, axis=0)
def hp(x, f, order=2): return signal.sosfilt(signal.butter(order, f, 'high', fs=SR, output='sos'), x, axis=0)
def bp(x, f1, f2, order=2): return signal.sosfilt(signal.butter(order, [f1, f2], 'band', fs=SR, output='sos'), x, axis=0)

# ---------------- instruments ----------------
def pad_voice(freq, dur, bright=0.5, att=1.2, rel=1.5):
    n = int(dur * SR); t = tt(n); y = np.zeros((n, 2))
    for k, det in enumerate((-7, 0, 6)):
        f = freq * 2 ** (det / 1200); ph = rs.random() * 6.28
        s = np.zeros(n)
        for h in range(1, 9):
            if f * h > 9000: break
            s += np.sin(2 * np.pi * f * h * t + ph * h) / h * np.exp(-h / (2 + 6 * bright))
        pan = (k - 1) * 0.6
        y[:, 0] += s * np.cos((pan + 1) * np.pi / 4); y[:, 1] += s * np.sin((pan + 1) * np.pi / 4)
    lfo = 1 + 0.06 * np.sin(2 * np.pi * 0.18 * t + rs.random() * 6)
    return y * (env_adsr(n, att, 0.5, 0.85, min(rel, dur * 0.5)) * lfo)[:, None] * 0.12
def pad(notes, t0, dur, gain, bright=0.5, att=1.2, rel=1.6, send=0.5):
    for m in notes: place(music, lp(pad_voice(mtof(m), dur, bright, att, rel), 2400 + 3000 * bright), t0, gain, send=send)
def pluck(m, t0, gain, pan=0.0, decay=0.35, bright=1.0, send=0.35, kind='pluck'):
    f = mtof(m); n = int((decay * 4 + 0.05) * SR); t = tt(n)
    if kind == 'mallet':
        s = np.sin(2 * np.pi * f * t) * np.exp(-t / decay) + 0.35 * np.sin(2 * np.pi * f * 4.0 * t) * np.exp(-t / (decay * 0.18)) + 0.1 * np.sin(2 * np.pi * f * 10 * t) * np.exp(-t / 0.02)
    else:
        s = np.zeros(n)
        for h in range(1, 7): s += np.sin(2 * np.pi * f * h * t) / h ** 1.3 * np.exp(-t / (decay / (1 + (h - 1) * 0.6 / bright)))
    s *= np.minimum(1, t / 0.003)
    place(music, s * 0.22, t0, gain, pan, send)
def bell(m, t0, gain, pan=0.0, decay=2.4, send=0.6, buf=None):
    f = mtof(m); n = int(decay * 3 * SR); t = tt(n)
    s = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / (decay * d)) for r, a, d in ((1, 1, 1), (2.0, 0.35, 0.6), (2.76, 0.25, 0.35), (5.4, 0.12, 0.15), (8.93, 0.06, 0.08)))
    s *= np.minimum(1, t / 0.002)
    place(sfx if buf is None else buf, s * 0.25, t0, gain, pan, send)
def boom(t0, gain, f0=110, f1=38, dur=1.6, send=0.4, buf=None):
    n = int(dur * SR); t = tt(n); f = f1 + (f0 - f1) * np.exp(-t / 0.08)
    s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (dur * 0.35))
    s += lp(rs.standard_normal(n), 900) * np.exp(-t / 0.05) * 0.4
    place(sfx if buf is None else buf, s * 0.8, t0, gain, 0, send)
def noise_sweep(t0, dur, f_from, f_to, gain, shape='up', pan=0.0, send=0.4, rev=False):
    n = int(dur * SR); t = tt(n); x = rs.standard_normal(n)
    bands = np.geomspace(f_from, f_to, 10); y = np.zeros(n)
    for k, fc in enumerate(bands):
        c = (k + 0.5) / len(bands); w = np.exp(-((t / dur - c) ** 2) / 0.02)
        y += bp(x, fc / 1.4, min(fc * 1.4, SR / 2 - 100)) * w
    e = (t / dur) ** 2 if shape == 'up' else np.sin(np.pi * t / dur) if shape == 'mid' else np.exp(-t / (dur * 0.3))
    y = y * e
    if rev: y = y[::-1]
    place(sfx, y * 0.5, t0, gain, pan, send)
def click(t0, gain, f=3200, dec=0.004, pan=0.0, send=0.08):
    n = int(0.04 * SR); t = tt(n)
    s = hp(rs.standard_normal(n), 1500) * np.exp(-t / dec) + 0.5 * np.sin(2 * np.pi * f * t) * np.exp(-t / (dec * 1.5))
    place(sfx, s * 0.4, t0, gain, pan, send)
def thump(t0, gain, f=70, dur=0.25, send=0.1, buf=None):
    n = int(dur * SR); t = tt(n); fr = f + 60 * np.exp(-t / 0.02)
    s = np.sin(2 * np.pi * np.cumsum(fr) / SR) * np.exp(-t / (dur * 0.3))
    place(sfx if buf is None else buf, s, t0, gain, 0, send)
def tone(m, t0, dur, gain, pan=0.0, send=0.3, buf=None, wave='sine'):
    n = int(dur * SR); t = tt(n); f = mtof(m)
    s = np.sin(2 * np.pi * f * t) + (0.25 * np.sin(2 * np.pi * 2 * f * t) if wave == 'soft' else 0)
    s *= env_adsr(n, 0.006, dur * 0.3, 0.5, dur * 0.5)
    place(sfx if buf is None else buf, s * 0.3, t0, gain, pan, send)

# ---------------- score ----------------
CH = {'Dm': [50, 57, 62, 65, 69, 76], 'Bb': [46, 53, 62, 65, 69, 72], 'F': [41, 48, 57, 60, 64, 67], 'C': [48, 55, 64, 67, 74, 79], 'D': [50, 57, 62, 66, 69, 76], 'Gm': [43, 50, 58, 62, 65, 70]}
PROG = ['Dm', 'Bb', 'F', 'C']
BAR, GRID0 = 2.5, 15.0
# opening: a drone, then the identity world blooms
pad([26, 38], 0.0, 11.4, 0.9, bright=0.15, att=2.0, rel=1.2, send=0.3)
pad(CH['Dm'][1:], 4.0, 4.3, 0.75, bright=0.45, att=0.9, rel=1.4)
pad(CH['Bb'][1:], 8.0, 3.4, 0.7, bright=0.35, att=0.9, rel=1.2)
for k in range(int((11.2 - 8.9) / 0.625)):   # tension pulse
    thump(8.9 + k * 0.625, 0.55 + 0.1 * k / 4, f=48, dur=0.4, buf=music)
pad([63, 75], 8.9, 2.3, 0.35, bright=0.7, att=1.6, rel=0.4)  # dissonant colour (Eb) under the threat
# chapters: one progression on a 96 bpm grid; each chapter changes the voice
SECT = [  # start, end, pluck kind, pluck gain, pad gain, kick, hats, octave
    (15.0, 25.0, 'pluck', 0.55, 0.42, 0.55, 0.0, 0),
    (25.0, 35.0, 'pluck', 0.6, 0.45, 0.6, 0.18, 12),
    (35.0, 47.5, 'pluck', 0.62, 0.45, 0.65, 0.24, 0),
    (47.5, 65.0, 'mallet', 0.75, 0.5, 0.55, 0.2, 12),
    (65.0, 70.0, 'mallet', 0.5, 0.35, 0.0, 0.12, 12),
    (72.5, 82.5, 'pluck', 0.65, 0.5, 0.65, 0.26, 12),
]
pad(CH['Dm'][:4], 11.25, 3.9, 0.45, bright=0.3, att=0.6, rel=1.2)
PAT = [3, 4, 2, 4, 3, 5, 2, 4]
for (a, b, kind, pg, padg, kick, hats, octv) in SECT:
    bar0 = int(np.ceil((a - GRID0) / BAR - 1e-6)); t = GRID0 + bar0 * BAR
    while t < b - 0.01:
        ch = CH[PROG[int(round((t - GRID0) / BAR)) % 4]]
        L = min(BAR, b - t)
        pad(ch[1:5], t, L + 0.6, padg, bright=0.45, att=0.25, rel=0.8)
        place(music, lp(pad_voice(mtof(ch[0] - 12), L + 0.3, 0.1, 0.05, 0.4), 300), t, 0.9, send=0.05)
        for e in range(8):
            te = t + e * BAR / 8
            if te >= b: break
            m = ch[PAT[e] if PAT[e] < len(ch) else -1] + octv
            pluck(m, te, pg * (1 if e % 2 == 0 else 0.7), pan=0.35 * np.sin(e * 1.3), kind=kind, decay=0.42 if kind == 'mallet' else 0.3)
            if kick and e in (0, 4): thump(te, kick, f=52, dur=0.35, buf=music)
            if hats and e % 2 == 1:
                n = int(0.05 * SR); h = hp(rs.standard_normal(n), 7000) * np.exp(-tt(n) / 0.012)
                place(music, h * 0.25, te, hats, pan=0.3)
        t += BAR
# Zenstra: build, then silence before the click, then the block
noise_sweep(68.6, 1.85, 300, 9000, 0.42, 'up', send=0.4)
pad([38, 50], 70.0, 1.6, 0.25, bright=0.1, att=0.4, rel=0.5)
pad(CH['Dm'][1:], 72.3, 2.6, 0.45, bright=0.6, att=0.5, rel=1.0)
# finale: from minor into D major, then the sonic logo
pad(CH['Bb'][1:], 82.4, 2.8, 0.45, bright=0.35, att=1.0, rel=1.0)
pad(CH['Gm'][1:], 85.0, 2.8, 0.45, bright=0.4, att=0.8, rel=1.0)
pad(CH['C'][:5], 86.6, 1.4, 0.45, bright=0.45, att=0.6, rel=0.6)
pad(CH['D'], 87.6, 8.4, 0.62, bright=0.6, att=0.5, rel=3.2)
pad([38, 26], 87.6, 8.4, 0.7, bright=0.1, att=0.6, rel=3.0)
for k in range(12): pluck(CH['D'][2 + k % 4] + 12, 87.6 + k * 0.3125, 0.4 * (1 - k / 14), pan=0.4 * np.sin(k), decay=0.5)

# ---------------- sound design from the film's events ----------------
events = json.load(open(ev_path))
for e in events:
    t, ty = e['t'], e['type']
    if ty == 'key':
        r = rs.random(); click(t, 0.28 * e.get('v', 1) * (0.7 + 0.5 * r), f=2400 + 1600 * r, dec=0.003 + 0.002 * r, pan=(r - 0.5) * 0.3)
        thump(t, 0.05, f=180, dur=0.05)
    elif ty == 'space': click(t, 0.3, f=1500, dec=0.006); thump(t, 0.08, f=120, dur=0.07)
    elif ty == 'tap': tone(96, t, 0.06, 0.25, send=0.2); click(t, 0.12, f=5000, dec=0.002)
    elif ty == 'click': click(t, 0.5, f=2800, dec=0.004); click(t + 0.07, 0.35, f=2200, dec=0.004)
    elif ty == 'uiIn': noise_sweep(t - 0.12, 0.4, 900, 7000, 0.18, 'mid', send=0.3); tone(86, t + 0.05, 0.25, 0.18, send=0.4)
    elif ty == 'tick': tone(93, t, 0.08, 0.2, pan=0.2, send=0.25)
    elif ty == 'alert': tone(81, t, 0.16, 0.33, send=0.4, wave='soft'); tone(77, t + 0.13, 0.22, 0.3, send=0.4, wave='soft')
    elif ty == 'alertHi': tone(76, t, 0.16, 0.4, send=0.4, wave='soft'); tone(72, t + 0.13, 0.26, 0.38, send=0.45, wave='soft'); thump(t, 0.3, f=60)
    elif ty == 'impact': boom(t, 0.75, 90, 34, 2.2, send=0.5)
    elif ty == 'hit': boom(t, 0.6, 120, 40, 1.8, send=0.5); bell(86, t + 0.02, 0.4, -0.2); bell(93, t + 0.02, 0.28, 0.2)
    elif ty in ('success', 'confirm', 'ping'): tone(86, t, 0.12, 0.3, send=0.4); tone(93, t + 0.09, 0.28, 0.3, send=0.5)
    elif ty == 'whooshIn': noise_sweep(t, e.get('d', 1.4), 200, 9000, 0.55, 'up', send=0.5)
    elif ty == 'dive': noise_sweep(t, 1.05, 150, 10000, 0.6, 'up', send=0.5); boom(t + 1.0, 0.45, 70, 30, 1.4)
    elif ty == 'pushIn': pass
    elif ty in ('streak', 'swipe'): noise_sweep(t, 0.45, 800, 8000, 0.25, 'mid', pan=0.3, send=0.3)
    elif ty == 'reveal':
        for k, m in enumerate((86, 90, 93, 98)): bell(m, t + k * 0.06, 0.12, pan=(k - 1.5) * 0.4, decay=3.0, send=0.9)
    elif ty == 'tension': pass
    elif ty == 'room':
        n = int(4.2 * SR); x = lp(rs.standard_normal((n, 2)), 400) * 0.05 * env_adsr(n, 0.4, 0.1, 1, 1.2)[:, None]; place(sfx, x, t, 1.0)
    elif ty == 'build': click(t, 0.35, f=3600, dec=0.006, pan=rs.random() - 0.5, send=0.4); thump(t, 0.2, f=90, dur=0.15)
    elif ty == 'token': [tone(m, t + k * 0.06, 0.1, 0.18, send=0.35) for k, m in enumerate((84, 88, 91))]
    elif ty == 'spread':
        n = int(0.35 * SR); tq = tt(n); s = np.sin(2 * np.pi * np.cumsum(500 + 900 * tq / 0.35) / SR) * np.exp(-tq / 0.15); place(sfx, s * 0.12, t, 1, rs.random() - 0.5, 0.4)
    elif ty in ('step', 'stepHi'): pluck(62 if ty == 'step' else 58, t, 0.9, decay=0.25, send=0.4); thump(t, 0.25 if ty == 'step' else 0.5, f=60)
    elif ty == 'flag': tone(88, t, 0.07, 0.28, pan=0.15, send=0.3)
    elif ty == 'paste': noise_sweep(t, 0.18, 2000, 9000, 0.25, 'down', send=0.2); click(t, 0.3, f=2600)
    elif ty == 'heart': thump(t, 0.42, f=46, dur=0.32); thump(t + 0.16, 0.28, f=44, dur=0.3)
    elif ty == 'zenScan':
        noise_sweep(t - 0.5, 0.55, 300, 6000, 0.35, 'up', send=0.5, rev=False)
        n = int(0.6 * SR); tq = tt(n); s = np.sin(2 * np.pi * np.cumsum(200 + 2400 * tq / 0.6) / SR) * np.sin(np.pi * tq / 0.6) ** 2; place(sfx, s * 0.08, t, 1, 0, 0.5)
    elif ty == 'block':
        boom(t, 0.62, 140, 36, 2.6, send=0.55)
        for k, m in enumerate((62, 65, 69, 74, 81)): bell(m, t, 0.15, pan=(k - 2) * 0.3, decay=2.2, send=0.8)
        n = int(0.5 * SR); x = hp(rs.standard_normal(n), 4000) * np.exp(-tt(n) / 0.12); place(sfx, x * 0.25, t, 1, 0, 0.6)
    elif ty == 'banner': tone(84, t, 0.16, 0.28, send=0.4); tone(88, t + 0.11, 0.3, 0.28, send=0.5)
    elif ty == 'converge': noise_sweep(t, 1.6, 200, 8000, 0.3, 'up', send=0.6)
    elif ty == 'link': [bell(m, t + k * 0.12, 0.13, (k - 1) * 0.4, 2.2) for k, m in enumerate((81, 86, 88))]
    elif ty == 'swell': noise_sweep(t, 1.3, 120, 5000, 0.28, 'up', send=0.7)
    elif ty == 'logo':
        boom(t, 0.5, 100, 36, 3.0, send=0.6)
        for k, m in enumerate((74, 81, 90)): bell(m, t + k * 0.24, 0.42 - k * 0.04, pan=(k - 1) * 0.35, decay=3.2, send=0.8)
        bell(62, t, 0.2, 0, 3.5, 0.6)

# ---------------- narration ----------------
L = json.load(open(os.path.join(vo_dir, 'lines.json')))
for ln in L['lines']:
    x, sr = sf.read(os.path.join(vo_dir, ln['id'] + '.wav'), dtype='float64')
    if x.ndim > 1: x = x.mean(1)
    x = signal.resample_poly(x, SR, sr)
    x = hp(x, 75, 4)
    # gentle compression: tame peaks, even out words
    env = np.sqrt(signal.sosfilt(signal.butter(1, 8, fs=SR, output='sos'), x ** 2) + 1e-9)
    g = np.minimum(1, (0.12 / env) ** 0.35); x = x * g
    x = x / (np.max(np.abs(x)) + 1e-9) * 0.75
    place(vo, x, ln['at'], 1.0, 0, 0.06)

# ---------------- reverb, ducking, master ----------------
def reverb(x, secs=2.6, damp=5000):
    n = int(secs * SR); t = tt(n)
    ir = rs.standard_normal((n, 2)) * np.exp(-t / (secs * 0.28))[:, None]
    ir = lp(ir, damp); ir[:int(0.012 * SR)] = 0; ir /= np.sqrt((ir ** 2).sum(0))
    return np.stack([signal.fftconvolve(x[:, c], ir[:, c])[:len(x)] for c in range(2)], 1)
wet = reverb(verb_send)
# sidechain: music and effects make room for the voice
v = np.abs(vo).max(1); fr = int(0.01 * SR); nf = len(v) // fr
venv = v[:nf * fr].reshape(nf, fr).max(1)
gm = np.ones(nf); g = 1.0
for i in range(nf):
    tgt = 0.42 if venv[i] > 0.02 else 1.0
    g += (tgt - g) * (0.35 if tgt < g else 0.04)
    gm[i] = g
gain = np.interp(np.arange(N), np.arange(nf) * fr + fr / 2, gm)[:, None]
mix = (music * 0.9 + wet * 0.55) * gain + sfx * (0.6 + 0.4 * gain) + vo * 1.0
mix = hp(mix, 25, 2)
# soft limiter
pk = np.max(np.abs(mix)); mix = mix / pk * 0.98
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
fade = int(0.9 * SR); mix[-fade:] *= np.linspace(1, 0, fade)[:, None]
sf.write(out, mix.astype(np.float32), SR, subtype='PCM_24')
if os.environ.get('STEMS'):
    d = os.path.dirname(os.path.abspath(out))
    np.save(os.path.join(d, 'stem_music.npy'), ((music * 0.9 + wet * 0.55)).astype(np.float32))
    np.save(os.path.join(d, 'stem_sfx.npy'), (sfx * 1.0).astype(np.float32))
    np.save(os.path.join(d, 'stem_vo.npy'), vo.astype(np.float32))
    np.save(os.path.join(d, 'stem_norm.npy'), np.array([pk]))
print('wrote', out, round(len(mix) / SR, 2), 's')
