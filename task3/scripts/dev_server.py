#!/usr/bin/env python3
"""
Local development server for the site.

Serves public/ over http://127.0.0.1 (pages that fetch JSON need http, not file://).
Binds to 127.0.0.1 only.

Usage (from task3/):
    python3 scripts/dev_server.py            # then open http://127.0.0.1:8000/
    python3 scripts/dev_server.py --port 8001
"""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


def main() -> None:
    here = Path(__file__).resolve().parent.parent  # task3/
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()

    handler = functools.partial(Handler, directory=str(here / "public"))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving public/ at http://127.0.0.1:{args.port}/  (selection page is the home page)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
