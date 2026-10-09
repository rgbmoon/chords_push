# -*- coding: utf-8 -*-
"""
song.py — из последовательности аккордов делает страницу со схемами для Push.

Одна схема = один аккорд. Страница резиновая: карточки перестраиваются под
ширину окна, SVG внутри тянется, ничего не уезжает за экран.

    python3 song.py "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am" --name "Название"
    python3 song.py --file progression.txt --name "Песня" --svg

Результат: songs/<slug>/index.html
"""

from __future__ import annotations

import argparse
import datetime
import os
import re
import sys
from typing import List, Optional, Sequence

from webapp import esc as _esc, header, page
from push_grid import (COMPACT, GRID_JS, ChordSpec, Grid, PALETTE,
                       parse_progression, render_html, render_svg, span_cols,
                       voice_progression)

SONGS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "songs")


def slugify(name: str) -> str:
    translit = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
        "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
        "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
        "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "",
        "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
    }
    s = "".join(translit.get(ch, ch) for ch in name.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "song"


def plural(n: int, one: str, few: str, many: str) -> str:
    """Русское склонение: 1 нота, 2-4 ноты, 5+ нот."""
    if n % 10 == 1 and n % 100 != 11:
        return one
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return few
    return many


_CSS = """
.wrap{max-width:1700px;margin:0 auto;padding:20px clamp(12px,3vw,36px) 72px}
.seq{margin:0 0 16px;color:var(--muted);font-size:clamp(13px,1.8vw,16px);
  font-variant-numeric:tabular-nums;word-break:break-word}
.seq b{color:var(--fg);font-weight:600}
.bar{display:flex;flex-wrap:wrap;gap:10px 22px;align-items:center;
  margin:0 0 18px;padding:12px 14px;background:var(--panel);
  border:1px solid var(--line);border-radius:12px}
.legend{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:13px;color:var(--muted)}
.legend i{display:inline-block;width:13px;height:13px;border-radius:4px;
  margin-right:7px;vertical-align:-2px}
.legend span{white-space:nowrap}
/* схемы тут крупнее, чем в песне: страница только из них и состоит */
.cards{gap:clamp(14px,1.8vw,26px)}
footer{margin-top:36px;color:var(--muted);font-size:12.5px;line-height:1.7}
footer b{color:var(--fg);font-weight:600}
@media print{
  .bar,footer{display:none}
}
"""

_JS = """
(function(){
  // размер схем: 320 — тот самый пол, уже него подписи на пэдах не читаются.
  // Потолок двигаем вместе с полом, иначе одинокая колонка растянет схему
  var sizes={S:[320,340],M:[400,430],L:[540,580]};
  var btns=document.querySelectorAll('.sizer button');
  btns.forEach(function(b){b.addEventListener('click',function(){
    var v=sizes[b.dataset.size];
    document.documentElement.style.setProperty('--card-min',v[0]+'px');
    document.documentElement.style.setProperty('--card-max',v[1]+'px');
    btns.forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});
  });});
})();
"""


def build_page(specs: Sequence[ChordSpec], title: str, grid: Optional[Grid] = None,
               source: str = "", voice_leading: bool = True,
               allow_inversions: bool = False) -> str:
    g = grid or Grid()
    st = PALETTE["states"]
    # раскладка ровно одна — компактная: фигура в четырёх колонках, под одну руку
    voicings = voice_progression(g, specs, voice_leading=voice_leading,
                                 allow_inversions=allow_inversions, compact=True)

    def card_html(v):
        degs = " · ".join(v.overlay[rc].degree
                          for rc in sorted(v.pads, key=lambda rc: g.midi(*rc)))
        return render_html(g, overlay=v.overlay, title=v.spec.symbol,
                           subtitle=v.describe(), flats=v.spec.prefers_flats,
                           spelling=v.spec.spelling(), spec=v.spec, live=True,
                           meta="ступени <b>%s</b>" % _esc(degs))

    cards = [card_html(v) for v in voicings]

    legend = [
        (st["chord_root"]["stops"][1], "рут аккорда"),
        (st["chord"]["stops"][1], "остальные ноты"),
        (st["chord"]["stops"][1] + "66", "бледные — обращения: те же ноты на других пэдах"),
        (st["extra"]["stops"][1], "выделено руками — в аккорд не входит"),
        (st["root"]["stops"][0], "нота C — тоника раскраски"),
        (st["in_key"]["stops"][0], "гамма C major"),
        (st["off"]["stops"][0], "вне гаммы"),
    ]
    legend_html = "".join('<span><i style="background:%s"></i>%s</span>' % (col, _esc(txt))
                          for col, txt in legend)

    seq = " &rarr; ".join("<b>%s</b>" % _esc(s.symbol) for s in specs)
    date = datetime.date.today().isoformat()

    sizer = ('<div class="sizer">размер:'
             '<button data-size="S">S</button>'
             '<button data-size="M" aria-pressed="true">M</button>'
             '<button data-size="L">L</button></div>')

    footer = """<footer>
  Сетка Ableton Push, режим <b>Note / Chromatic</b>, раскладка <b>4ths</b>,
  нижний левый пэд — C1. Раскраска сетки всегда одна: тоника&nbsp;C + гамма&nbsp;C&nbsp;major.<br>
  Аппликатуры подобраны сразу для всей цепочки: солвер минимизирует сдвиг руки по
  гриду, поэтому часть нот переходит из аккорда в аккорд не сходя с пэда.
  Структуру аккорда он при этом не трогает — <b>рут всегда в басу</b>, играет только
  октавой и выбором пэда.<br>
  Фигура всегда держится в %(maxcols)d колонках грида — такой аккорд берётся одной рукой,
  не разъезжаясь вбок.<br>
  Схему можно переопределить руками: клик по бледному пэду переносит на него голос той же
  ноты — так задаётся обращение, и схема подписывает, какое получилось. Клик по любому
  другому пэду добавляет ноту не из аккорда, фиолетовым. Изменённая схема помечается
  точкой у имени, <b>&#10227;</b> возвращает аппликатуру солвера. Правки живут до
  перезагрузки страницы.<br>
  Сгенерировано %(date)s%(source)s.
</footer>""" % {"maxcols": COMPACT["max_cols"], "date": date,
                "source": (" из: " + _esc(source)) if source else ""}

    body = (header(title, back="../../", ctl=sizer)
            + '<div class="wrap"><p class="seq">%s</p>'
              '<div class="bar"><div class="legend">%s</div></div>'
              '<div class="cards">%s</div>%s</div>'
            % (seq, legend_html, "".join(cards), footer))

    return page("%s — схемы для Push" % title, body, _CSS, _JS + GRID_JS,
                with_grid=True)


def make_song(chords: str, name: str, write_svg: bool = False,
              outdir: Optional[str] = None, voice_leading: bool = True,
              allow_inversions: bool = False) -> str:
    specs = parse_progression(chords)
    if not specs:
        raise ValueError("не удалось прочитать ни одного аккорда из %r" % chords)
    folder = outdir or os.path.join(SONGS_DIR, slugify(name))
    os.makedirs(folder, exist_ok=True)

    html = build_page(specs, name, source=chords.strip(), voice_leading=voice_leading,
                      allow_inversions=allow_inversions)
    path = os.path.join(folder, "index.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html)

    if write_svg:
        sd = os.path.join(folder, "svg")
        os.makedirs(sd, exist_ok=True)
        g = Grid()
        for i, v in enumerate(voice_progression(g, specs, voice_leading=voice_leading,
                                                allow_inversions=allow_inversions), 1):
            fn = "%02d_%s.svg" % (i, re.sub(r"[^A-Za-z0-9#b]+", "_", v.spec.symbol))
            with open(os.path.join(sd, fn), "w", encoding="utf-8") as fh:
                fh.write(render_svg(g, overlay=v.overlay, title=v.spec.symbol,
                                    subtitle=v.describe(), flats=v.spec.prefers_flats,
                                    spelling=v.spec.spelling(), id_prefix="s%d" % i))
    return path


def _main(argv=None):
    p = argparse.ArgumentParser(description="Схемы аккордовой последовательности для Push")
    p.add_argument("chords", nargs="?", help='последовательность, напр. "Bb Gm A"')
    p.add_argument("--file", help="файл с последовательностью")
    p.add_argument("--name", default=None, help="название песни (оно же имя папки)")
    p.add_argument("--svg", action="store_true", help="дополнительно сохранить отдельные SVG")
    p.add_argument("--outdir", default=None, help="папка назначения")
    p.add_argument("--no-voice-leading", action="store_true",
                   help="выбирать каждый аккорд отдельно, без оглядки на соседние")
    p.add_argument("--allow-inversions", action="store_true",
                   help="разрешить солверу менять бас (по умолчанию рут всегда в басу)")
    a = p.parse_args(argv)

    text = a.chords
    if a.file:
        with open(a.file, encoding="utf-8") as fh:
            text = fh.read()
    if not text:
        p.error("нужна последовательность аккордов или --file")

    name = a.name or " ".join(text.split()[:4])
    specs = parse_progression(text)
    path = make_song(text, name, write_svg=a.svg, outdir=a.outdir,
                     voice_leading=not a.no_voice_leading,
                     allow_inversions=a.allow_inversions)
    print("аккордов: %d — %s" % (len(specs), " ".join(s.symbol for s in specs)))
    print("готово:", path)
    return 0


if __name__ == "__main__":
    sys.exit(_main())
