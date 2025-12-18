#!/usr/bin/env python3
"""
Recursively convert non-WebP images to WebP.

Default behavior:
- Creates a .webp next to each source file (same folder)
- Keeps the original file (safe)
- Skips files already in a "thumbnails" folder
- Skips conversion if output .webp is newer than input

Requires:
  pip install pillow
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Optional

from PIL import Image, ImageOps


# Treat these as convertible image inputs (non-webp).
CONVERT_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".bmp", ".gif"}

# WebP inputs we should ignore.
WEBP_EXTS = {".webp"}


def is_in_folder_named(path: Path, folder_name: str) -> bool:
    folder_name = folder_name.lower()
    return any(part.lower() == folder_name for part in path.parts)


def is_up_to_date(src: Path, dst: Path) -> bool:
    return dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime


def convert_one(
    src: Path,
    dst: Path,
    quality: int,
    keep_metadata: bool,
) -> None:
    with Image.open(src) as im:
        # Fix EXIF orientation (common for phone photos)
        im = ImageOps.exif_transpose(im)

        # Ensure a sensible mode for WebP
        # - If transparency exists, keep RGBA
        # - Otherwise, use RGB
        if im.mode not in ("RGB", "RGBA"):
            # Convert palettes/L/CMYK/etc.
            # If image has transparency info in palette, convert to RGBA.
            if "transparency" in im.info:
                im = im.convert("RGBA")
            else:
                im = im.convert("RGB")

        save_kwargs = {
            "format": "WEBP",
            "quality": quality,
            "method": 6,       # better compression (slower encode)
            "optimize": True,
        }

        # Preserve ICC color profile if present
        if "icc_profile" in im.info:
            save_kwargs["icc_profile"] = im.info["icc_profile"]

        # Strip EXIF by default (smaller); keep only if asked
        if keep_metadata and "exif" in im.info:
            save_kwargs["exif"] = im.info["exif"]

        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, **save_kwargs)


def main() -> int:
    ap = argparse.ArgumentParser(description="Recursively convert non-WebP images to .webp")
    ap.add_argument("root", type=Path, help="Root folder to crawl")
    ap.add_argument("--quality", type=int, default=80, help="WebP quality (default: 80)")
    ap.add_argument("--keep-metadata", action="store_true",
                    help="Keep EXIF metadata (larger files). Default strips EXIF.")
    ap.add_argument("--delete-originals", action="store_true",
                    help="Delete source files after successful conversion (DANGEROUS).")
    ap.add_argument("--overwrite", action="store_true",
                    help="Overwrite existing .webp outputs even if newer.")
    ap.add_argument("--skip-folder", action="append", default=["thumbnails"],
                    help="Folder name to skip entirely (can be used multiple times). Default: thumbnails")
    args = ap.parse_args()

    root = args.root.resolve()
    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Folder not found: {root}")

    converted = 0
    skipped = 0
    errors = 0
    deleted = 0

    skip_folders = {name.lower() for name in args.skip_folder}

    for src in root.rglob("*"):
        if not src.is_file():
            continue

        # Skip folders by name anywhere in the path
        if any(is_in_folder_named(src, name) for name in skip_folders):
            continue

        ext = src.suffix.lower()
        if ext in WEBP_EXTS:
            continue
        if ext not in CONVERT_EXTS:
            continue

        dst = src.with_suffix(".webp")

        try:
            if not args.overwrite and is_up_to_date(src, dst):
                skipped += 1
                continue

            convert_one(src, dst, quality=args.quality, keep_metadata=args.keep_metadata)
            converted += 1

            if args.delete_originals:
                # Only delete if destination exists and is non-empty
                if dst.exists() and dst.stat().st_size > 0:
                    src.unlink()
                    deleted += 1

        except Exception as e:
            errors += 1
            print(f"[ERROR] {src}: {e}")

    print("\nDone.")
    print(f"Converted: {converted}")
    print(f"Skipped (up-to-date): {skipped}")
    print(f"Deleted originals: {deleted}")
    print(f"Errors: {errors}")

    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
