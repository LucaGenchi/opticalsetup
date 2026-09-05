#!/usr/bin/env python3
"""Download the reviewed primary PDFs to a local research directory.

Standard library only. Does not redistribute PDFs or replace existing files.
The pinned hash detects changed publisher copies and incomplete downloads.
Usage: python3 tools/download-2pp-sources.py /path/to/local/papers
"""
import hashlib
import json
import sys
import urllib.request
from pathlib import Path


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    target = Path(sys.argv[1]).expanduser().resolve()
    target.mkdir(parents=True, exist_ok=True)
    manifest = Path(__file__).resolve().parents[1] / "collections/2pp/sources.json"
    failed = []
    for source in json.loads(manifest.read_text())["documents"]:
        destination = target / source["filename"]
        try:
            if destination.exists():
                data = destination.read_bytes()
            else:
                request = urllib.request.Request(source["url"], headers={"User-Agent": "OpticalSetup paper collection research"})
                with urllib.request.urlopen(request, timeout=240) as response:
                    data = response.read(50 * 1024 * 1024 + 1)
            if not data.startswith(b"%PDF-") or b"%%EOF" not in data[-2048:]:
                raise ValueError("Response is not a complete PDF")
            if hashlib.sha256(data).hexdigest() != source["sha256"]:
                raise ValueError("PDF differs from the reviewed copy; verify identity and revision before accepting")
            if not destination.exists():
                # Exclusive creation prevents a concurrent download from replacing a file.
                with destination.open("xb") as output:
                    output.write(data)
            print(f"Verified {source['filename']} ({source['pages']} pages)")
        except Exception as error:
            failed.append(source["filename"])
            print(f"Unavailable: {source['filename']}: {error}", file=sys.stderr)
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
