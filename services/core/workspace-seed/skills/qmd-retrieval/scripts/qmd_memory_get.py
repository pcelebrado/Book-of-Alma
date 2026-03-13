#!/usr/bin/env python3
import argparse
import json
import os
from pathlib import Path

ROOT = Path(os.environ.get("OPENCLAW_WORKSPACE_DIR", "/data/workspace")).resolve()


def resolve_workspace_markdown(raw_path: str) -> tuple[str, Path]:
    rel = raw_path.strip()
    if rel.startswith("qmd://workspace/"):
        rel = rel[len("qmd://workspace/") :]
    rel = rel.replace("\\", "/")
    if not rel or rel.startswith("/") or rel.startswith("../"):
        raise SystemExit("Path must be a workspace-relative markdown file")

    target = (ROOT / rel).resolve()
    if target.suffix.lower() != ".md" or not target.is_file() or (target != ROOT and ROOT not in target.parents):
        raise SystemExit("Only markdown files under the workspace are allowed")
    return rel, target


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--path", required=True)
    parser.add_argument("--from", dest="start", type=int, default=1)
    parser.add_argument("--lines", type=int, default=40)
    args = parser.parse_args()

    rel, target = resolve_workspace_markdown(args.path)
    lines = target.read_text(encoding="utf-8", errors="ignore").splitlines()

    start = max(1, args.start)
    end = min(len(lines), start + max(1, args.lines) - 1)
    content = "\n".join(lines[start - 1 : end])

    print(
        json.dumps(
            {
                "path": rel,
                "from": start,
                "lines": max(1, args.lines),
                "content": content,
                "citation": f"{rel}#L{start}-L{end}",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
