# Voice-over

The narration for "The Identity Shift" is synthetic speech made offline with [Piper](https://github.com/rhasspy/piper) (voice `en_US-lessac-high`).

- `build_vo.py` holds the script (one list per scene), synthesises each sentence, joins them with measured pauses, and writes `vo.wav` and `vo.json` (sentence timings).
- Copy `vo.json` into `src/data/voiceover.js` (as `export const VO = ...`); the film animation and captions read their timings from it.
- Encode: `ffmpeg -i vo.wav -af "loudnorm=I=-18:TP=-2:LRA=7,highpass=f=70" -ac 1 -c:a libmp3lame -b:a 64k public/audio/identity-shift.mp3`.
- To change the voice: `pip install piper-tts`, download another voice from https://huggingface.co/rhasspy/piper-voices, run `python build_vo.py <voice>.onnx`. Samples of three voices are in `docs/redesign/voice-samples/`.
- To change the words: edit `SEGS` in `build_vo.py`, regenerate, then update the timings and the matching step text in `src/components/visuals/Flows.jsx` (`STEPS`) if scene names change.
- A human recording can replace the file one-for-one if you keep the same sentence timings, or re-time the cues in `voiceover.js`.
