# Voice-over

The narration for the home-page film is synthetic speech made offline with [Piper](https://github.com/rhasspy/piper) (voice `en_US-lessac-high`), over a very quiet generated music bed.

- `vo20.py <voice>.onnx <name> F` synthesises the script (the `F` list), one sentence at a time with 0.34 s pauses, and writes `<name>.wav` plus `<name>.json` (sentence start and end times in seconds).
- `mix.py <name>.wav <name>_bed.wav` adds the music bed (quiet pad that dips under the voice).
- Encode: `ffmpeg -i <name>_bed.wav -af "loudnorm=I=-16:TP=-1.5:LRA=7,highpass=f=60" -ac 1 -c:a libmp3lame -b:a 96k public/audio/identity-shift.mp3`.
- Copy the JSON timings into `src/data/voiceover.js` (five segments: shift, attack, find, trust, close). The film in `src/components/visuals/Flows.jsx` reads its cues from there, so a change of words or pace only needs the new timings.
- Setup: `python -m venv v && v/bin/pip install piper-tts`, then download a voice from https://huggingface.co/rhasspy/piper-voices.
- A human recording can replace the mp3 one-for-one if the sentence timings stay the same.
