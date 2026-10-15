#!/usr/bin/env python3
"""
Phase: selection UI.

Copies the audio clips listed in data/selected/candidates.json into
public/audio/selected/ (so the site deploys them and the ASR wrapper can read them).

Clips are looked up in the spontaneous audios folder of the sibling asr-puno-quechua
repo. Missing clips are reported and the script exits non-zero.

Usage:
    python3 scripts/copy_selected_audio.py
    python3 scripts/copy_selected_audio.py --corpus-root /path/to/asr-puno-quechua
"""
import argparse
import json
import shutil
import sys
from pathlib import Path

AUDIO_DIR = "data/spontaneous/sps-corpus-5.0-2026-09-11-qxp/audios"


def main() -> None:
    here = Path(__file__).resolve().parent.parent  # task3/
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus-root", type=Path, default=here.parent.parent / "asr-puno-quechua")
    parser.add_argument("--candidates", type=Path, default=here / "data" / "selected" / "candidates.json")
    parser.add_argument("--out", type=Path, default=here / "public" / "audio" / "selected")
    args = parser.parse_args()

    if not args.candidates.exists():
        sys.exit(f"{args.candidates} not found. Export it from the selection tool first.")
    candidates = json.loads(args.candidates.read_text(encoding="utf-8"))

    args.out.mkdir(parents=True, exist_ok=True)
    copied, missing = 0, []
    for c in candidates:
        src = args.corpus_root / AUDIO_DIR / c["audio_filename"]
        if not src.exists():
            missing.append(c["audio_filename"])
            continue
        shutil.copy2(src, args.out / c["audio_filename"])
        copied += 1

    print(f"Copied {copied} of {len(candidates)} clips to {args.out}")
    if missing:
        print("Missing:", *missing, sep="\n  ")
        sys.exit(1)


if __name__ == "__main__":
    main()
