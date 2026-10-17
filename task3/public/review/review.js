// Phase: review tool.
// Loads the ASR results (localStorage key TASK3_CONFIG.STORAGE.ASR, or a transcripts.json file),
// shows one row per clip with an editable corrected-Quechua field, a category and an editable
// English field. Translate calls RunpodClient.translate (the translation proxy) to fill the
// English; Save entry stores whatever English is in the box as
//   {audio_filename, quechua_text, english_translation, category, reviewed_by}
// in localStorage (STORAGE.PHRASEBOOK). The list can be downloaded as phrasebook.json.
// Saving again replaces the entry. Clips whose ASR failed, or whose translation failed, can still
// be saved by typing the text by hand.

(function () {
  const CONFIG = window.TASK3_CONFIG;
  const CATEGORIES = ["greetings", "directions", "lodging", "food", "transactions"];
  const $ = (id) => document.getElementById(id);
  const rowsEl = $("rows");
  const reviewerEl = $("reviewer");
  const downloadBtn = $("downloadBtn");

  let clips = [];                 // transcripts.json rows
  const phrasebook = new Map();   // audio_filename -> approved entry

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage unavailable */ }
  }
  function showError(message) {
    const el = $("pageError");
    el.textContent = message;
    el.hidden = false;
  }

  function persist() {
    save(CONFIG.STORAGE.PHRASEBOOK, Array.from(phrasebook.values()));
    $("summary").textContent = clips.length ? `${phrasebook.size} of ${clips.length} approved` : "";
    downloadBtn.disabled = phrasebook.size === 0;
    $("siteLink").hidden = phrasebook.size === 0;
  }

  function render() {
    rowsEl.innerHTML = "";
    for (const clip of clips) {
      const done = phrasebook.get(clip.audio_filename);
      const tr = document.createElement("tr");

      const tdClip = document.createElement("td");
      tdClip.textContent = clip.audio_filename;
      if (clip.reference_text) {
        const ref = document.createElement("span");
        ref.className = "prompt";
        ref.textContent = "Reference: " + clip.reference_text;
        tdClip.appendChild(ref);
      }

      const tdAsr = document.createElement("td");
      if (clip.error) { tdAsr.textContent = "ASR error: " + clip.error; tdAsr.className = "err"; }
      else tdAsr.textContent = clip.asr_transcript || "";

      const tdText = document.createElement("td");
      const ta = document.createElement("textarea");
      ta.value = done ? done.quechua_text : clip.asr_transcript || "";
      tdText.appendChild(ta);

      const tdCat = document.createElement("td");
      const sel = document.createElement("select");
      const none = document.createElement("option");
      none.value = ""; none.textContent = "— choose —";
      sel.append(none);
      for (const c of CATEGORIES) {
        const o = document.createElement("option");
        o.value = o.textContent = c;
        sel.append(o);
      }
      sel.value = (done && done.category) || clip.category || "";
      tdCat.appendChild(sel);

      const tdAct = document.createElement("td");
      const en = document.createElement("textarea");
      en.placeholder = "English translation (click Translate, then edit if needed)";
      en.value = done ? done.english_translation : "";
      const msg = document.createElement("div");
      msg.className = "err";
      const translateBtn = document.createElement("button");
      translateBtn.textContent = "Translate";
      const saveBtn = document.createElement("button");
      saveBtn.className = "approve";
      saveBtn.textContent = done ? "Update entry" : "Save entry";
      saveBtn.disabled = !en.value.trim();
      en.addEventListener("input", () => { saveBtn.disabled = !en.value.trim(); });

      function missingField() {
        if (!ta.value.trim()) return "Enter the Quechua text first.";
        if (!sel.value) return "Choose a category first.";
        if (!reviewerEl.value.trim()) return "Enter your name as reviewer (top of page).";
        return "";
      }

      translateBtn.addEventListener("click", async () => {
        const problem = missingField();
        if (problem) { msg.textContent = problem; return; }
        translateBtn.disabled = true;
        msg.textContent = "Translating…";
        try {
          en.value = await RunpodClient.translate(ta.value.trim());
          msg.textContent = "";
          saveBtn.disabled = !en.value.trim();
        } catch (err) {
          msg.textContent = "Translation failed: " + err.message; // you can still type the English by hand
        }
        translateBtn.disabled = false;
      });

      saveBtn.addEventListener("click", () => {
        const problem = missingField() || (en.value.trim() ? "" : "Enter or generate the English translation first.");
        if (problem) { msg.textContent = problem; return; }
        phrasebook.set(clip.audio_filename, {
          audio_filename: clip.audio_filename,
          quechua_text: ta.value.trim(),
          english_translation: en.value.trim(),
          category: sel.value,
          reviewed_by: reviewerEl.value.trim(),
        });
        persist();
        render();
      });
      tdAct.append(en, msg, translateBtn, saveBtn);

      tr.append(tdClip, tdAsr, tdText, tdCat, tdAct);
      rowsEl.appendChild(tr);
    }
  }

  function setClips(rows) {
    if (!Array.isArray(rows)) throw new Error("expected a JSON array");
    clips = rows.filter((r) => r && r.audio_filename);
    const saved = load(CONFIG.STORAGE.PHRASEBOOK) || [];
    phrasebook.clear();
    for (const e of saved) if (clips.some((c) => c.audio_filename === e.audio_filename)) phrasebook.set(e.audio_filename, e);
    persist();
    render();
  }

  function download() {
    const text = JSON.stringify(Array.from(phrasebook.values()), null, 2) + "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "phrasebook.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function init() {
    $("mockNote").hidden = !CONFIG.USE_MOCK;
    const reviewer = load("task3.reviewer.v1");
    if (reviewer) reviewerEl.value = reviewer;
    reviewerEl.addEventListener("change", () => save("task3.reviewer.v1", reviewerEl.value.trim()));

    const importFile = $("importFile");
    $("importBtn").addEventListener("click", () => importFile.click());
    importFile.addEventListener("change", async () => {
      const file = importFile.files[0];
      importFile.value = "";
      if (!file) return;
      try { setClips(JSON.parse(await file.text())); }
      catch (err) { showError("Could not load that file: " + err.message); }
    });
    downloadBtn.addEventListener("click", download);

    const asr = load(CONFIG.STORAGE.ASR);
    if (asr && asr.status === "done" && Array.isArray(asr.results)) setClips(asr.results);
    else showError("No ASR results found in this browser. Run the ASR step first, or load a transcripts.json file.");
  }

  init();
})();
