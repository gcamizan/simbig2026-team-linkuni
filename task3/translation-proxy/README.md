# Translation proxy

`POST /translate` with `{"text": "...", "src_lang": "quy_Latn", "tgt_lang": "eng_Latn"}` returns
`{"translation": "..."}`. The review page calls it when the curator approves an entry.

The model, `facebook/nllb-200-distilled-600M`, is **self-hosted** with `transformers`. The
Hugging Face hosted API does not serve it, so there is no external call and no token is required.
Puno Quechua uses the NLLB code `quy_Latn` (the only Quechua code the model has).

## Run locally

```bash
cd task3/translation-proxy
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt -r requirements-local.txt
cp .env.example .env            # optional: set HF_TOKEN for faster downloads
.venv/bin/uvicorn app:app --port 8001
```

The first request downloads the model (~2.5 GB) and loads it (slow once); later requests are fast.
Set `PRELOAD_MODEL=1` to load it at startup instead.

```bash
curl -X POST http://127.0.0.1:8001/translate -H "Content-Type: application/json" \
  -d '{"text":"Allillanchu","src_lang":"quy_Latn","tgt_lang":"eng_Latn"}'
```

## Tests

```bash
.venv/bin/pytest -q                  # fast, no download
RUN_SLOW=1 .venv/bin/pytest -q       # also runs the real model
```

## Deploy on Runpod (for Edson)

1. Clone the repo, then `cd task3/translation-proxy`.
2. Create a venv and install `requirements.txt` + `requirements-local.txt`. On a GPU pod install the
   CUDA build of torch for the pod, then use it as is (the code runs on CPU; GPU use is a later optimisation).
3. Set `PRELOAD_MODEL=1`, `ALLOWED_ORIGINS` (must include `https://simbig2026-team-linkuni.xcr33d.workers.dev`)
   and optionally `PROXY_SHARED_SECRET`.
4. Run `uvicorn app:app --host 0.0.0.0 --port <port>` and expose it over HTTPS (the site is https, so a
   plain-HTTP address is blocked by the browser). The pod's proxy URL for that port works.
5. Give us the HTTPS base URL; it goes in `TRANSLATE_BASE_URL` in `task3/public/shared/config.js`.

Settings (environment or `.env`): see `.env.example`.
