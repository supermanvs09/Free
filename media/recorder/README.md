# Screen recorder (MP4 for any web app)

Plays a list of steps in a real browser, records each run and saves it as an
MP4 (H.264, 1600×900, no audio) that plays anywhere: WhatsApp, Slack, e-mail,
PowerPoint, QuickTime, VLC.

## Setup (once)

1. Node.js 18 or later
2. ffmpeg on PATH: `brew install ffmpeg` · `sudo apt install ffmpeg` · `choco install ffmpeg`
3. In this folder:

   ```bash
   npm install
   npx playwright install chromium
   ```

## Use

1. Copy `recordings.example.json` to `recordings.json` and edit it for your app:
   `baseUrl`, the `login` steps (selectors of your sign-in form), and one
   entry in `recordings` per video.
2. Start your app, then:

   ```bash
   APP_USER='you@example.com' APP_PASSWORD='…' node record.mjs recordings.json
   node record.mjs recordings.json leak      # only the recording named "leak"
   ```

   On Windows PowerShell: `$env:APP_USER='…'; $env:APP_PASSWORD='…'; node record.mjs recordings.json`

3. The MP4s are in `out/`, plus `combined` (all of them in one file) if set.

Passwords are read from environment variables (`"$APP_USER"` in the config),
so the config file can be shared without credentials in it.

## Steps

| Step | Does |
|---|---|
| `{ "goto": "/path" }` | Open a page (relative to `baseUrl`) |
| `{ "click": "selector" }` | Click (CSS, `text=Save`, `button >> nth=2`) |
| `{ "fill": ["#email", "value"] }` | Type into a field (`"$NAME"` reads an env var) |
| `{ "press": "Control+Shift+L" }` | Press keys |
| `{ "hover": "selector" }` | Move the mouse over an element |
| `{ "scroll": 600 }` | Scroll down by pixels |
| `{ "waitFor": "selector" }` | Wait until it is visible |
| `{ "waitForUrl": "/dashboard" }` | Wait until the URL contains this |
| `{ "wait": 3000 }` | Wait in ms: let an animation or demo play |
| `{ "mark": true }` | The video starts here; everything before is cut |

Each recording can also set `"leadIn": 1.5`: the seconds kept before the mark.

## Tips

- Sign-in happens once, outside the videos; each recording starts signed in.
- Put `{ "mark": true }` right before the action people should see, so page
  loading is not in the video.
- Use `wait` generously at the end, so the final state stays on screen for a
  few seconds.
- Size: change `viewport`. 1600×900 reads well on a laptop and a phone.
- The recorder only records what your app shows. Guided effects such as a
  moving cursor, zoom and captions must be built into the app itself (in the
  NHI console that is the live-scenario presenter opened with Ctrl+Shift+L).
