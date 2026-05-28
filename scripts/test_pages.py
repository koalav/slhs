#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str], quiet: bool = False) -> None:
    print("+", " ".join(command))
    stdout = subprocess.DEVNULL if quiet else None
    subprocess.run(command, cwd=ROOT, check=True, stdout=stdout)


def main() -> int:
    run([sys.executable, "scripts/smoke_test.py"])
    run([sys.executable, "-m", "compileall", "-q", "src", "scripts"])
    run([sys.executable, "-m", "json.tool", "docs/data/latest.json"], quiet=True)
    run([sys.executable, "-m", "json.tool", "docs/data/base.json"], quiet=True)
    run([sys.executable, "-m", "json.tool", "docs/data/research.json"], quiet=True)
    run(["node", "--check", "docs/assets/app.js"])
    run(["node", "--check", "docs/assets/base.js"])
    run(["node", "--check", "docs/assets/research.js"])
    run(["node", "--check", "docs/assets/simulator.js"])
    run(["node", "tests/simulator.test.js"])
    run([sys.executable, "tests/static_pages_test.py"])
    run([sys.executable, "tests/http_pages_test.py"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
