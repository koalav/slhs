#!/usr/bin/env python3
from __future__ import annotations

import json
import threading
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


def fetch(base_url: str, path: str) -> bytes:
    with urllib.request.urlopen(f"{base_url}{path}", timeout=5) as response:
        assert response.status == 200, path
        return response.read()


def main() -> None:
    handler = partial(SimpleHTTPRequestHandler, directory=str(DOCS))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    try:
        for path in ["/", "/index.html", "/base.html", "/research.html", "/simulator.html", "/backtest.html"]:
            body = fetch(base_url, path)
            assert b"<!doctype html>" in body.lower(), path

        for path in [
            "/assets/app.js",
            "/assets/base.js",
            "/assets/research.js",
            "/assets/simulator.js",
            "/assets/backtest.js",
            "/assets/styles.css",
        ]:
            assert len(fetch(base_url, path)) > 100, path

        latest = json.loads(fetch(base_url, "/data/latest.json"))
        base = json.loads(fetch(base_url, "/data/base.json"))
        research = json.loads(fetch(base_url, "/data/research.json"))
        assert latest["schema_version"] == 1
        assert base["schema_version"] == 1
        assert research["schema_version"] == 1
        archive_index = DOCS / "data/archive/index.json"
        if archive_index.exists():
            archive = json.loads(fetch(base_url, "/data/archive/index.json"))
            assert archive["schema_version"] == 1
            assert archive["records"]
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)

    print("http pages tests passed")


if __name__ == "__main__":
    main()
