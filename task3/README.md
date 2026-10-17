# Task 3 — ASR-verified audio phrasebook (SIMBig 2026)

An educational Puno Quechua tourism phrasebook. A curator picks validated spontaneous-speech clips,
the team's ASR model transcribes them, the curator corrects the Quechua, a machine translation
gives the English (also editable), and the approved entries form a phrasebook.

Live site: https://simbig2026-team-linkuni.xcr33d.workers.dev

## Pages (`public/`, static HTML/JS, no build step)

| URL | Folder | What it does |
|---|---|---|
| `/` | `index.html`, `select.js` | Lists the audio sample from the Runpod server; pick up to 10 clips |
| `/asr/` | `asr/` | Sends the selection to the ASR batch endpoint and shows transcripts |
| `/review/` | `review/` | Correct the Quechua, choose a category, translate, edit the English, save the entry |
| `/phrasebook/` | `phrasebook/` | Shows the saved entries by category, with data and licence notes |

State passes between pages through the browser (localStorage) and `*.json` file export/import.
`public/shared/config.js` holds every setting (Runpod URL, endpoint paths, mock mode, limits);
search the code for `TODO(EDSON)` to find values that still depend on the Runpod server.

## Services

- **Runpod server (Edson):** `GET /samples`, `POST /asr_batch` (and the Task 1 ASR model).
- **Translation proxy (`translation-proxy/`):** FastAPI service running `facebook/nllb-200-distilled-600M`
  itself (Hugging Face's hosted API does not serve it). See its README to run and deploy it.

## Run the site locally

```bash
cd task3
python3 scripts/dev_server.py        # then open http://127.0.0.1:8000/
```

Set `USE_MOCK: true` in `public/shared/config.js` to work without any server (samples and ASR are
simulated, translation is a placeholder text).

## Deploy

`.github/workflows/deploy.yml` deploys `task3/public` to Cloudflare Workers when `main` changes. It
needs the repository secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
Only `main` deploys; work happens on `task3/<phase>` branches, squash-merged.

## Data and licences

Speech data: Mozilla Common Voice Spontaneous Speech 5.0 (Puno Quechua), CC0-1.0; the dataset must
not be re-hosted and speakers must not be identified. Translations come from Meta's NLLB-200
(CC-BY-NC 4.0, non-commercial). Secrets (`.env`) are never committed.
