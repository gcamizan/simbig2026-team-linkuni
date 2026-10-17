// Phase: selection UI.
// Vanilla JS, no build step. Lists the validated audio sample (RunpodClient.listSamples),
// lets the user pick up to TASK3_CONFIG.MAX_SELECTION clips, and hands the selection to the
// ASR page through localStorage (and an optional selection.json export/import).
// No audio playback: the flow only returns descriptive attributes, not audio.

(function () {
  const CONFIG = window.TASK3_CONFIG;
  const MAX = CONFIG.MAX_SELECTION;
  const KEY = CONFIG.STORAGE.SELECTION;
  const PAGE_SIZE = 100;
  const CATEGORIES = ["greetings", "directions", "lodging", "food", "transactions"];

  let ALL_ENTRIES = [];
  const selected = new Map(); // id -> entry (with optional category)
  let visibleCount = PAGE_SIZE;

  const $ = (id) => document.getElementById(id);
  const searchInput = $("search");
  const selectedOnly = $("selectedOnly");
  const counts = $("counts");
  const corpusBody = $("corpusBody");
  const loadMoreWrap = $("loadMoreWrap");
  const selectedList = $("selectedList");
  const sendBtn = $("sendBtn");
  const exportBtn = $("exportBtn");

  function option(value, label) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    return o;
  }

  function filteredEntries() {
    const q = searchInput.value.trim().toLowerCase();
    return ALL_ENTRIES.filter((e) => {
      if (selectedOnly.checked && !selected.has(e.id)) return false;
      if (q && !(e.reference_text + " " + e.prompt + " " + e.audio_filename).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderBrowse() {
    const entries = filteredEntries();
    counts.textContent = `${entries.length.toLocaleString()} of ${ALL_ENTRIES.length.toLocaleString()} clips match`;

    corpusBody.innerHTML = "";
    for (const entry of entries.slice(0, visibleCount)) {
      const tr = document.createElement("tr");

      const tdPick = document.createElement("td");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = selected.has(entry.id);
      cb.disabled = !cb.checked && selected.size >= MAX;
      cb.addEventListener("change", () => {
        toggleSelect(entry, cb.checked);
        renderBrowse(); // refresh which checkboxes are disabled by the cap
      });
      tdPick.appendChild(cb);

      const tdText = document.createElement("td");
      tdText.textContent = entry.reference_text || "(no transcription)";
      const meta = document.createElement("span");
      meta.className = "prompt";
      meta.textContent = (entry.prompt ? "Q: " + entry.prompt + " · " : "") + entry.audio_filename;
      tdText.appendChild(meta);

      const tdDur = document.createElement("td");
      tdDur.className = "source";
      tdDur.textContent = entry.duration_ms == null ? "—" : (entry.duration_ms / 1000).toFixed(1) + " s";

      const tdCat = document.createElement("td");
      const sel = document.createElement("select");
      sel.append(option("", "— none —"));
      for (const c of CATEGORIES) sel.append(option(c, c));
      const current = selected.get(entry.id);
      sel.value = (current && current.category) || "";
      sel.disabled = !current;
      sel.addEventListener("change", () => {
        const s = selected.get(entry.id);
        if (s) {
          s.category = sel.value || null;
          renderSelected();
        }
      });
      tdCat.appendChild(sel);

      tr.append(tdPick, tdText, tdDur, tdCat);
      corpusBody.appendChild(tr);
    }

    loadMoreWrap.style.display = entries.length > visibleCount ? "" : "none";
  }

  function toggleSelect(entry, isChecked) {
    if (isChecked) {
      if (selected.size >= MAX) return;
      selected.set(entry.id, { ...entry, category: null });
    } else {
      selected.delete(entry.id);
    }
    renderSelected();
  }

  function renderSelected() {
    selectedList.innerHTML = "";
    for (const entry of selected.values()) {
      const li = document.createElement("li");
      li.textContent = `${entry.reference_text || entry.audio_filename}${entry.category ? " — " + entry.category : ""}`;
      selectedList.appendChild(li);
    }
    $("selectedCount").textContent = String(selected.size);
    sendBtn.disabled = selected.size === 0;
    exportBtn.disabled = selected.size === 0;
    persist();
  }

  function selectionRows() {
    return Array.from(selected.values(), (e) => ({
      id: e.id,
      audio_filename: e.audio_filename,
      reference_text: e.reference_text,
      prompt: e.prompt,
      duration_ms: e.duration_ms,
      status: e.status,
      category: e.category,
    }));
  }

  async function exportSelection() {
    const text = JSON.stringify(selectionRows(), null, 2) + "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "selection.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function resetAndRender() {
    visibleCount = PAGE_SIZE;
    renderBrowse();
  }
  searchInput.addEventListener("input", resetAndRender);
  selectedOnly.addEventListener("change", resetAndRender);
  $("loadMoreBtn").addEventListener("click", () => {
    visibleCount += PAGE_SIZE;
    renderBrowse();
  });
  exportBtn.addEventListener("click", exportSelection);
  sendBtn.addEventListener("click", () => {
    persist();
    window.location.href = "asr/";
  });

  const importFile = $("importFile");
  $("importBtn").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try {
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows)) throw new Error("expected a JSON array");
      restore(rows);
      resetAndRender();
    } catch (err) {
      showError(`Could not load that file: ${err.message}`);
    }
  });

  function showError(message) {
    const el = $("loadError");
    el.textContent = message;
    el.hidden = false;
  }

  function persist() {
    if (ALL_ENTRIES.length === 0) return; // list failed to load: keep the saved picks
    try {
      localStorage.setItem(KEY, JSON.stringify(selectionRows()));
    } catch (_) { /* storage unavailable: picks just won't persist */ }
  }

  // rows: [{id, category, ...}]; ids missing from the current list are skipped; capped at MAX.
  function restore(rows) {
    const byId = new Map(ALL_ENTRIES.map((e) => [e.id, e]));
    selected.clear();
    for (const r of rows) {
      const entry = byId.get(r && r.id);
      if (!entry || selected.size >= MAX) continue;
      selected.set(entry.id, { ...entry, category: CATEGORIES.includes(r.category) ? r.category : null });
    }
    renderSelected();
  }

  async function init() {
    $("maxSel").textContent = $("selectedMax").textContent = String(MAX);
    $("mockNote").hidden = !CONFIG.USE_MOCK;
    try {
      ALL_ENTRIES = await RunpodClient.listSamples();
    } catch (err) {
      showError(`Could not load the audio sample list (${err.message}).`);
    }
    try {
      if (ALL_ENTRIES.length) restore(JSON.parse(localStorage.getItem(KEY) || "[]"));
    } catch (_) { /* ignore a corrupt or unavailable saved selection */ }
    renderBrowse();
    renderSelected();
  }

  init();
})();
