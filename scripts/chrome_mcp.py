#!/usr/bin/env python3
"""Local bridge to the real Chrome DevTools MCP, explicitly launched headless.

This is QA tooling only. It never implements or substitutes browser behavior.
Run `server`, then `call TOOL JSON` or `tools` from another terminal.
"""

from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.request import Request, urlopen
import json
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
ADDRESS = "http://127.0.0.1:17771"


def server():
    diagnostic = open("/tmp/8x-chrome-mcp.log", "a")
    process = subprocess.Popen(
        ["rtk", "proxy", "npx", "--yes", "chrome-devtools-mcp@latest", "--headless", "--isolated", "--no-usage-statistics", "--no-performance-crux", f"--workspace={ROOT}", "--workspace=/tmp"],
        cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=diagnostic, text=True, bufsize=1,
    )
    sequence = 0

    def rpc(method, params=None):
        nonlocal sequence
        sequence += 1
        request_id = sequence
        process.stdin.write(json.dumps({"jsonrpc": "2.0", "id": request_id, "method": method, "params": params or {}}) + "\n")
        process.stdin.flush()
        while True:
            line = process.stdout.readline()
            if not line:
                raise RuntimeError("Chrome MCP closed; inspect /tmp/8x-chrome-mcp.log")
            try:
                message = json.loads(line)
            except json.JSONDecodeError:
                continue
            if message.get("id") == request_id:
                if "error" in message:
                    raise RuntimeError(json.dumps(message["error"]))
                return message.get("result")

    rpc("initialize", {"protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": {"name": "8x-phase1-qa", "version": "1.0"}})
    process.stdin.write(json.dumps({"jsonrpc": "2.0", "method": "notifications/initialized"}) + "\n")
    process.stdin.flush()
    catalogue = rpc("tools/list")

    class Handler(BaseHTTPRequestHandler):
        def respond(self, data, status=200):
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            self.respond(catalogue)

        def do_POST(self):
            try:
                payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                self.respond(rpc("tools/call", {"name": payload["name"], "arguments": payload.get("arguments", {})}))
            except Exception as error:
                self.respond({"isError": True, "error": str(error)}, 500)

        def log_message(self, *args):
            pass

    print(json.dumps({"ready": ADDRESS, "tool_count": len(catalogue["tools"]), "browser": "real Chrome DevTools MCP, headless"}), flush=True)
    try:
        HTTPServer(("127.0.0.1", 17771), Handler).serve_forever()
    finally:
        process.terminate()
        diagnostic.close()


def call(name, arguments):
    request = Request(ADDRESS, data=json.dumps({"name": name, "arguments": arguments}).encode(), headers={"Content-Type": "application/json"})
    with urlopen(request, timeout=180) as response:
        return json.load(response)


if __name__ == "__main__":
    if sys.argv[1] == "server":
        server()
    elif sys.argv[1] == "tools":
        with urlopen(ADDRESS, timeout=10) as response:
            catalogue = json.load(response)
        names = set(sys.argv[2:])
        print(json.dumps([tool for tool in catalogue["tools"] if not names or tool["name"] in names]))
    elif sys.argv[1] == "call":
        print(json.dumps(call(sys.argv[2], json.loads(sys.argv[3]))))
