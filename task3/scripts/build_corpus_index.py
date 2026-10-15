#!/usr/bin/env python3
"""
Phase: selection UI.

Builds the browsable index the selection tool fetches
(public/select/data/index.json; gitignored, regenerate any time). The index holds no
audio paths: the page builds audio URLs from SELECT_CONFIG.AUDIO_BASE_URL + audio_filename.

Pool = spontaneous Common Voice clips only:
  asr-puno-quechua/data/spontaneous/sps-corpus-5.0-2026-09-11-qxp/ss-corpus-qxp.tsv

Each clip gets a `status`, derived like the datasheet's transcription buckets:
  validated        transcription present and votes >= 1   (1,074 clips)
  pending          transcription present, votes == 0      (148 clips)
  not_transcribed  no transcription                       (6,083 clips)
The tool's "validated / not validated" filter groups pending + not_transcribed as
"not validated". Clips longer than --max-duration-ms are dropped.

Entry fields: id, audio_filename, reference_text (the transcription, may be empty), prompt (the question asked),
duration_ms, votes, status, category (always null; the curator assigns it).

Default assumption: asr-puno-quechua is a sibling folder of this repo; override with
--corpus-root. Audio bytes are not touched here.

Usage:
    python3 scripts/build_corpus_index.py
    python3 scripts/build_corpus_index.py --corpus-root /path/to/asr-puno-quechua --max-duration-ms 10000
"""
import argparse
import csv
import json
import sys
from pathlib import Path

SPONTANEOUS_DIR = "data/spontaneous/sps-corpus-5.0-2026-09-11-qxp"


def to_int(value: str, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def status_of(transcription: str, votes: int) -> str:
    if not transcription:
        return "not_transcribed"
    return "validated" if votes >= 1 else "pending"


def build_entries(root: Path, max_ms: int) -> list[dict]:
    base = root / SPONTANEOUS_DIR
    # quoting=NONE: Common Voice TSVs contain stray quote characters
    with (base / "ss-corpus-qxp.tsv").open(encoding="utf-8", newline="") as f:
        rows = list(csv.DictReader(f, delimiter="\t", quoting=csv.QUOTE_NONE))

    entries = []
    for row in rows:
        dur = to_int(row["duration_ms"])
        if not dur or dur > max_ms:
            continue
        text = row["transcription"].strip()
        votes = to_int(row["votes"])
        entries.append(
            {
                "id": f"sps-{row['audio_id']}",
                "audio_filename": row["audio_file"],
                "reference_text": text,
                "prompt": row["prompt"].strip(),
                "duration_ms": dur,
                "votes": votes,
                "status": status_of(text, votes),
                "category": None,
            }
        )
    return entries


def main() -> None:
    here = Path(__file__).resolve().parent.parent  # task3/
    default_root = here.parent.parent / "asr-puno-quechua"

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus-root", type=Path, default=default_root,
                        help=f"asr-puno-quechua repo root (default: {default_root})")
    parser.add_argument("--max-duration-ms", type=int, default=10000,
                        help="drop clips longer than this (default: 10000)")
    parser.add_argument("--out", type=Path, default=here / "public" / "select" / "data" / "index.json",
                        help="output path (default: public/select/data/index.json)")
    args = parser.parse_args()

    tsv = args.corpus_root / SPONTANEOUS_DIR / "ss-corpus-qxp.tsv"
    if not tsv.exists():
        sys.exit(f"Expected corpus file not found: {tsv}\n"
                 "Pass --corpus-root if asr-puno-quechua isn't a sibling of this repo.")

    entries = build_entries(args.corpus_root, args.max_duration_ms)

    args.out.parent.mkdir(parents=True, exist_ok=True)
    with args.out.open("w", encoding="utf-8") as f:
        json.dump(entries, f, ensure_ascii=False, indent=2)

    by_status = {}
    for e in entries:
        by_status[e["status"]] = by_status.get(e["status"], 0) + 1
    print(f"Wrote {len(entries)} spontaneous entries (<= {args.max_duration_ms} ms): {by_status}")
    print(f"  {args.out}")


if __name__ == "__main__":
    main()
