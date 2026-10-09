# -*- coding: utf-8 -*-
"""
songpage.py — страница песни: слева текст с аккордами, справа схемы для Push.

На вход — обычный «аккорды над текстом», как на любом сайте с подборами.
Я разбираю страницу руками (guitartuna, ultimate-guitar, amdm — неважно) и кладу
результат в такой файл:

    @title: Ð¤Ð¾Ð½Ð°ÑÐ¸
    @artist: ÐÑÐ¾-ÑÐ¾
    @key: Dm
    @source: https://...

    # Intro
    Bb        Bbmaj7b5

    # Verse 1
    Bb
    Lanterns in the rain
    Am               C
    Walk to the harbor

Правила формата:
  * `@ключ: значение` — шапка (title, artist, key, bpm, capo, source);
  * `# Название` — секция (Verse 1, Chorus, Bridge…);
  * строка, все токены которой читаются как аккорды, — строка аккордов;
    если следом идёт строка текста, аккорды встают над ней по колонкам,
    иначе это проигрыш (аккорды без текста);
  * `.` в начале — «это точно аккорды», `|` в начале — «это точно текст»
    (нужно редко: например если слово в тексте совпало с символом аккорда).

Схемы строятся только для аккордов, которые реально звучат под текстом —
интро/аутро/проигрыши в текст попадают, а в сайдбар нет. `--all-chords` снимает
это ограничение.

    python3 songpage.py source.txt
    python3 songpage.py source.txt --name "Unethical" --all-chords

Результат: songs/<slug>/index.html (рядом кладётся сам source.txt).
"""

from __future__ import annotations

import argparse
import datetime
import os
import re
import shutil
import sys
from collections import Counter
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from push_grid import (COMPACT, GRID_JS, Grid, PALETTE, ChordSpec, _build_overlay,
                       pc_to_name, parse_chord_symbol, render_html,
                       render_svg, span_cols, voice_progression)
from song import SONGS_DIR, slugify
# рама страницы — общая с остальным приложением: шапка, две колонки с ручкой,
# пол и потолок ширины схемы. Всё, что нужно больше чем одной странице, живёт там
from webapp import (CARD_MAX, CARD_MIN, LAYOUT_JS, esc as _esc, gutter, header,
                    layout_css, page)

META_KEYS = ("title", "artist", "key", "bpm", "capo", "source", "tuning")
_SENT_END = ",.?!;:"


# ------------------------------------------------------------------ разбор --

@dataclass
class Line:
    kind: str                                   # 'pair' | 'chords' | 'lyric' | 'blank'
    lyric: str = ""
    chords: List[Tuple[int, str]] = field(default_factory=list)   # (колонка, символ)


@dataclass
class Section:
    title: str
    lines: List[Line] = field(default_factory=list)

    @property
    def has_lyrics(self) -> bool:
        return any(l.kind in ("pair", "lyric") and l.lyric.strip() for l in self.lines)


@dataclass
class Song:
    meta: Dict[str, str] = field(default_factory=dict)
    sections: List[Section] = field(default_factory=list)

    def chain(self, with_lyrics_only: bool = True) -> List[str]:
        """Аккорды в порядке звучания. Подряд идущие повторы схлопнуты."""
        out: List[str] = []
        for sec in self.sections:
            for l in sec.lines:
                if l.kind == "chords" and with_lyrics_only:
                    continue
                for _col, sym in l.chords:
                    if not out or out[-1] != sym:
                        out.append(sym)
        return out


def is_chord_token(tok: str) -> bool:
    try:
        parse_chord_symbol(tok)
        return True
    except Exception:
        return False


def is_chord_line(s: str) -> bool:
    t = s.strip()
    if not t:
        return False
    if t[0] == ".":
        return True
    if t[0] == "|":
        return False
    if t[-1] in _SENT_END or "'" in t or '"' in t:
        return False
    toks = t.split()
    if len(toks) > 12:
        return False
    return all(is_chord_token(tok) for tok in toks)


def chord_positions(s: str) -> List[Tuple[int, str]]:
    s = s[1:] if s.lstrip().startswith(".") else s
    return [(m.start(), m.group()) for m in re.finditer(r"\S+", s)]


def parse_source(text: str) -> Song:
    song = Song()
    body: List[str] = []
    for raw in text.splitlines():
        m = re.match(r"^@(\w+)\s*:\s*(.*)$", raw.strip())
        if m and m.group(1).lower() in META_KEYS:
            song.meta[m.group(1).lower()] = m.group(2).strip()
        else:
            body.append(raw.rstrip())

    cur = Section("")
    song.sections.append(cur)
    i = 0
    while i < len(body):
        raw = body[i]
        if raw.strip().startswith("#"):
            cur = Section(raw.strip().lstrip("#").strip())
            song.sections.append(cur)
            i += 1
            continue
        if not raw.strip():
            if cur.lines and cur.lines[-1].kind != "blank":
                cur.lines.append(Line("blank"))
            i += 1
            continue
        if is_chord_line(raw):
            nxt = body[i + 1] if i + 1 < len(body) else ""
            if nxt.strip() and not nxt.strip().startswith("#") and not is_chord_line(nxt):
                lyr = nxt[1:] if nxt.lstrip().startswith("|") else nxt
                cur.lines.append(Line("pair", lyr, chord_positions(raw)))
                i += 2
            else:
                cur.lines.append(Line("chords", "", chord_positions(raw)))
                i += 1
            continue
        lyr = raw[1:] if raw.lstrip().startswith("|") else raw
        cur.lines.append(Line("lyric", lyr))
        i += 1

    song.sections = [s for s in song.sections if s.title or s.lines]
    for s in song.sections:
        while s.lines and s.lines[-1].kind == "blank":
            s.lines.pop()
    return song


def split_units(lyric: str, chords: Sequence[Tuple[int, str]]
                ) -> List[Tuple[Optional[str], str]]:
    """Разрезать строку текста по колонкам аккордов: [(аккорд|None, кусок текста)]."""
    if not chords:
        return [(None, lyric)]
    units: List[Tuple[Optional[str], str]] = []
    if chords[0][0] > 0:
        units.append((None, lyric[:chords[0][0]]))
    for k, (col, sym) in enumerate(chords):
        end = chords[k + 1][0] if k + 1 < len(chords) else max(len(lyric), col)
        units.append((sym, lyric[col:end] if col < len(lyric) else ""))
    return units


# -------------------------------------------------------------- аппликатуры --

@dataclass
class Card:
    symbol: str
    spec: ChordSpec
    notes: List[int]
    pads: List[Tuple[int, int]]
    overlay: dict
    names: List[str] = field(default_factory=list)
    degrees: str = ""
    width: int = 0                  # сколько колонок грида занимает фигура


def build_cards(grid: Grid, chain: Sequence[str], voice_leading: bool = True,
                allow_inversions: bool = False, compact: bool = True) -> List[Card]:
    """Одна карточка на уникальный аккорд.

    Аппликатура выбирается не в вакууме: солвер прогоняется по всей реальной
    цепочке песни, а карточке достаётся вариант, который в этой цепочке
    встретился чаще всего.

    compact=True — фигура держится в четырёх колонках, чтобы браться одной рукой.
    """
    if not chain:
        return []
    voicings = voice_progression(grid, list(chain), voice_leading=voice_leading,
                                 allow_inversions=allow_inversions, compact=compact)

    counts: Dict[str, Counter] = {}
    order: List[str] = []
    for v in voicings:
        sym = v.spec.symbol
        if sym not in counts:
            counts[sym] = Counter()
            order.append(sym)
        counts[sym][(tuple(v.notes), tuple(v.pads))] += 1

    spec_of = {v.spec.symbol: v.spec for v in voicings}
    chosen: Dict[str, Tuple[Tuple[int, ...], Tuple[Tuple[int, int], ...]]] = {}
    for sym in order:
        chosen[sym] = counts[sym].most_common(1)[0][0]

    cards: List[Card] = []
    for sym in order:
        notes, pads = chosen[sym]
        spec = spec_of[sym]
        overlay, _gh = _build_overlay(grid, spec, list(pads), True)
        sp = spec.spelling()
        names = ["%s%d" % (sp.get(m % 12) or pc_to_name(m % 12, spec.prefers_flats),
                           m // 12 - 2) for m in notes]
        degs = " · ".join(overlay[rc].degree
                          for rc in sorted(pads, key=lambda rc: grid.midi(*rc)))
        cards.append(Card(sym, spec, list(notes), list(pads), overlay,
                          names, degs, span_cols(pads)))
    return cards


# ------------------------------------------------------------------ рендер --



_CSS = """
:root{--lyric:clamp(16px,1.4vw,21px)}

/* --- текст с аккордами --- */
.sheet{padding:18px clamp(12px,2vw,22px) 40px clamp(12px,3vw,36px)}
/* сайдбару паддинги дороже, чем тексту: каждые 20px тут решают, встанут схемы
   в две колонки или в одну */
.side{padding:12px clamp(10px,1.4vw,20px) 12px clamp(10px,1vw,14px)}
.sec{margin:0 0 26px}
.sec h2{margin:0 0 10px;font-size:12.5px;letter-spacing:.13em;text-transform:uppercase;
  color:var(--muted);font-weight:600;display:flex;align-items:center;gap:11px}
.sec h2::after{content:"";flex:1;height:1px;background:var(--line)}
.sec.instr h2{color:var(--dim)}
.line{margin:0 0 4px;font-size:var(--lyric);line-height:1.35}
.line.plain{padding-top:0}
.line.only{margin-bottom:10px}
.u{display:inline-block;vertical-align:bottom}
.u .c{display:block;color:var(--root);font-weight:700;font-size:.82em;line-height:1.45;
  letter-spacing:.01em;padding-right:.7em;white-space:nowrap;
  font-feature-settings:"tnum"}
.u .t{white-space:pre-wrap}
.line.only .u .c{color:var(--dim)}
.sec.instr .u .c{color:var(--dim)}
.blank{height:11px}

footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);
  color:var(--muted);font-size:12.5px;line-height:1.7}
footer a{color:var(--tone)}
footer b{color:var(--fg);font-weight:600}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;margin:0 0 12px;font-size:12.5px}
.legend i{display:inline-block;width:12px;height:12px;border-radius:4px;
  margin-right:6px;vertical-align:-2px}
.legend span{white-space:nowrap}
.facts{display:flex;flex-wrap:wrap;gap:4px 18px;margin:0 0 12px}
.facts b{color:var(--fg);font-weight:600}

@media print{
  footer{display:none}
  .sec{break-inside:avoid}
}
"""

_JS = """
// кегль текста песни: S / M / L
(function(){
  var sizes={S:'15px',M:'clamp(16px,1.4vw,21px)',L:'24px'};
  var btns=document.querySelectorAll('.sizer button');
  btns.forEach(function(b){b.addEventListener('click',function(){
    document.documentElement.style.setProperty('--lyric',sizes[b.dataset.size]);
    btns.forEach(function(x){x.setAttribute('aria-pressed',String(x===b));});
  });});
})();
"""


def render_line(line: Line) -> str:
    if line.kind == "blank":
        return '<div class="blank"></div>'
    if line.kind == "lyric":
        return '<div class="line plain">%s</div>' % (_esc(line.lyric) or "&nbsp;")
    if line.kind == "chords":
        us = "".join('<span class="u"><span class="c">%s</span><span class="t">&nbsp;</span></span>'
                     % _esc(sym) for _col, sym in line.chords)
        return '<div class="line only">%s</div>' % us
    parts = []
    for sym, text in split_units(line.lyric, line.chords):
        t = _esc(text) if text else "&nbsp;"
        if sym is None:
            parts.append('<span class="u"><span class="c">&nbsp;</span>'
                         '<span class="t">%s</span></span>' % t)
        else:
            parts.append('<span class="u"><span class="c">%s</span>'
                         '<span class="t">%s</span></span>' % (_esc(sym), t))
    return '<div class="line">%s</div>' % "".join(parts)


def _card_body(grid: Grid, card: Card) -> str:
    return render_html(grid, overlay=card.overlay, title=card.symbol,
                       subtitle=" · ".join(card.names),
                       flats=card.spec.prefers_flats,
                       spelling=card.spec.spelling(), spec=card.spec, live=True,
                       meta="ступени <b>%s</b>" % _esc(card.degrees),
                       key=card.symbol)


_STORE_JS = """
// Накликанные аппликатуры переживают перезагрузку: сервер держит их в
// songs/<slug>/state.json — отдельно от index.html, который перегенерируется.
// Страница, открытая двойным кликом по файлу (file://), сервера не видит:
// fetch падает, всё уходит в catch, и правки живут до перезагрузки, как раньше.
(function(){
  var URL='/api/song/%(slug)s/state', state={}, timer=null, busy=false;
  function flush(){
    timer=null; busy=true;
    fetch(URL,{method:'POST',headers:{'Content-Type':'application/json'},
               body:JSON.stringify({chords:state})})
      .catch(function(){}).then(function(){busy=false;});
  }
  // клик по пэду — уже запись, но подряд идущие клики (перенос голоса, потом
  // ещё один) складываем в один POST: файл переписывается целиком
  window.PG_SAVE=function(key,st){
    if(st) state[key]=st; else delete state[key];
    if(timer) clearTimeout(timer);
    timer=setTimeout(flush,120);
  };
  fetch(URL).then(function(r){return r.ok?r.json():null;}).then(function(d){
    if(!d||!d.chords) return;
    state=d.chords;
    document.querySelectorAll('.pg[data-key]').forEach(function(pg){
      var k=pg.dataset.key;
      if(state[k]&&pg.__pgSet) pg.__pgSet(state[k]);
    });
  }).catch(function(){});
})();
"""


def build_page(song: Song, cards: Sequence[Card], grid: Grid,
               title: str, chain: Sequence[str], slug: str = "") -> str:
    st = PALETTE["states"]

    secs = []
    for sec in song.sections:
        if not sec.lines:
            continue
        cls = "sec" if sec.has_lyrics else "sec instr"
        head = '<h2>%s</h2>' % _esc(sec.title) if sec.title else ""
        secs.append('<section class="%s">%s%s</section>'
                    % (cls, head, "".join(render_line(l) for l in sec.lines)))

    cards_html = [_card_body(grid, card) for card in cards]

    legend = [
        (st["chord_root"]["stops"][1], "рут аккорда"),
        (st["chord"]["stops"][1], "остальные ноты"),
        (st["chord"]["stops"][1] + "66", "бледные — обращения"),
        (st["extra"]["stops"][1], "выделено руками — не из аккорда"),
        (st["root"]["stops"][0], "нота C"),
        (st["in_key"]["stops"][0], "гамма C major"),
        (st["off"]["stops"][0], "вне гаммы"),
    ]
    legend_html = "".join('<span><i style="background:%s"></i>%s</span>' % (c, _esc(t))
                          for c, t in legend)

    # в шапке — только то, что нужно, пока играешь; остальное уехало в подвал
    chips = []
    if song.meta.get("key"):
        chips.append("тональность <b>%s</b>" % _esc(song.meta["key"]))
    if song.meta.get("capo"):
        chips.append("каподастр <b>%s</b>" % _esc(song.meta["capo"]))
    if song.meta.get("bpm"):
        chips.append("<b>%s</b> BPM" % _esc(song.meta["bpm"]))

    facts = ["схемы: <b>%s</b>" % _esc(", ".join(c.symbol for c in cards))]
    skipped = [s for s in dict.fromkeys(song.chain(with_lyrics_only=False))
               if s not in {c.symbol for c in cards}]
    if skipped:
        facts.append("без схем: %s" % _esc(", ".join(skipped)))
    if song.meta.get("source"):
        facts.append('<a href="%s" target="_blank" rel="noopener">источник</a>'
                     % _esc(song.meta["source"]))

    artist = song.meta.get("artist") or ""
    sizer = ('<div class="sizer">текст:'
             '<button data-size="S">S</button>'
             '<button data-size="M" aria-pressed="true">M</button>'
             '<button data-size="L">L</button></div>')

    footer = """<footer>
  <div class="legend">%(legend)s</div>
  <div class="facts">%(facts)s</div>
  Сетка Ableton Push, режим <b>Note / Chromatic</b>, раскладка <b>4ths</b>,
  нижний левый пэд — C1. Раскраска сетки всегда одна: тоника&nbsp;C + гамма&nbsp;C&nbsp;major.<br>
  Одна схема — один аккорд песни. Аппликатуру солвер выбирал не для аккорда в отдельности,
  а для всей цепочки куплета, поэтому соседние аккорды делят пэды. Структура при этом
  не тронута — <b>рут всегда в басу</b>.<br>
  Фигура всегда держится в %(maxcols)d колонках грида — такой аккорд берётся одной рукой,
  не разъезжаясь вбок. Трезвучие уже четырёх колонок не бывает, sus-аккорды ложатся в три.<br>
  Схема не приколочена. Клик по бледному пэду переносит на него голос той же ноты —
  так руками задаётся обращение, и схема подписывает, какое получилось. Клик по любому
  другому пэду добавляет ноту не из аккорда, фиолетовым. Изменённая схема помечается
  точкой у имени, <b>&#10227;</b> возвращает аппликатуру солвера. Правки сохраняются
  сразу по клику — в <code>state.json</code> рядом с песней, и при следующем открытии
  схема встаёт так, как ты её оставил (страница, открытая файлом мимо сервера, сохранять
  не умеет — там правки живут до перезагрузки).<br>
  Секции без текста (интро, проигрыши, аутро) оставлены в тексте, но схемы по ним не строятся.<br>
  Сгенерировано %(date)s.
</footer>""" % {"legend": legend_html,
                "facts": "".join("<span>%s</span>" % f for f in facts),
                "maxcols": COMPACT["max_cols"],
                "date": datetime.date.today().isoformat()}

    # ссылка на главную относительная: страница лежит в songs/<slug>/ и одинаково
    # открывается и через сервер, и просто файлом
    body = (header(title, subtitle=artist, back="../../",
                   chips="".join("<span>%s</span>" % c for c in chips), ctl=sizer)
            + '<div class="layout">'
            + '<main class="pane sheet">%s%s</main>' % ("".join(secs), footer)
            + gutter()
            + '<aside class="pane side"><div class="cards">%s</div></aside>'
            % "".join(cards_html)
            + "</div>")

    # хранилище цепляется ПОСЛЕ GRID_JS: тот вешает на схемы __pgSet, без
    # которого возвращать сохранённую аппликатуру некуда
    js = LAYOUT_JS + _JS + GRID_JS
    if slug:
        js += _STORE_JS % {"slug": slug}
    return page("%s — текст и схемы для Push" % title, body,
                layout_css() + _CSS, js, with_grid=True)


# --------------------------------------------------------------------- API --

def make_page(source_text: str, name: Optional[str] = None,
              outdir: Optional[str] = None, all_chords: bool = False,
              voice_leading: bool = True, allow_inversions: bool = False,
              write_svg: bool = False) -> str:
    song = parse_source(source_text)
    title = name or song.meta.get("title") or "Песня"
    chain = song.chain(with_lyrics_only=not all_chords)
    if not chain:
        raise ValueError("в источнике не нашлось ни одного аккорда")

    grid = Grid()
    # раскладка ровно одна — компактная: фигура в четырёх колонках, под одну руку
    cards = build_cards(grid, chain, voice_leading=voice_leading,
                        allow_inversions=allow_inversions, compact=True)

    folder = outdir or os.path.join(SONGS_DIR, slugify(title))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, "index.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(build_page(song, cards, grid, title, chain,
                            slug=os.path.basename(os.path.normpath(folder))))

    if write_svg:
        sd = os.path.join(folder, "svg")
        os.makedirs(sd, exist_ok=True)
        for i, card in enumerate(cards, 1):
            fn = "%02d_%s.svg" % (i, re.sub(r"[^A-Za-z0-9#b]+", "_", card.symbol))
            with open(os.path.join(sd, fn), "w", encoding="utf-8") as fh:
                fh.write(render_svg(grid, overlay=card.overlay, title=card.symbol,
                                    subtitle=" · ".join(card.names),
                                    flats=card.spec.prefers_flats,
                                    spelling=card.spec.spelling(),
                                    id_prefix="s%d" % i))
    return path


def _main(argv=None):
    p = argparse.ArgumentParser(
        description="Страница песни: текст с аккордами + схемы для Push")
    p.add_argument("source", help="файл «аккорды над текстом» (см. docstring)")
    p.add_argument("--name", default=None, help="название (по умолчанию — @title)")
    p.add_argument("--outdir", default=None, help="папка назначения")
    p.add_argument("--all-chords", action="store_true",
                   help="строить схемы и для аккордов без текста (интро, проигрыши)")
    p.add_argument("--svg", action="store_true", help="дополнительно сохранить SVG")
    p.add_argument("--no-voice-leading", action="store_true",
                   help="выбирать каждый аккорд отдельно")
    p.add_argument("--allow-inversions", action="store_true",
                   help="разрешить солверу менять бас (по умолчанию рут в басу)")
    a = p.parse_args(argv)

    with open(a.source, encoding="utf-8") as fh:
        text = fh.read()
    path = make_page(text, name=a.name, outdir=a.outdir, all_chords=a.all_chords,
                     voice_leading=not a.no_voice_leading,
                     allow_inversions=a.allow_inversions, write_svg=a.svg)

    dst = os.path.join(os.path.dirname(path), "source.txt")
    if os.path.abspath(a.source) != os.path.abspath(dst):
        shutil.copyfile(a.source, dst)

    song = parse_source(text)
    chain = song.chain(with_lyrics_only=not a.all_chords)
    uniq = []
    for s in chain:
        if s not in uniq:
            uniq.append(s)
    print("секций: %d, аккордов в цепочке: %d, схем: %d — %s"
          % (len([s for s in song.sections if s.lines]), len(chain), len(uniq),
             " ".join(uniq)))
    print("готово:", path)
    return 0


if __name__ == "__main__":
    sys.exit(_main())
