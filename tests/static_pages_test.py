#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def assert_exists(path: str) -> None:
    target = ROOT / path
    assert target.exists(), f"missing file: {path}"
    assert target.stat().st_size > 0, f"empty file: {path}"


def check_html_assets(path: str) -> None:
    html = read(path)
    for href in re.findall(r'href="([^"]+)"', html):
        if href.startswith(("http://", "https://", "#")):
            continue
        assert_exists(str((Path(path).parent / href).as_posix()))
    for src in re.findall(r'src="([^"]+)"', html):
        if src.startswith(("http://", "https://")):
            continue
        assert_exists(str((Path(path).parent / src).as_posix()))


def check_required_ids(html_path: str, js_path: str) -> None:
    html = read(html_path)
    js = read(js_path)
    ids = set(re.findall(r'id="([^"]+)"', html))
    referenced = set(re.findall(r'\b(?:[serb]|bt)\("([^"]+)"\)', js))
    missing = sorted(referenced - ids)
    assert not missing, f"{html_path} missing ids referenced by {js_path}: {missing}"


def main() -> None:
    for path in [
        "docs/index.html",
        "docs/base.html",
        "docs/research.html",
        "docs/simulator.html",
        "docs/backtest.html",
    ]:
        check_html_assets(path)

    check_required_ids("docs/index.html", "docs/assets/app.js")
    check_required_ids("docs/base.html", "docs/assets/base.js")
    check_required_ids("docs/research.html", "docs/assets/research.js")
    check_required_ids("docs/simulator.html", "docs/assets/simulator.js")
    check_required_ids("docs/backtest.html", "docs/assets/backtest.js")

    latest = json.loads(read("docs/data/latest.json"))
    base = json.loads(read("docs/data/base.json"))
    research = json.loads(read("docs/data/research.json"))
    archive_path = ROOT / "docs/data/archive/index.json"

    assert latest["schema_version"] == 1
    assert base["period"]["observations"] >= 400
    assert len(base["series"]["dates"]) == len(base["series"]["samsung_close"])
    assert all(item["available"] for item in research["coverage"])
    if archive_path.exists():
        archive = json.loads(archive_path.read_text(encoding="utf-8"))
        assert archive["schema_version"] == 1
        assert archive["records"], "archive index has no records"
        for row in archive["records"]:
            assert_exists(f"docs/data/archive/{row['path']}")
    for row in research["major_articles"]:
        assert row["source_url"].startswith("http"), f"bad article url: {row}"
    for row in research["global_factors"]:
        assert row["source_url"].startswith("http"), f"bad global factor url: {row}"

    print("static page tests passed")


if __name__ == "__main__":
    main()
