"""Tests for the translation proxy. The Hugging Face call is always mocked: no token, no network.

Run (from translation-proxy/):  .venv/bin/pytest -q
"""
import os

import pytest
from fastapi.testclient import TestClient

import app as proxy

GOOD = {"text": "Allillanchu", "src_lang": "quy_Latn", "tgt_lang": "eng_Latn"}


class FakeBackend:
    def __init__(self):
        self.calls = []

    async def translate(self, text, src_lang, tgt_lang):
        self.calls.append((text, src_lang, tgt_lang))
        return "Hello"


class FailingBackend:
    async def translate(self, text, src_lang, tgt_lang):
        raise proxy.BackendError("translation service returned HTTP 503")


def client(backend):
    return TestClient(proxy.create_app(backend))


def test_translate_ok():
    backend = FakeBackend()
    res = client(backend).post("/translate", json=GOOD)
    assert res.status_code == 200
    assert res.json() == {"translation": "Hello"}
    assert backend.calls == [("Allillanchu", "quy_Latn", "eng_Latn")]


@pytest.mark.parametrize("patch", [
    {"text": "   "},
    {"text": "x" * 501},
    {"src_lang": "quechua"},
    {"tgt_lang": "eng"},
])
def test_rejects_bad_input(patch):
    res = client(FakeBackend()).post("/translate", json={**GOOD, **patch})
    assert res.status_code == 422


def test_backend_failure_is_502():
    res = client(FailingBackend()).post("/translate", json=GOOD)
    assert res.status_code == 502
    assert "503" in res.json()["detail"]


def test_shared_secret(monkeypatch):
    monkeypatch.setenv("PROXY_SHARED_SECRET", "s3cret")
    c = client(FakeBackend())
    assert c.post("/translate", json=GOOD).status_code == 401
    assert c.post("/translate", json=GOOD, headers={"X-Proxy-Secret": "wrong"}).status_code == 401
    assert c.post("/translate", json=GOOD, headers={"X-Proxy-Secret": "s3cret"}).status_code == 200


def test_cors_allows_site_origin_only():
    c = client(FakeBackend())
    ok = c.options("/translate", headers={
        "Origin": "https://simbig2026-team-linkuni.xcr33d.workers.dev",
        "Access-Control-Request-Method": "POST",
    })
    assert ok.headers.get("access-control-allow-origin") == "https://simbig2026-team-linkuni.xcr33d.workers.dev"
    bad = c.options("/translate", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


def test_unknown_backend_fails_cleanly(monkeypatch):
    monkeypatch.setenv("TRANSLATE_BACKEND", "hf")
    with pytest.raises(RuntimeError, match="unknown TRANSLATE_BACKEND"):
        proxy.make_backend()


# --- LocalBackend with a fake tokenizer/model (no torch, no download) -----------------------

class FakeTok:
    unk_token_id = 3
    src_lang = None

    def convert_tokens_to_ids(self, code):
        return {"quy_Latn": 10, "eng_Latn": 11}.get(code, 3)

    def __call__(self, text, return_tensors=None):
        FakeTok.last = (text, self.src_lang)
        return {"input_ids": [text]}

    def batch_decode(self, out, skip_special_tokens=True):
        return [f"EN:{out}"]


class FakeModel:
    def generate(self, input_ids, forced_bos_token_id, max_new_tokens):
        return f"{input_ids[0]}|{forced_bos_token_id}|{max_new_tokens}"


def fake_loader(name):
    fake_loader.loads += 1
    return FakeTok(), FakeModel()


fake_loader.loads = 0


def test_local_backend_translates_and_loads_once():
    fake_loader.loads = 0
    c = client(proxy.LocalBackend(loader=fake_loader))
    r1 = c.post("/translate", json=GOOD)
    r2 = c.post("/translate", json=GOOD)
    assert r1.json() == {"translation": "EN:Allillanchu|11|200"}
    assert r2.status_code == 200
    assert fake_loader.loads == 1
    assert FakeTok.last == ("Allillanchu", "quy_Latn")


def test_local_backend_rejects_unsupported_language():
    c = client(proxy.LocalBackend(loader=fake_loader))
    res = c.post("/translate", json={**GOOD, "src_lang": "quz_Latn"})
    assert res.status_code == 502
    assert "quz_Latn" in res.json()["detail"]


def test_local_backend_model_failure_is_generic_502():
    def boom(name):
        raise OSError("secret path /x/y")

    res = client(proxy.LocalBackend(loader=boom)).post("/translate", json=GOOD)
    assert res.status_code == 502
    assert "secret path" not in res.text


@pytest.mark.skipif(os.getenv("RUN_SLOW") != "1", reason="downloads the real model; set RUN_SLOW=1")
def test_real_model_smoke():
    res = client(proxy.LocalBackend()).post("/translate", json=GOOD)
    assert res.status_code == 200
    assert res.json()["translation"].strip()
