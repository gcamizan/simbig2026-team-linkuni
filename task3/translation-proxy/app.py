"""
Phase: translation proxy.

One endpoint, POST /translate {text, src_lang, tgt_lang} -> {translation}. The review page
calls it synchronously when the curator approves an entry. The Hugging Face token lives only
here (environment / .env) and never appears in a response.

Translation runs on a SELF-HOSTED facebook/nllb-200-distilled-600M (transformers). The
Hugging Face hosted API does not serve this model (checked 2026-10-17), so there is no
external translation call and no token is needed (HF_TOKEN is optional: faster downloads).
The model loads on the first request (or at startup with PRELOAD_MODEL=1).
Backends (TRANSLATE_BACKEND): local (default).

Run (from translation-proxy/):
    .venv/bin/uvicorn app:app --port 8001
"""
import asyncio
import os
import re
import threading
from typing import Callable, Protocol

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

load_dotenv()

MAX_TEXT_CHARS = 500
LANG_CODE = re.compile(r"^[a-z]{3}_[A-Z][a-z]{3}$")  # FLORES-200 style, e.g. quy_Latn
DEFAULT_ORIGINS = "https://simbig2026-team-linkuni.xcr33d.workers.dev,http://127.0.0.1:8000,http://localhost:8000"
DEFAULT_MODEL = "facebook/nllb-200-distilled-600M"
MAX_NEW_TOKENS = 200


class TranslateRequest(BaseModel):
    text: str
    src_lang: str
    tgt_lang: str

    @field_validator("text")
    @classmethod
    def _text(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("text is empty")
        if len(v) > MAX_TEXT_CHARS:
            raise ValueError(f"text is longer than {MAX_TEXT_CHARS} characters")
        return v

    @field_validator("src_lang", "tgt_lang")
    @classmethod
    def _lang(cls, v: str) -> str:
        if not LANG_CODE.match(v):
            raise ValueError("language code must look like quy_Latn")
        return v


class TranslateResponse(BaseModel):
    translation: str


class BackendError(Exception):
    """The translation backend failed; the message is safe to show to the client."""


class Backend(Protocol):
    async def translate(self, text: str, src_lang: str, tgt_lang: str) -> str: ...


def load_nllb(model_name: str):
    """Load tokenizer and model (slow: downloads ~2.5 GB the first time). Imported lazily so the
    tests and the API surface do not need torch."""
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

    tokenizer = AutoTokenizer.from_pretrained(model_name)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_name)
    model.eval()
    return tokenizer, model


class LocalBackend:
    def __init__(self, model_name: str = DEFAULT_MODEL, loader: Callable = load_nllb):
        self._model_name, self._loader = model_name, loader
        self._tokenizer = self._model = None
        self._lock = threading.Lock()  # one translation at a time; also guards lazy loading

    def _translate_sync(self, text: str, src_lang: str, tgt_lang: str) -> str:
        with self._lock:
            if self._model is None:
                self._tokenizer, self._model = self._loader(self._model_name)
            tok, model = self._tokenizer, self._model
            for code in (src_lang, tgt_lang):
                if tok.convert_tokens_to_ids(code) == tok.unk_token_id:
                    raise BackendError(f"language code {code} is not supported by the model")
            tok.src_lang = src_lang
            inputs = tok(text, return_tensors="pt")
            out = model.generate(
                **inputs,
                forced_bos_token_id=tok.convert_tokens_to_ids(tgt_lang),
                max_new_tokens=MAX_NEW_TOKENS,
            )
            return tok.batch_decode(out, skip_special_tokens=True)[0]

    async def translate(self, text: str, src_lang: str, tgt_lang: str) -> str:
        try:
            return await asyncio.to_thread(self._translate_sync, text, src_lang, tgt_lang)
        except BackendError:
            raise
        except Exception as e:  # model load/generation failure: log server-side, generic message out
            print(f"translation failed: {type(e).__name__}: {e}")
            raise BackendError("the translation model failed") from e


def make_backend() -> Backend:
    kind = os.getenv("TRANSLATE_BACKEND", "local")
    if kind != "local":
        raise RuntimeError(f"unknown TRANSLATE_BACKEND {kind!r} (only 'local' exists)")
    return LocalBackend(os.getenv("NLLB_MODEL", DEFAULT_MODEL))


def create_app(backend: Backend | None = None) -> FastAPI:
    app = FastAPI(title="Task 3 translation proxy")
    origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_methods=["POST", "GET", "OPTIONS"],
        allow_headers=["Content-Type", "X-Proxy-Secret"],
    )
    state = {"backend": backend}

    if backend is None and os.getenv("PRELOAD_MODEL") == "1":
        state["backend"] = make_backend()
        state["backend"]._translate_sync("hello", "eng_Latn", "spa_Latn")  # warm up: load the model now

    def get_backend() -> Backend:
        if state["backend"] is None:
            state["backend"] = make_backend()
        return state["backend"]

    # Optional shared secret. NOTE: anything sent from public browser JS is public, so this only
    # deters casual abuse; real access control is an open item (TODO(EDSON)).
    def check_secret(x_proxy_secret: str | None = Header(default=None)) -> None:
        secret = os.getenv("PROXY_SHARED_SECRET", "")
        if secret and x_proxy_secret != secret:
            raise HTTPException(status_code=401, detail="missing or wrong X-Proxy-Secret")

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok"}

    @app.post("/translate", response_model=TranslateResponse, dependencies=[Depends(check_secret)])
    async def translate(req: TranslateRequest, backend: Backend = Depends(get_backend)) -> TranslateResponse:
        try:
            return TranslateResponse(translation=await backend.translate(req.text, req.src_lang, req.tgt_lang))
        except BackendError as e:
            raise HTTPException(status_code=502, detail=str(e))

    return app


app = create_app()
