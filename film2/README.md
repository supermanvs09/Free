# Deep Algorithms Solutions · 120 s brand advertisement (source)

Live-action plates, graded and cut from `tools/edl.json`, with product screens and Null Motion-style graphics (GSAP timelines seeked per frame) rendered on top.

- `src/timeline.js`: the edit, connection grids, product lockups and the brand end card
- `src/ui.js`: product screens
- `tools/mix.py`: score, location ambience, sound design and voice mix

The production book is in `deliverables/brand-ad-120s/PRODUCTION-BOOK.md`.

## Rebuild

```bash
# footage: download the clips in tools/footage-credits.json (1080p) into build/src as <id>.mp4
python tools/prep_shots.py build/src build/shots && ln -s ../build/shots src/shots   # grade + cut every shot
python tools/tts.py <kokoro-model-dir> build/vo                                     # or drop in a recorded voice, one WAV per line id
(cd src && python -m http.server 8766) &
node tools/render.cjs http://127.0.0.1:8766/index.html build/frames 0 "" 3            # frames + build/events.json
STEMS=1 python tools/mix.py build/events.json build/vo tools/edl.json build/mix.wav
ffmpeg -framerate 30 -i build/frames/f%05d.jpg -i build/mix.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 \
  -c:v libx264 -preset slow -crf 21 -tune film -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k -shortest master.mp4
```

To change the voice-over, replace the WAVs in `build/vo` (keep `lines.json`), adjust start times in `tools/edl.json` under `vo`, then re-run the mix and the encode. The frames don't need re-rendering.
