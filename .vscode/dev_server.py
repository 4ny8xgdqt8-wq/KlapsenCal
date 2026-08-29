#!/usr/bin/env python3
import os
import sys
import time
import threading
import webbrowser
from http.server import HTTPServer, SimpleHTTPRequestHandler

PORT = 8080
WATCH_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
clients = []
clients_lock = threading.Lock()

def get_latest_mtime():
    latest = 0
    for root, dirs, files in os.walk(WATCH_DIR):
        if '.git' in dirs:
            dirs.remove('.git')
        if '.vscode' in dirs:
            dirs.remove('.vscode')
        for f in files:
            if f.endswith(('.html', '.css', '.js', '.json', '.svg', '.png', '.webp')):
                try:
                    p = os.path.join(root, f)
                    m = os.path.getmtime(p)
                    if m > latest:
                        latest = m
                except OSError:
                    pass
    return latest

def file_watcher():
    last_mtime = get_latest_mtime()
    while True:
        time.sleep(0.3)
        current_mtime = get_latest_mtime()
        if current_mtime > last_mtime:
            last_mtime = current_mtime
            with clients_lock:
                to_remove = []
                for client in clients:
                    try:
                        client.wfile.write(b"data: reload\n\n")
                        client.wfile.flush()
                    except Exception:
                        to_remove.append(client)
                for c in to_remove:
                    if c in clients:
                        clients.remove(c)

class LiveReloadHandler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/__live_reload__":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with clients_lock:
                clients.append(self)
            try:
                while True:
                    time.sleep(1)
            except Exception:
                with clients_lock:
                    if self in clients:
                        clients.remove(self)
            return

        clean_path = self.path.split('?')[0].split('#')[0].lstrip('/')
        if clean_path in ('', 'index.html'):
            file_path = os.path.join(WATCH_DIR, 'index.html')
            if os.path.exists(file_path):
                with open(file_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                
                live_script = """
                <!-- Live Reload Injected -->
                <script>
                (function() {
                    let es = new EventSource('/__live_reload__');
                    es.onmessage = function(e) {
                        if (e.data === 'reload') {
                            console.log('[LiveReload] File changed, reloading...');
                            window.location.reload();
                        }
                    };
                    es.onerror = function() {
                        setTimeout(() => { es = new EventSource('/__live_reload__'); }, 2000);
                    };
                })();
                </script>
                """
                content = content.replace("</body>", f"{live_script}\n</body>")
                encoded = content.encode('utf-8')
                
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(encoded)))
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.end_headers()
                self.wfile.write(encoded)
                return

        return super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def translate_path(self, path):
        path = path.split('?', 1)[0].split('#', 1)[0]
        clean = path.lstrip('/')
        if clean in ('', '/'):
            clean = 'index.html'
        return os.path.join(WATCH_DIR, clean)

if __name__ == "__main__":
    os.chdir(WATCH_DIR)
    t = threading.Thread(target=file_watcher, daemon=True)
    t.start()
    
    server = HTTPServer(("0.0.0.0", PORT), LiveReloadHandler)
    print(f"🔥 Klapsentouren Live-Server läuft unter: http://localhost:{PORT}")
    print("👀 Automatischer Live-Reload bei jeder Dateiänderung ist aktiv!")
    
    try:
        webbrowser.open(f"http://localhost:{PORT}")
    except Exception:
        pass

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer beendet.")
