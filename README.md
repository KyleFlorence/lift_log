# Lift Log

A deliberately small workout tracker that runs as a home-screen web app on a phone.

- **Blocks → days → exercises.** A block is a named program (for example "Fall 2026"). Each block has days (A, B, C…), and each day lists exercises.
- **Last time, pre-filled.** Open a day and every exercise starts with the weights and reps from the last time you did it. Tap + or − to bump a set, or type a number.
- **Per-set tracking.** 3 sets of 8 are recorded as 8, 8, 8, so you can improve one set or all of them.
- **Notes that come back.** A note you leave today shows up under the exercise next time (the last 3 by default). Each exercise can also carry a sticky note such as "seat 4, wide grip".
- **Load types.** Weight (lb) is the default. Bodyweight (+ added lb), band (pick from your own list), and timed (seconds) are one tap away when adding an exercise.
- **Check off** exercises as you go. Done exercises collapse to a one-line summary.
- **History** by session and by exercise. Sessions can be re-dated if you forgot to log one.
- **Dark mode** follows the phone, with a manual override in Settings.

Data lives only in the phone's browser storage. There is no account and no server. Settings has export and import for backups.

Live at **https://kyleflorence.github.io/lift_log/** (source: https://github.com/KyleFlorence/lift_log).

## Use it on an iPhone

1. Open https://kyleflorence.github.io/lift_log/ in Safari.
2. Tap Share, then **Add to Home Screen**.
3. Open it from the home screen. It runs full-screen and works offline.

Installing to the home screen matters: iOS can clear storage for ordinary Safari tabs that go unused for a week, but it keeps data for installed web apps. Export a backup now and then anyway, and before switching phones.

Friends can use the same URL. Each phone keeps its own data.

## Hosting on GitHub Pages

The repo only contains code, so a public repo exposes nothing personal.

1. In the repo on GitHub: **Settings → Pages → Build and deployment**. Set Source to "Deploy from a branch", pick `main` and `/ (root)`, and save.
2. After a minute the app is live at `https://kyleflorence.github.io/lift_log/`.

Every later push to `main` redeploys automatically. If you fork this for yourself, the URL becomes `https://<you>.github.io/<repo>/`; nothing in the code needs to change because all paths are relative.

## Run locally

Any static file server works. For example:

```bash
python -m http.server 8765
```

Then open `http://localhost:8765/`.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell and iOS web-app meta tags |
| `app.js` | All logic: storage, program editor, session logging, history, settings |
| `styles.css` | Styling, light and dark themes |
| `sw.js` | Service worker: network first, cache fallback for offline use |
| `manifest.webmanifest` | Home-screen install metadata |
| `icons/` | App icons |

No build step and no dependencies.

## How data is stored

One JSON object in `localStorage` under the key `liftlog.v1`:

- `blocks[]`: `{ id, name, createdAt, days[] }` where each day is `{ id, name, exercises[] }` and each exercise is `{ id, name, type, sets, note }`. `type` is `lb`, `bw`, `band`, or `time`.
- `sessions[]`: one per day per date: `{ id, blockId, dayId, date, createdAt, entries }`. Each entry records the exercise name, type, `sets[]` of `{ w, r, s, band }`, a note, a done flag, and a touched flag.
- `settings`: step sizes, number of past notes shown, theme, band names.

"Last time" is found by exercise name, case-insensitive, across all blocks. Renaming an exercise in the program offers to rename its past entries too. A session where nothing was edited or checked is discarded automatically, so opening a day by accident leaves no trace.
