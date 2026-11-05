# Deep Algorithms Solutions · brand film (source)

The film is code: `src/index.html` is a 1920×1080 stage, and every frame is a pure function of time. Each chapter is one file:
- `cons.js`: the opening and the constellation engine
- `s_m365.js`, `s_ad.js`, `s_aws.js`, `s_bank.js`, `s_zen.js`: one file per product chapter
- `s_final.js`: the finale

The production bible, with the storyboard, claim validation and script, is in `deliverables/brand-film/PRODUCTION-BIBLE.md`.

## Rebuild

```bash
# 0. tools: Python 3.11+ (numpy scipy soundfile kokoro-onnx pillow), Node 22 + Playwright with Chromium, ffmpeg
# 1. voice: Kokoro model files (kokoro-v1.0.onnx, voices-v1.0.bin) from github.com/thewh1teagle/kokoro-onnx releases
python tools/tts.py <model-dir> build/vo                      # one WAV per line + lines.json
# 2. opening footage: Coverr "A man shutting down his PC and walking away" (1080p), frames 0.2–4.8 s
ffmpeg -ss 0.2 -t 4.6 -i desk.mp4 -vf fps=30,scale=1920:1080 -q:v 2 build/desk/raw%03d.jpg
python tools/desk_prep.py build/desk build/deskout            # grade + per-frame screen matte + rects.json
python -c "import json;r=json.load(open('build/deskout/rects.json'));open('build/deskout/rects.js','w').write('window.DESK_RECTS='+json.dumps(r))"
ln -s ../../build/deskout src/assets/desk
# 3. picture
(cd src && python -m http.server 8765) &
node tools/render.cjs http://127.0.0.1:8765/index.html build/frames 0 "" 3   # also writes build/events.json
node tools/snap.cjs <dir> 12.5 41.0 72.0                    # quick stills while editing
# 4. sound: score, sound design from events.json, narration, ducking
STEMS=1 python tools/mix.py build/events.json build/vo build/mix.wav 96
# 5. encode the master and the 30 s cut
ffmpeg -framerate 30 -i build/frames/f%05d.jpg -i build/mix.wav -af loudnorm=I=-16:TP=-1.5:LRA=11 \
  -c:v libx264 -preset slow -crf 23 -tune grain -pix_fmt yuv420p -movflags +faststart -c:a aac -b:a 192k -shortest master.mp4
python tools/cut.py build && ffmpeg -framerate 30 -i build/cut_frames/c%05d.jpg -i build/cut.wav \
  -af loudnorm=I=-14:TP=-1.5 -c:v libx264 -crf 23 -tune grain -pix_fmt yuv420p -c:a aac -shortest cut30.mp4
```

Open `src/index.html?t=41.5` in a browser to see any moment. To change a line of narration, edit `tools/vo_script.json` (`at` is its start time), re-run steps 1 and 4, and re-encode. The picture does not need re-rendering.
