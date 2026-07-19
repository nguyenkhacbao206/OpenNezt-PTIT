"""Tải FLORES-200 (vie + eng) thành bộ test JSON chuẩn cho measure_accuracy.py.

FLORES-200 là bộ dịch chuẩn của Meta (bản dịch người, 200 ngôn ngữ), dùng để so
sánh MT CÔNG BẰNG và CITABLE. Lấy thẳng từ tarball CÔNG KHAI của NLLB (không cần
đăng nhập HuggingFace, chỉ dùng thư viện chuẩn).

Cách dùng (từ backend/, đã bật venv):
    python tools/make_flores_testset.py                          # 50 cặp, split devtest
    python tools/make_flores_testset.py --limit 30 --split dev --out data/flores_vi_en.json

Rồi đo (nhớ --limit nhỏ nếu cloud, vì mỗi cặp = 2 câu = tốn quota):
    python tools/measure_accuracy.py --testset data/flores_vi_en.json --mode offline
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tarfile
import urllib.request

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

URL = "https://dl.fbaipublicfiles.com/nllb/flores200_dataset.tar.gz"


def get_lines(tar_path: str, split: str, lang: str) -> list[str]:
    """Đọc file 1-câu-mỗi-dòng của một ngôn ngữ trong tarball FLORES-200."""
    with tarfile.open(tar_path, "r:gz") as t:
        for prefix in ("./", ""):  # tarball dùng tiền tố "./"
            try:
                f = t.extractfile(f"{prefix}flores200_dataset/{split}/{lang}.{split}")
            except KeyError:
                f = None
            if f is not None:
                return [ln.decode("utf-8").rstrip("\n") for ln in f.readlines()]
    raise RuntimeError(f"Không tìm thấy {lang}.{split} trong tarball.")


def main() -> None:
    p = argparse.ArgumentParser(description="Tạo bộ test FLORES-200 vi/en (tarball công khai).")
    p.add_argument("--split", default="devtest", choices=["dev", "devtest"], help="dev (997) | devtest (1012).")
    p.add_argument("--limit", type=int, default=50, help="Số CẶP câu (mỗi cặp -> 2 câu 2 chiều).")
    p.add_argument("--out", default="data/flores_vi_en.json", help="File JSON đầu ra.")
    p.add_argument("--cache", default="data/.flores_cache", help="Thư mục cache tarball.")
    a = p.parse_args()

    os.makedirs(a.cache, exist_ok=True)
    tar_path = os.path.join(a.cache, "flores200_dataset.tar.gz")
    if not os.path.exists(tar_path):
        print(f"Tải FLORES-200 (~25MB) từ {URL} ...")
        urllib.request.urlretrieve(URL, tar_path)
        print("  xong.")

    vi = get_lines(tar_path, a.split, "vie_Latn")
    en = get_lines(tar_path, a.split, "eng_Latn")
    pairs = list(zip(vi, en))[: a.limit]

    out = []
    for v, e in pairs:
        out.append({"src": v, "ref": e, "srcLang": "vi", "tgtLang": "en"})
        out.append({"src": e, "ref": v, "srcLang": "en", "tgtLang": "vi"})
    os.makedirs(os.path.dirname(a.out) or ".", exist_ok=True)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(f"✓ {a.out}: {len(out)} câu ({len(pairs)} cặp × 2 chiều), split={a.split}")


if __name__ == "__main__":
    main()
