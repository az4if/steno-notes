# Steno

A little notebook that lives in your browser. Add pages, flip between them
with the tabs on the left, and everything autosaves to `localStorage` — no
backend, no build step, just three static files.

## Settings

The gear icon opens a settings panel to customize the notebook:

- **Theme** — Steno (cream/pine), Midnight (dark), Manuscript (sepia/serif),
  Slate (cool/graph)
- **Paper** — Ruled, Grid, or Blank
- **Typeface** — Mono, Serif, Sans, or Hand (handwritten)
- **Text size** — S / M / L / XL

Everything is stored in `localStorage` and reapplied on load. The ruled/grid
line spacing recalculates from the chosen text size, so the paper always
lines up correctly no matter what size you pick. Scrollbars (in the note,
the page tabs, and the settings panel) pick up the current theme's accent
color too.

## Page date

Each page has a small editable date field next to the title, next to the
delete button. New pages are stamped with today's date automatically; click
it to change it if you want to backdate a note.

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
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<repo-name>.git
   git push -u origin main
   ```
3. On GitHub: **Settings → Pages → Source → Deploy from a branch**, pick
   `main` and `/ (root)`, then **Save**.
4. Your notebook will be live at
   `https://<your-username>.github.io/<repo-name>/` within a minute or two.

## Notes

- Notes and settings are stored per-browser (`localStorage`), not synced
  anywhere — that's the tradeoff for zero backend and zero setup.
- Everything is plain HTML/CSS/JS. `app.js` holds page state and settings
  state; `styles.css` uses CSS custom properties for theme/paper/typography
  so new themes or paper styles are just a new attribute block away.
