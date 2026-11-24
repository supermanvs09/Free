# Product film

The film on the home page (`public/video/deep-algorithms-film.mp4`, 1:15). It is made from code so it can be re-cut when the products or the words change: live-action footage carries the world and the threat, and the site's own product pictures carry the answer.

**Structure.** It follows premium enterprise SaaS films: the product is the hero, shown large, simplified and true to the real app. Callouts sit on glass beside it, never inside it. There is one benefit per product, kinetic type carries the story on mute, the pacing is deliberate, and every product chapter uses the same visual system. Take 10 (current) keeps the take-7 opening and then gives four product chapters two beats each: a real situation (no names) with a person and the signals, then the product's own console on screen with the pitch line and its result. Chapters: adapID Continuous Identity Risk Management, adapID NHI Security for AWS, adapID Identity Fraud Prevention, and Zenstra AI. Score: "Deliberate Thought" by Kevin MacLeod (CC BY 4.0), low and steady. Take 9 opened like take 7, then plays six real situations without naming anyone: a person doing the action in a bright live-action shot, signal toasts, and one product card with its mark large (Null Motion's notification and phone-notify choreography, GSAP eases), plus a tracked screen replacement. Sound is `mix3.py`: the take-7 voice chain and one licensed needle-drop. Take 8 replaced the fictional bank with **real public incidents** (Change Healthcare, MGM Resorts, Snowflake customers, Salesloft Drift, India's "digital arrest" scams), each dated and sourced on screen, then shows the five products containing that kind of attack under a visible protection layer (scan, "Protected" → "Contained", lock). Sound is `mix2.py`: three licensed cues by Kevin MacLeod (CC BY 4.0, see `CREDITS.md`). The notes below describe take 7's structure; the timeline in `Film.jsx` is the source of truth.
1. **Cold open (silent):** 21:38 IST, a private bank, every system green, then "Before morning, five attacks will begin."
2. **Problem:** most access now belongs to service accounts, cloud keys and AI agents. Attackers log in, and no alert fires.
3. **Brand:** the plate opens with "catches them before they act" and shows the four product lines.
4. **Five chapters**, each a worst case on screen in silence over a heartbeat, then the product stopping it:
   1. **adapID Fraud Prevention.** A customer on a scam call sends ₹2,40,000 to a new payee, and the payment is held (< 80 ms).
   2. **Zenstra AI.** An agent exports customer records, and the action is blocked (4 ms).
   3. **adapID Identity Risk Management (CIRM).** Right password, wrong person, and every session is revoked (1.4 s).
   4. **BotShield AI.** 18,204 bot logins hit, and 6 of 37 exposures are proven and patched.
   5. **ICMS.** PII is found and refused where there is no consent; the regulator asks, and every access with its purpose is ready (< 5 min).

   The camera leans into the one row that matters, with a spotlight, and the result lands as one number on glass. A chapter marker (01/05 … 05/05) keeps the viewer oriented.
5. **Resolution:** 09:00, business as usual. "One night. Five attacks. Nothing lost."
6. **Proof, then the ask:** each phrase gets a shot that says it literally: "Built in India" over Charminar (Hyderabad), "banks" over a payment at the counter, "government" over Rashtrapati Bhavan, and "enterprises" over an Indian office team under the customer logos and certifications. Then the ask plays over the city, a one-second beat follows, and the lockup appears with the products, the button and the URL. The voice ends on "Book a demo."

| File | What it does |
| --- | --- |
| `script.json` | The narration, line by line. `lead` is the silence before the first line (the cold open plays in it). `text` is what appears on screen and in captions, `say` is what the voice reads (spellings that help pronunciation, such as "Adap-ID"), and `after` is the pause after each line. The long pauses after `brand`, `fraud`, `zenstra`, `cirm` and `botshield` are the silent worst-case beats. |
| `tts.py` | Synthesises the narration with [Kokoro](https://github.com/hexgrad/kokoro) (Apache-2.0), voice `am_fenrir` at speed 1.15, one line at a time. A line's `ph` pins how a name is said (Zenstra is `zzˈɛnstɹə`). Writes `vo.wav` and `timings.json`. The voice was chosen by measurement rather than by ear. Kokoro voices were compared with Chatterbox (MIT) on three tests: Whisper transcripts (every product name must come back right), torchaudio SQUIM quality estimates, and pitch variation. `am_fenrir` scored best on all three. |
| `footage.json` | The live-action shots: source URL, the window used (`in`, `dur`) and per-shot `lift`/`sat`. Every clip is free for commercial use without attribution (Pexels and Coverr licences). See `CREDITS.md`. |
| `footage.py` | Downloads each shot, cuts its window and gives all shots one grade (cool shadows, muted saturation, gentle film curve), so footage from different cameras cuts together. Writes 1920×1080 JPEG frames at 30 fps. |
| `mix.py` | Generates the score (soft pads, a pulse from the brand moment on, whooshes, a chime, a closing swell), plus an impact and riser into each worst-case beat on their own bus. A 16th-note arpeggio drives the product chapters, and a low hit lands each answer. The score is ducked under the voice and set 15 dB below speech. |
| `captions.py` | Writes the WebVTT captions from `timings.json`. |
| `render.mjs` | Opens `film.html` on the dev server, serves the footage frames as `/clips/…`, and captures every frame at 1920×1080. |
| `src/dev/film/Film.jsx` | The film: each scene is a pure function of time, cut to `timings.json`. Shots get a slow camera move, grain and lens falloff. The five chapters are one table (`CHAPTERS`): worst case, product picture, focus ring (measured from the DOM), headline and outcome. The product pictures are the site's own, with their steps driven by the film clock. |

## Remake it

```bash
# 1. voice (Python 3.11+): pip install kokoro-onnx soundfile
#    model files: kokoro-v1.0.onnx and voices-v1.0.bin from github.com/thewh1teagle/kokoro-onnx/releases
python tools/film/tts.py <model-dir> build/film            # vo.wav + timings.json
cp build/film/timings.json tools/film/timings.json

# 2. footage (ffmpeg, curl)
python tools/film/footage.py build/film/cache build/film/clips

# 3. sound
python tools/film/mix.py build/film/vo.wav tools/film/timings.json build/film/mix.wav 74.75

# 4. captions
python tools/film/captions.py tools/film/timings.json public/video/deep-algorithms-film.vtt

# 5. picture (Playwright with Chromium; set CHROMIUM=/path/to/chrome to use a system browser)
npm run dev &                                              # serves film.html
node tools/film/render.mjs http://localhost:5173 build/film/frames build/film/clips

# 6. encode (loudness to -16 LUFS, true peak -1.5 dB)
ffmpeg -framerate 30 -i build/film/frames/f%05d.jpg -i build/film/mix.wav -map 0:v -map 1:a \
  -af "loudnorm=I=-16:TP=-1.5:LRA=9" -ar 48000 -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p \
  -profile:v high -level 4.1 -g 60 -movflags +faststart -c:a aac -b:a 160k -shortest \
  public/video/deep-algorithms-film.mp4
ffmpeg -i public/video/deep-algorithms-film.mp4 -c:v libvpx-vp9 -b:v 0 -crf 34 -row-mt 1 -c:a libopus -b:a 128k \
  public/video/deep-algorithms-film.webm
ffmpeg -ss 26.4 -i public/video/deep-algorithms-film.mp4 -frames:v 1 -c:v libwebp -quality 86 public/video/film-poster.webp
```

Don't edit source files while `render.mjs` runs. The dev server reloads the page, and the renderer reopens it and redoes the frame, which costs time.

Check the narration by ear, or with a speech-to-text pass (for example faster-whisper `small.en`): every product name should come back spelled correctly. A professional voice recording can replace `vo.wav` one-for-one. If you do, re-time `timings.json` by hand so the scenes stay on the words. Swapping a shot means changing its `src`/`in` in `footage.json` and re-running steps 2 and 5.
