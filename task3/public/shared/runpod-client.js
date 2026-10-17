// Runpod API client shared by the pages. Vanilla JS, no build step.
//   RunpodClient.listSamples()        -> [{id, audio_filename, reference_text, prompt, duration_ms, status}]
//   RunpodClient.submitBatch(files)   -> job_id
//   RunpodClient.getJob(job_id)       -> {status, results: [{audio, transcript, error}]}
//   RunpodClient.translate(text)      -> English text (via the translation proxy)
// With TASK3_CONFIG.USE_MOCK = true nothing is sent to Runpod (see config.js).
// TODO(EDSON): verify every request/response shape here against his real API.

window.RunpodClient = (function () {
  const C = window.TASK3_CONFIG;
  const MAX_DURATION_MS = 10000;

  function url(path) {
    return C.RUNPOD_BASE_URL.replace(/\/$/, "") + path;
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (C.AUTH_HEADER) headers[C.AUTH_HEADER.name] = C.AUTH_HEADER.value; // TODO(EDSON)
    const res = await fetch(url(path), { ...options, headers });
    if (!res.ok) throw new Error(`Runpod returned HTTP ${res.status} for ${path}`);
    return res.json();
  }

  // The list endpoint may return only {audio}; every other attribute is optional.
  // The agreed scope is validated clips of <= 10 s, so enforce it here too in case the
  // server returns more.
  function normalizeSample(r) {
    const file = r.audio || r.audio_filename;
    return {
      id: r.id || String(file).replace(/\.mp3$/i, ""),
      audio_filename: file,
      reference_text: r.transcription ?? r.reference_text ?? "",
      prompt: r.prompt || "",
      duration_ms: r.duration_ms ?? null,
      status: r.status || "validated",
    };
  }

  function inScope(e) {
    return !!e.audio_filename && e.status === "validated" &&
      (e.duration_ms === null || e.duration_ms <= MAX_DURATION_MS);
  }

  async function listSamples() {
    let rows;
    if (C.USE_MOCK) {
      for (const u of C.MOCK_SAMPLES_URLS) {
        try {
          const res = await fetch(u);
          if (res.ok) { rows = await res.json(); break; }
        } catch (_) { /* try the next source */ }
      }
      if (!rows) throw new Error("no mock sample file found");
    } else {
      rows = await request(C.SAMPLES_PATH);
    }
    return rows.map(normalizeSample).filter(inScope);
  }

  // --- ASR batch (async) ---------------------------------------------------------------

  const mockJobs = new Map(); // job_id -> {started, audios}
  const inlineJobs = new Map(); // job_id -> results, when /asr_batch answers with the results directly

  // Accepts [{audio, transcript, error}] or close variants (audio_filename/file, text).
  // TODO(EDSON): replace with the exact shape once confirmed.
  function normalizeResults(rows) {
    return rows.map((r) => ({
      audio: r.audio || r.audio_filename || r.file || r.filename,
      transcript: r.transcript ?? r.text ?? null,
      error: r.error || null,
    }));
  }

  async function submitBatch(audios) {
    if (audios.length === 0 || audios.length > C.MAX_SELECTION) {
      throw new Error(`select between 1 and ${C.MAX_SELECTION} clips`);
    }
    if (C.USE_MOCK) {
      const id = "mock-" + Date.now().toString(36);
      mockJobs.set(id, { started: Date.now(), audios });
      return id;
    }
    // Same call as: curl -X POST <base>/asr_batch -H "Content-Type: application/json"
    //                    -d '{"audios": ["a.mp3", "b.mp3"]}'
    const body = await request(C.ASR_SUBMIT_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audios }),
    });
    if (body.job_id) return body.job_id; // async: poll getJob(job_id)
    const rows = Array.isArray(body) ? body : body.results; // synchronous: results came back directly
    if (Array.isArray(rows)) {
      const id = "inline-" + Date.now().toString(36);
      inlineJobs.set(id, normalizeResults(rows));
      return id;
    }
    throw new Error("unexpected /asr_batch response (no job_id and no results)"); // TODO(EDSON)
  }

  async function getJob(jobId) {
    if (inlineJobs.has(jobId)) return { status: "done", results: inlineJobs.get(jobId) };
    if (C.USE_MOCK) {
      const job = mockJobs.get(jobId);
      if (!job) return { status: "failed", results: [], error: "mock job lost (page was reloaded)" };
      const t = Date.now() - job.started;
      if (t < 1500) return { status: "queued", results: [] };
      if (t < 1500 + 700 * job.audios.length) return { status: "running", results: [] };
      return {
        status: "done",
        results: job.audios.map((a) =>
          /missing/i.test(a)
            ? { audio: a, transcript: null, error: "audio not found (mock)" }
            : { audio: a, transcript: `[mock transcript of ${a}]`, error: null }
        ),
      };
    }
    const job = await request(C.ASR_JOB_PATH.replace("{job_id}", encodeURIComponent(jobId)));
    return { ...job, results: normalizeResults(job.results || []) };
  }

  // --- Translation (synchronous, called when the curator approves an entry) ---------------
  // Goes to the translation proxy, which holds the Hugging Face token. Never call Hugging Face
  // from the browser. TODO(EDSON/proxy): confirm host, path, shared-secret header and shapes.

  async function translate(text) {
    if (C.USE_MOCK) {
      await new Promise((r) => setTimeout(r, 400));
      return `[mock English translation of: ${text}]`;
    }
    const headers = { "Content-Type": "application/json" };
    if (C.AUTH_HEADER) headers[C.AUTH_HEADER.name] = C.AUTH_HEADER.value; // TODO(EDSON)
    const res = await fetch(C.TRANSLATE_BASE_URL.replace(/\/$/, "") + C.TRANSLATE_PATH, {
      method: "POST",
      headers,
      body: JSON.stringify({ text, src_lang: C.SRC_LANG, tgt_lang: C.TGT_LANG }),
    });
    if (!res.ok) throw new Error(`translation proxy returned HTTP ${res.status}`);
    const body = await res.json();
    if (typeof body.translation !== "string") throw new Error("response has no 'translation'");
    return body.translation;
  }

  return { listSamples, submitBatch, getJob, translate };
})();
