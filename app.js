(() => {
  "use strict";

  const STORAGE_KEY = "steno.pages.v1";
  const ACTIVE_KEY = "steno.active.v1";

  const tabRail   = document.getElementById("tabRail");
  const pageEl    = document.getElementById("page");
  const titleEl   = document.getElementById("pageTitle");
  const bodyEl    = document.getElementById("pageBody");
  const deleteBtn = document.getElementById("deleteBtn");
  const wordCount = document.getElementById("wordCount");
  const savedAt   = document.getElementById("savedAt");
  const emptyState  = document.getElementById("emptyState");
  const emptyAddBtn = document.getElementById("emptyAddBtn");

  /** @type {{id:string, title:string, body:string, updatedAt:number}[]} */
  let pages = [];
  let activeId = null;
  let saveTimer = null;
  let savedFlashTimer = null;

  // ---------------------------------------------------------------
  // Persistence
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

  // Save immediately before the tab closes so nothing is lost.
  window.addEventListener("beforeunload", () => {
    const active = pages.find(p => p.id === activeId);
    if (active) {
      active.title = titleEl.value;
      active.body = bodyEl.value;
    }
    persist();
  });

  load();
  render();
})();
