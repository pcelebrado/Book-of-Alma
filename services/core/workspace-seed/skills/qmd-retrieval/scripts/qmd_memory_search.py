#!/usr/bin/env python3
import argparse
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(os.environ.get("OPENCLAW_WORKSPACE_DIR", "/data/workspace")).resolve()
STATE_DIR = Path(os.environ.get("OPENCLAW_STATE_DIR", "/data/.openclaw"))
QMD_COMMAND = os.environ.get(
    "OPENCLAW_MEMORY_QMD_COMMAND",
    "/root/.bun/install/global/node_modules/@tobilu/qmd/bin/qmd",
)
QMD_COLLECTION_NAME = os.environ.get("OPENCLAW_QMD_COLLECTION_NAME", "workspace").strip() or "workspace"
QMD_XDG_CONFIG = STATE_DIR / "agents" / "main" / "qmd" / "xdg-config"
QMD_XDG_CACHE = STATE_DIR / "agents" / "main" / "qmd" / "xdg-cache"


def qmd_env() -> dict[str, str]:
    env = os.environ.copy()
    env["XDG_CONFIG_HOME"] = str(QMD_XDG_CONFIG)
    env["XDG_CACHE_HOME"] = str(QMD_XDG_CACHE)
    env["OPENCLAW_STATE_DIR"] = str(STATE_DIR)
    env["OPENCLAW_WORKSPACE_DIR"] = str(ROOT)
    return env


def to_local_path(qmd_file: str) -> str:
    prefix = "qmd://workspace/"
    if qmd_file.startswith(prefix):
        return qmd_file[len(prefix) :]
    return qmd_file


def is_workspace_markdown(rel_path: str) -> bool:
    rel = rel_path.strip().replace("\\", "/")
    if not rel or rel.startswith("/") or rel.startswith("../"):
        return False
    candidate = (ROOT / rel).resolve()
    return candidate.is_file() and candidate.suffix.lower() == ".md" and (candidate == ROOT or ROOT in candidate.parents)


def compute_line_window(path: Path, snippet: str) -> tuple[int, int]:
    try:
        text = path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return 1, 1

    clean = re.sub(r"@@[^\n]*\n?", "", snippet).strip()
    if not clean:
        return 1, 1

    idx = text.find(clean)
    if idx < 0:
        for part in clean.splitlines():
            part = part.strip()
            if part:
                idx = text.find(part)
                if idx >= 0:
                    break
    if idx < 0:
        return 1, min(10, text.count("\n") + 1)

    start = text.count("\n", 0, idx) + 1
    line_count = max(1, clean.count("\n") + 1)
    end = start + line_count - 1
    return start, end


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", required=True)
    parser.add_argument("--max-results", type=int, default=5)
    parser.add_argument("--min-score", type=float, default=0.0)
    args = parser.parse_args()

    QMD_XDG_CONFIG.mkdir(parents=True, exist_ok=True)
    QMD_XDG_CACHE.mkdir(parents=True, exist_ok=True)

    cmd = [
        QMD_COMMAND,
        "search",
        args.query,
        "-c",
        QMD_COLLECTION_NAME,
        "-n",
        str(max(1, min(args.max_results * 3, 50))),
        "--json",
    ]
    proc = subprocess.run(cmd, text=True, env=qmd_env(), capture_output=True, check=False)
    if proc.returncode != 0:
        combined = "\n".join(part for part in [proc.stdout.strip(), proc.stderr.strip()] if part).strip()
        if "Collection not found" in combined:
            raise SystemExit(
                f"QMD collection '{QMD_COLLECTION_NAME}' is missing. Run `bash tools/admin/qmd-rescan.sh` first.",
            )
        raise SystemExit(combined or f"qmd search failed with exit code {proc.returncode}")

    raw = proc.stdout
    rows = json.loads(raw)

    out = []
    for row in rows:
        rel = to_local_path(str(row.get("file", "")).strip())
        if not is_workspace_markdown(rel):
            continue

        score = float(row.get("score", 0.0) or 0.0)
        if score < args.min_score:
            continue

        snippet = str(row.get("snippet") or "").strip()
        full_path = (ROOT / rel).resolve()
        start_line, end_line = compute_line_window(full_path, snippet)

        out.append(
            {
                "path": rel,
                "startLine": start_line,
                "endLine": end_line,
                "score": score,
                "snippet": snippet,
                "source": "qmd",
                "citation": f"{rel}#L{start_line}-L{end_line}",
            }
        )
        if len(out) >= args.max_results:
            break

    print(json.dumps({"results": out, "provider": "qmd-local", "citations": "auto"}, indent=2))


if __name__ == "__main__":
    main()
