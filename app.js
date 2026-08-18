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
  const dateEl      = document.getElementById("pageDate");
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

  const exportBtn  = document.getElementById("exportBtn");
  const importBtn  = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");

  const searchBtn      = document.getElementById("searchBtn");
  const searchOverlay  = document.getElementById("searchOverlay");
  const searchClose    = document.getElementById("searchClose");
  const searchInput    = document.getElementById("searchInput");
  const searchResults  = document.getElementById("searchResults");

  const duplicateBtn = document.getElementById("duplicateBtn");
  const printBtn      = document.getElementById("printBtn");
  const offlineTag     = document.getElementById("offlineTag");
  const notebookStats  = document.getElementById("notebookStats");
  const installBtn     = document.getElementById("installBtn");
  const installHint    = document.getElementById("installHint");

  /** @type {{id:string, title:string, body:string, updatedAt:number}[]} */
  let pages = [];
  let activeId = null;
  let saveTimer = null;
  let savedFlashTimer = null;
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let dragState = null;

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
    // Backfill dates for pages saved before this feature existed, so
    // nothing shows up blank.
    for (const p of pages) {
      if (!p.date) p.date = formatToday();
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
      date: formatToday(),
      body: "",
      updatedAt: Date.now(),
    };
  }

  // Human-friendly "Aug 18, 2026" style date for a fresh page. Kept as a
  // plain editable string on the page itself, not regenerated on load, so
  // a page always keeps the date it was created with unless you change it.
  function formatToday() {
    try {
      return new Date().toLocaleDateString(undefined, {
        month: "short", day: "numeric", year: "numeric",
      });
    } catch (e) {
      const d = new Date();
      return (d.getMonth() + 1) + "/" + d.getDate() + "/" + d.getFullYear();
    }
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
  // Search
  // ---------------------------------------------------------------
  function openSearch() {
    searchOverlay.hidden = false;
    searchInput.value = "";
    renderSearchResults("");
    setTimeout(() => searchInput.focus(), 0);
  }

  function closeSearch() {
    searchOverlay.hidden = true;
  }

  function renderSearchResults(query) {
    const q = query.trim().toLowerCase();
    searchResults.innerHTML = "";

    if (!q) {
      const hint = document.createElement("p");
      hint.className = "search-hint";
      hint.textContent = "Type to search titles and notes.";
      searchResults.appendChild(hint);
      return;
    }

    const matches = [];
    for (const p of pages) {
      const snippet = buildSnippet(p, q);
      if (snippet !== null) matches.push({ page: p, snippet });
    }

    if (matches.length === 0) {
      const hint = document.createElement("p");
      hint.className = "search-hint";
      hint.textContent = "No matches.";
      searchResults.appendChild(hint);
      return;
    }

    for (const m of matches) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "search-result";

      const titleRow = document.createElement("div");
      titleRow.className = "search-result-title";
      titleRow.textContent = m.page.title.trim() || "Untitled";

      const snippetRow = document.createElement("div");
      snippetRow.className = "search-result-snippet";
      snippetRow.textContent = m.snippet;

      item.appendChild(titleRow);
      item.appendChild(snippetRow);
      item.addEventListener("click", () => {
        selectPage(m.page.id);
        closeSearch();
      });
      searchResults.appendChild(item);
    }
  }

  function buildSnippet(page, q) {
    const title = page.title || "";
    const body = page.body || "";

    if (title.toLowerCase().indexOf(q) !== -1) {
      return body ? truncateClean(body, 80) : "No content yet";
    }

    const idx = body.toLowerCase().indexOf(q);
    if (idx === -1) return null;

    const start = Math.max(0, idx - 30);
    const end = Math.min(body.length, idx + q.length + 30);
    let snippet = body.slice(start, end).replace(/\s+/g, " ").trim();
    if (start > 0) snippet = "\u2026" + snippet;
    if (end < body.length) snippet = snippet + "\u2026";
    return snippet;
  }

  function truncateClean(str, n) {
    const clean = str.replace(/\s+/g, " ").trim();
    return clean.length > n ? clean.slice(0, n) + "\u2026" : clean;
  }

  // Tabs fall back to the first line of the note when there's no title,
  // so a quick jotted page is still recognizable at a glance instead of
  // sitting in the rail as "Untitled".
  function tabLabel(p) {
    const title = p.title.trim();
    if (title) return title;
    const firstLine = (p.body || "").split("\n").find(l => l.trim().length > 0);
    return firstLine ? truncateClean(firstLine, 22) : "Untitled";
  }

  // ---------------------------------------------------------------
  // Backup: export / import
  // ---------------------------------------------------------------
  function exportBackup() {
    const payload = {
      app: "steno",
      version: 1,
      exportedAt: new Date().toISOString(),
      pages: pages,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = "steno-backup-" + stamp + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (e) {
        window.alert("That file doesn't look like a valid Steno backup.");
        return;
      }

      const incoming = Array.isArray(data) ? data : data.pages;
      if (!Array.isArray(incoming) || incoming.length === 0) {
        window.alert("No pages found in that file.");
        return;
      }

      const count = incoming.length;
      const ok = window.confirm(
        "Import " + count + (count === 1 ? " page" : " pages") +
        "? They'll be added alongside your current notes."
      );
      if (!ok) return;

      for (const raw of incoming) {
        if (!raw || typeof raw !== "object") continue;
        const p = freshPage(typeof raw.title === "string" ? raw.title : "");
        p.body = typeof raw.body === "string" ? raw.body : "";
        p.date = (typeof raw.date === "string" && raw.date) ? raw.date : formatToday();
        pages.push(p);
      }
      persist();
      render();
      closeSettings();
    };
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function render() {
    renderTabs();
    renderPage();
    updateNotebookStats();
  }

  function renderTabs() {
    tabRail.innerHTML = "";

    for (const p of pages) {
      const btn = document.createElement("button");
      btn.className = "tab" + (p.id === activeId ? " active" : "");
      btn.type = "button";
      btn.dataset.id = p.id;
      btn.textContent = tabLabel(p);
      btn.title = p.title.trim() || "Untitled";
      btn.addEventListener("click", () => selectPage(p.id));
      btn.addEventListener("pointerdown", (e) => onTabPointerDown(e, p.id, btn));
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

  // ---------------------------------------------------------------
  // Drag-to-reorder tabs (Pointer Events, works for mouse + touch)
  //
  // Mouse: dragging starts as soon as the pointer moves past a small
  // threshold. Touch: requires a brief press-and-hold first, so an
  // ordinary swipe still scrolls the tab rail instead of being
  // hijacked into a reorder. Reordering itself only happens once, on
  // drop — during the drag we just highlight whichever tab is under
  // the pointer as the target.
  // ---------------------------------------------------------------
  function onTabPointerDown(e, pageId, tabEl) {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    dragState = {
      id: pageId,
      tabEl,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dragging: false,
      targetId: null,
      pressTimer: null,
      moveHandler: null,
      upHandler: null,
    };

    dragState.moveHandler = (ev) => onTabPointerMove(ev);
    dragState.upHandler = (ev) => onTabPointerUp(ev);

    try { tabEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    tabEl.addEventListener("pointermove", dragState.moveHandler);
    tabEl.addEventListener("pointerup", dragState.upHandler);
    tabEl.addEventListener("pointercancel", dragState.upHandler);

    if (e.pointerType === "touch" || e.pointerType === "pen") {
      dragState.pressTimer = setTimeout(() => {
        if (dragState) beginTabDrag();
      }, 380);
    }
  }

  function beginTabDrag() {
    if (!dragState || dragState.dragging) return;
    dragState.dragging = true;
    dragState.tabEl.classList.add("tab-dragging");
  }

  function onTabPointerMove(e) {
    if (!dragState) return;
    const dx = e.clientX - dragState.startX;
    const dy = e.clientY - dragState.startY;
    const dist = Math.hypot(dx, dy);
    const isTouch = e.pointerType === "touch" || e.pointerType === "pen";

    if (!dragState.dragging) {
      if (!isTouch && dist > 6) {
        beginTabDrag();
      } else if (isTouch && dist > 8) {
        // Moved too much before the long-press fired — this was a
        // scroll attempt, not a drag. Back off entirely.
        teardownTabDrag();
        return;
      } else {
        return;
      }
    }

    // Actively dragging: stop the rail from scrolling and highlight
    // whichever tab the pointer is currently over.
    e.preventDefault();
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetTab = el ? el.closest(".tab") : null;
    clearDropTarget();
    if (targetTab && targetTab !== dragState.tabEl && tabRail.contains(targetTab)) {
      targetTab.classList.add("tab-drop-target");
      dragState.targetId = targetTab.dataset.id;
    } else {
      dragState.targetId = null;
    }
  }

  function onTabPointerUp() {
    if (!dragState) return;
    const { id, targetId, dragging } = dragState;
    teardownTabDrag();

    if (dragging && targetId && targetId !== id) {
      const fromIdx = pages.findIndex(p => p.id === id);
      const toIdx = pages.findIndex(p => p.id === targetId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [movedPage] = pages.splice(fromIdx, 1);
        pages.splice(toIdx, 0, movedPage);
        persist();
      }
    }
    renderTabs();
  }

  function teardownTabDrag() {
    if (!dragState) return;
    clearTimeout(dragState.pressTimer);
    const { tabEl, pointerId, moveHandler, upHandler } = dragState;
    try { tabEl.releasePointerCapture(pointerId); } catch (err) { /* ignore */ }
    tabEl.removeEventListener("pointermove", moveHandler);
    tabEl.removeEventListener("pointerup", upHandler);
    tabEl.removeEventListener("pointercancel", upHandler);
    tabEl.classList.remove("tab-dragging");
    clearDropTarget();
    dragState = null;
  }

  function clearDropTarget() {
    const existing = tabRail.querySelector(".tab-drop-target");
    if (existing) existing.classList.remove("tab-drop-target");
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
    dateEl.value = active.date || "";
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

  function duplicatePage() {
    const active = pages.find(p => p.id === activeId);
    if (!active) return;

    const copy = freshPage(active.title ? active.title + " copy" : "");
    copy.body = active.body;
    copy.date = active.date;

    const idx = pages.findIndex(p => p.id === activeId);
    pages.splice(idx + 1, 0, copy);
    activeId = copy.id;
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
    active.date = dateEl.value;
    active.body = bodyEl.value;
    active.updatedAt = Date.now();
    updateWordCount();

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      persist();
      renderTabs();
      updateNotebookStats();
      flashSaved();
    }, 400);
  }

  // ---------------------------------------------------------------
  // Notebook stats (shown in Settings)
  // ---------------------------------------------------------------
  function updateNotebookStats() {
    if (!notebookStats) return;
    const pageCount = pages.length;
    const totalWords = pages.reduce((sum, p) => {
      const body = (p.body || "").trim();
      return sum + (body ? body.split(/\s+/).length : 0);
    }, 0);
    const pageWord = pageCount === 1 ? "page" : "pages";
    const totalWord = totalWords === 1 ? "word" : "words";
    notebookStats.textContent =
      `${pageCount} ${pageWord} \u00b7 ${totalWords.toLocaleString()} ${totalWord} total.`;
  }

  // ---------------------------------------------------------------
  // Online / offline status
  // ---------------------------------------------------------------
  function updateOnlineStatus() {
    if (!offlineTag) return;
    offlineTag.hidden = navigator.onLine;
  }

  // ---------------------------------------------------------------
  // PWA: install prompt + service worker
  // ---------------------------------------------------------------
  let deferredInstallPrompt = null;

  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
  }

  function initInstall() {
    if (!installBtn) return;

    if (isStandalone()) {
      if (installHint) installHint.textContent = "You're using the installed app.";
      return;
    }

    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault();
      deferredInstallPrompt = e;
      installBtn.hidden = false;
      if (installHint) {
        installHint.textContent = "Install Steno to open it in its own window and use it offline.";
      }
    });

    installBtn.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      installBtn.hidden = true;
      deferredInstallPrompt.prompt();
      try { await deferredInstallPrompt.userChoice; } catch (e) { /* ignore */ }
      deferredInstallPrompt = null;
    });

    window.addEventListener("appinstalled", () => {
      installBtn.hidden = true;
      if (installHint) installHint.textContent = "Steno is installed. Look for it on your home screen or app launcher.";
    });
  }

  function initServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {
        // Offline support just won't be available this session — the
        // notebook itself still works fine off localStorage.
      });
    });
  }

  // ---------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------
  function stepPage(delta) {
    if (pages.length === 0) return;
    const idx = pages.findIndex(p => p.id === activeId);
    if (idx === -1) return;
    const nextIdx = (idx + delta + pages.length) % pages.length;
    selectPage(pages[nextIdx].id);
  }

  function isTypingTarget(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA";
  }

  // ---------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------
  titleEl.addEventListener("input", scheduleSave);
  dateEl.addEventListener("input", scheduleSave);
  bodyEl.addEventListener("input", scheduleSave);
  deleteBtn.addEventListener("click", deleteActivePage);
  duplicateBtn.addEventListener("click", duplicatePage);
  printBtn.addEventListener("click", () => window.print());
  emptyAddBtn.addEventListener("click", addPage);

  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  settingsBtn.addEventListener("click", openSettings);
  settingsClose.addEventListener("click", closeSettings);
  settingsOverlay.addEventListener("click", (e) => {
    if (e.target === settingsOverlay) closeSettings();
  });

  searchBtn.addEventListener("click", openSearch);
  searchClose.addEventListener("click", closeSearch);
  searchOverlay.addEventListener("click", (e) => {
    if (e.target === searchOverlay) closeSearch();
  });
  searchInput.addEventListener("input", () => renderSearchResults(searchInput.value));

  exportBtn.addEventListener("click", exportBackup);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", () => {
    const file = importFile.files && importFile.files[0];
    if (file) importBackup(file);
    importFile.value = "";
  });

  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;

    // Ctrl/Cmd+K — open search, from anywhere.
    if (mod && !e.shiftKey && !e.altKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      openSearch();
      return;
    }

    // Ctrl/Cmd+Shift+Backspace — delete the current page, from anywhere.
    if (mod && e.shiftKey && e.key === "Backspace") {
      e.preventDefault();
      deleteActivePage();
      return;
    }

    // Escape — close whichever overlay is open.
    if (e.key === "Escape") {
      if (!searchOverlay.hidden) { closeSearch(); return; }
      if (!settingsOverlay.hidden) { closeSettings(); return; }
      return;
    }

    // Everything below is a bare-key shortcut, so only fire it when
    // the person isn't actively typing in a field, and leave modifier
    // combos alone so we don't clash with browser/OS shortcuts.
    if (isTypingTarget(e.target) || mod || e.altKey) return;

    if (e.key === "n" || e.key === "N") {
      e.preventDefault();
      addPage();
    } else if (e.key === "/") {
      e.preventDefault();
      openSearch();
    } else if (e.key === "[") {
      e.preventDefault();
      stepPage(-1);
    } else if (e.key === "]") {
      e.preventDefault();
      stepPage(1);
    }
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
      active.date = dateEl.value;
      active.body = bodyEl.value;
    }
    persist();
  });

  loadSettings();
  applySettings();
  load();
  render();
  updateOnlineStatus();
  initInstall();
  initServiceWorker();
})();
