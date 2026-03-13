#!/usr/bin/env python3
import argparse
import copy
import datetime as dt
import json
import os
from pathlib import Path
from typing import Any


STATE_DIR = Path(os.environ.get("OPENCLAW_STATE_DIR", "/data/.openclaw"))
CONFIG_PATH = STATE_DIR / "openclaw.json"
WORKSPACE_DIR = Path(os.environ.get("OPENCLAW_WORKSPACE_DIR", "/data/workspace"))
INTERESTING_PREFIXES = (
    "auth",
    "agents.defaults.model",
    "agents.defaults.models",
    "models.providers",
    "channels",
    "plugins",
    "commands",
    "tools",
    "memory",
    "gateway",
    "wizard",
)


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def flatten(obj: Any, prefix: str = "") -> dict[str, str]:
    out: dict[str, str] = {}
    if isinstance(obj, dict):
        for key, value in obj.items():
            next_prefix = f"{prefix}.{key}" if prefix else str(key)
            out.update(flatten(value, next_prefix))
        return out
    if isinstance(obj, list):
        out[prefix] = f"list[{len(obj)}]"
        return out
    out[prefix] = type(obj).__name__
    return out


def matches_interesting(path: str) -> bool:
    return any(path == prefix or path.startswith(prefix + ".") for prefix in INTERESTING_PREFIXES)


def deep_merge(target: Any, patch: Any) -> Any:
    if not isinstance(target, dict) or not isinstance(patch, dict):
        return copy.deepcopy(patch)
    merged = copy.deepcopy(target)
    for key, value in patch.items():
        if key in merged:
            merged[key] = deep_merge(merged[key], value)
        else:
            merged[key] = copy.deepcopy(value)
    return merged


def delete_dotted_path(target: dict[str, Any], dotted_path: str) -> bool:
    parts = [part for part in dotted_path.split(".") if part]
    if not parts:
        return False
    cursor: Any = target
    for part in parts[:-1]:
        if not isinstance(cursor, dict) or part not in cursor:
            return False
        cursor = cursor[part]
    if not isinstance(cursor, dict) or parts[-1] not in cursor:
        return False
    del cursor[parts[-1]]
    return True


def backup_config(label: str) -> Path:
    timestamp = dt.datetime.utcnow().strftime("%Y-%m-%dT%H-%M-%SZ")
    suffix = f".bak-{timestamp}-{label}" if label else f".bak-{timestamp}"
    backup_path = CONFIG_PATH.with_name(CONFIG_PATH.name + suffix)
    backup_path.write_text(CONFIG_PATH.read_text(encoding="utf-8"), encoding="utf-8")
    return backup_path


def summarize(config: dict[str, Any]) -> dict[str, Any]:
    defaults = (((config.get("agents") or {}).get("defaults")) or {})
    memory = config.get("memory") or {}
    gateway = config.get("gateway") or {}
    return {
        "config_path": str(CONFIG_PATH),
        "workspace_dir": str(WORKSPACE_DIR),
        "primary_model": (((defaults.get("model") or {}).get("primary")) or None),
        "model_aliases": sorted(((defaults.get("models") or {})).keys()),
        "auth_profiles": sorted((((config.get("auth") or {}).get("profiles")) or {}).keys()),
        "provider_defs": sorted((((config.get("models") or {}).get("providers")) or {}).keys()),
        "channels": sorted((config.get("channels") or {}).keys()),
        "enabled_plugins": sorted(
            key for key, value in (((config.get("plugins") or {}).get("entries")) or {}).items() if isinstance(value, dict) and value.get("enabled")
        ),
        "commands": config.get("commands") or {},
        "tools": config.get("tools") or {},
        "memory": {
            "backend": memory.get("backend"),
            "qmd_paths": (((memory.get("qmd") or {}).get("paths")) or []),
            "memory_search": (defaults.get("memorySearch") or {}),
        },
        "gateway": {
            "mode": gateway.get("mode"),
            "bind": gateway.get("bind"),
            "port": gateway.get("port"),
            "tailscale": gateway.get("tailscale"),
            "controlUi": gateway.get("controlUi"),
            "http_endpoints": (((gateway.get("http") or {}).get("endpoints")) or {}),
        },
    }


def audit_backups() -> list[dict[str, Any]]:
    current = load_json(CONFIG_PATH)
    current_flat = flatten(current)
    reports: list[dict[str, Any]] = []
    for path in sorted(STATE_DIR.glob("openclaw.json.bak*")):
        try:
            data = load_json(path)
        except Exception as exc:
            reports.append({"backup": path.name, "error": str(exc)})
            continue
        other_flat = flatten(data)
        missing = sorted(key for key in current_flat if key not in other_flat and matches_interesting(key))
        extra = sorted(key for key in other_flat if key not in current_flat and matches_interesting(key))
        type_changes = sorted(
            key for key in current_flat if key in other_flat and current_flat[key] != other_flat[key] and matches_interesting(key)
        )
        reports.append(
            {
                "backup": path.name,
                "missing_vs_current": missing[:20],
                "extra_vs_current": extra[:20],
                "type_changes": type_changes[:20],
            }
        )
    return reports


def cmd_summary(_args: argparse.Namespace) -> int:
    print(json.dumps(summarize(load_json(CONFIG_PATH)), indent=2))
    return 0


def cmd_audit_backups(_args: argparse.Namespace) -> int:
    print(json.dumps(audit_backups(), indent=2))
    return 0


def cmd_patch(args: argparse.Namespace) -> int:
    current = load_json(CONFIG_PATH)
    updated = copy.deepcopy(current)
    for merge_json in args.merge_json:
        patch = json.loads(merge_json)
        updated = deep_merge(updated, patch)
    removed = []
    for dotted_path in args.unset:
        if delete_dotted_path(updated, dotted_path):
            removed.append(dotted_path)
    backup = backup_config(args.backup_label)
    save_json(CONFIG_PATH, updated)
    print(
        json.dumps(
            {
                "ok": True,
                "backup": str(backup),
                "removed": removed,
                "summary": summarize(updated),
            },
            indent=2,
        )
    )
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Audit and patch live OpenClaw config safely.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    summary = subparsers.add_parser("summary", help="Print a redaction-safe current config summary.")
    summary.set_defaults(func=cmd_summary)

    audit = subparsers.add_parser("audit-backups", help="Compare current config to backup snapshots.")
    audit.set_defaults(func=cmd_audit_backups)

    patch = subparsers.add_parser("patch", help="Apply JSON merge patches and create a backup first.")
    patch.add_argument("--merge-json", action="append", default=[], help="Deep-merge JSON object into the config.")
    patch.add_argument("--unset", action="append", default=[], help="Remove a dotted-path key.")
    patch.add_argument("--backup-label", default="manual", help="Backup label suffix.")
    patch.set_defaults(func=cmd_patch)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
