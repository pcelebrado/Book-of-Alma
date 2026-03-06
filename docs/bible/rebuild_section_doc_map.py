import json
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(r"C:\P4NTH30N\OP3NF1XER\nate-alma\dev\memory\alma-teachings\bible")
COMPACT_PATH = ROOT / "indices" / "compact-index.json"
SECTIONS_PATH = ROOT / "mappings" / "book-sections.json"
OUTPUT_PATH = ROOT / "indices" / "section-doc-map.json"


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def main() -> None:
    compact = load_json(COMPACT_PATH)
    mapping = load_json(SECTIONS_PATH)

    docs = compact.get("documents", [])
    sections = mapping.get("sections", [])

    by_id = {s["sectionId"]: s for s in sections}
    ordered = sorted(sections, key=lambda s: s["order"])

    section_out = {}
    for s in ordered:
        section_out[s["sectionId"]] = {
            "title": s["title"],
            "order": s["order"],
            "docCount": 0,
            "documents": [],
        }

    unmapped = []
    for d in docs:
        section_id = d.get("sectionId")
        doc_id = d.get("docId")
        if section_id in by_id and doc_id:
            section_out[section_id]["documents"].append(doc_id)
        else:
            if doc_id:
                unmapped.append(doc_id)

    total_mapped = 0
    for section in section_out.values():
        section["docCount"] = len(section["documents"])
        total_mapped += section["docCount"]

    output = {
        "schemaVersion": "1.0.0",
        "generatedAt": datetime.now(timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z"),
        "totalSections": len(section_out),
        "totalMapped": total_mapped,
        "unmapped": unmapped,
        "sections": section_out,
    }

    with OUTPUT_PATH.open("w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=True, indent=2)
        f.write("\n")


if __name__ == "__main__":
    main()
