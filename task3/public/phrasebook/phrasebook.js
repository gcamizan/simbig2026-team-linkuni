// Phase: site (phrasebook page).
// Shows the curated entries grouped by category, with search. Data order:
//   1. the published phrasebook.json (TASK3_CONFIG.PHRASEBOOK_URL, the curated, committed copy);
//   2. else the entries saved in this browser by the review page (STORAGE.PHRASEBOOK);
//   3. or a phrasebook.json file the visitor loads.
// Entry: {audio_filename, quechua_text, english_translation, category, reviewed_by}.
// Clip players show only when TASK3_CONFIG.AUDIO_BASE_URL is set.

(function () {
  const CONFIG = window.TASK3_CONFIG;
  const CATEGORIES = ["greetings", "directions", "lodging", "food", "transactions"];
  const $ = (id) => document.getElementById(id);
  const entriesEl = $("entries");
  const searchEl = $("search");
  let ENTRIES = [];

  function note(text) {
    const el = $("pageNote");
    el.textContent = text;
    el.hidden = !text;
  }

  function valid(e) {
    return e && typeof e.quechua_text === "string" && typeof e.english_translation === "string" && e.category;
  }

  function render() {
    const q = searchEl.value.trim().toLowerCase();
    const shown = ENTRIES.filter((e) => !q || (e.quechua_text + " " + e.english_translation).toLowerCase().includes(q));
    $("counts").textContent = ENTRIES.length ? `${shown.length} of ${ENTRIES.length} phrases` : "";
    entriesEl.innerHTML = "";
    if (!ENTRIES.length) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "No phrases yet. Review some clips first, or load a phrasebook.json file.";
      entriesEl.appendChild(p);
      return;
    }
    const cats = [...CATEGORIES, ...new Set(shown.map((e) => e.category).filter((c) => !CATEGORIES.includes(c)))];
    for (const cat of cats) {
      const group = shown.filter((e) => e.category === cat);
      if (!group.length) continue;
      const h = document.createElement("h2");
      h.textContent = cat;
      entriesEl.appendChild(h);
      for (const e of group) {
        const div = document.createElement("div");
        div.className = "entry";
        const qu = document.createElement("div");
        qu.className = "quechua";
        qu.textContent = e.quechua_text;
        const en = document.createElement("div");
        en.className = "english";
        en.textContent = e.english_translation;
        div.append(qu, en);
        if (CONFIG.AUDIO_BASE_URL && e.audio_filename) {
          const audio = document.createElement("audio");
          audio.controls = true;
          audio.preload = "none";
          audio.src = CONFIG.AUDIO_BASE_URL + encodeURIComponent(e.audio_filename);
          div.appendChild(audio);
        }
        if (e.reviewed_by) {
          const meta = document.createElement("div");
          meta.className = "meta";
          meta.textContent = "Reviewed by " + e.reviewed_by;
          div.appendChild(meta);
        }
        entriesEl.appendChild(div);
      }
    }
  }

  function setEntries(rows, source) {
    if (!Array.isArray(rows)) throw new Error("expected a JSON array");
    ENTRIES = rows.filter(valid);
    note(ENTRIES.length < rows.length ? `${rows.length - ENTRIES.length} invalid entries in ${source} were skipped.` : "");
    render();
  }

  async function load() {
    try {
      const res = await fetch(CONFIG.PHRASEBOOK_URL);
      if (res.ok) { setEntries(await res.json(), "the published phrasebook"); return; }
    } catch (_) { /* no published copy yet: fall back to this browser */ }
    try {
      const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE.PHRASEBOOK) || "[]");
      setEntries(saved, "this browser");
      if (ENTRIES.length) note("Showing entries saved in this browser (not yet published).");
    } catch (_) {
      ENTRIES = [];
      render();
    }
  }

  searchEl.addEventListener("input", render);
  const importFile = $("importFile");
  $("importBtn").addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", async () => {
    const file = importFile.files[0];
    importFile.value = "";
    if (!file) return;
    try { setEntries(JSON.parse(await file.text()), "that file"); }
    catch (err) { note("Could not load that file: " + err.message); }
  });

  load();
})();
