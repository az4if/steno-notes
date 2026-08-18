(() => {
  "use strict";

  const STORAGE_KEY  = "steno.pages.v1";
  const ACTIVE_KEY   = "steno.active.v1";
  const SETTINGS_KEY = "steno.settings.v1";

  const DEFAULT_SETTINGS = { theme: "steno", paper: "ruled", font: "mono", size: 15 };

  const root       = document.documentElement;
  const tabRail     = document.getElementById("tabRail");
  const pageEl      = document.getElementById("page");
  const titleEl     = document.getElementById("pageTitle");
  const bodyEl      = document.getElementById("pageBody");
  const deleteBtn   = document.getElementById("deleteBtn");
  const wordCount   = document.getElementById("wordCount");
  const savedAt     = document.getElementById("savedAt");
  const emptyState    = document.getElementById("emptyState");
  const emptyAddBtn   = document.getElementById("emptyAddBtn");

  const settingsBtn     = document.getElementById("settingsBtn");
  const settingsOverlay = document.getElementById("settingsOverlay");
  const settingsClose   = document.getElementById("settingsClose");
  const themeRow  = document.getElementById("themeRow");
  const paperRow  = document.getElementById("paperRow");
  const fontRow   = document.getElementById("fontRow");
  const sizeRow   = document.getElementById("sizeRow");

  /** @type {{id:string, title:string, body:string, updatedAt:number}[]} */
  let pages = [];
  let activeId = null;
  let saveTimer = null;
  let savedFlashTimer = null;
  let settings = Object.assign({}, DEFAULT_SETTINGS);

  // ---------------------------------------------------------------
  // Pages: persistence
  // ---------------------------------------------------------------
  function load() {
    let storedActiveId = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      pages = raw ? JSON.parse(raw) : [];
      storedActiveId = localStorage.getItem(ACTIVE_KEY);
    } catch (e) {
      // localStorage unavailable (private mode, disabled storage, etc.) —
      // fall back to an in-memory notebook for this session.
      pages = [];
    }
    if (!Array.isArray(pages) || pages.length === 0) {
      pages = [freshPage("Page 1")];
    }
    activeId = storedActiveId || pages[0].id;
    if (!pages.some(p => p.id === activeId)) activeId = pages[0].id;
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pages));
      localStorage.setItem(ACTIVE_KEY, activeId);
    } catch (e) {
      // Storage unavailable or full — keep working in memory for this
      // session rather than throwing and breaking the UI.
    }
  }

  function freshPage(title) {
    return {
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())),
      title: title || "",
      body: "",
      updatedAt: Date.now(),
    };
  }

  // ---------------------------------------------------------------
  // Settings: persistence + dynamic layout application
  // ---------------------------------------------------------------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const overrides = (parsed && typeof parsed === "object") ? parsed : {};
      settings = Object.assign({}, DEFAULT_SETTINGS, overrides);
    } catch (e) {
      settings = Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      // ignore — settings just won't survive a reload this session
    }
  }

  // Derive a matching line-height and rule-line offset from a font size,
  // so the ruled/grid background always lines up with the text baseline
  // no matter what size is picked. Keeps the "paper" genuinely dynamic
  // instead of hard-coded to one font size.
  function computeLineMetrics(fontSize) {
    const lineHeight = Math.round(fontSize * 1.8);
    const offset = Math.round(lineHeight * 0.3);
    return { lineHeight, offset };
  }

  function applySettings() {
    root.dataset.theme = settings.theme;
    root.dataset.paper = settings.paper;
    root.dataset.font = settings.font;

    const { lineHeight, offset } = computeLineMetrics(settings.size);
    root.style.setProperty("--font-size", settings.size + "px");
    root.style.setProperty("--line-height", lineHeight + "px");
    root.style.setProperty("--rule-offset", offset + "px");

    setActiveButton(themeRow, settings.theme);
    setActiveButton(paperRow, settings.paper);
    setActiveButton(fontRow, settings.font);
    setActiveButton(sizeRow, String(settings.size));
  }

  function setActiveButton(row, value) {
    if (!row) return;
    const children = Array.prototype.slice.call(row.children);
    for (const btn of children) {
      btn.classList.toggle("active", btn.dataset.value === String(value));
    }
  }

  function wireSettingsRow(row, key, parseAsNumber) {
    if (!row) return;
    row.addEventListener("click", (e) => {
      const btn = e.target.closest(".swatch, .option-btn");
      if (!btn || !row.contains(btn)) return;
      settings[key] = parseAsNumber ? Number(btn.dataset.value) : btn.dataset.value;
      persistSettings();
      applySettings();
    });
  }

  function openSettings() {
    settingsOverlay.hidden = false;
  }

  function closeSettings() {
    settingsOverlay.hidden = true;
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function render() {
    renderTabs();
    renderPage();
  }

  function renderTabs() {
    tabRail.innerHTML = "";

    for (const p of pages) {
      const btn = document.createElement("button");
      btn.className = "tab" + (p.id === activeId ? " active" : "");
      btn.type = "button";
      btn.textContent = p.title.trim() || "Untitled";
      btn.title = p.title.trim() || "Untitled";
      btn.addEventListener("click", () => selectPage(p.id));
      tabRail.appendChild(btn);
    }

    const addBtn = document.createElement("button");
    addBtn.className = "tab-add";
    addBtn.type = "button";
    addBtn.setAttribute("aria-label", "Add a page");
    addBtn.textContent = "+";
    addBtn.addEventListener("click", addPage);
    tabRail.appendChild(addBtn);
  }

  function renderPage() {
    const active = pages.find(p => p.id === activeId);

    if (!active) {
      pageEl.hidden = true;
      emptyState.hidden = false;
      return;
    }

    pageEl.hidden = false;
    emptyState.hidden = true;

    titleEl.value = active.title;
    bodyEl.value = active.body;
    updateWordCount();
    savedAt.classList.remove("visible");
  }

  function updateWordCount() {
    const words = bodyEl.value.trim().split(/\s+/).filter(Boolean).length;
    wordCount.textContent = words === 1 ? "1 word" : `${words} words`;
  }

  function flashSaved() {
    savedAt.textContent = "Saved";
    savedAt.classList.add("visible");
    clearTimeout(savedFlashTimer);
    savedFlashTimer = setTimeout(() => savedAt.classList.remove("visible"), 1200);
  }

  // ---------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------
  function selectPage(id) {
    activeId = id;
    persist();
    renderTabs();
    renderPage();
  }

  function addPage() {
    const p = freshPage(`Page ${pages.length + 1}`);
    pages.push(p);
    activeId = p.id;
    persist();
    render();
    titleEl.focus();
    titleEl.select();
  }

  function deleteActivePage() {
    const active = pages.find(p => p.id === activeId);
    if (!active) return;

    const label = active.title.trim() || "this untitled page";
    const ok = window.confirm(`Tear out "${label}"? This can't be undone.`);
    if (!ok) return;

    const idx = pages.findIndex(p => p.id === activeId);
    pages.splice(idx, 1);

    if (pages.length > 0) {
      activeId = pages[Math.max(0, idx - 1)].id;
    } else {
      activeId = null;
    }

    persist();
    render();
  }

  function scheduleSave() {
    const active = pages.find(p => p.id === activeId);
    if (!active) return;

    active.title = titleEl.value;
    active.body = bodyEl.value;
    active.updatedAt = Date.now();
    updateWordCount();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persist();
      renderTabs();
      flashSaved();
    }, 400);
  }

  // ---------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------
  titleEl.addEventListener("input", scheduleSave);
  bodyEl.addEventListener("input", scheduleSave);
  deleteBtn.addEventListener("click", deleteActivePage);
  emptyAddBtn.addEventListener("click", addPage);

  settingsBtn.addEventListener("click", openSettings);
  settingsClose.addEventListener("click", closeSettings);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !settingsOverlay.hidden) closeSettings();
  });

  wireSettingsRow(themeRow, "theme", false);
  wireSettingsRow(paperRow, "paper", false);
  wireSettingsRow(fontRow, "font", false);
  wireSettingsRow(sizeRow, "size", true);

  // Save immediately before the tab closes so nothing is lost.
  window.addEventListener("beforeunload", () => {
    const active = pages.find(p => p.id === activeId);
    if (active) {
      active.title = titleEl.value;
      active.body = bodyEl.value;
    }
    persist();
  });

  loadSettings();
  applySettings();
  load();
  render();
})();
