# -*- coding: utf-8 -*-
"""Главная: подборы аккордов и разобранные песни.

Список приходит готовым из serve.py — эта страница только рисует.
"""
import time
from typing import Sequence

from song import plural
from webapp import esc, header, page

_CSS = """
.wrap{max-width:1100px;margin:0 auto;padding:24px clamp(12px,3vw,36px) 70px}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
  margin:28px 0 12px;font-weight:600;display:flex;align-items:baseline;gap:9px}
h2 span{text-transform:none;letter-spacing:0;color:var(--dim);font-weight:400}
.tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(235px,1fr));gap:11px}
.card{position:relative;display:block;background:var(--panel);border:1px solid var(--line);
  border-radius:12px;padding:13px 15px;text-decoration:none;color:inherit}
.card:hover{border-color:var(--tone)}
.card b{display:block;font-size:15px;line-height:1.3;margin-bottom:4px;
  letter-spacing:-.01em;padding-right:14px}
.card i{display:block;font-style:normal;color:var(--muted);font-size:12.5px;
  line-height:1.45}
.card em{font-style:normal;color:var(--dim);font-size:12px;display:block;margin-top:6px}
.card .x{position:absolute;top:6px;right:6px;background:none;border:0;color:#39443f;
  font-size:15px;line-height:1;padding:3px 6px;cursor:pointer;border-radius:6px}
.card .x:hover{color:var(--extra);background:#1b2320}
.empty{color:var(--dim);font-size:13.5px;border:1px dashed var(--line);
  border-radius:12px;padding:16px 18px}
.new{background:transparent;border:1px dashed #2a3531;display:flex;align-items:center;
  justify-content:center;color:var(--muted);font-size:13.5px;min-height:74px}
.new:hover{border-color:var(--tone);color:var(--fg)}
"""

_JS = """
document.querySelectorAll('.card .x').forEach(function(b){
  b.addEventListener('click',function(e){
    e.preventDefault(); e.stopPropagation();
    if(!confirm('Удалить подбор \\u00ab'+b.dataset.name+'\\u00bb?')) return;
    fetch('/api/picks/'+encodeURIComponent(b.dataset.slug)+'/delete',{method:'POST'})
      .then(function(){location.reload();});
  });
});
"""


def ago(ts: float) -> str:
    d = max(0, time.time() - ts)
    if d < 3600:
        n = int(d // 60)
        return "только что" if n < 1 else "%d %s назад" % (
            n, plural(n, "минуту", "минуты", "минут"))
    if d < 86400:
        n = int(d // 3600)
        return "%d %s назад" % (n, plural(n, "час", "часа", "часов"))
    n = int(d // 86400)
    if n < 30:
        return "%d %s назад" % (n, plural(n, "день", "дня", "дней"))
    return time.strftime("%d.%m.%Y", time.localtime(ts))


def render_home(songs: Sequence[dict], picks: Sequence[dict]) -> str:
    p = [header("Аккорды на Push", back=None,
                ctl='<a class="btn" href="/find">+ новый подбор</a>'),
         '<div class="wrap">']

    p.append('<h2>Подборы <span>%d</span></h2>' % len(picks))
    if picks:
        p.append('<div class="tiles">')
        for it in picks:
            n = it["count"]
            syms = list(it.get("syms") or [])
            chain = " · ".join(syms) + (" …" if n > len(syms) else "")
            p.append('<a class="card" href="/find?pick=%s"><b>%s</b>'
                     '<i>%s</i><em>%d %s · %s</em>'
                     '<button class="x" data-slug="%s" data-name="%s" title="удалить">'
                     "&times;</button></a>"
                     % (esc(it["slug"]), esc(it["name"]), esc(chain), n,
                        plural(n, "аккорд", "аккорда", "аккордов"),
                        esc(ago(it["updated"])), esc(it["slug"]), esc(it["name"])))
        p.append('<a class="card new" href="/find">+ новый подбор</a></div>')
    else:
        p.append('<div class="empty">Пока пусто. '
                 '<a href="/find">Открыть страницу определения</a> — накликать аккорд '
                 'на сетке, добавить в подбор и сохранить под именем.</div>')

    p.append('<h2>Песни <span>%d</span></h2>' % len(songs))
    if songs:
        p.append('<div class="tiles">')
        for it in songs:
            sub = it.get("artist") or ""
            n = it.get("chords") or 0
            if n:
                sub = (sub + " · " if sub else "") + "%d %s" % (
                    n, plural(n, "схема", "схемы", "схем"))
            p.append('<a class="card" href="/songs/%s/"><b>%s</b><i>%s</i><em>%s</em></a>'
                     % (esc(it["slug"]), esc(it["title"]), esc(sub), esc(ago(it["updated"]))))
        p.append("</div>")
    else:
        p.append('<div class="empty">В папке songs/ пока нет страниц. '
                 "Их делает songpage.py из текста песни с аккордами.</div>")

    p.append("</div>")
    return page("Аккорды на Push", "".join(p), _CSS, _JS)
