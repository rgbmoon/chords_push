# -*- coding: utf-8 -*-
"""Локальный сервер: главная, страница определения аккорда, подборы.

    python3 serve.py            # или двойной клик по start.command

Слушает только 127.0.0.1 — наружу ничего не торчит. Ставить нечего: всё из
стандартной библиотеки.

ПОЧЕМУ ПИТОН, А НЕ НОДА: сервер делает `import push_grid` и получает таблицу
42 типов, солвер и правильную запись нот даром. На ноде всю музыкальную теорию
пришлось бы держать второй копией — в проекте зафиксировано обратное правило
(имена нот и ступени не дублируются, у них одно место).

Данные подборов лежат в picks/<slug>.json, накликанные аппликатуры песни —
в songs/<slug>/state.json. Обычные файлы в папке проекта: их видно в Finder
и не жалко открыть руками.
"""
import json
import mimetypes
import os
import re
import sys
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import List, Optional
from urllib.parse import parse_qs, unquote, urlparse

import identify as ident
from song import slugify
from findpage import render_find
from homepage import render_home

HERE = os.path.dirname(os.path.abspath(__file__))
SONGS_DIR = os.path.join(HERE, "songs")
PICKS_DIR = os.path.join(HERE, "picks")
MAX_BODY = 1 << 20          # 1 МБ хватает на любой подбор


# --------------------------------------------------------------- данные ----

def _read(path: str) -> str:
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read()


def song_meta(folder: str) -> dict:
    """Название и артист песни: сначала из source.txt, потом из <title>."""
    slug = os.path.basename(folder)
    title, artist = "", ""
    src = os.path.join(folder, "source.txt")
    if os.path.exists(src):
        for line in _read(src).splitlines():
            m = re.match(r"^@\s*(\w+)\s*:\s*(.+?)\s*$", line)
            if not m:
                continue
            if m.group(1).lower() == "title":
                title = m.group(2)
            elif m.group(1).lower() == "artist":
                artist = m.group(2)
    html = ""
    index = os.path.join(folder, "index.html")
    if os.path.exists(index):
        html = _read(index)
    if not title:
        m = re.search(r"<title>(.*?)</title>", html, re.S)
        # в <title> у страниц хвост вида «— схемы для Push», на карточке он лишний
        title = (m.group(1).strip().split(" — ")[0] if m else slug)
    return {"slug": slug, "title": title, "artist": artist,
            "chords": html.count('class="pg"'),
            "updated": os.path.getmtime(index) if os.path.exists(index) else 0}


def list_songs(root: Optional[str] = None) -> List[dict]:
    root = root or SONGS_DIR
    if not os.path.isdir(root):
        return []
    out = []
    for name in sorted(os.listdir(root)):
        folder = os.path.join(root, name)
        if os.path.isfile(os.path.join(folder, "index.html")):
            out.append(song_meta(folder))
    out.sort(key=lambda s: -s["updated"])
    return out


def list_picks(root: Optional[str] = None) -> List[dict]:
    root = root or PICKS_DIR
    if not os.path.isdir(root):
        return []
    out = []
    for name in sorted(os.listdir(root)):
        if not name.endswith(".json"):
            continue
        try:
            d = json.loads(_read(os.path.join(root, name)))
        except Exception:
            continue
        chords = d.get("chords") or []
        out.append({"slug": d.get("slug") or name[:-5],
                    "name": d.get("name") or name[:-5],
                    "count": len(chords),
                    # на карточке главной видно саму цепочку, а не только счёт —
                    # по названию «проба 3» через неделю не вспомнить, что внутри
                    "syms": [str(c.get("sym") or "?") for c in chords[:9]],
                    "updated": d.get("updated")
                    or os.path.getmtime(os.path.join(root, name))})
    out.sort(key=lambda p: -p["updated"])
    return out


def load_pick(slug: str, root: Optional[str] = None) -> Optional[dict]:
    root = root or PICKS_DIR
    path = os.path.join(root, slugify(slug) + ".json")
    if not os.path.exists(path):
        return None
    try:
        d = json.loads(_read(path))
    except Exception:
        return None
    # ступени и запись нот в файле не лежат — пересчитываем при открытии
    d["chords"] = ident.enrich(d.get("chords"))
    return d


# --- накликанные аппликатуры песни ------------------------------------------
# Лежат ОТДЕЛЬНЫМ файлом рядом с песней, а не внутри index.html: страницу
# перегенерирует songpage.py при любой правке источника или рамы, и правки
# должны это пережить. Ключ — символ аккорда: в сайдбаре одна схема на
# уникальный аккорд, так что символа хватает.
STATE_FILE = "state.json"
_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{0,79}$")


def _song_folder(slug: str, root: Optional[str] = None) -> Optional[str]:
    """Папка песни по слагу. Слаг проверяем регуляркой, а не склейкой путей:
    так «..» и абсолютные пути отсекаются до всякой работы с файловой системой."""
    if not _SLUG_RE.match(slug or ""):
        return None
    folder = os.path.join(root or SONGS_DIR, slug)
    return folder if os.path.isdir(folder) else None


def _pads(raw) -> List[int]:
    out = []
    for v in (raw or [])[:64]:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            continue
        i = int(v)
        if 0 <= i < 64 and i not in out:
            out.append(i)
    return sorted(out)


def _clean_state(raw) -> dict:
    """Из тела запроса берём только пэды — всё остальное схема пересчитает сама."""
    out = {}
    if not isinstance(raw, dict):
        return out
    for sym, st in list(raw.items())[:256]:
        if not isinstance(sym, str) or not isinstance(st, dict):
            continue
        pads = _pads(st.get("pads"))
        if pads:
            out[sym[:40]] = {"pads": pads, "extra": _pads(st.get("extra"))}
    return out


def song_state(slug: str, root: Optional[str] = None) -> dict:
    folder = _song_folder(slug, root)
    if folder is None:
        return {"chords": {}}
    path = os.path.join(folder, STATE_FILE)
    if not os.path.exists(path):
        return {"chords": {}}
    try:
        d = json.loads(_read(path))
    except Exception:
        return {"chords": {}}
    return {"chords": _clean_state(d.get("chords"))}


def save_song_state(slug: str, payload: dict, root: Optional[str] = None) -> dict:
    folder = _song_folder(slug, root)
    if folder is None:
        raise ValueError("нет такой песни")
    chords = _clean_state((payload or {}).get("chords"))
    data = {"slug": slug, "chords": chords, "updated": time.time()}
    with open(os.path.join(folder, STATE_FILE), "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    return {"chords": chords}


def _clean_chords(raw) -> List[dict]:
    """Сохраняем ПЭДЫ, а не только символ: иначе теряется аппликатура."""
    out = []
    for it in (raw or [])[:512]:
        if not isinstance(it, dict):
            continue
        pads = sorted({int(p) for p in (it.get("pads") or [])
                       if isinstance(p, (int, float)) and 0 <= int(p) < 64})
        if not pads:
            continue
        rp = it.get("root_pc")
        # какой пэд был рутом, тоже храним: подбор открывается с ним же, иначе
        # при загрузке карточки рут пересчитался бы по-своему
        root = it.get("root")
        root = int(root) if isinstance(root, (int, float)) and int(root) in pads else pads[0]
        out.append({"sym": str(it.get("sym") or "?")[:24],
                    "pads": pads,
                    "root": root,
                    "root_pc": int(rp) % 12 if isinstance(rp, (int, float)) else None,
                    "kind": str(it.get("kind") or "")[:24]})
    return out


def save_pick(payload: dict, root: Optional[str] = None) -> dict:
    root = root or PICKS_DIR
    name = str(payload.get("name") or "").strip()[:80]
    if not name:
        raise ValueError("нужно название")
    chords = _clean_chords(payload.get("chords"))
    if not chords:
        raise ValueError("подбор пуст")

    os.makedirs(root, exist_ok=True)
    slug = slugify(payload.get("slug") or "") or ""
    if not slug or not os.path.exists(os.path.join(root, slug + ".json")):
        # новое имя: занятый слаг не перетираем, а разводим номером
        slug = slugify(name)
        base, n = slug, 2
        while os.path.exists(os.path.join(root, slug + ".json")):
            slug = "%s-%d" % (base, n)
            n += 1

    path = os.path.join(root, slug + ".json")
    old = {}
    if os.path.exists(path):
        try:
            old = json.loads(_read(path))
        except Exception:
            old = {}
    now = time.time()
    data = {"name": name, "slug": slug, "chords": chords,
            "created": old.get("created", now), "updated": now}
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
    return data


def delete_pick(slug: str, root: Optional[str] = None) -> bool:
    root = root or PICKS_DIR
    path = os.path.join(root, slugify(slug) + ".json")
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


# --------------------------------------------------------------- сервер ----

def _safe_join(base: str, rel: str) -> Optional[str]:
    p = os.path.normpath(os.path.join(base, unquote(rel).lstrip("/")))
    if p != base and not p.startswith(base + os.sep):
        return None
    return p


class Handler(BaseHTTPRequestHandler):
    server_version = "chords_push"
    protocol_version = "HTTP/1.1"

    # --- ответы ---------------------------------------------------------
    def _send(self, body: bytes, ctype: str, code: int = 200):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def html(self, text: str, code: int = 200):
        self._send(text.encode("utf-8"), "text/html; charset=utf-8", code)

    def json(self, obj, code: int = 200):
        self._send(json.dumps(obj, ensure_ascii=False).encode("utf-8"),
                   "application/json; charset=utf-8", code)

    def body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return {}

    # --- маршруты -------------------------------------------------------
    def do_GET(self):
        u = urlparse(self.path)
        path, q = u.path, parse_qs(u.query)

        if path == "/":
            return self.html(render_home(list_songs(), list_picks()))

        if path == "/find":
            slug = (q.get("pick") or [""])[0]
            pick = load_pick(slug) if slug else None
            return self.html(render_find(pick))

        if path == "/api/picks":
            return self.json({"picks": list_picks()})

        m = re.match(r"^/api/song/([^/]+)/state$", path)
        if m:
            return self.json(song_state(unquote(m.group(1))))

        if path.startswith("/songs/"):
            rel = path[len("/songs/"):]
            full = _safe_join(SONGS_DIR, rel)
            if full is None:
                return self.html("<h1>404</h1>", 404)
            if os.path.isdir(full):
                full = os.path.join(full, "index.html")
            if not os.path.isfile(full):
                return self.html("<h1>404</h1>", 404)
            ctype = mimetypes.guess_type(full)[0] or "application/octet-stream"
            if ctype.startswith("text/") or ctype.endswith("+xml"):
                ctype += "; charset=utf-8"
            with open(full, "rb") as fh:
                return self._send(fh.read(), ctype)

        if path == "/favicon.ico":
            return self._send(b"", "image/x-icon", 204)

        return self.html("<h1>404</h1><p><a href=\"/\">на главную</a></p>", 404)

    do_HEAD = do_GET

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/identify":
            d = self.body()
            midis = d.get("midi") or ident.pads_to_midi(d.get("pads") or [])
            rp = d.get("root_pc")            # рут называет страница, а не сервер
            rp = int(rp) % 12 if isinstance(rp, (int, float)) else None
            return self.json(ident.identify(midis, rp))

        if path == "/api/picks":
            try:
                return self.json(save_pick(self.body()))
            except ValueError as e:
                return self.json({"error": str(e)}, 400)
            except OSError as e:
                return self.json({"error": "не записалось: %s" % e}, 500)

        m = re.match(r"^/api/song/([^/]+)/state$", path)
        if m:
            try:
                return self.json(save_song_state(unquote(m.group(1)), self.body()))
            except ValueError as e:
                return self.json({"error": str(e)}, 400)
            except OSError as e:
                return self.json({"error": "не записалось: %s" % e}, 500)

        m = re.match(r"^/api/picks/([^/]+)/delete$", path)
        if m:
            try:
                ok = delete_pick(m.group(1))
            except OSError as e:
                return self.json({"error": str(e)}, 500)
            return self.json({"deleted": ok})

        return self.json({"error": "нет такого маршрута"}, 404)

    def log_message(self, fmt, *args):
        sys.stderr.write("  %s %s\n" % (self.command or "-", self.path))


def _bind(port: int, tries: int = 20) -> ThreadingHTTPServer:
    for i in range(tries):
        try:
            return ThreadingHTTPServer(("127.0.0.1", port + i), Handler)
        except OSError as e:
            if e.errno not in (48, 98):        # EADDRINUSE на macOS / Linux
                raise
    raise SystemExit("не нашлось свободного порта начиная с %d" % port)


def run(port: int = 8765, open_browser: bool = True):
    httpd = _bind(port)
    url = "http://127.0.0.1:%d/" % httpd.server_address[1]
    print("Аккорды на Push: %s" % url)
    print("Остановить — Ctrl+C в этом окне.")
    if open_browser:
        threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nостановлено")
    finally:
        httpd.server_close()


def _main(argv=None):
    import argparse
    p = argparse.ArgumentParser(description="локальный сервер chords_push")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--no-open", action="store_true", help="не открывать браузер")
    a = p.parse_args(argv)
    run(a.port, not a.no_open)


if __name__ == "__main__":
    _main()
