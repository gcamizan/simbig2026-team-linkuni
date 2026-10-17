// Phase: ASR step.
// Reads the selection saved by the selection page, submits it as one async batch
// (RunpodClient.submitBatch), polls the job (RunpodClient.getJob) and shows one row per clip.
// The finished job is saved to localStorage (TASK3_CONFIG.STORAGE.ASR) for the review page and
// can be downloaded as transcripts.json. A failed clip shows its error and never stops the rest.

(function () {
  const CONFIG = window.TASK3_CONFIG;
  const $ = (id) => document.getElementById(id);
  const rowsEl = $("rows");
  const statusEl = $("asrStatus");
  const runBtn = $("runBtn");
  const downloadBtn = $("downloadBtn");

  let selection = [];
  let results = null; // transcripts.json rows once the job is done

  function load(key) {
    try { return JSON.parse(localStorage.getItem(key) || "null"); } catch (_) { return null; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage unavailable */ }
  }
  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.className = isError ? "err" : "";
  }

  function render() {
    rowsEl.innerHTML = "";
    const byFile = new Map((results || []).map((r) => [r.audio_filename, r]));
    for (const clip of selection) {
      const r = byFile.get(clip.audio_filename);
      const tr = document.createElement("tr");
      const tdClip = document.createElement("td");
      tdClip.textContent = clip.audio_filename;
      const tdRef = document.createElement("td");
      tdRef.textContent = clip.reference_text || "(no transcription)";
      const tdAsr = document.createElement("td");
      if (!r) tdAsr.textContent = "…";
      else if (r.error) { tdAsr.textContent = "Error: " + r.error; tdAsr.className = "err"; }
      else tdAsr.textContent = r.asr_transcript;
      tr.append(tdClip, tdRef, tdAsr);
      rowsEl.appendChild(tr);
    }
  }

  // transcripts.json row = the selected clip + asr_transcript + error (same shape as scripts/run_asr_batch.py).
  function merge(job) {
    const byAudio = new Map((job.results || []).map((r) => [r.audio, r]));
    return selection.map((clip) => {
      const r = byAudio.get(clip.audio_filename);
      return {
        ...clip,
        asr_transcript: r && !r.error ? r.transcript : null,
        error: r ? r.error || null : "no result returned for this clip",
      };
    });
  }

  async function poll(jobId) {
    for (;;) {
      let job;
      try {
        job = await RunpodClient.getJob(jobId);
      } catch (err) {
        setStatus(`Could not read the job status (${err.message}). Retrying…`, true);
        await new Promise((r) => setTimeout(r, CONFIG.POLL_INTERVAL_MS));
        continue;
      }
      if (job.status === "done" || job.status === "failed") return job;
      setStatus(`Job ${jobId}: ${job.status}…`);
      await new Promise((r) => setTimeout(r, CONFIG.POLL_INTERVAL_MS));
    }
  }

  async function run() {
    runBtn.disabled = true;
    downloadBtn.disabled = true;
    results = null;
    render();
    try {
      setStatus("Submitting batch…");
      const jobId = await RunpodClient.submitBatch(selection.map((c) => c.audio_filename));
      save(CONFIG.STORAGE.ASR, { job_id: jobId, status: "submitted", results: null });
      const job = await poll(jobId);
      if (job.status === "failed" && !(job.results || []).length) {
        setStatus("The ASR job failed: " + (job.error || "no details returned"), true);
        save(CONFIG.STORAGE.ASR, { job_id: jobId, status: "failed", results: null });
      } else {
        results = merge(job);
        save(CONFIG.STORAGE.ASR, { job_id: jobId, status: "done", results });
        const failed = results.filter((r) => r.error).length;
        setStatus(`Done: ${results.length - failed} of ${results.length} clips transcribed${failed ? `, ${failed} with errors` : ""}.`, failed > 0);
        downloadBtn.disabled = false;
        $("reviewLink").hidden = false;
      }
    } catch (err) {
      setStatus("Could not run ASR: " + err.message, true);
    }
    runBtn.disabled = false;
    render();
  }

  function download() {
    const text = JSON.stringify(results, null, 2) + "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcripts.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function init() {
    $("mockNote").hidden = !CONFIG.USE_MOCK;
    selection = load(CONFIG.STORAGE.SELECTION) || [];
    const saved = load(CONFIG.STORAGE.ASR);
    if (saved && saved.status === "done" && saved.results) {
      results = saved.results;
      downloadBtn.disabled = false;
      $("reviewLink").hidden = false;
      setStatus("Showing the previous run. Run ASR again to replace it.");
    }
    if (selection.length === 0) {
      setStatus("No clips selected yet. Go back to the selection page.", true);
    } else {
      runBtn.disabled = false;
    }
    runBtn.addEventListener("click", run);
    downloadBtn.addEventListener("click", download);
    render();
  }

  init();
})();
