# Steno

A little notebook that lives in your browser. Add pages, flip between them
with the tabs on the left, and everything autosaves to `localStorage` — no
backend, no build step, just three static files.

## Run it locally

Open `index.html` directly in a browser, or serve it:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Deploy to GitHub Pages

1. Create a new repo on GitHub (don't initialize it with a README).
2. From this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git branch -M main
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source → Deploy from a branch**, pick
   `main` and `/ (root)`, then **Save**.
4. Your notebook will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Notes

- Notes are stored per-browser (`localStorage`), not synced anywhere —
  that's the tradeoff for zero backend and zero setup.
- Everything is plain HTML/CSS/JS, so it's easy to extend: `app.js` holds
  all the page state and rendering logic.
