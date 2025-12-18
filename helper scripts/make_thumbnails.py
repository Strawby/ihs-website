#!/usr/bin/env python3
"""
Recursive thumbnail generator.

For every folder containing images:
- Creates a ./thumbnails/ subfolder
- Writes compressed WebP thumbnails there
- Preserves filenames (forces .webp)
- Auto-fixes EXIF orientation
- Skips files if thumbnail is newer

Requires:
  pip install pillow
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Tuple

from PIL import Image, ImageOps


IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".bmp", ".gif"}
THUMB_DIR_NAME = "thumbnails"


def is_image(p: Path) -> bool:
    return p.is_file() and p.suffix.lower() in IMAGE_EXTS


def is_up_to_date(src: Path, dst: Path) -> bool:
    return dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime


def make_thumbnail(
    src: Path,
    dst: Path,
    max_size: Tuple[int, int],
    quality: int,
    method: str,
    keep_metadata: bool,
) -> None:
    with Image.open(src) as im:
        im = ImageOps.exif_transpose(im)

        if im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")

        if method == "fit":
            im.thumbnail(max_size, Image.Resampling.LANCZOS)
        elif method == "cover":
            im = ImageOps.fit(im, max_size, method=Image.Resampling.LANCZOS)
        else:
            raise ValueError(f"Unknown method: {method}")

        dst.parent.mkdir(parents=True, exist_ok=True)

        save_kwargs = {
            "format": "WEBP",
            "quality": quality,
            "method": 6,
            "optimize": True,
        }

        if "icc_profile" in im.info:
            save_kwargs["icc_profile"] = im.info["icc_profile"]

        if keep_metadata and "exif" in im.info:
            save_kwargs["exif"] = im.info["exif"]

        im.save(dst, **save_kwargs)


def main() -> int:
    ap = argparse.ArgumentParser(description="Create thumbnails in local 'thumbnails' folders.")
    ap.add_argument("root", type=Path, help="Root folder to crawl")
    ap.add_argument("--max", nargs=2, type=int, default=[600, 600], metavar=("W", "H"),
                    help="Thumbnail max size (default: 600 600)")
    ap.add_argument("--quality", type=int, default=80, help="WebP quality (default: 80)")
    ap.add_argument("--method", choices=["fit", "cover"], default="fit",
                    help='Resize method: "fit" (no crop) or "cover" (crop)')
    ap.add_argument("--keep-metadata", action="store_true",
                    help="Preserve EXIF metadata (larger files)")
    ap.add_argument("--overwrite", action="store_true",
                    help="Rebuild thumbnails even if up-to-date")
    args = ap.parse_args()

    root = args.root.resolve()
    max_size = (args.max[0], args.max[1])

    if not root.exists() or not root.is_dir():
        raise SystemExit(f"Folder not found: {root}")

    created = skipped = errors = 0

    for src in root.rglob("*"):
        if not is_image(src):
            continue

        # Skip images already inside a thumbnails folder
        if THUMB_DIR_NAME in src.parts:
            continue

        thumb_dir = src.parent / THUMB_DIR_NAME
        thumb_path = (thumb_dir / src.name).with_suffix(".webp")

        try:
            if not args.overwrite and is_up_to_date(src, thumb_path):
                skipped += 1
                continue

            make_thumbnail(
                src=src,
                dst=thumb_path,
                max_size=max_size,
                quality=args.quality,
                method=args.method,
                keep_metadata=args.keep_metadata,
            )
            created += 1

        except Exception as e:
            errors += 1
            print(f"[ERROR] {src}: {e}")

    print("\nDone.")
    print(f"Created: {created}")
    print(f"Skipped: {skipped}")
    print(f"Errors:  {errors}")

    return 0 if errors == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
