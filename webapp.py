# -*- coding: utf-8 -*-
"""Общая рама страниц приложения: документ, шапка, раскладка «две колонки с ручкой».

Здесь лежит всё, что нужно БОЛЬШЕ ЧЕМ ОДНОЙ странице: страница песни
(songpage.py), страница определения аккорда (findpage.py), главная
(homepage.py). Правило простое — если стиль или скрипт понадобился второй
странице, он переезжает сюда, а не копируется.

Разметка самой схемы сюда не входит: она живёт рядом с её CSS, в push_grid.py
(`render_html` для готовой схемы, `render_card_template` для пустой).
"""
from typing import Optional

from push_grid import PALETTE, grid_css

__all__ = ["esc", "page", "header", "gutter", "base_css", "layout_css", "LAYOUT_JS",
           "CARD_MIN", "CARD_MAX"]


def esc(s) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


# Пол и потолок ширины схемы в колонке со схемами.
# Пол держит схему читаемой: вторая колонка появляется только тогда, когда каждая
# схема останется шире минимума. Замерено на 42 типах x 3 тониках: ниже 315 у
# `Gb b13` подпись упирается в край пэда.
# Потолок нужен не меньше пола: без него одинокая колонка растягивает схему на
# весь сайдбар, схема становится выше — и в экран перестаёт влезать следующий ряд.
# ВАЖНО: потолок нельзя ставить в minmax() — auto-fit посчитает число колонок по
# нему и схлопнет всё в одну колонку. Он вешается на сам элемент.
CARD_MIN = 315
CARD_MAX = 330

_st = PALETTE["states"]

_BASE_CSS = """
*,*::before,*::after{box-sizing:border-box}
:root{--bg:%(bg)s;--panel:#121715;--panel2:#0f1412;--line:#1f2724;--fg:#e9efeb;
  --muted:#8d9a94;--dim:#5f6b66;--tone:%(tone)s;--root:%(root)s;--extra:%(extra)s;
  --gut:clamp(18px,2.2vw,34px);--card-min:%(cardmin)dpx;--card-max:%(cardmax)dpx}
html,body{margin:0;padding:0;height:100%%}
body{background:var(--bg);color:var(--fg);-webkit-font-smoothing:antialiased;
  font:15px/1.55 -apple-system,'SF Pro Text','Helvetica Neue',Segoe UI,Roboto,Arial,sans-serif}
a{color:inherit}

/* --- шапка: одна строка, минимум высоты --- */
.top{background:var(--panel2);border-bottom:1px solid var(--line);
  padding:0 clamp(12px,3vw,36px);flex:0 0 auto}
.topin{max-width:1600px;margin:0 auto;display:flex;flex-wrap:wrap;align-items:center;
  gap:6px 16px;min-height:48px;padding:7px 0}
h1{margin:0;font-size:clamp(15px,1.7vw,19px);letter-spacing:-.015em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:42vw}
h1 small{font-size:.78em;font-weight:400;color:var(--muted);letter-spacing:0;
  margin-left:8px}
.back{color:var(--muted);text-decoration:none;font-size:13px;white-space:nowrap}
.back:hover{color:var(--fg)}
.chips{display:flex;flex-wrap:wrap;gap:3px 12px;color:var(--muted);font-size:12.5px;
  white-space:nowrap}
.chips b{color:var(--fg);font-weight:600}
.ctl{margin-left:auto;display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center}

/* --- органы управления --- */
button,.btn{background:#1b2320;color:var(--fg);border:1px solid var(--line);
  border-radius:8px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer;
  text-decoration:none;display:inline-block;line-height:1.3}
button:hover,.btn:hover{border-color:var(--tone);color:#fff}
button:disabled{opacity:.45;cursor:default;border-color:var(--line);color:var(--muted)}
button.pri{background:var(--tone);color:#04212e;border-color:var(--tone);font-weight:600}
button.pri:hover{color:#04212e;filter:brightness(1.08)}
button.pri:disabled{background:#1b2320;color:var(--muted);filter:none}
input[type=text]{background:#0d1211;color:var(--fg);border:1px solid var(--line);
  border-radius:8px;padding:6px 10px;font:inherit;font-size:13px;min-width:180px}
input[type=text]:focus{outline:none;border-color:var(--tone)}
/* переключатель размера (кегль текста в песне, размер схем в song.py) */
.sizer{display:flex;gap:5px;align-items:center;font-size:12.5px;color:var(--muted)}
.sizer button{border-radius:7px;padding:3px 9px;font-size:12.5px}
.sizer button[aria-pressed=true]{background:var(--tone);color:#04212e;
  border-color:var(--tone);font-weight:600}
.st{font-size:12.5px;color:var(--root);opacity:0;transition:opacity .25s}
.st.on{opacity:1}
.st.err{color:var(--extra)}

/* --- сетка из схем: и в сайдбаре песни, и в подборе --- */
.cards{display:grid;gap:8px;align-items:start;justify-items:start;
  grid-template-columns:repeat(auto-fit,minmax(min(100%%,var(--card-min)),1fr))}
.cards > .pg{width:100%%;max-width:var(--card-max)}
"""


def base_css() -> str:
    return _BASE_CSS % {"bg": PALETTE["background"],
                        "tone": _st["chord"]["stops"][1],
                        "root": _st["chord_root"]["stops"][1],
                        "extra": _st["extra"]["stops"][1],
                        "cardmin": CARD_MIN, "cardmax": CARD_MAX}


# --------------------------------------------- две колонки с ручкой между ----

_LAYOUT_CSS = """
/* Страница НЕ скроллится целиком: шапка стоит намертво, а две колонки —
   независимые области со своим скроллом. Раньше сайдбар был липким внутри
   общего скролла, и схемы не долистывались до конца, пока страница не уедет
   вверх вместе с шапкой. Слово-сторож в тестах — «sticky», поэтому в CSS его
   быть не должно даже в комментарии. */
body{height:100vh;height:100dvh;display:flex;flex-direction:column;overflow:hidden}

/* колонки 50/50 по умолчанию, ручка между ними тянется мышкой и стрелками */
.layout{flex:1 1 auto;min-height:0;width:100%;max-width:1600px;margin:0 auto;
  display:grid;gap:0;--split:50%;
  grid-template-columns:minmax(0,var(--split)) var(--gut) minmax(0,1fr)}
.gutter{position:relative;cursor:col-resize;touch-action:none;outline:none;
  display:flex;align-items:center;justify-content:center}
.gutter::before{content:"";position:absolute;left:50%;top:0;bottom:0;width:1px;
  margin-left:-.5px;background:var(--line)}
.gutter b{position:relative;display:block;width:5px;height:52px;
  border-radius:4px;background:#26312d;transition:background .15s}
.gutter:hover b,.gutter:focus-visible b,.gutter.drag b{background:var(--tone)}
.gutter:focus-visible::before{background:var(--tone)}
body.dragging{user-select:none;cursor:col-resize}

/* обе колонки скроллятся сами по себе; паддинги ставит уже страница */
.pane{overflow-y:auto;overflow-x:hidden;min-width:0;min-height:0;
  overscroll-behavior:contain;scrollbar-width:thin;
  scrollbar-color:#2b3733 transparent}
.pane::-webkit-scrollbar{width:8px}
.pane::-webkit-scrollbar-thumb{background:#2b3733;border-radius:8px}

@media (max-width:900px){
  /* схемы наверх узкой лентой, вторая колонка под ними — обе со своим скроллом */
  .layout{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr)}
  .gutter{display:none}
  .side{order:-1;overflow:visible;padding:10px 0 0;
    border-bottom:1px solid var(--line)}
  .cards{display:flex;flex-direction:row;overflow-x:auto;scroll-snap-type:x mandatory;
    padding:0 clamp(12px,3vw,36px) 10px;gap:10px;
    -webkit-overflow-scrolling:touch}
  .cards > .pg{flex:0 0 min(88vw,var(--card-min));scroll-snap-align:start}
}
@media print{
  body{background:#fff;color:#000;height:auto;display:block;overflow:visible}
  .top,.gutter{display:none}
  .layout{display:block;max-width:none}
  .pane{overflow:visible;padding:0}
  .cards{display:grid;grid-template-columns:repeat(2,1fr)}
  .cards > .pg{break-inside:avoid}
}
"""


def layout_css() -> str:
    return _LAYOUT_CSS


LAYOUT_JS = """
// Ручка между колонками: тянем мышкой/пальцем, стрелками, двойной клик — 50/50.
(function(){
  var lay=document.querySelector('.layout'), gut=document.getElementById('gutter');
  if(!lay||!gut) return;
  var left=lay.firstElementChild;
  // левая колонка ужимается до 300px, правая — не уже одной карточки схемы:
  // иначе подписи на пэдах становится не разобрать
  var MIN=300;
  var MINR=parseInt(getComputedStyle(lay).getPropertyValue('--card-min'),10)+26||406;
  function widthNow(){return left.getBoundingClientRect().width;}
  function setSplit(px){
    var w=lay.getBoundingClientRect().width, g=gut.getBoundingClientRect().width;
    px=Math.max(MIN,Math.min(Math.max(MIN,w-g-MINR),px));
    lay.style.setProperty('--split',(px/w*100).toFixed(2)+'%');
    gut.setAttribute('aria-valuenow',Math.round(px/w*100));
  }
  var drag=false;
  gut.addEventListener('pointerdown',function(e){
    if(window.innerWidth<=900) return;
    drag=true; gut.setPointerCapture(e.pointerId);
    gut.classList.add('drag'); document.body.classList.add('dragging'); e.preventDefault();
  });
  gut.addEventListener('pointermove',function(e){
    if(!drag) return;
    setSplit(e.clientX-lay.getBoundingClientRect().left);
  });
  function stop(e){
    if(!drag) return;
    drag=false; gut.classList.remove('drag'); document.body.classList.remove('dragging');
    if(e&&e.pointerId!==undefined&&gut.hasPointerCapture(e.pointerId))
      gut.releasePointerCapture(e.pointerId);
  }
  gut.addEventListener('pointerup',stop);
  gut.addEventListener('pointercancel',stop);
  gut.addEventListener('dblclick',function(){lay.style.setProperty('--split','50%');});
  gut.addEventListener('keydown',function(e){
    var step=e.shiftKey?80:24;
    if(e.key==='ArrowLeft'){setSplit(widthNow()-step); e.preventDefault();}
    else if(e.key==='ArrowRight'){setSplit(widthNow()+step); e.preventDefault();}
    else if(e.key==='Home'||e.key==='Enter'){lay.style.setProperty('--split','50%'); e.preventDefault();}
  });
})();
"""


def gutter() -> str:
    return ('<div class="gutter" id="gutter" tabindex="0" role="separator" '
            'aria-orientation="vertical" aria-label="ширина колонок" aria-valuenow="50" '
            'title="потяни, чтобы поменять ширину колонок · двойной клик — поровну">'
            "<b></b></div>")


# ------------------------------------------------------------------ шапка ----

def header(title: str, subtitle: str = "", chips: str = "", ctl: str = "",
           back: Optional[str] = "/") -> str:
    """Шапка страницы. back — куда ведёт «главная»; None убирает ссылку.

    Страницы песен лежат в songs/<slug>/ и открываются и через сервер, и файлом,
    поэтому ссылка туда относительная («../../»), а не «/».
    """
    return ('<header class="top"><div class="topin">%s<h1>%s%s</h1>%s%s'
            "</div></header>"
            % (('<a class="back" href="%s">&larr; главная</a>' % esc(back)) if back else "",
               esc(title),
               ('<small>%s</small>' % esc(subtitle)) if subtitle else "",
               ('<div class="chips">%s</div>' % chips) if chips else "",
               ('<div class="ctl">%s</div>' % ctl) if ctl else ""))


def page(title: str, body: str, css: str = "", js: str = "",
         with_grid: bool = False, head: str = "") -> str:
    """Документ целиком. with_grid подключает CSS схемы (grid_css)."""
    return ("<!doctype html>\n<html lang=\"ru\">\n<head>\n<meta charset=\"utf-8\">\n"
            "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">\n"
            "<title>%s</title>\n<style>%s</style>\n%s</head>\n<body>\n%s\n"
            "<script>%s</script>\n</body>\n</html>\n"
            % (esc(title), base_css() + (grid_css() if with_grid else "") + css,
               head, body, js))
