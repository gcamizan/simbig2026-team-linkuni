// Shared settings for every page of the demo (selection, ASR, review, phrasebook).
//
// Every value marked TODO(EDSON) is a PLACEHOLDER: it depends on Edson's answer about the
// Runpod server. Search the repo for "TODO(EDSON)" to find everything to correct later.
window.TASK3_CONFIG = {
  // true: no network call goes to Runpod (samples from local files, ASR simulated).
  // false: the pages call the Runpod endpoints below. Translation is still a placeholder,
  // so the review page needs the translation proxy before it can approve in live mode.
  USE_MOCK: false,

  // Edson's Runpod proxy URL (received 2026-10-17). TODO(EDSON): confirm it is permanent
  // (it looks like a per-pod proxy address that changes if the pod is recreated) and that
  // CORS allows https://simbig2026-team-linkuni.xcr33d.workers.dev and http://127.0.0.1:8000.
  RUNPOD_BASE_URL: "https://7ftpybloeqd9t0-8000.proxy.runpod.net",

  // Paths confirmed by Edson. TODO(EDSON): response shapes are still unverified (his server
  // returned 502 when first tried); the client accepts the shapes below plus close variants.
  SAMPLES_PATH: "/samples",                // GET  -> [{audio, transcription?, prompt?, duration_ms?, status?}, ...]
  ASR_SUBMIT_PATH: "/asr_batch",           // POST {audios: [filename, ...]} (max 10) -> {job_id} or the results directly
  ASR_JOB_PATH: "/asr_batch/{job_id}",     // GET  -> {status: queued|running|done|failed, results: [{audio, transcript, error}]}

  // TODO(EDSON/proxy): the translation proxy (translation-proxy/, not built yet) needs its own
  // reachable HTTPS address; it may or may not share the Runpod host. It holds the Hugging Face
  // token server-side and forwards to the hosted NLLB-200 API. Proposed contract:
  //   POST {text, src_lang, tgt_lang} -> {translation}
  TRANSLATE_BASE_URL: "https://TRANSLATE-HOST-PLACEHOLDER",
  TRANSLATE_PATH: "/translate",
  // TODO(FLORES): unresolved. Candidates: quy_Latn (Southern Quechua), quz_Latn (Ayacucho), a Cusco
  // variant. Check which variant Task 1 uses against the NLLB-200 distilled-600M language list.
  SRC_LANG: "quy_Latn",
  TGT_LANG: "eng_Latn",

  // TODO(EDSON): access control for the demo. A secret cannot live in public JS; if Edson
  // chooses a token or header scheme, set it here, e.g. {name: "X-Demo-Token", value: "..."}.
  AUTH_HEADER: null,

  // Product rule from the flow: the user picks at most 10 clips per run.
  MAX_SELECTION: 10,
  POLL_INTERVAL_MS: 2000,

  // Mock mode only: local sample sources, tried in order. The first is an optional
  // gitignored local file with real sample records (never committed); the second is committed synthetic data.
  MOCK_SAMPLES_URLS: ["/data/index.json", "/shared/samples.mock.json"],

  // Keys used to pass state between pages through the browser (no backend).
  STORAGE: {
    SELECTION: "task3.selection.v2",   // [{id, audio_filename, reference_text, prompt, duration_ms, status, category}]
    ASR: "task3.asr.v1",               // {job_id, status, results}
    PHRASEBOOK: "task3.phrasebook.v1", // [{audio_filename, quechua_text, english_translation, category, reviewed_by}]
  },
};
