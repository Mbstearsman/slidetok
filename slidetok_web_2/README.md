# slidetok (web)

The TikTok slide generator, rebuilt as a web app — same stack as shelfdrop:
**GitHub → Render (backend) + Netlify (frontend)**.

You upload a captions file and background images (a font is optional); the
backend renders 9:16 (1080×1920) slides with every caption at the same size,
and hands back a `slides.zip`.

**Built in:** a TikTok-style font (Montserrat, bundled in `backend/fonts/`) is
used automatically when you don't upload one, and the per-slide "bubble" renders
as TikTok-style rounded pills behind each line — not one big box.

```
slidetok_web/
├── backend/            ← deploy on Render
│   ├── app.py          Flask API (wraps the engine)
│   ├── generate_images.py   the rendering engine
│   ├── requirements.txt
│   └── render.yaml
├── frontend/           ← deploy on Netlify
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── sample_captions.csv
└── netlify.toml
```

## Deploy

**1. Push to GitHub** — put this whole folder in a new repo.

**2. Backend on Render**
- New → Web Service → connect the repo.
- Set **Root Directory** to `backend`.
- Render reads `render.yaml`; otherwise: Build `pip install -r requirements.txt`,
  Start `gunicorn --timeout 180 --workers 1 app:app`.
- Deploy, then copy the service URL (e.g. `https://slidetok-api.onrender.com`).

**3. Frontend on Netlify**
- Add new site → import the same repo.
- `netlify.toml` already points the publish directory at `frontend/`, so no
  build command is needed.
- Open the site, paste your Render URL into the **Render API address** box at
  the top (it's saved on your device).

That's it. The header dot turns cyan when the frontend can reach the backend.

## Captions format

One **row per post**, one **column per slide**. `sample_captions.csv` shows the
layout. `.csv` and `.ods` both work.

## Two things worth knowing

- **Render's free tier sleeps** after ~15 min idle, so the first generate after
  a break can take ~30s while it wakes up. The button shows this while it waits.
- **CORS** is already open in `app.py`. To lock it to just your Netlify domain,
  replace `CORS(app)` with `CORS(app, origins=["https://your-site.netlify.app"])`.
