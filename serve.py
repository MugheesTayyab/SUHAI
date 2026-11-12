"""Start the Suhai web app: python serve.py

Options:
  --port 8000      choose a port
  --no-browser     do not open a browser tab
  --host 0.0.0.0   let other devices on the same network open it
"""
from __future__ import annotations

import argparse
import threading
import webbrowser

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="Suhai web app")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    url = f"http://{'127.0.0.1' if args.host == '0.0.0.0' else args.host}:{args.port}"
    print(f"\n  Suhai is starting\n  Story         {url}\n"
          f"  Control room  {url}/app\n  API docs      {url}/docs\n")
    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    uvicorn.run("server.app:app", host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
