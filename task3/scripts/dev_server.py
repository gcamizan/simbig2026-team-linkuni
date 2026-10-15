#!/usr/bin/env python3
"""
Local development server for the site (temporary, until the Runpod audio endpoint exists).

Serves public/ and, under /corpus-audio/<filename>, the spontaneous mp3s from the
sibling asr-puno-quechua repo, so the selection tool can play clips without any local
path appearing in the page, the index, or the repo. Binds to 127.0.0.1 only; only
plain *.mp3 file names from that one folder are served.

Usage (from task3/):
    python3 scripts/dev_server.py            # then open http://127.0.0.1:8000/select/
    python3 scripts/dev_server.py --corpus-root /path/to/asr-puno-quechua --port 8000
"""
import argparse
import functools
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

AUDIO_DIR = "data/spontaneous/sps-corpus-5.0-2026-09-11-qxp/audios"
AUDIO_PREFIX = "/corpus-audio/"
SAFE_NAME = re.compile(r"^[A-Za-z0-9._-]+\.mp3$")


class Handler(SimpleHTTPRequestHandler):
    audio_dir: Path

    def translate_path(self, path: str) -> str:
        url_path = unquote(urlparse(path).path)
        if url_path.startswith(AUDIO_PREFIX):
            name = url_path[len(AUDIO_PREFIX):]
            if SAFE_NAME.match(name):
                return str(self.audio_dir / name)
            return str(self.audio_dir / "__not_found__")
        return super().translate_path(path)

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    here = Path(__file__).resolve().parent.parent  # task3/
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus-root", type=Path, default=here.parent.parent / "asr-puno-quechua")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    Handler.audio_dir = (args.corpus_root / AUDIO_DIR).resolve()
    if not Handler.audio_dir.is_dir():
        print(f"Warning: audio folder not found: {Handler.audio_dir} (clips will not play)")

    handler = functools.partial(Handler, directory=str(here / "public"))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving public/ at http://127.0.0.1:{args.port}/  (selection tool: /select/)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
