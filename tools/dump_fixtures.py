# -*- coding: utf-8 -*-
"""Эталоны для TS-порта: прогоняет Python-ядро и пишет tests/fixtures/*.json.

Временный инструмент: живёт ровно столько, сколько живёт Python-версия. После
удаления Python фикстуры остаются замороженными — TS сверяется с ними.

    python3 tools/dump_fixtures.py
"""
import json
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

import push_grid as pg          # noqa: E402
import identify as ident        # noqa: E402
import songpage as sp           # noqa: E402
import song as songmod          # noqa: E402
import webapp                   # noqa: E402
import findpage                 # noqa: E402

OUT = os.path.join(ROOT, "tests", "fixtures")
G = pg.Grid()
ROOT_NAMES = ["C", "C#", "Db", "D", "Eb", "E", "F", "F#", "Gb", "G", "Ab", "A", "Bb", "B"]


def dump(name, obj):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, separators=(",", ":"))
    print("%-16s %7d байт" % (name, os.path.getsize(path)))


def pairs(d):
    return [[k, v] for k, v in d.items()]


def idx(rc):
    return rc[0] * 8 + rc[1]


def fnum(x):
    return None if x is None else round(x, 9)


def spec_dict(s):
    return {"symbol": s.symbol, "root_pc": s.root_pc, "kind": s.kind,
            "intervals": list(s.intervals), "bass_pc": s.bass_pc,
            "root_written": s.root_written, "bass_written": s.bass_written,
            "degrees": s.degrees, "root_name": s.root_name,
            "spelling": [[pc, n] for pc, n in s.spelling().items()],
            "degree_map": [[pc, d] for pc, d in s.degree_map().items()],
            "prefers_flats": s.prefers_flats, "pitch_classes": s.pitch_classes}


def overlay_list(ov):
    return [[idx(rc), m.degree, m.is_root, m.ghost, m.midi] for rc, m in ov.items()]


def voicing_dict(v):
    return {"symbol": v.spec.symbol, "notes": list(v.notes),
            "pads": [idx(p) for p in v.pads], "ghosts": [idx(p) for p in v.ghosts],
            "inversion": v.inversion, "move": fnum(v.move),
            "overlay": overlay_list(v.overlay)}


# ------------------------------------------------------------------ данные --

def data_fixture():
    with open(os.path.join(ROOT, "push_grid.json"), encoding="utf-8") as fh:
        raw = json.load(fh)
    rest = {k: v for k, v in raw.items()
            if k not in ("chords", "chord_aliases", "intervals")}
    dump("data.json", {"chords": pairs(raw["chords"]),
                       "chord_aliases": pairs(raw["chord_aliases"]),
                       "intervals": pairs(raw["intervals"]),
                       "rest": rest})


# ------------------------------------------------------------------ разбор --

EXTRA_SYMBOLS = [
    "C(b5)", "Cb5", "C6/9", "C69/A", "Am/C", "Bb(b5)/D", "H", "", "  Dm7  ", "c", "am",
    "C♯m", "B♭", "Cm(maj7)", "X", "C/H", "Dsus", "CMAJ7", "CM7", "Cm7", "Cwat",
    "Hmaj7", "Fb", "E#", "B#m", "Cbb", "C##", "F#m7b5", "Ebaug", "Bdim7", "A7sus4", "C(add9)",
    "Bbadd#11", "Dmadd9/A", "A7", "Dsus2", "G/B", "D/F#", "Em7/D", "C/E", "Bb/Ab", "F/C",
    "Am7/G", "C6/9/A", "Cm6/9", "C7/", "/C", "C/", "Am/c", "Am/Db", "Dbmaj7/Cb", "Gb7/Fb",
    "Abm", "G#m", "C#7", "Db7", "N.C.", "x2", "Oh-ooo-o", "E*", "F*", "A7(E", "Bb(b5)",
]


def parse_fixture():
    cases = []
    syms = []
    for alias in pg.ALIASES:
        for r in ROOT_NAMES:
            syms.append(r + alias)
    syms += EXTRA_SYMBOLS
    for s in syms:
        try:
            cases.append({"in": s, "out": spec_dict(pg.parse_chord_symbol(s))})
        except Exception as e:      # noqa: BLE001 — эталон и для ошибок тоже
            cases.append({"in": s, "error": type(e).__name__})
    progs = []
    for text in ["Bb Gm A", "Bb | Gm -> A, Dm", "C C C Am", "Am;Dm\nE7\tAm",
                 "C – G — Am → F", "C->G", "| C | G |", " - C - ", "C,,G", "",
                 "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am", "C Hm", "Dm7 G7 Cmaj7"]:
        try:
            progs.append({"in": text,
                          "out": [s.symbol for s in pg.parse_progression(text)]})
        except Exception as e:      # noqa: BLE001
            progs.append({"in": text, "error": type(e).__name__})
    notes = {}
    for n in ["C", "c", "C#", "Db", "B#", "Cb", "Fb", "E#", "Bbb", "C##", "A♯", "B♭",
              " G ", "H", "", "Cx", "C#b"]:
        try:
            notes[n] = pg.note_to_pc(n)
        except Exception:           # noqa: BLE001
            notes[n] = None
    spell = []
    for rn in ROOT_NAMES:
        for deg in ["1", "b2", "2", "b3", "3", "4", "b5", "#4", "5", "#5", "b6", "6", "bb7",
                    "b7", "7", "b9", "9", "#9", "11", "#11", "b13", "13", "x"]:
            for pc in range(12):
                spell.append([rn, deg, pc, pg.spell_from(rn, deg, pc)])
    dump("parse.json", {"symbols": cases, "progressions": progs, "notes": notes,
                        "spell": spell,
                        "interval_short": [[n, pg.interval_short(n)] for n in range(0, 30)],
                        "midi_to_name": [[m, pg.midi_to_name(m), pg.midi_to_name(m, True),
                                          pg.midi_to_name(m, False, False)]
                                         for m in range(0, 128)]})


# --------------------------------------------------------------- аппликатуры --

def symbol_pool():
    pool = []
    for kind in pg.CHORDS:
        for r in ROOT_NAMES:
            s = r + ident.suffix_of(kind)
            try:
                pg.parse_chord_symbol(s)
            except ValueError:
                continue
            pool.append(s)
    return pool


def voicing_fixture():
    singles = []
    for kind in pg.CHORDS:
        for root in range(12):
            name = pg.NOTE_FLAT[root]
            spec = pg.ChordSpec(name + kind, root, kind, pg.chord_intervals(kind), None, name)
            for compact in (True, False):
                try:
                    v = pg.voice_chord(G, spec, compact=compact)
                    singles.append({"kind": kind, "root": root, "compact": compact,
                                    "out": voicing_dict(v)})
                except ValueError:
                    singles.append({"kind": kind, "root": root, "compact": compact,
                                    "error": True})
    for s in ["Am/C", "C6/9", "Bb(b5)/D", "G/B", "D/F#", "Dmadd9/A", "Bbadd#11", "Cmin13",
              "C13#11", "C7alt"]:
        singles.append({"symbol": s, "compact": True,
                        "out": voicing_dict(pg.voice_chord(G, s))})
        singles.append({"symbol": s, "compact": True, "ghosts": False,
                        "out": voicing_dict(pg.voice_chord(G, s, ghosts=False))})

    rnd = random.Random(20261009)
    pool = symbol_pool()
    progs = []
    modes = ([{}] * 120 + [{"voice_leading": False}] * 40 + [{"compact": False}] * 40
             + [{"allow_inversions": True}] * 40)
    for opts in modes:
        n = rnd.randint(1, 9)
        chain = []
        for _ in range(n):
            s = rnd.choice(pool)
            if rnd.random() < 0.15:
                s += "/" + rnd.choice(["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A",
                                       "Bb", "B"])
            chain.append(s)
        case = {"chain": chain, "opts": opts}
        try:
            vs = pg.voice_progression(G, chain, **opts)
            case["out"] = [voicing_dict(v) for v in vs]
        except ValueError:
            case["error"] = True
        progs.append(case)
    for name, chain in [("демо", "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am"),
                        ("поп", "C G Am F"), ("джаз", "Dm7 G7 Cmaj7 Em7b5 A7 Dm7"),
                        ("кварты", "C F Bb Eb Ab Db"), ("далеко", "C F#m7 Bb13 Em9"),
                        ("бардовский", "Am Dm E7 Am F C E7 Am")]:
        for opts in ({}, {"voice_leading": False}, {"compact": False},
                     {"allow_inversions": True}):
            syms = [s.symbol for s in pg.parse_progression(chain)]
            progs.append({"name": name, "chain": syms, "opts": opts,
                          "out": [voicing_dict(v)
                                  for v in pg.voice_progression(G, syms, **opts)]})

    placements = []
    for notes in ([48, 52, 55], [48, 55], [36, 40, 43, 47], [60, 64, 67, 71, 74],
                  [48, 51, 55, 58, 62, 69], [77, 78], [36], [79], [40, 41, 42, 43]):
        for kw in ({}, {"limit": 1}, {"limit": 6, "max_cols": 4, "compact": True},
                   {"max_cols": 4, "compact": True}, {"compact": True}):
            placements.append({"notes": notes, "kw": kw,
                               "out": [[idx(p) for p in combo]
                                       for combo in pg.all_placements(G, notes, **kw)][:40]})
    pitches = []
    for s in ["C", "Am/C", "G/B", "D/F#", "Cmin13", "C7alt", "Bb(b5)/D", "Em7/D"]:
        spec = pg.parse_chord_symbol(s)
        for low in (36, 41, 43, 48, 53, 55, 60):
            pitches.append({"symbol": s, "low": low, "out": pg.chord_pitches(spec, low)})
    dump("voicing.json", {"singles": singles, "progressions": progs,
                          "placements": placements, "pitches": pitches,
                          "invert": [[p, n, pg.invert(p, n)]
                                     for p in ([60, 64, 67], [48, 55, 64, 70], [60])
                                     for n in range(0, 5)]})


# -------------------------------------------------------------- определение --

def identify_fixture():
    rnd = random.Random(777)
    cases = []
    for _ in range(500):
        k = rnd.choice([1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6])
        pads = rnd.sample(range(64), k)
        mode = rnd.random()
        if mode < 0.7:
            root_pc = G.midi(pads[0] // 8, pads[0] % 8) % 12
        elif mode < 0.9:
            root_pc = None
        else:
            root_pc = rnd.randrange(12)
        midis = ident.pads_to_midi(pads)
        cases.append({"pads": pads, "root_pc": root_pc,
                      "out": ident.identify(midis, root_pc)})
    for midis, rp in [([57, 60, 64, 67], None), ([60, 64, 67, 69], None),
                      ([57, 60, 64, 67], 9), ([57, 60, 64, 67], 0), ([60, 64, 67, 69], 4),
                      ([54, 59, 60], None), ([54, 59, 55], None), ([57, 60, 62, 64, 67], 0),
                      ([54, 59, 61, 64], None), ([60, 63, 66, 70, 73], None),
                      ([60, 64, 71], None), ([60, 64, 67, 62], None), ([60, 64, 67, 63], None),
                      ([60, 64, 67, 61], None), ([58, 62, 65], None), ([], None), ([], 3),
                      ([60, 67], None), ([60, 61], None), ([60, 73], None), ([60, 72], None),
                      ([60, 85], None), ([60, 84], None), ([36, 38], 0), ([36, 38], None),
                      ([60, 60, 64], 0)]:
        cases.append({"midi": midis, "root_pc": rp, "out": ident.identify(midis, rp)})

    picks = []
    for _ in range(30):
        pads = rnd.sample(range(64), rnd.choice([2, 3, 4, 5]))
        rp = G.midi(pads[0] // 8, pads[0] % 8) % 12
        res = ident.identify(ident.pads_to_midi(pads), rp)
        cands = res["candidates"]
        roll = rnd.random()
        if cands and roll < 0.5:
            c = cands[0]
            item = {"sym": c["sym"], "pads": sorted(pads), "root": pads[0],
                    "root_pc": c["root_pc"], "kind": c["kind"]}
        elif len(cands) > 1 and roll < 0.75:
            c = cands[1]
            item = {"sym": c["sym"], "pads": sorted(pads), "root": pads[0],
                    "root_pc": c["root_pc"], "kind": c["kind"]}
        else:
            item = {"sym": "?", "pads": sorted(pads), "root": pads[0], "root_pc": rp,
                    "kind": ""}
        picks.append(item)
    picks.append({"sym": "Zz", "pads": [0, 4, 7], "root": 0, "root_pc": 0, "kind": "maj"})
    picks.append({"sym": "", "pads": [12, 17, 20, 25], "root": 20, "root_pc": 9,
                  "kind": "min7"})
    enrich = ident.enrich(picks)

    dump("identify.json", {
        "cases": cases, "enrich_in": picks, "enrich_out": enrich,
        "interval_name": [[n, ident.interval_name(n)] for n in range(-50, 51)],
        "degree_from_root": [[n, ident.degree_from_root(n)] for n in range(-45, 51)],
        "suffix_of": [[k, ident.suffix_of(k)] for k in pg.CHORDS],
        "root_name": [[pc, m, ident.root_name(pc, m)] for pc in range(-3, 15)
                      for m in (False, True)],
        "max_notes": ident.MAX_NOTES,
        "pads_to_midi": [[p, ident.pads_to_midi(p)]
                         for p in ([0, 63], [99], [-1, 5], [], [7, 8, 56])],
    })


# ------------------------------------------------------------------ песни --

SOURCES = {
    "проба": """@title: Проба
@artist: Кто-то
@key: Dm
@source: https://example.org/x

# Intro
Bb        Bbmaj7b5

# Verse 1
Bb
Lanterns in the rain
Am                 C
Walk to the harbor
Counting all the gulls
Dm   Gm
(oh) Sail away
""",
    "фонари": """@title: Фонари
@artist: Никто
@key: Am
@bpm: 92
@capo: 2
@tuning: standard
@unknown: что-то

# Вступление
Am   F   C   G
Am   F   C   G

# Куплет 1
Am                F
Вечер тихо ходит по крыше
C                     G
Ветер пишет письма воде
Am                F        C      G
Фонари всё ближе и ближе
     Dm7         E7sus4   E7
и никто не знает, где

# Припев
F          G          Em7       Am
Ла-ла-ла, ла-ла, ла-ла-ла, ла-ла
.Am
|Am I the one who knows
F                         G/B
Дальше будет только светлее

# Проигрыш
C G/B Am G F C/E Dm7 G7sus4

# Кода
Am
""",
    "без шапки": """C        G
just a line
Am                     F
another line that is long enough
C
G
short
""",
    "крайние": """
# Пусто

# Только текст
нет аккордов здесь
и здесь нет

#Секция без пробела
D   A   Bm   G
у дороги

C
""",
    "повторы": """Am Am Am
раз два три
Am      Am
четыре пять
C  C/E   F  F
шесть семь
""",
    "длинная строка": """C D E F G A B C D E F G A
это не строка аккордов, токенов больше двенадцати
C D E F G A B C D E F G
а это строка аккордов
""",
    "мусор": """A7 (E string - 3 1 0)*         Dsus2
Morning spills across the floor
F*     E*
Oh-ooo-o
Bbadd#11                               Bb(b5)/D
Long and winding text that goes on
  Dm    Bbadd#11     Dmadd9/A
Oh--oh--oh, the kettle sings
""",
}


def song_dict(song):
    return {"meta": song.meta,
            "sections": [{"title": s.title, "has_lyrics": s.has_lyrics,
                          "lines": [{"kind": l.kind, "lyric": l.lyric,
                                     "chords": [list(c) for c in l.chords]}
                                    for l in s.lines]}
                         for s in song.sections]}


def card_dict(c):
    return {"symbol": c.symbol, "notes": c.notes, "pads": [idx(p) for p in c.pads],
            "names": c.names, "degrees": c.degrees, "width": c.width,
            "overlay": overlay_list(c.overlay)}


def sheet_fixture():
    out = []
    for name, text in SOURCES.items():
        song = sp.parse_source(text)
        units = []
        for s in song.sections:
            for l in s.lines:
                if l.kind == "pair":
                    units.append({"lyric": l.lyric, "chords": [list(c) for c in l.chords],
                                  "units": [list(u) for u in sp.split_units(l.lyric,
                                                                            l.chords)]})
        lines_html = [sp.render_line(l) for s in song.sections for l in s.lines]
        case = {"name": name, "text": text, "song": song_dict(song),
                "chain_lyrics": song.chain(True), "chain_all": song.chain(False),
                "units": units, "lines_html": lines_html}
        for key, ch in (("cards_lyrics", song.chain(True)), ("cards_all", song.chain(False))):
            try:
                case[key] = [card_dict(c) for c in sp.build_cards(pg.Grid(), ch)]
            except ValueError:
                case[key] = None
        out.append(case)
    lines = ["Bb   Gm", "Got me on my knees", "Am I still here?", "But you're never",
             ".Am", "|Am", "", "   ", "C D E F G A B C D E F G", "C D E F G A B C D E F G A",
             "Am.", "Am,", "Am:", "C/E  G/B", "Hm", "  Dm   ", "Dm Gm", "Am7 (x2)",
             "A7 (E string - 3 1 0)*", "E*", "N.C.", "| Am | F |", "Am - F - C", "C\tG",
             "Ла ла ла", "Ab Eb", "A B C", "A Bad Day", "Am Down", "Cm7b5"]
    split = []
    for lyr, chords in [("Walk to the harbor", [(0, "Am"), (8, "C")]),
                        ("Walk to the harbor", [(5, "C")]),
                        ("(oh)", [(0, "Bb"), (5, "Gm"), (10, "Dm")]),
                        ("", [(0, "C")]), ("abc", []), ("abcdef", [(3, "C"), (3, "D")]),
                        ("abcdef", [(10, "C"), (12, "D")])]:
        split.append({"lyric": lyr, "chords": [list(c) for c in chords],
                      "out": [list(u) for u in sp.split_units(lyr, chords)]})
    dump("sheet.json", {"sources": out,
                        "is_chord_line": [[l, sp.is_chord_line(l)] for l in lines],
                        "chord_positions": [[l, [list(p) for p in sp.chord_positions(l)]]
                                            for l in lines],
                        "split_units": split,
                        "slugify": [[s, songmod.slugify(s)]
                                    for s in ["Bb — Gm — Dm — Am", "Пример Песни", "",
                                              "Ёжик в тумане", "!!!", "abc-DEF_123"]],
                        "plural": [[n, songmod.plural(n, "a", "b", "c")]
                                   for n in list(range(0, 30)) + [101, 111, 112, 121, 1000]]})


# --------------------------------------------------------------- разметка --

def html_fixture():
    g = pg.Grid()
    cards_song, cards_seq = [], []
    for chain in ["Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am",
                  "Dm7 G7 Cmaj7 Em7b5 A7 Dm7", "Am/C G/B Bdim7 C7alt F#m7b5 Cmin13",
                  "Bb(b5)/D Dmadd9/A Bbadd#11 Ebaug C6/9"]:
        syms = [s.symbol for s in pg.parse_progression(chain)]
        for c in sp.build_cards(g, syms):
            cards_song.append({"symbol": c.symbol, "html": sp._card_body(g, c)})
        for v in pg.voice_progression(g, syms, compact=True):
            degs = " · ".join(v.overlay[rc].degree
                              for rc in sorted(v.pads, key=lambda rc: g.midi(*rc)))
            cards_seq.append({"symbol": v.spec.symbol, "describe": v.describe(),
                              "degs": degs,
                              "html": pg.render_html(g, overlay=v.overlay, title=v.spec.symbol,
                                                     subtitle=v.describe(),
                                                     flats=v.spec.prefers_flats,
                                                     spelling=v.spec.spelling(), spec=v.spec,
                                                     live=True,
                                                     meta="ступени <b>%s</b>"
                                                     % webapp.esc(degs))})
    static = {
        "plain": pg.render_html(g),
        "captioned": pg.render_html(g, title="Dm", subtitle="D2 · F2 · A2",
                                    meta="ступени 1 · b3 · 5", key="Dm"),
        "flats": pg.render_html(g, flats=True),
        "template": pg.render_card_template(),
        "template_big": pg.render_card_template(cls="pg big free", caption=False),
        "template_foot": pg.render_card_template(
            foot='<button class="del" title="убрать">&times;</button>'),
    }
    pages = {}
    for name in ("проба", "фонари"):
        song = sp.parse_source(SOURCES[name])
        ch = song.chain(True)
        cards = sp.build_cards(pg.Grid(), ch)
        pages["song:" + name] = sp.build_page(song, cards, pg.Grid(), song.meta["title"], ch,
                                              slug="x")
    for chain in ["Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am", "C G Am F"]:
        pages["seq:" + chain] = songmod.build_page(pg.parse_progression(chain), "Тест")
    pages["find"] = findpage.render_find(None)
    dump("html.json", {"cards_song": cards_song, "cards_seq": cards_seq, "static": static,
                       "pages": pages})
    dump("css.json", {"base": webapp.base_css(), "layout": webapp.layout_css(),
                      "grid": pg.grid_css(), "card_min": webapp.CARD_MIN,
                      "card_max": webapp.CARD_MAX})


if __name__ == "__main__":
    data_fixture()
    parse_fixture()
    voicing_fixture()
    identify_fixture()
    sheet_fixture()
    html_fixture()
