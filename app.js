(() => {
  "use strict";

  const STORAGE_KEY        = "steno.pages.v1";        // legacy, migrated from
  const ACTIVE_KEY         = "steno.active.v1";        // legacy, migrated from
  const SETTINGS_KEY       = "steno.settings.v1";
  const NOTEBOOKS_KEY      = "steno.notebooks.v1";
  const CURRENT_NB_KEY     = "steno.currentNotebook.v1";
  const PIN_HASH_KEY       = "steno.pinHash.v1";
  const UNLOCKED_KEY       = "steno.unlocked.v1"; // sessionStorage

  const DEFAULT_SETTINGS = {
    theme: "steno", paper: "ruled", font: "mono", size: 15,
    sort: "manual", encryptBackups: false,
  };

  const COLOR_HEX = {
    red: "#c0564f", orange: "#c9853e", yellow: "#c7ab41",
    green: "#4f8f5b", blue: "#3f6fb0", purple: "#7a539c",
  };

  const TEMPLATES = [
    { id: "blank",   name: "Blank page",    desc: "Start with a clean page.", body: "" },
    { id: "journal", name: "Daily journal", desc: "A simple daily reflection.", body: "Today I\u2026\n\nGrateful for\u2026\n\nTomorrow I will\u2026" },
    { id: "meeting", name: "Meeting notes", desc: "Attendees, agenda, action items.", body: "Attendees:\n\nAgenda:\n\nNotes:\n\nAction items:\n" },
    { id: "todo",    name: "To-do list",    desc: "A quick checklist.", body: "- [ ] \n- [ ] \n- [ ] " },
  ];

  // Matches a checklist line written as "- [ ] " (or an already
  // checked "- [ \u2713 ] " / legacy "- [x] ") with no leading
  // indentation — exactly what the To-do template writes.
  const CHECKLIST_LINE_RE = /^-\s\[[^\]]*\]/;

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
  const sortRow   = document.getElementById("sortRow");

  const exportBtn  = document.getElementById("exportBtn");
  const importBtn  = document.getElementById("importBtn");
  const importFile = document.getElementById("importFile");
  const encryptBackupToggle = document.getElementById("encryptBackupToggle");
  const setPinBtn    = document.getElementById("setPinBtn");
  const removePinBtn = document.getElementById("removePinBtn");

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

  const pinBtn          = document.getElementById("pinBtn");
  const colorBtn        = document.getElementById("colorBtn");
  const colorDotPreview = document.getElementById("colorDotPreview");
  const colorPopover    = document.getElementById("colorPopover");
  const colorPickerWrap = document.querySelector(".color-picker-wrap");

  const notebookSwitchBtn  = document.getElementById("notebookSwitchBtn");
  const notebookNameLabel  = document.getElementById("notebookNameLabel");
  const notebooksOverlay   = document.getElementById("notebooksOverlay");
  const notebooksClose     = document.getElementById("notebooksClose");
  const notebookList       = document.getElementById("notebookList");
  const newNotebookBtn     = document.getElementById("newNotebookBtn");

  const templateOverlay = document.getElementById("templateOverlay");
  const templateClose   = document.getElementById("templateClose");
  const templateList    = document.getElementById("templateList");

  const lockOverlay   = document.getElementById("lockOverlay");
  const lockPanel      = document.querySelector(".lock-panel");
  const lockPinInput  = document.getElementById("lockPinInput");
  const lockUnlockBtn = document.getElementById("lockUnlockBtn");
  const lockError      = document.getElementById("lockError");

  const undoToast      = document.getElementById("undoToast");
  const undoToastLabel = document.getElementById("undoToastLabel");
  const undoBtn        = document.getElementById("undoBtn");

  /** @type {{id:string, name:string, pages:object[], activePageId:string}[]} */
  let notebooks = [];
  let currentNotebookId = null;
  /** @type {{id:string, title:string, date:string, body:string, updatedAt:number, pinned:boolean, color:string}[]} */
  let pages = [];
  let activeId = null;
  let saveTimer = null;
  let savedFlashTimer = null;
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let dragState = null;
  let pendingDelete = null;
  let undoTimer = null;

  function freshId() {
    return crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random());
  }

  // ---------------------------------------------------------------
  // Themed dialogs — a drop-in replacement for window.alert/confirm/
  // prompt. Native dialogs are drawn by the OS/browser and ignore the
  // page's theme entirely (e.g. a bright white confirm box popping up
  // over the Midnight theme), so these build a small themed panel
  // instead, using the same overlay pattern as Settings/Search/etc.
  // Each returns a Promise: showAlert -> undefined, showConfirm ->
  // boolean, showPrompt -> string | null (null means cancelled).
  // ---------------------------------------------------------------
  function openDialog(opts) {
    const { kind, title, message, defaultValue, placeholder, danger, confirmLabel, cancelLabel } = opts;

    return new Promise((resolve) => {
      const overlay = document.createElement("div");
      overlay.className = "dialog-overlay";

      const panel = document.createElement("div");
      panel.className = "dialog-panel";
      panel.setAttribute("role", "alertdialog");
      panel.setAttribute("aria-modal", "true");
      if (title) panel.setAttribute("aria-label", title);

      if (title) {
        const h = document.createElement("h2");
        h.className = "dialog-title";
        h.textContent = title;
        panel.appendChild(h);
      }

      if (message) {
        const p = document.createElement("p");
        p.className = "dialog-message";
        p.textContent = message;
        panel.appendChild(p);
      }

      let input = null;
      if (kind === "prompt") {
        input = document.createElement("input");
        input.type = (placeholder || "").toLowerCase().includes("password") ? "password" : "text";
        input.className = "dialog-input";
        input.value = defaultValue || "";
        if (placeholder) input.placeholder = placeholder;
        input.autocomplete = "off";
        input.spellcheck = false;
        panel.appendChild(input);
      }

      const actions = document.createElement("div");
      actions.className = "dialog-actions";

      let cancelBtn = null;
      if (kind !== "alert") {
        cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "dialog-btn dialog-btn-secondary";
        cancelBtn.textContent = cancelLabel || "Cancel";
        actions.appendChild(cancelBtn);
      }

      const okBtn = document.createElement("button");
      okBtn.type = "button";
      okBtn.className = "dialog-btn " + (danger ? "dialog-btn-danger" : "dialog-btn-primary");
      okBtn.textContent = confirmLabel || "OK";
      actions.appendChild(okBtn);

      panel.appendChild(actions);
      overlay.appendChild(panel);
      document.body.appendChild(overlay);

      const previouslyFocused = document.activeElement;

      function cleanup(result) {
        document.removeEventListener("keydown", onKeydown, true);
        overlay.removeEventListener("mousedown", onOverlayMousedown);
        overlay.remove();
        if (previouslyFocused && typeof previouslyFocused.focus === "function") {
          try { previouslyFocused.focus(); } catch (e) { /* ignore */ }
        }
        resolve(result);
      }

      function confirmAndClose() {
        cleanup(kind === "prompt" ? input.value : true);
      }

      function dismiss() {
        cleanup(kind === "prompt" ? null : false);
      }

      okBtn.addEventListener("click", confirmAndClose);
      if (cancelBtn) cancelBtn.addEventListener("click", dismiss);

      // Only dismiss on a click that both starts and ends on the
      // overlay backdrop itself, so dragging a text selection out
      // past the panel edge doesn't accidentally close the dialog.
      function onOverlayMousedown(e) {
        if (e.target !== overlay) return;
        const onUp = (upEvent) => {
          overlay.removeEventListener("mouseup", onUp);
          if (upEvent.target === overlay) dismiss();
        };
        overlay.addEventListener("mouseup", onUp);
      }
      overlay.addEventListener("mousedown", onOverlayMousedown);

      function onKeydown(e) {
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          dismiss();
        } else if (e.key === "Enter" && kind === "prompt" && document.activeElement === input) {
          e.preventDefault();
          e.stopPropagation();
          confirmAndClose();
        }
      }
      document.addEventListener("keydown", onKeydown, true);

      setTimeout(() => {
        if (input) { input.focus(); input.select(); }
        else okBtn.focus();
      }, 0);
    });
  }

  function showAlert(message, opts) {
    return openDialog(Object.assign({ kind: "alert", message, confirmLabel: "OK" }, opts));
  }
  function showConfirm(message, opts) {
    return openDialog(Object.assign({ kind: "confirm", message, confirmLabel: "OK" }, opts));
  }
  function showPrompt(message, defaultValue, opts) {
    return openDialog(Object.assign({ kind: "prompt", message, defaultValue, confirmLabel: "OK" }, opts));
  }

  // ---------------------------------------------------------------
  // Notebooks + pages: persistence
  // ---------------------------------------------------------------
  function loadNotebooks() {
    try {
      const raw = localStorage.getItem(NOTEBOOKS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) notebooks = parsed;
      }
    } catch (e) {
      notebooks = [];
    }

    if (!Array.isArray(notebooks) || notebooks.length === 0) {
      // Migrate from the old single flat-notebook format, if there's one
      // sitting in storage from before notebooks existed.
      let legacyPages = null;
      let legacyActive = null;
      try {
        const rawPages = localStorage.getItem(STORAGE_KEY);
        legacyPages = rawPages ? JSON.parse(rawPages) : null;
        legacyActive = localStorage.getItem(ACTIVE_KEY);
      } catch (e) { /* ignore */ }

      if (Array.isArray(legacyPages) && legacyPages.length > 0) {
        notebooks = [{
          id: freshId(),
          name: "Notebook 1",
          pages: legacyPages,
          activePageId: legacyActive || legacyPages[0].id,
        }];
      } else {
        const p = freshPage("Page 1");
        notebooks = [{ id: freshId(), name: "Notebook 1", pages: [p], activePageId: p.id }];
      }
    }

    // Backfill fields for data saved before newer features existed.
    for (const nb of notebooks) {
      if (!Array.isArray(nb.pages) || nb.pages.length === 0) {
        const p = freshPage("Page 1");
        nb.pages = [p];
      }
      for (const p of nb.pages) {
        if (!p.date) p.date = formatToday();
        if (typeof p.pinned !== "boolean") p.pinned = false;
        if (typeof p.color !== "string") p.color = "";
      }
      if (!nb.activePageId || !nb.pages.some(pg => pg.id === nb.activePageId)) {
        nb.activePageId = nb.pages[0].id;
      }
      if (!nb.name) nb.name = "Untitled notebook";
    }

    let storedCurrent = null;
    try { storedCurrent = localStorage.getItem(CURRENT_NB_KEY); } catch (e) { /* ignore */ }
    currentNotebookId = (storedCurrent && notebooks.some(n => n.id === storedCurrent))
      ? storedCurrent
      : notebooks[0].id;

    const current = getCurrentNotebook();
    pages = current.pages;
    activeId = current.activePageId;
  }

  function persistNotebooks() {
    const current = getCurrentNotebook();
    if (current) current.activePageId = activeId;
    try {
      localStorage.setItem(NOTEBOOKS_KEY, JSON.stringify(notebooks));
      localStorage.setItem(CURRENT_NB_KEY, currentNotebookId);
    } catch (e) {
      // Storage unavailable or full — keep working in memory for this
      // session rather than throwing and breaking the UI.
    }
  }

  function getCurrentNotebook() {
    return notebooks.find(n => n.id === currentNotebookId) || notebooks[0];
  }

  function switchNotebook(id) {
    const nb = notebooks.find(n => n.id === id);
    if (!nb) return;
    currentNotebookId = id;
    pages = nb.pages;
    activeId = nb.activePageId && pages.some(p => p.id === nb.activePageId)
      ? nb.activePageId
      : (pages[0] ? pages[0].id : null);
    persistNotebooks();
    updateNotebookHeader();
    render();
  }

  async function createNotebook() {
    const name = await showPrompt("Name this notebook:", "Notebook " + (notebooks.length + 1), {
      title: "New notebook", confirmLabel: "Create",
    });
    if (name === null) return;
    const p = freshPage("Page 1");
    const nb = {
      id: freshId(),
      name: name.trim() || ("Notebook " + (notebooks.length + 1)),
      pages: [p],
      activePageId: p.id,
    };
    notebooks.push(nb);
    switchNotebook(nb.id);
    closeNotebooks();
  }

  async function renameNotebook(nb) {
    const newName = await showPrompt("New name for this notebook:", nb.name, {
      title: "Rename notebook", confirmLabel: "Rename",
    });
    if (newName === null) return;
    nb.name = newName.trim() || nb.name;
    persistNotebooks();
    renderNotebookList();
    updateNotebookHeader();
  }

  async function deleteNotebook(id) {
    if (notebooks.length <= 1) return;
    const nb = notebooks.find(n => n.id === id);
    if (!nb) return;
    const count = nb.pages.length;
    const ok = await showConfirm(
      "Delete notebook \u201c" + nb.name + "\u201d and " + count + (count === 1 ? " page" : " pages") +
      " inside it? This can't be undone.",
      { title: "Delete notebook", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;

    const idx = notebooks.findIndex(n => n.id === id);
    notebooks.splice(idx, 1);

    if (currentNotebookId === id) {
      switchNotebook(notebooks[Math.max(0, idx - 1)].id);
    } else {
      persistNotebooks();
    }
    renderNotebookList();
  }

  function updateNotebookHeader() {
    const nb = getCurrentNotebook();
    notebookNameLabel.textContent = nb ? nb.name : "Notebook";
  }

  function freshPage(title) {
    return {
      id: freshId(),
      title: title || "",
      date: formatToday(),
      body: "",
      updatedAt: Date.now(),
      pinned: false,
      color: "",
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

  function resolveTheme(themeSetting) {
    if (themeSetting !== "auto") return themeSetting;
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    return prefersDark ? "midnight" : "steno";
  }

  function applySettings() {
    root.dataset.theme = resolveTheme(settings.theme);
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
    setActiveButton(sortRow, settings.sort);

    if (notebooks.length > 0) renderTabs();
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
  // Backup: export / import, optionally password-encrypted
  //
  // Encryption uses the browser's real Web Crypto API (PBKDF2 + AES-GCM)
  // — this is genuine encryption of the exported file, unlike the PIN
  // lock below which is only a screen, not real security.
  // ---------------------------------------------------------------
  function hasSubtleCrypto() {
    return !!(window.crypto && window.crypto.subtle);
  }

  function bufToBase64(bytes) {
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function base64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function deriveKey(password, salt, usage) {
    const enc = new TextEncoder().encode(password);
    return crypto.subtle.importKey("raw", enc, "PBKDF2", false, ["deriveKey"]).then(keyMaterial =>
      crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        [usage]
      )
    );
  }

  function encryptString(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(password, salt, "encrypt").then(key => {
      const enc = new TextEncoder().encode(plaintext);
      return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc).then(cipherBuf => ({
        app: "steno",
        encrypted: true,
        version: 1,
        salt: bufToBase64(salt),
        iv: bufToBase64(iv),
        data: bufToBase64(new Uint8Array(cipherBuf)),
      }));
    });
  }

  function decryptString(payload, password) {
    const salt = base64ToBuf(payload.salt);
    const iv = base64ToBuf(payload.iv);
    const data = base64ToBuf(payload.data);
    return deriveKey(password, salt, "decrypt").then(key =>
      crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data).then(plainBuf =>
        new TextDecoder().decode(plainBuf)
      )
    );
  }

  function downloadJSON(obj, encrypted) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().slice(0, 10);
    a.download = "steno-backup-" + stamp + (encrypted ? "-encrypted" : "") + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function exportBackup() {
    const payload = {
      app: "steno",
      version: 2,
      exportedAt: new Date().toISOString(),
      notebookName: getCurrentNotebook() ? getCurrentNotebook().name : "",
      pages: pages,
    };

    if (encryptBackupToggle && encryptBackupToggle.checked) {
      if (!hasSubtleCrypto()) {
        await showAlert("Encrypted backups aren't available in this browsing context. Try the hosted (https) version.", { title: "Can't encrypt" });
        return;
      }
      const password = await showPrompt("Set a password to encrypt this backup:", "", {
        title: "Encrypt backup", placeholder: "Password", confirmLabel: "Encrypt & export",
      });
      if (!password) return;
      try {
        const enc = await encryptString(JSON.stringify(payload), password);
        downloadJSON(enc, true);
      } catch (e) {
        await showAlert("Couldn't encrypt this backup on this device.", { title: "Export failed" });
      }
      return;
    }

    downloadJSON(payload, false);
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      let data;
      try {
        data = JSON.parse(String(reader.result));
      } catch (e) {
        await showAlert("That file doesn't look like a valid Steno backup.", { title: "Import failed" });
        return;
      }

      if (data && data.encrypted) {
        if (!hasSubtleCrypto()) {
          await showAlert("Encrypted backups aren't available in this browsing context. Try the hosted (https) version.", { title: "Can't decrypt" });
          return;
        }
        const password = await showPrompt("Enter the password for this backup:", "", {
          title: "Encrypted backup", placeholder: "Password", confirmLabel: "Unlock",
        });
        if (!password) return;
        try {
          const plaintext = await decryptString(data, password);
          let inner;
          try {
            inner = JSON.parse(plaintext);
          } catch (e) {
            await showAlert("Wrong password, or this file is corrupted.", { title: "Import failed" });
            return;
          }
          await finishImport(inner);
        } catch (e) {
          await showAlert("Wrong password, or this file is corrupted.", { title: "Import failed" });
        }
        return;
      }

      await finishImport(data);
    };
    reader.readAsText(file);
  }

  async function finishImport(data) {
    const incoming = Array.isArray(data) ? data : data.pages;
    if (!Array.isArray(incoming) || incoming.length === 0) {
      await showAlert("No pages found in that file.", { title: "Import failed" });
      return;
    }

    const count = incoming.length;
    const ok = await showConfirm(
      "Import " + count + (count === 1 ? " page" : " pages") +
      "? They'll be added alongside your current notes.",
      { title: "Import backup", confirmLabel: "Import" }
    );
    if (!ok) return;

    for (const raw of incoming) {
      if (!raw || typeof raw !== "object") continue;
      const p = freshPage(typeof raw.title === "string" ? raw.title : "");
      p.body = typeof raw.body === "string" ? raw.body : "";
      p.date = (typeof raw.date === "string" && raw.date) ? raw.date : formatToday();
      p.color = typeof raw.color === "string" ? raw.color : "";
      pages.push(p);
    }
    persistNotebooks();
    render();
    closeSettings();
  }

  // ---------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------
  function render() {
    renderTabs();
    renderPage();
    updateNotebookStats();
  }

  function getSortedPages() {
    const pinned = pages.filter(p => p.pinned);
    const unpinned = pages.filter(p => !p.pinned);

    function applySort(arr) {
      if (settings.sort === "title") {
        return arr.slice().sort((a, b) => tabLabel(a).localeCompare(tabLabel(b)));
      }
      if (settings.sort === "recent") {
        return arr.slice().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      }
      return arr; // manual — insertion order, as reordered by drag-and-drop
    }

    return applySort(pinned).concat(applySort(unpinned));
  }

  function renderTabs() {
    tabRail.innerHTML = "";
    const ordered = getSortedPages();

    for (const p of ordered) {
      const btn = document.createElement("button");
      btn.className = "tab" + (p.id === activeId ? " active" : "");
      btn.type = "button";
      btn.dataset.id = p.id;
      btn.title = p.title.trim() || "Untitled";

      if (p.color && COLOR_HEX[p.color]) {
        const dot = document.createElement("span");
        dot.className = "tab-color-dot";
        dot.style.background = COLOR_HEX[p.color];
        btn.appendChild(dot);
      }

      const label = document.createElement("span");
      label.className = "tab-label";
      label.textContent = tabLabel(p);
      btn.appendChild(label);

      if (p.pinned) {
        const pinMark = document.createElement("span");
        pinMark.className = "tab-pin-icon";
        pinMark.textContent = "\uD83D\uDCCC"; // 📌
        pinMark.setAttribute("aria-hidden", "true");
        btn.appendChild(pinMark);
      }

      btn.addEventListener("click", () => selectPage(p.id));
      if (settings.sort === "manual") {
        btn.addEventListener("pointerdown", (e) => onTabPointerDown(e, p.id, btn));
      }
      tabRail.appendChild(btn);
    }

    const addBtn = document.createElement("button");
    addBtn.className = "tab-add";
    addBtn.type = "button";
    addBtn.setAttribute("aria-label", "Add a page");
    addBtn.textContent = "+";
    addBtn.addEventListener("click", openTemplatePicker);
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

    // Only rebuild the tab rail here if an actual drag happened. A
    // plain click also goes through pointerdown -> pointerup (this
    // handler) before the browser's own "click" event fires, so
    // unconditionally re-rendering the tabs on every pointerup would
    // tear out and rebuild the tab buttons out from under the click
    // that's about to land on them — the click event then has no
    // element left to fire on, and selecting a tab silently does
    // nothing. Only a completed reorder needs a re-render; a plain
    // click's own selectPage() call already re-renders afterward.
    if (dragging && targetId && targetId !== id) {
      const fromIdx = pages.findIndex(p => p.id === id);
      const toIdx = pages.findIndex(p => p.id === targetId);
      if (fromIdx !== -1 && toIdx !== -1) {
        const [movedPage] = pages.splice(fromIdx, 1);
        pages.splice(toIdx, 0, movedPage);
        persistNotebooks();
      }
      renderTabs();
    }
    // A drag that ended without landing on a different tab (e.g.
    // dropped back on itself), or a plain click, needs no extra
    // re-render here — teardownTabDrag() above already cleared any
    // drag-target styling, and a plain click's own selectPage() call
    // re-renders the tabs right after this.
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
    updatePinButton(active);
    updateColorButton(active);
  }

  // ---------------------------------------------------------------
  // To-do checkboxes — clicking directly on a "- [ ] " marker (no
  // separate widget) flips it to "- [ \u2713 ] ", and clicking it again
  // flips it back. Since the caret position is already known the
  // instant a click lands in the textarea, this just checks whether
  // that click fell on the marker at the start of its line.
  // ---------------------------------------------------------------
  function onBodyClick() {
    if (bodyEl.selectionStart !== bodyEl.selectionEnd) return; // ignore drag-selections

    const idx = bodyEl.selectionStart;
    const text = bodyEl.value;
    const lineStart = text.lastIndexOf("\n", idx - 1) + 1;
    const lineEndIdx = text.indexOf("\n", idx);
    const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
    const line = text.slice(lineStart, lineEnd);

    const m = CHECKLIST_LINE_RE.exec(line);
    if (!m) return;

    const bracketClose = line.indexOf("]", line.indexOf("["));
    if (bracketClose === -1) return;

    // Clickable zone is the marker itself: from the start of the line
    // through just past the closing "]". Clicking further into the
    // line (the item's own text) is left alone for normal editing.
    const clickOffset = idx - lineStart;
    if (clickOffset > bracketClose + 1) return;

    toggleChecklistLine(lineStart);
  }

  // Flips the "[ ]" / "[ \u2713 ]" marker on one specific line,
  // identified by the character offset where that line begins.
  const CHECKLIST_UNCHECKED = "[ ]";
  const CHECKLIST_CHECKED = "[ \u2713 ]";

  function toggleChecklistLine(lineStart) {
    const text = bodyEl.value;
    const lineEndIdx = text.indexOf("\n", lineStart);
    const lineEnd = lineEndIdx === -1 ? text.length : lineEndIdx;
    const line = text.slice(lineStart, lineEnd);
    const m = CHECKLIST_LINE_RE.exec(line);
    if (!m) return;

    const bracketOpen = line.indexOf("[");
    const bracketClose = line.indexOf("]", bracketOpen);
    if (bracketOpen === -1 || bracketClose === -1) return;

    // Accept a legacy "[x]"/"[X]" (from an older version of this
    // feature) as "checked" too, so any notes already toggled that
    // way still read correctly and toggle back to the new marker.
    const inner = line.slice(bracketOpen + 1, bracketClose).trim();
    const isChecked = inner === "x" || inner === "X" || inner === "\u2713";
    const newMarker = isChecked ? CHECKLIST_UNCHECKED : CHECKLIST_CHECKED;

    const absOpen = lineStart + bracketOpen;
    const absClose = lineStart + bracketClose;
    const newText = text.slice(0, absOpen) + newMarker + text.slice(absClose + 1);

    const scrollTop = bodyEl.scrollTop;
    bodyEl.value = newText;
    bodyEl.scrollTop = scrollTop;
    const caretPos = Math.min(absOpen + newMarker.length, newText.length);
    bodyEl.selectionStart = bodyEl.selectionEnd = caretPos;
    bodyEl.focus();

    const active = pages.find(p => p.id === activeId);
    if (active) {
      active.title = titleEl.value;
      active.date = dateEl.value;
      active.body = newText;
      active.updatedAt = Date.now();
    }
    persistNotebooks();
    updateWordCount();
    updateNotebookStats();
    renderTabs();
    flashSaved();
  }

  function updatePinButton(page) {
    if (!pinBtn) return;
    pinBtn.classList.toggle("pinned", !!(page && page.pinned));
    pinBtn.title = page && page.pinned ? "Unpin this page" : "Pin this page";
  }

  function updateColorButton(page) {
    if (!colorDotPreview) return;
    const color = page ? page.color : "";
    if (color && COLOR_HEX[color]) {
      colorDotPreview.classList.add("has-color");
      colorDotPreview.style.setProperty("--dot", COLOR_HEX[color]);
    } else {
      colorDotPreview.classList.remove("has-color");
      colorDotPreview.style.removeProperty("--dot");
    }
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
    persistNotebooks();
    renderTabs();
    renderPage();
  }

  function addPage(template) {
    const p = freshPage(`Page ${pages.length + 1}`);
    if (template && template.body) p.body = template.body;
    pages.push(p);
    activeId = p.id;
    persistNotebooks();
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
    copy.color = active.color;

    const idx = pages.findIndex(p => p.id === activeId);
    pages.splice(idx + 1, 0, copy);
    activeId = copy.id;
    persistNotebooks();
    render();
    titleEl.focus();
    titleEl.select();
  }

  // Deleting a page asks for confirmation first (themed to match the
  // current theme, unlike a native browser confirm box), then removes
  // it immediately and shows a short "Undo" toast. If the toast times
  // out or another page is deleted first, the removal becomes permanent.
  async function deleteActivePage() {
    const active = pages.find(p => p.id === activeId);
    if (!active) return;

    const ok = await showConfirm(
      "Tear out \u201c" + (active.title.trim() || "Untitled page") + "\u201d? You can undo this right after.",
      { title: "Delete page", confirmLabel: "Delete", danger: true }
    );
    if (!ok) return;

    // The active page may have changed while the confirm dialog was
    // open (unlikely, but be safe rather than delete the wrong page).
    const current = pages.find(p => p.id === activeId);
    if (!current) return;

    const idx = pages.findIndex(p => p.id === activeId);
    pages.splice(idx, 1);

    if (pages.length > 0) {
      activeId = pages[Math.max(0, idx - 1)].id;
    } else {
      activeId = null;
    }

    persistNotebooks();
    render();

    pendingDelete = { page: current, index: idx };
    showUndoToast(current.title.trim() || "Untitled page");
  }

  function showUndoToast(label) {
    undoToastLabel.textContent = "\u201C" + label + "\u201D deleted";
    undoToast.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(() => {
      undoToast.hidden = true;
      pendingDelete = null;
    }, 6000);
  }

  function undoDelete() {
    if (!pendingDelete) return;
    clearTimeout(undoTimer);
    const { page, index } = pendingDelete;
    const insertAt = Math.min(index, pages.length);
    pages.splice(insertAt, 0, page);
    activeId = page.id;
    pendingDelete = null;
    undoToast.hidden = true;
    persistNotebooks();
    render();
  }

  function togglePin() {
    const active = pages.find(p => p.id === activeId);
    if (!active) return;
    active.pinned = !active.pinned;
    persistNotebooks();
    render();
  }

  function setPageColor(color) {
    const active = pages.find(p => p.id === activeId);
    if (!active) return;
    active.color = color;
    persistNotebooks();
    renderTabs();
    updateColorButton(active);
    closeColorPopover();
  }

  function openColorPopover() {
    colorPopover.hidden = false;
  }

  function closeColorPopover() {
    colorPopover.hidden = true;
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
      persistNotebooks();
      renderTabs();
      updateNotebookStats();
      flashSaved();
    }, 400);
  }

  // ---------------------------------------------------------------
  // New-page templates
  // ---------------------------------------------------------------
  function openTemplatePicker() {
    templateList.innerHTML = "";
    for (const t of TEMPLATES) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "notebook-list-item";

      const body = document.createElement("div");
      body.className = "notebook-list-body";
      const name = document.createElement("div");
      name.className = "notebook-list-name";
      name.textContent = t.name;
      const meta = document.createElement("div");
      meta.className = "notebook-list-meta";
      meta.textContent = t.desc;
      body.appendChild(name);
      body.appendChild(meta);
      item.appendChild(body);

      item.addEventListener("click", () => {
        addPage(t);
        closeTemplatePicker();
      });
      templateList.appendChild(item);
    }
    templateOverlay.hidden = false;
  }

  function closeTemplatePicker() {
    templateOverlay.hidden = true;
  }

  // ---------------------------------------------------------------
  // Notebooks switcher panel
  // ---------------------------------------------------------------
  function openNotebooks() {
    renderNotebookList();
    notebooksOverlay.hidden = false;
  }

  function closeNotebooks() {
    notebooksOverlay.hidden = true;
  }

  function renderNotebookList() {
    notebookList.innerHTML = "";

    // A double-click is, from the DOM's point of view, two "click"
    // events followed by one "dblclick" — so a plain click handler on
    // the row fires (and switches notebooks, closing this panel)
    // before the dblclick that should trigger a rename ever arrives.
    // To tell the two apart, a click schedules the switch a beat
    // later instead of doing it immediately; a dblclick landing in
    // that window cancels the pending switch and renames instead.
    let pendingSwitch = null; // { timer }
    function cancelPendingSwitch() {
      if (pendingSwitch) {
        clearTimeout(pendingSwitch.timer);
        pendingSwitch = null;
      }
    }

    for (const nb of notebooks) {
      const item = document.createElement("div");
      item.className = "notebook-list-item" + (nb.id === currentNotebookId ? " active" : "");

      const body = document.createElement("div");
      body.className = "notebook-list-body";
      const name = document.createElement("div");
      name.className = "notebook-list-name";
      name.textContent = nb.name;
      const meta = document.createElement("div");
      meta.className = "notebook-list-meta";
      const count = nb.pages.length;
      meta.textContent = count + (count === 1 ? " page" : " pages") + " \u2014 double-click name to rename";
      body.appendChild(name);
      body.appendChild(meta);
      body.addEventListener("click", () => {
        cancelPendingSwitch();
        pendingSwitch = {
          timer: setTimeout(() => {
            pendingSwitch = null;
            switchNotebook(nb.id);
            closeNotebooks();
          }, 300),
        };
      });
      name.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        cancelPendingSwitch();
        renameNotebook(nb);
      });
      item.appendChild(body);

      if (notebooks.length > 1) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "notebook-list-delete";
        del.setAttribute("aria-label", "Delete notebook");
        del.textContent = "\u00d7";
        del.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteNotebook(nb.id);
        });
        item.appendChild(del);
      }

      notebookList.appendChild(item);
    }
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

    installBtn.addEventListener("click", () => {
      if (!deferredInstallPrompt) return;
      installBtn.hidden = true;
      deferredInstallPrompt.prompt();
      Promise.resolve(deferredInstallPrompt.userChoice).catch(() => { /* ignore */ });
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
  // PIN lock — a privacy screen, not real security. The notes are
  // still plain text in localStorage; this only gates the UI so a
  // passer-by can't casually open the tab and start reading. Said
  // plainly in the Settings copy too.
  // ---------------------------------------------------------------
  function sha256Hex(str) {
    const enc = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", enc).then(buf => {
      const bytes = new Uint8Array(buf);
      let hex = "";
      for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
      }
      return hex;
    });
  }

  function initPinGate() {
    let hash = null;
    try { hash = localStorage.getItem(PIN_HASH_KEY); } catch (e) { /* ignore */ }

    if (setPinBtn) setPinBtn.hidden = !!hash;
    if (removePinBtn) removePinBtn.hidden = !hash;

    if (!hash) return;

    let unlocked = false;
    try { unlocked = sessionStorage.getItem(UNLOCKED_KEY) === "1"; } catch (e) { /* ignore */ }
    if (unlocked) return;

    lockOverlay.hidden = false;
    setTimeout(() => lockPinInput.focus(), 0);
  }

  async function setPin() {
    if (!hasSubtleCrypto()) {
      await showAlert("PIN lock isn't available in this browsing context. Try the hosted (https) version.", { title: "Can't set a PIN" });
      return;
    }
    const pin1 = await showPrompt("Choose a PIN (4+ characters):", "", {
      title: "Set a PIN", placeholder: "PIN", confirmLabel: "Continue",
    });
    if (!pin1) return;
    if (pin1.length < 4) {
      await showAlert("Use at least 4 characters.", { title: "Too short" });
      return;
    }
    const pin2 = await showPrompt("Enter it again to confirm:", "", {
      title: "Confirm PIN", placeholder: "PIN", confirmLabel: "Set PIN",
    });
    if (pin2 !== pin1) {
      await showAlert("Those didn't match \u2014 nothing was changed.", { title: "Didn't match" });
      return;
    }

    let hash;
    try {
      hash = await sha256Hex(pin1);
    } catch (e) {
      await showAlert("Couldn't set a PIN on this device.", { title: "Something went wrong" });
      return;
    }
    try {
      localStorage.setItem(PIN_HASH_KEY, hash);
      sessionStorage.setItem(UNLOCKED_KEY, "1");
    } catch (e) { /* ignore */ }
    setPinBtn.hidden = true;
    removePinBtn.hidden = false;
    await showAlert("PIN set. You'll be asked for it next time this notebook is opened in a new browser session.", { title: "PIN set" });
  }

  async function removePin() {
    const ok = await showConfirm("Remove the PIN? The notebook will open without asking from now on.", {
      title: "Remove PIN", confirmLabel: "Remove", danger: true,
    });
    if (!ok) return;
    try {
      localStorage.removeItem(PIN_HASH_KEY);
      sessionStorage.removeItem(UNLOCKED_KEY);
    } catch (e) { /* ignore */ }
    setPinBtn.hidden = false;
    removePinBtn.hidden = true;
  }

  function attemptUnlock() {
    const entered = lockPinInput.value;
    if (!entered) return;
    let storedHash = null;
    try { storedHash = localStorage.getItem(PIN_HASH_KEY); } catch (e) { /* ignore */ }
    if (!storedHash) { lockOverlay.hidden = true; return; }

    sha256Hex(entered).then(hash => {
      if (hash === storedHash) {
        try { sessionStorage.setItem(UNLOCKED_KEY, "1"); } catch (e) { /* ignore */ }
        lockOverlay.hidden = true;
        lockError.hidden = true;
        lockPinInput.value = "";
      } else {
        lockError.hidden = false;
        lockPanel.classList.remove("lock-shake");
        void lockPanel.offsetWidth;
        lockPanel.classList.add("lock-shake");
        lockPinInput.value = "";
        lockPinInput.focus();
      }
    }).catch(() => {
      lockError.hidden = false;
      lockError.textContent = "Couldn't check the PIN on this device.";
    });
  }

  // ---------------------------------------------------------------
  // Wire up
  // ---------------------------------------------------------------
  titleEl.addEventListener("input", scheduleSave);
  dateEl.addEventListener("input", scheduleSave);
  bodyEl.addEventListener("input", scheduleSave);
  bodyEl.addEventListener("click", onBodyClick);
  deleteBtn.addEventListener("click", deleteActivePage);
  duplicateBtn.addEventListener("click", duplicatePage);
  printBtn.addEventListener("click", () => window.print());
  emptyAddBtn.addEventListener("click", openTemplatePicker);

  pinBtn.addEventListener("click", togglePin);
  colorBtn.addEventListener("click", () => {
    if (colorPopover.hidden) openColorPopover(); else closeColorPopover();
  });
  colorPopover.addEventListener("click", (e) => {
    const swatch = e.target.closest(".color-swatch");
    if (!swatch) return;
    setPageColor(swatch.dataset.color || "");
  });
  document.addEventListener("click", (e) => {
    if (!colorPopover.hidden && colorPickerWrap && !colorPickerWrap.contains(e.target)) {
      closeColorPopover();
    }
  });

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
  if (encryptBackupToggle) {
    encryptBackupToggle.addEventListener("change", () => {
      settings.encryptBackups = encryptBackupToggle.checked;
      persistSettings();
    });
  }

  if (setPinBtn) setPinBtn.addEventListener("click", setPin);
  if (removePinBtn) removePinBtn.addEventListener("click", removePin);
  lockUnlockBtn.addEventListener("click", attemptUnlock);
  lockPinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") attemptUnlock();
  });

  notebookSwitchBtn.addEventListener("click", openNotebooks);
  notebooksClose.addEventListener("click", closeNotebooks);
  notebooksOverlay.addEventListener("click", (e) => {
    if (e.target === notebooksOverlay) closeNotebooks();
  });
  newNotebookBtn.addEventListener("click", createNotebook);

  templateClose.addEventListener("click", closeTemplatePicker);
  templateOverlay.addEventListener("click", (e) => {
    if (e.target === templateOverlay) closeTemplatePicker();
  });

  undoBtn.addEventListener("click", undoDelete);

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

    // Escape — close whichever overlay is open. The PIN lock is
    // deliberately not in this list; it isn't dismissible.
    if (e.key === "Escape") {
      if (!searchOverlay.hidden) { closeSearch(); return; }
      if (!settingsOverlay.hidden) { closeSettings(); return; }
      if (!notebooksOverlay.hidden) { closeNotebooks(); return; }
      if (!templateOverlay.hidden) { closeTemplatePicker(); return; }
      if (!colorPopover.hidden) { closeColorPopover(); return; }
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
  wireSettingsRow(sortRow, "sort", false);

  if (window.matchMedia) {
    const darkModeQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const onSchemeChange = () => { if (settings.theme === "auto") applySettings(); };
    if (darkModeQuery.addEventListener) darkModeQuery.addEventListener("change", onSchemeChange);
    else if (darkModeQuery.addListener) darkModeQuery.addListener(onSchemeChange);
  }

  // Save immediately before the tab closes so nothing is lost.
  window.addEventListener("beforeunload", () => {
    const active = pages.find(p => p.id === activeId);
    if (active) {
      active.title = titleEl.value;
      active.date = dateEl.value;
      active.body = bodyEl.value;
    }
    persistNotebooks();
  });

  loadSettings();
  loadNotebooks();
  if (encryptBackupToggle) encryptBackupToggle.checked = !!settings.encryptBackups;
  updateNotebookHeader();
  applySettings();
  initPinGate();
  render();
  updateOnlineStatus();
  initInstall();
  initServiceWorker();
})();
