#!/usr/bin/env python3
"""Fetch public source photographs and OFL fonts; never uses credentials."""

from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
import json
import re
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PHOTOS = {
    "desert": "photo-1542401886-65d6c61db217",
    "fashion": "photo-1515886657613-9f3515b0c78f",
    "perfume": "photo-1541643600914-78b084683601",
    "architecture": "photo-1511818966892-d7d671e672a2",
    "automotive": "photo-1492144534655-ae79c964c9d7",
    "pigment": "photo-1541701494587-cb58502866ab",
    "portrait": "photo-1524504388940-b1c1722653e1",
    "forest": "photo-1448375240586-882707db888b",
}
FONT_CSS = "https://fonts.googleapis.com/css2?family=Manrope:wght@400..600&family=Space+Grotesk:wght@500..600&display=swap"
AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"


def fetch(url):
    with urlopen(Request(url, headers={"User-Agent": AGENT}), timeout=60) as response:
        return response.read()


def photo(task):
    name, identifier = task
    width = 1800 if name == "desert" else 900
    url = f"https://images.unsplash.com/{identifier}?auto=format&fit=crop&w={width}&q=85&fm=webp"
    path = ROOT / "public/images" / f"{name}.webp"
    data = path.read_bytes() if path.exists() else fetch(url)
    if data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        raise ValueError(f"Expected a real WebP image: {name}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return {"file": str(path.relative_to(ROOT)), "source": url, "credit": "Unsplash", "license": "https://unsplash.com/license", "sha256": sha256(data).hexdigest(), "bytes": len(data)}


def main():
    with ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(photo, PHOTOS.items()))
    css = fetch(FONT_CSS).decode()
    Path("/tmp/8x-font-source.css").write_text(css)
    for block in re.findall(r"/\* latin \*/\s*@font-face\s*\{([^}]+)\}", css):
        family = re.search(r"font-family: '([^']+)'", block).group(1)
        url = re.search(r"src: url\(([^)]+)\)", block).group(1)
        slug = "manrope" if family == "Manrope" else "space-grotesk"
        path = ROOT / "public/fonts" / f"{slug}-latin.woff2"
        data = fetch(url)
        if data[:4] != b"wOF2":
            raise ValueError(f"Expected WOFF2 font: {family}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        license_url = f"https://raw.githubusercontent.com/google/fonts/main/ofl/{slug.replace('-', '')}/OFL.txt"
        (path.parent / f"{slug}-OFL.txt").write_bytes(fetch(license_url))
        sources.append({"file": str(path.relative_to(ROOT)), "source": url, "family": family, "license": license_url, "sha256": sha256(data).hexdigest(), "bytes": len(data)})
    if not (ROOT / "public/fonts/manrope-latin.woff2").exists() or not (ROOT / "public/fonts/space-grotesk-latin.woff2").exists():
        raise ValueError("Both required Latin font families must be downloaded")
    (ROOT / "docs/asset-manifest.json").write_text(json.dumps(sources, indent=2) + "\n")
    print(json.dumps({"downloaded_assets": len(sources), "total_bytes": sum(s["bytes"] for s in sources)}))


if __name__ == "__main__":
    main()
