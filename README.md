# Steno

A little notebook that lives in your browser. Add pages, flip between them
with the tabs on the left, organize them into notebooks, and everything
autosaves to `localStorage` — no backend, no build step, just static files.
It also installs as a PWA and works offline.

## Notebooks & pages

- Click the notebook name (top-left) to switch notebooks, rename one
  (double-click its name in the list), or start a new one.
- **+** on the tab rail opens a page-template picker: Blank, Daily journal,
  Meeting notes, or To-do list.
- **Pin** (the pin icon) keeps a page pinned to the top of the tab list.
- **Color tag** (the circle icon) marks a page with one of six colors, shown
  as a dot on its tab.
- **Duplicate** and **Print** are in the same icon row.
- **Delete** removes a page immediately but shows an "Undo" toast for a few
  seconds — nothing is gone for good until that toast disappears.
- Drag tabs to reorder them by hand (works with mouse or touch — touch
  needs a brief press-and-hold first, so an ordinary swipe still scrolls
  the tab list).

## Settings

The gear icon opens a settings panel:

- **Theme** — Steno (cream/pine), Midnight (dark), Manuscript (sepia/serif),
  Slate (cool/graph), or Auto (follows your system's light/dark setting and
  updates live if it changes).
- **Paper** — Ruled, Grid, or Blank.
- **Typeface** — Mono, Serif, Sans, or Hand (handwritten).
- **Text size** — S / M / L / XL. The ruled/grid line spacing recalculates
  from whatever size you pick, so the paper always lines up correctly.
- **Organize** — sort tabs Manually (drag order), by Title, or by Recently
  edited. Pinned pages always float to the top regardless of sort mode.
- **Backup** — export every page in the current notebook as a JSON file,
  or import one back in (import adds pages alongside what's already there;
  it never overwrites). Turn on "Encrypt exports with a password" to have
  Export ask for a password and lock the file with real AES-GCM encryption
  (via the browser's Web Crypto API) — Import will ask for that same
  password to read it back.
- **Privacy** — set a PIN to require it before the notebook opens on this
  device. This is a privacy screen for casual snooping, not real security:
  the notes are still plain text in this browser's storage, so it won't
  stop anyone who opens developer tools. (The backup encryption above is
  the one that's genuinely secure, since it's protecting a file at rest.)

Scrollbars (in the note, the page tabs, the notebooks list, and the
settings panel) all pick up the current theme's accent color.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl`/`⌘` `K` | Search |
| `N` | New blank page |
| `[` / `]` | Previous / next page |
| `Ctrl`/`⌘` `⇧` `⌫` | Delete current page |
| `Esc` | Close whichever panel is open |

Bare-key shortcuts (`N`, `[`, `]`, `/`) only fire when you're not actively
typing in a field.

## Page date

Each page has a small editable date field next to the title. New pages are
stamped with today's date automatically; click it to change it if you want
to backdate a note.

## Install & offline

Steno is a installable PWA: open it in a browser and look for an "Install"
prompt (or use the install button if your browser shows one), and it opens
in its own window from your home screen or app launcher from then on. A
service worker caches the app shell, so it keeps working without a network
connection — a small "Offline" tag appears in Settings when you're
disconnected.

## Run it locally

Open `index.html` directly in a browser, or serve it (recommended, since
service workers need a real origin):

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

If you ship another update later, bump `CACHE_VERSION` at the top of
`sw.js` first — otherwise returning visitors' service workers may keep
serving the old cached files for a while.

## Notes

- Notebooks, pages, and settings are stored per-browser (`localStorage`),
  not synced anywhere — export a backup from Settings now and then.
- Everything is plain HTML/CSS/JS. `app.js` holds all notebook/page state
  and settings; `styles.css` uses CSS custom properties for theme, paper,
  and typography, so a new theme or paper style is just a new attribute
  block away.
