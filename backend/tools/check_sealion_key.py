"""Kiểm tra nhanh SEA-LION API: key hợp lệ chưa, model dịch được không.

Gửi đúng MỘT request chat/completions tối thiểu và diễn giải kết quả ra tiếng
Việt, để bạn biết cấu hình NMT_ENGINE=sealion có chạy được hay không TRƯỚC khi
chạy cả pipeline.

Cách dùng (từ backend/):
    python tools/check_sealion_key.py                  # đọc SEALION_API_KEY trong .env
    python tools/check_sealion_key.py sk-XXXX...       # kiểm tra key truyền trực tiếp
    python tools/check_sealion_key.py --model aisingapore/Gemma-SEA-LION-v4-27B-IT
    python tools/check_sealion_key.py --url http://localhost:11434/v1   # bản tự host
"""
from __future__ import annotations

import argparse
import os
import sys

import httpx

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

_DEFAULT_URL = "https://api.sea-lion.ai/v1"
_DEFAULT_MODEL = "aisingapore/Qwen-SEA-LION-v4.5-27B-IT"


def load_from_env(name: str) -> str | None:
    """Đọc một biến từ môi trường, fallback sang .env (đơn giản, không pydantic)."""
    value = os.environ.get(name)
    if value:
        return value
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    try:
        with open(env_path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith(f"{name}=") and "=" in line:
                    return line.split("=", 1)[1].strip() or None
    except OSError:
        pass
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Kiểm tra SEA-LION API.")
    parser.add_argument("key", nargs="?", default=None,
                        help="API key cần kiểm tra (mặc định: đọc SEALION_API_KEY từ .env).")
    parser.add_argument("--model", default=None,
                        help=f"Model để thử (mặc định: SEALION_MODEL hoặc {_DEFAULT_MODEL}).")
    parser.add_argument("--url", default=None,
                        help=f"Base URL (mặc định: SEALION_API_URL hoặc {_DEFAULT_URL}).")
    args = parser.parse_args()

    key = args.key or load_from_env("SEALION_API_KEY")
    model = args.model or load_from_env("SEALION_MODEL") or _DEFAULT_MODEL
    base_url = args.url or load_from_env("SEALION_API_URL") or _DEFAULT_URL
    hosted = "api.sea-lion.ai" in base_url

    if not key and hosted:
        print("❌ Không tìm thấy key. Truyền trực tiếp hoặc điền SEALION_API_KEY trong .env.")
        print("   → Lấy key miễn phí tại https://playground.sea-lion.ai")
        sys.exit(2)

    shown = f"{key[:6]}...  (dài {len(key)} ký tự)" if key else "(không có — server tự host bỏ qua auth)"
    print(f"→ URL:   {base_url}")
    print(f"→ Key:   {shown}")
    print(f"→ Model: {model}\n")

    url = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": "Translate the following Vietnamese text into English. Return only the translation, with no explanations, notes, or quotes."},
            {"role": "user", "content": "Xin chào, rất vui được gặp bạn."},
        ],
        "temperature": 0.0,
    }
    try:
        resp = httpx.post(url, headers={"Authorization": f"Bearer {key or ''}"},
                          json=payload, timeout=60.0)
    except httpx.HTTPError as e:
        print(f"❌ Không gọi được API: {e}")
        sys.exit(1)

    try:
        body = resp.json()
    except ValueError:
        print(f"❌ HTTP {resp.status_code} — body không phải JSON:\n{resp.text[:500]}")
        sys.exit(1)

    if resp.status_code == 200:
        try:
            text = body["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError):
            text = "(không đọc được nội dung nhưng HTTP 200)"
        print(f"✅ DÙNG ĐƯỢC. Dịch thử 'Xin chào...' -> {text!r}")
        print("   → Đặt NMT_ENGINE=sealion trong .env để bật.")
        if hosted:
            print("   ⚠ Free tier ~10 request/phút — họp nói liên tục có thể chạm limit.")
        return

    err = body.get("error", {})
    msg = err.get("message", "") if isinstance(err, dict) else str(err)
    print(f"❌ HTTP {resp.status_code}")
    if resp.status_code == 401:
        print("   → Key sai/thiếu. Kiểm tra lại tại https://playground.sea-lion.ai")
    elif resp.status_code == 429:
        print("   → Chạm rate limit (free tier ~10 req/phút). Đợi chút rồi thử lại.")
    elif resp.status_code == 404:
        print("   → Model không tồn tại trên endpoint này. Xem model id ở")
        print("     https://docs.sea-lion.ai/guides/inferencing/api")
    print(f"\n--- Chi tiết ---\n{msg[:500] or resp.text[:500]}")
    sys.exit(1)


if __name__ == "__main__":
    main()
