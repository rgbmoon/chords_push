# -*- coding: utf-8 -*-
"""
push_grid — модель нотной сетки Ableton Push + расчёт аккордов + рендер в SVG.

Модель зафиксирована: **Note Mode, Chromatic, раскладка 4ths**.
Визуальная база сетки тоже зафиксирована: тоника C (оранжевая) + гамма C major —
она не меняется, любые аккорды строятся поверх одного и того же визуала.

Без внешних зависимостей (только stdlib). Данные — в push_grid.json рядом.

Быстрый старт
-------------
    from push_grid import Grid, voice_chord, render_chord_svg

    svg = render_chord_svg("Bbmaj7b5")          # готовая схема одного аккорда
    v   = voice_chord(Grid(), "Gm6")            # ноты, пэды, «призраки»

CLI
---
    python3 push_grid.py Bbmaj7b5 -o chord.svg
    python3 push_grid.py --ascii state
"""

from __future__ import annotations

import itertools
import json
import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

__all__ = [
    "DATA", "ROWS", "COLS", "ROW_SEMITONES", "BASE_MIDI",
    "NOTE_SHARP", "NOTE_FLAT", "SCALES", "CHORDS", "ALIASES",
    "Grid", "ChordSpec", "Voicing", "PadMark",
    "note_to_pc", "pc_to_name", "midi_to_name", "interval_short",
    "chord_intervals", "parse_chord_symbol", "parse_progression",
    "chord_pitches", "voice_chord", "voice_progression", "place_chord",
    "all_placements", "invert", "WEIGHTS",
    "find_shape", "shape_to_ascii",
    "render_svg", "render_chord_svg",
    "render_html", "grid_css", "GRID_JS",
]

# ---------------------------------------------------------------- данные ----

_HERE = os.path.dirname(os.path.abspath(__file__))
_JSON = os.path.join(_HERE, "push_grid.json")

with open(_JSON, encoding="utf-8") as _fh:
    DATA = json.load(_fh)

ROWS: int = DATA["grid"]["rows"]
COLS: int = DATA["grid"]["cols"]
ROW_SEMITONES: int = DATA["grid"]["row_offset_semitones"]      # 5 — кварта
BASE_MIDI: int = DATA["grid"]["base_midi"]                     # 36 — C1

NOTE_SHARP: List[str] = DATA["note_names"]["sharp"]
NOTE_FLAT: List[str] = DATA["note_names"]["flat"]
SCALES: Dict[str, dict] = DATA["scales"]
CHORDS: Dict[str, dict] = DATA["chords"]
ALIASES: Dict[str, str] = DATA["chord_aliases"]
PALETTE: dict = DATA["palette"]
RENDER: dict = DATA["render"]

DEGREE_SHORT = ["1", "b2", "2", "b3", "3", "4", "b5", "5", "b6", "6", "b7", "7"]
_INT_SHORT = {int(k): v["short"] for k, v in DATA["intervals"].items()}


def interval_short(n: int) -> str:
    """Короткое имя интервала: 0->'1', 4->'3', 14->'9', 21->'13'."""
    if n in _INT_SHORT:
        return _INT_SHORT[n]
    return DEGREE_SHORT[n % 12]


# ------------------------------------------------------------ утилиты нот ----

_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
_NOTE_RE = re.compile(r"^[A-Ga-g][#b♯♭]*$")


def note_to_pc(name) -> int:
    """'C', 'F#', 'Bb' или int -> класс высоты 0..11."""
    if isinstance(name, int):
        return name % 12
    s = str(name).strip()
    if not s:
        raise ValueError("пустое имя ноты")
    pc = _PC.get(s[0].upper())
    if pc is None:
        raise ValueError("неизвестная нота: %r" % name)
    for ch in s[1:]:
        if ch in "#♯":
            pc += 1
        elif ch in "b♭":
            pc -= 1
        else:
            raise ValueError("неизвестный знак альтерации в %r" % name)
    return pc % 12


def is_note_name(s: str) -> bool:
    return bool(_NOTE_RE.match(s.strip()))


def pc_to_name(pc: int, flats: bool = False) -> str:
    return (NOTE_FLAT if flats else NOTE_SHARP)[pc % 12]


def midi_to_name(midi: int, flats: bool = False, octave: bool = True) -> str:
    """Нотация Ableton: C3 = MIDI 60."""
    n = pc_to_name(midi, flats)
    return "%s%d" % (n, midi // 12 - 2) if octave else n


def scale_steps(scale) -> List[int]:
    if isinstance(scale, (list, tuple)):
        return sorted({int(x) % 12 for x in scale})
    ent = SCALES.get(scale)
    if ent is None:
        raise KeyError("неизвестная гамма: %r (есть: %s)" % (scale, ", ".join(SCALES)))
    return list(ent["steps"])


def chord_intervals(chord) -> List[int]:
    if isinstance(chord, (list, tuple)):
        return list(chord)
    ent = CHORDS.get(chord)
    if ent is None:
        raise KeyError("неизвестный тип аккорда: %r" % (chord,))
    return list(ent["intervals"])



# --------------------------------------------------- правописание нот ------

_LETTERS = "CDEFGAB"
_LETTER_PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}


#: имена, которые нормально читаются на пэде. Fb / Cb / E# / B# и двойные знаки
#: теоретически верны, но для подписи пэда только мешают — их мы не используем.
_SIMPLE_NAMES = set(NOTE_SHARP) | set(NOTE_FLAT)


def spell_from(root_name: str, degree_label: str, pc: int) -> str:
    """Записать ноту по её ступени относительно тоники аккорда.

    'G' + 'b3' + pc=10 -> 'Bb' (а не 'A#'): буква определяется номером ступени,
    знак — тем, что нужно, чтобы попасть в нужный класс высоты.
    """
    m = re.search(r"\d+", degree_label)
    dnum = int(m.group()) if m else 1
    step = (dnum - 1) % 7
    letter = _LETTERS[(_LETTERS.index(root_name[0].upper()) + step) % 7]
    diff = (pc - _LETTER_PC[letter]) % 12
    acc = diff if diff <= 6 else diff - 12
    name = letter + ("#" * acc if acc > 0 else "b" * -acc)
    return name if name in _SIMPLE_NAMES else ""      # "" = пусть решает вызывающий


# ------------------------------------------------------------------ Grid ----

@dataclass
class Grid:
    """Нотная сетка Push: Chromatic, раскладка 4ths.

    root / scale задают только РАСКРАСКУ (какие пэды белые, какой оранжевый).
    Рабочее значение по умолчанию — C major, менять его в проекте не нужно.
    """

    root: object = DATA["default_root"]
    scale: object = DATA["default_scale"]
    base_midi: int = BASE_MIDI
    rows: int = ROWS
    cols: int = COLS

    def __post_init__(self):
        self.root_pc = note_to_pc(self.root)
        self.steps = scale_steps(self.scale)

    # --- координаты <-> высота -------------------------------------------

    def midi(self, r: int, c: int) -> int:
        """MIDI-нота пэда. r — снизу вверх (0..7), c — слева направо (0..7)."""
        if not (0 <= r < self.rows and 0 <= c < self.cols):
            raise IndexError("пэд (%d, %d) вне сетки %dx%d" % (r, c, self.rows, self.cols))
        return self.base_midi + ROW_SEMITONES * r + c

    def pc(self, r: int, c: int) -> int:
        return self.midi(r, c) % 12

    def state(self, r: int, c: int) -> str:
        """'root' | 'in_key' | 'off' — базовая раскраска пэда."""
        rel = (self.pc(r, c) - self.root_pc) % 12
        if rel == 0:
            return "root"
        return "in_key" if rel in self.steps else "off"

    def degree(self, r: int, c: int) -> int:
        return (self.pc(r, c) - self.root_pc) % 12

    def note_name(self, r: int, c: int, flats: bool = False, octave: bool = False) -> str:
        return midi_to_name(self.midi(r, c), flats, octave)

    def pads_of_midi(self, midi: int) -> List[Tuple[int, int]]:
        """Все пэды, играющие эту MIDI-ноту (их бывает несколько)."""
        return [(r, c) for r in range(self.rows) for c in range(self.cols)
                if self.midi(r, c) == midi]

    def pads_of_pc(self, pc: int) -> List[Tuple[int, int]]:
        pc %= 12
        return [(r, c) for r in range(self.rows) for c in range(self.cols)
                if self.pc(r, c) == pc]

    @property
    def lowest_midi(self) -> int:
        return self.midi(0, 0)

    @property
    def highest_midi(self) -> int:
        return self.midi(self.rows - 1, self.cols - 1)

    def unique_pitches(self) -> List[int]:
        return sorted({self.midi(r, c) for r in range(self.rows) for c in range(self.cols)})

    def to_ascii(self, mode: str = "note") -> str:
        """Печать сетки в терминал: note | degree | midi | state."""
        out = []
        for r in range(self.rows - 1, -1, -1):
            cells = []
            for c in range(self.cols):
                if mode == "note":
                    t = self.note_name(r, c)
                elif mode == "degree":
                    t = DEGREE_SHORT[self.degree(r, c)]
                elif mode == "midi":
                    t = str(self.midi(r, c))
                else:
                    t = {"root": "@", "in_key": "o", "off": "."}[self.state(r, c)]
                cells.append("%-3s" % t)
            out.append("r%d | %s" % (r, " ".join(cells)))
        return "\n".join(out)


# ----------------------------------------------------- разбор символа ------

@dataclass
class ChordSpec:
    """Разобранный символ аккорда: 'Bbmaj7b5', 'Am/C', 'Gm6'."""
    symbol: str
    root_pc: int
    kind: str
    intervals: List[int]
    bass_pc: Optional[int] = None
    root_written: str = ""          # как тоника записана в символе: 'Bb', 'F#'
    bass_written: str = ""

    @property
    def degrees(self) -> List[str]:
        ent = CHORDS.get(self.kind)
        if ent and "degrees" in ent:
            return list(ent["degrees"])
        return [interval_short(i) for i in self.intervals]

    @property
    def root_name(self) -> str:
        return self.root_written or pc_to_name(self.root_pc)

    def spelling(self) -> Dict[int, str]:
        """класс высоты -> правильно записанное имя ноты для этого аккорда."""
        out: Dict[int, str] = {}
        rn = self.root_name
        for i, deg in zip(self.intervals, self.degrees):
            pc = (self.root_pc + i) % 12
            out.setdefault(pc, spell_from(rn, deg, pc) or None)
        if self.bass_pc is not None:
            b = self.bass_written if self.bass_written in _SIMPLE_NAMES else None
            out.setdefault(self.bass_pc % 12, b)
        return out

    @property
    def prefers_flats(self) -> bool:
        """Чем писать остальные (не аккордовые) пэды — бемолями или диезами."""
        names = [n for n in self.spelling().values() if n]
        flats = sum(n.count("b") for n in names)
        sharps = sum(n.count("#") for n in names)
        if flats != sharps:
            return flats > sharps
        return "b" in self.root_name

    @property
    def pitch_classes(self) -> List[int]:
        pcs = [(self.root_pc + i) % 12 for i in self.intervals]
        if self.bass_pc is not None and self.bass_pc % 12 not in pcs:
            pcs.append(self.bass_pc % 12)
        return pcs

    def degree_map(self) -> Dict[int, str]:
        """класс высоты -> подпись ступени ('1', 'b3', '9', ...)."""
        out: Dict[int, str] = {}
        for i, deg in zip(self.intervals, self.degrees):
            out.setdefault((self.root_pc + i) % 12, deg)
        if self.bass_pc is not None:
            out.setdefault(self.bass_pc % 12,
                           interval_short((self.bass_pc - self.root_pc) % 12))
        return out


def _lookup_kind(suffix: str) -> Optional[str]:
    """Регистр значим: сначала точное совпадение, потом по нижнему регистру."""
    if suffix in ALIASES:
        return ALIASES[suffix]
    return ALIASES.get(suffix.lower())


def _split_root(sym: str) -> Tuple[int, str, str]:
    m = re.match(r"^([A-Ga-g][#b♯♭]*)(.*)$", sym)
    if not m:
        raise ValueError("не удалось прочитать тонику в %r" % sym)
    written = m.group(1)[0].upper() + m.group(1)[1:].replace("♯", "#").replace("♭", "b")
    return note_to_pc(m.group(1)), m.group(2), written


def parse_chord_symbol(sym: str) -> ChordSpec:
    """'Bbmaj7b5' -> ChordSpec. Понимает слэш-бас ('Am/C') и тип '6/9'.

    Тоника читается «жадно», вместе со знаком альтерации: 'Cb5' = квинта от Cb.
    Мажор с пониженной квинтой пишите со скобками — 'C(b5)' — или как 'Cmajb5'.
    """
    raw = sym.strip()
    if not raw:
        raise ValueError("пустой символ аккорда")
    clean = raw.replace(" ", "")

    # скобки снимаем ТОЛЬКО с суффикса: в 'C(b5)' тоника — C, а не Cb
    def split(sym):
        pc, suf, wr = _split_root(sym)
        return pc, suf.replace("(", "").replace(")", ""), wr

    # сначала пробуем символ целиком — иначе '6/9' развалится на слэш-бас
    root_pc, suffix, written = split(clean)
    kind = _lookup_kind(suffix)
    bass_pc, bass_written = None, ""

    if kind is None and "/" in clean:
        head, tail = clean.rsplit("/", 1)
        if head and is_note_name(tail):
            root_pc, suffix, written = split(head)
            kind = _lookup_kind(suffix)
            bass_pc, _, bass_written = _split_root(tail)

    if kind is None:
        raise ValueError("неизвестный аккорд %r (суффикс %r)" % (raw, suffix))
    return ChordSpec(raw, root_pc, kind, chord_intervals(kind), bass_pc,
                     written, bass_written)


_SPLIT_RE = re.compile(r"[\s,;|–—>→\n\r\t]+")


def parse_progression(text: str) -> List[ChordSpec]:
    """'Bb Gm A' или 'Bb | Gm -> A' -> список ChordSpec.

    Подряд идущие повторы одного символа схлопываются в один.
    """
    tokens = [t for t in _SPLIT_RE.split(text.replace("->", " ")) if t and t not in ("-", "|")]
    out: List[ChordSpec] = []
    for t in tokens:
        spec = parse_chord_symbol(t)
        if out and out[-1].symbol == spec.symbol:
            continue
        out.append(spec)
    return out


# --------------------------------------------------------------- аккорды ----

def chord_pitches(spec: ChordSpec, low: int = 48) -> List[int]:
    """MIDI-ноты аккорда. Рут кладём в октаву, начинающуюся с `low`.

    Слэш-бас опускается ниже рута и становится нижним голосом.
    """
    root = low + ((spec.root_pc - low) % 12)
    notes = [root + i for i in spec.intervals]
    if spec.bass_pc is not None:
        b = root + ((spec.bass_pc - root) % 12)
        while b >= min(notes):
            b -= 12
        notes = [n for n in notes if n % 12 != spec.bass_pc % 12] + [b]
    return sorted(notes)


def span_cols(cells: Sequence[Tuple[int, int]]) -> int:
    """Сколько колонок грида занимает фигура — это и есть «ширина под руку»."""
    cs = [c for _, c in cells]
    return max(cs) - min(cs) + 1


def span_rows(cells: Sequence[Tuple[int, int]]) -> int:
    rs = [r for r, _ in cells]
    return max(rs) - min(rs) + 1


def _cost(cells: Sequence[Tuple[int, int]], compact: bool = False) -> tuple:
    rs = [r for r, _ in cells]
    cs = [c for _, c in cells]
    h = max(rs) - min(rs)
    w = max(cs) - min(cs)
    if compact:      # колонки дороже рядов: рука разъезжается именно вбок
        return (w * 3 + h, w, h, min(rs), min(cs))
    return (h * 3 + w, w, h, min(rs), min(cs))


def all_placements(grid: Grid, pitches: Sequence[int], limit: Optional[int] = None,
                   max_cols: Optional[int] = None, compact: bool = False
                   ) -> List[List[Tuple[int, int]]]:
    """Все способы разложить набор нот по пэдам, от самого компактного.

    Одна и та же нота лежит на нескольких пэдах, поэтому вариантов больше одного —
    именно из них солвер и выбирает тот, что ближе к предыдущему аккорду.

    max_cols  — потолок занятых колонок. Если в него не влезает ни один вариант
                (бывает у широких аккордов), потолок отпускается по шагам
                `relax_cols`, а не выбрасывает аккорд совсем.
    """
    cand = []
    for m in sorted(pitches):
        pads = grid.pads_of_midi(m)
        if not pads:
            return []
        cand.append(pads)
    out = []
    for combo in itertools.product(*cand):
        if len(set(combo)) != len(combo):
            continue
        out.append((span_cols(combo), _cost(combo, compact), list(combo)))
    if not out:
        return []
    sel = out
    if max_cols:
        for cap in [max_cols] + list(COMPACT.get("relax_cols", ())):
            fit = [x for x in out if x[0] <= cap]
            if fit:
                sel = fit
                break
    sel = sorted(sel, key=lambda x: x[1])
    return [p for _w, _k, p in (sel[:limit] if limit else sel)]


def place_chord(grid: Grid, pitches: Sequence[int],
                max_span_cols: Optional[int] = None,
                max_span_rows: Optional[int] = None) -> Optional[List[Tuple[int, int]]]:
    """Разложить конкретные MIDI-ноты по пэдам, выбрав компактную аппликатуру."""
    cand = []
    for m in sorted(pitches):
        pads = grid.pads_of_midi(m)
        if not pads:
            return None
        cand.append(pads)
    best = None
    for combo in itertools.product(*cand):
        if len(set(combo)) != len(combo):
            continue
        rs = [r for r, _ in combo]
        cs = [c for _, c in combo]
        if max_span_cols is not None and max(cs) - min(cs) > max_span_cols:
            continue
        if max_span_rows is not None and max(rs) - min(rs) > max_span_rows:
            continue
        k = _cost(combo)
        if best is None or k < best[0]:
            best = (k, list(combo))
    return best[1] if best else None


def invert(pitches: Sequence[int], n: int = 1) -> List[int]:
    """n-е обращение: n нижних голосов переносятся на октаву вверх."""
    p = sorted(pitches)
    for _ in range(n % max(1, len(p))):
        p = sorted(p[1:] + [p[0] + 12])
    return p


@dataclass
class PadMark:
    """Пометка на пэде для рендера."""
    degree: str
    is_root: bool
    ghost: bool
    midi: Optional[int] = None


@dataclass
class Voicing:
    spec: ChordSpec
    notes: List[int]
    pads: List[Tuple[int, int]]
    ghosts: List[Tuple[int, int]]
    overlay: Dict[Tuple[int, int], PadMark] = field(default_factory=dict)
    inversion: int = 0
    move: Optional[float] = None    # насколько сдвинулась рука от прошлого аккорда

    @property
    def note_names(self) -> List[str]:
        sp = self.spec.spelling()
        out = []
        for m in self.notes:
            nm = sp.get(m % 12) or pc_to_name(m % 12, self.spec.prefers_flats)
            out.append("%s%d" % (nm, m // 12 - 2))
        return out

    @property
    def bass(self) -> int:
        return min(self.notes)

    def describe(self) -> str:
        s = " ".join(self.note_names)
        if self.inversion:
            s += "  ·  %d-е обращение" % self.inversion
        return s


def _build_overlay(grid: Grid, spec: ChordSpec, pads: Sequence[Tuple[int, int]],
                   ghosts: bool):
    dmap = spec.degree_map()
    overlay: Dict[Tuple[int, int], PadMark] = {}
    for r, c in pads:
        pc = grid.pc(r, c)
        overlay[(r, c)] = PadMark(dmap.get(pc, "?"), pc == spec.root_pc, False,
                                  grid.midi(r, c))
    ghost_pads: List[Tuple[int, int]] = []
    if ghosts:
        pcs = set(spec.pitch_classes)
        for r in range(grid.rows):
            for c in range(grid.cols):
                if (r, c) in overlay:
                    continue
                pc = grid.pc(r, c)
                if pc in pcs:
                    ghost_pads.append((r, c))
                    overlay[(r, c)] = PadMark(dmap.get(pc, "?"), pc == spec.root_pc,
                                              True, grid.midi(r, c))
    return overlay, ghost_pads


def voice_chord(grid: Grid, chord, low_candidates: Sequence[int] = (48, 43, 53, 36),
                ghosts: bool = True, compact: bool = True) -> Voicing:
    """Выбрать голосоведение аккорда и разложить его по пэдам.

    Возвращает Voicing: сами ноты, пэды выбранной аппликатуры и «призраки» —
    все прочие пэды с теми же классами высот (обращения и другие октавы).
    """
    spec = chord if isinstance(chord, ChordSpec) else parse_chord_symbol(str(chord))
    chosen = None
    for low in low_candidates:
        notes = chord_pitches(spec, low=low)
        if notes[0] < grid.lowest_midi or notes[-1] > grid.highest_midi:
            continue
        cap = COMPACT["max_cols"] if compact else None
        got = all_placements(grid, notes, limit=1, max_cols=cap, compact=compact)
        if got:
            chosen = (notes, got[0])
            break
    if chosen is None:
        raise ValueError("аккорд %s не помещается в диапазон сетки (%s..%s)"
                         % (spec.symbol, midi_to_name(grid.lowest_midi),
                            midi_to_name(grid.highest_midi)))
    notes, pads = chosen
    overlay, ghost_pads = _build_overlay(grid, spec, pads, ghosts)
    return Voicing(spec, notes, pads, ghost_pads, overlay)


# ------------------------------------------- голосоведение по цепочке ------
#
# Одна и та же гармония ложится на грид десятками способов: разные обращения,
# разные октавы, и для каждой ноты — несколько пэдов. Поэтому выбор аппликатуры
# для аккорда имеет смысл делать не в одиночку, а с оглядкой на соседей:
# рука должна ходить по гриду как можно меньше.
#
# Считаем это динамическим программированием (Витерби) по всей цепочке:
#   состояние    = конкретный вариант (набор нот + набор пэдов) одного аккорда
#   цена узла    = компактность фигуры + регистр + штраф за обращение
#   цена перехода= голосоведение (в полутонах) + сдвиг руки (в пэдах)
#                  − премия за каждый пэд, который остаётся зажатым

WEIGHTS = dict(DATA["voice_leading"]["weights"])
COMPACT = dict(DATA["voice_leading"]["compact_mode"])


def _centroid(pads):
    return (sum(r for r, _ in pads) / len(pads), sum(c for _, c in pads) / len(pads))


def _voice_distance(prev: Sequence[int], cur: Sequence[int]) -> float:
    """Среднее движение голосов в полутонах (симметрично, для разных размеров)."""
    if not prev or not cur:
        return 0.0
    a = sum(min(abs(n - p) for p in prev) for n in cur) / len(cur)
    b = sum(min(abs(p - n) for n in cur) for p in prev) / len(prev)
    return (a + b) / 2.0


def _node_cost(grid: Grid, notes, pads, inversion: int, compact_mode: bool = False) -> float:
    rs = [r for r, _ in pads]
    cs = [c for _, c in pads]
    h, w = max(rs) - min(rs), max(cs) - min(cs)
    if compact_mode:
        compact = COMPACT["row_weight"] * h + COMPACT["col_weight"] * w
    else:
        compact = h * 3 + w
    # «удобство места»: середина грида лучше краёв — там больше вариантов рядом
    mid_r, mid_c = (grid.rows - 1) / 2.0, (grid.cols - 1) / 2.0
    cr, cc = _centroid(pads)
    edge = (abs(cr - mid_r) / mid_r + abs(cc - mid_c) / mid_c) / 2.0
    inv_pen = 0.0 if inversion == 0 else (WEIGHTS["inversion"]
                                          + WEIGHTS["inversion_step"] * (inversion - 1))
    return (WEIGHTS["compact"] * compact / 4.0
            + WEIGHTS["register"] * edge
            + inv_pen)


def _edge_cost(prev_notes, prev_pads, notes, pads) -> Tuple[float, int, float]:
    voice = _voice_distance(prev_notes, notes)
    (pr, pc_), (cr, cc) = _centroid(prev_pads), _centroid(pads)
    hand = ((cr - pr) ** 2 + (cc - pc_) ** 2) ** 0.5
    holds = len(set(prev_pads) & set(pads))
    cost = WEIGHTS["voice"] * voice + WEIGHTS["hand"] * hand - WEIGHTS["hold"] * holds
    return cost, holds, hand


def _candidates(grid: Grid, spec: ChordSpec, max_placements: int = 6,
                lows: Sequence[int] = (36, 41, 43, 48, 53, 55, 60),
                allow_inversions: bool = False, compact: bool = False):
    """Все разумные варианты (ноты, пэды, номер обращения) для одного аккорда.

    По умолчанию обращения НЕ перебираются: смена баса меняет звучание аккорда,
    а солвер не должен подменять гармонию ради удобства руки. Свободы всё равно
    хватает — октава плюс выбор пэда для каждой ноты (§3.2 GRID_SPEC).
    """
    seen = set()
    out = []
    n = len(spec.intervals)
    # у слэш-аккорда бас задан явно — его тоже не трогаем
    inversions = tuple(range(n)) if (allow_inversions and spec.bass_pc is None) else (0,)
    for low in lows:
        base = chord_pitches(spec, low=low)
        for inv in inversions:
            notes = invert(base, inv) if inv else list(base)
            key = tuple(notes)
            if key in seen:
                continue
            seen.add(key)
            if notes[0] < grid.lowest_midi or notes[-1] > grid.highest_midi:
                continue
            cap = COMPACT["max_cols"] if compact else None
            for pads in all_placements(grid, notes, limit=max_placements,
                                       max_cols=cap, compact=compact):
                out.append((notes, pads, inv))
    return out


def voice_progression(grid: Grid, chords: Sequence, ghosts: bool = True,
                      voice_leading: bool = True, allow_inversions: bool = False,
                      max_placements: int = 6, compact: bool = True) -> List[Voicing]:
    """Подобрать аппликатуры для всей последовательности сразу.

    voice_leading=False    — каждый аккорд выбирается сам по себе (просто компактно).
    allow_inversions=True  — разрешить солверу менять бас. По умолчанию ВЫКЛЮЧЕНО:
                             структура аккорда важнее удобства, рут остаётся в басу.
    compact=True           — держать фигуру в `compact_mode.max_cols` колонках, чтобы
                             аккорд брался одной рукой. compact=False — как раньше:
                             солвер жмёт фигуру по рядам и разъезжается по колонкам.
    """
    specs = [c if isinstance(c, ChordSpec) else parse_chord_symbol(str(c)) for c in chords]
    if not specs:
        return []
    if not voice_leading:
        return [voice_chord(grid, s, ghosts=ghosts, compact=compact) for s in specs]

    cands = []
    for spec in specs:
        cs = _candidates(grid, spec, max_placements,
                         allow_inversions=allow_inversions, compact=compact)
        if not cs:
            raise ValueError("аккорд %s не помещается в диапазон сетки (%s..%s)"
                             % (spec.symbol, midi_to_name(grid.lowest_midi),
                                midi_to_name(grid.highest_midi)))
        cands.append(cs)

    # прямой проход
    best = [_node_cost(grid, n, p, i, compact) for n, p, i in cands[0]]
    back: List[List[int]] = [[-1] * len(cands[0])]
    for k in range(1, len(cands)):
        cur = []
        ptr = []
        for notes, pads, inv in cands[k]:
            node = _node_cost(grid, notes, pads, inv, compact)
            bi, bv = 0, float("inf")
            for j, (pn, pp, _) in enumerate(cands[k - 1]):
                e, _h, _d = _edge_cost(pn, pp, notes, pads)
                v = best[j] + e
                if v < bv:
                    bi, bv = j, v
            cur.append(bv + node)
            ptr.append(bi)
        best, _ = cur, None
        back.append(ptr)

    # обратный проход
    idx = min(range(len(best)), key=lambda i: best[i])
    chain = [idx]
    for k in range(len(cands) - 1, 0, -1):
        idx = back[k][idx]
        chain.append(idx)
    chain.reverse()

    out: List[Voicing] = []
    prev_pads: Optional[List[Tuple[int, int]]] = None
    prev_notes: Optional[List[int]] = None
    for k, spec in enumerate(specs):
        notes, pads, inv = cands[k][chain[k]]
        move = None
        if prev_pads:
            _c, _h, move = _edge_cost(prev_notes, prev_pads, notes, pads)
        overlay, ghost_pads = _build_overlay(grid, spec, pads, ghosts)
        out.append(Voicing(spec, list(notes), list(pads), ghost_pads, overlay,
                           inv, move))
        prev_pads, prev_notes = pads, notes
    return out


# ------------------------------------------------------- фигуры (ASCII) ----

def find_shape(chord, dr_max: int = 4, anchor_root: bool = True
               ) -> Optional[List[Tuple[int, int]]]:
    """Позиционно-независимая ФИГУРА аккорда: список векторов (Δряд, Δколонка)."""
    iv = chord.intervals if isinstance(chord, ChordSpec) else chord_intervals(chord)
    cand = []
    for k, n in enumerate(iv):
        opts = [(dr, n - ROW_SEMITONES * dr) for dr in range(dr_max + 1)
                if -(COLS - 1) <= n - ROW_SEMITONES * dr <= COLS - 1]
        if anchor_root and k == 0:
            opts = [(0, 0)] if (0, 0) in opts else opts[:1]
        if not opts:
            return None
        cand.append(opts)
    best = None
    for combo in itertools.product(*cand):
        if len(set(combo)) != len(combo):
            continue
        cs = [c for _, c in combo]
        if max(cs) - min(cs) > COLS - 1:
            continue
        k = _cost(combo)
        if best is None or k < best[0]:
            best = (k, list(combo))
    return best[1] if best else None


def shape_to_ascii(shape: Sequence[Tuple[int, int]], chord=None) -> str:
    iv = (chord.intervals if isinstance(chord, ChordSpec)
          else chord_intervals(chord)) if chord is not None else None
    labels = {}
    for k, (dr, dc) in enumerate(shape):
        labels[(dr, dc)] = interval_short(iv[k]) if iv else "x"
    rs = [r for r, _ in shape]
    cs = [c for _, c in shape]
    lines = []
    for dr in range(max(rs), min(rs) - 1, -1):
        row = []
        for dc in range(min(cs), max(cs) + 1):
            row.append("[%s]" % labels[(dr, dc)].center(3) if (dr, dc) in labels else "  .  ")
        lines.append("".join(row))
    return "\n".join(lines)


# ------------------------------------------------------------ рендер SVG ----

def _esc(s) -> str:
    return (str(s).replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _grad_def(gid: str, stops: Sequence[str], g: dict) -> str:
    offs = g.get("offsets") or [i / (len(stops) - 1.0) for i in range(len(stops))]
    body = "".join('<stop offset="%.4g" stop-color="%s"/>' % (o, s)
                   for o, s in zip(offs, stops))
    return ('<radialGradient id="%s" cx="%.4g" cy="%.4g" r="%.4g">%s</radialGradient>'
            % (gid, g.get("cx", .5), g.get("cy", .5), g.get("r", .72), body))


def render_svg(grid: Grid,
               overlay: Optional[Dict[Tuple[int, int], PadMark]] = None,
               labels: str = "note",
               degrees: bool = True,
               title: Optional[str] = None,
               subtitle: Optional[str] = None,
               flats: bool = False,
               spelling: Optional[Dict[int, Optional[str]]] = None,
               scale: float = 1.0,
               responsive: bool = True,
               id_prefix: str = "g") -> str:
    """SVG-картинка сетки.

    overlay    — {(r, c): PadMark}: ноты аккорда (ghost=False) и обращения (ghost=True)
    labels     — 'note' | 'midi' | 'none'
    degrees    — дописывать ступень в скобках под нотами аккорда
    spelling   — {класс высоты: имя} для нот аккорда (Gm -> Bb, а не A#)
    responsive — без фиксированных width/height: svg тянется по ширине контейнера
    """
    R = RENDER
    overlay = overlay or {}
    pw, ph = R["pad_w"] * scale, R["pad_h"] * scale
    gx, gy = R["gap_x"] * scale, R["gap_y"] * scale
    rad, mar = R["corner_radius"] * scale, R["margin"] * scale
    fs = R["label"]["font_size"] * scale
    sfs = R["sublabel"]["font_size"] * scale
    sdy = R["sublabel"]["dy"] * scale
    ff = _esc(R["label"]["font_family"])

    head = 0.0
    if title:
        head += fs * 1.75
    if subtitle:
        head += fs * 1.25

    W = mar * 2 + grid.cols * pw + (grid.cols - 1) * gx
    H = mar * 2 + grid.rows * ph + (grid.rows - 1) * gy + head

    states = PALETTE["states"]
    used = {"root", "in_key", "off"}
    for mark in overlay.values():
        used.add("chord_root" if mark.is_root else "chord")
    defs = "".join(_grad_def(id_prefix + "_" + k, states[k]["stops"], R["gradient"])
                   for k in sorted(used))

    if responsive:
        size = ('width="%s" preserveAspectRatio="%s" style="%s"'
                % (R["responsive"]["width_attr"],
                   R["responsive"]["preserve_aspect_ratio"],
                   R["responsive"]["style"]))
    else:
        size = 'width="%.1f" height="%.1f"' % (W, H)

    p = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %.1f %.1f" %s role="img">'
         % (W, H, size)]
    if title:
        p.append("<title>%s</title>" % _esc(title))
    p.append("<defs>%s</defs>" % defs)
    p.append('<rect x="0" y="0" width="%.1f" height="%.1f" rx="%.1f" fill="%s"/>'
             % (W, H, rad * 1.4, PALETTE["background"]))
    if title:
        p.append('<text x="%.1f" y="%.1f" fill="#eef2ef" font-family="%s" font-size="%.1f" '
                 'font-weight="700">%s</text>' % (mar, mar + fs, ff, fs * 1.15, _esc(title)))
    if subtitle:
        p.append('<text x="%.1f" y="%.1f" fill="#8b9691" font-family="%s" font-size="%.1f">'
                 '%s</text>' % (mar, mar + fs * (2.6 if title else 1.0), ff, fs * 0.82,
                                _esc(subtitle)))

    gop = PALETTE.get("ghost_opacity", 0.34)

    for r in range(grid.rows - 1, -1, -1):
        for c in range(grid.cols):
            x = mar + c * (pw + gx)
            y = mar + head + (grid.rows - 1 - r) * (ph + gy)
            base = grid.state(r, c)
            mark = overlay.get((r, c))
            tint = ("chord_root" if mark.is_root else "chord") if mark else None

            if mark and not mark.ghost:
                p.append('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" '
                         'fill="url(#%s_%s)"/>' % (x, y, pw, ph, rad, id_prefix, tint))
                p.append('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" '
                         'fill="none" stroke="#ffffff" stroke-opacity="0.9" '
                         'stroke-width="%.2f"/>'
                         % (x + scale, y + scale, pw - 2 * scale, ph - 2 * scale,
                            rad, 2.2 * scale))
                col = states[tint]["label_color"]
                sub_op = 0.85
            else:
                p.append('<rect x="%.2f" y="%.2f" width="%.2f" height="%.2f" rx="%.2f" '
                         'fill="url(#%s_%s)"/>' % (x, y, pw, ph, rad, id_prefix, base))
                col = states[base]["label_color"]
                sub_op = R["sublabel"]["opacity"]
                if mark:  # призрак: полупрозрачная заливка поверх базового пэда
                    p.append('<rect class="gh" x="%.2f" y="%.2f" width="%.2f" height="%.2f" '
                             'rx="%.2f" fill="url(#%s_%s)" opacity="%.2f"/>'
                             % (x, y, pw, ph, rad, id_prefix, tint, gop))

            if labels == "note":
                main = None
                if spelling:
                    main = spelling.get(grid.pc(r, c))
                if not main:
                    main = grid.note_name(r, c, flats)
            elif labels == "midi":
                main = str(grid.midi(r, c))
            else:
                main = ""
            sub = "(%s)" % mark.degree if (mark and degrees) else ""

            if main:
                dy = -sdy * 0.34 if sub else 0.0
                cls = ' class="lbl"' if (mark and mark.ghost) else ""
                p.append('<text%s x="%.2f" y="%.2f" fill="%s" font-family="%s" '
                         'font-size="%.2f" font-weight="%s" text-anchor="middle" '
                         'dominant-baseline="central">%s</text>'
                         % (cls, x + pw / 2, y + ph / 2 + dy, col, ff, fs,
                            R["label"]["font_weight"], _esc(main)))
            if sub:
                p.append('<text%s x="%.2f" y="%.2f" fill="%s" fill-opacity="%.2f" '
                         'font-family="%s" font-size="%.2f" font-weight="%s" '
                         'text-anchor="middle" dominant-baseline="central">%s</text>'
                         % (' class="gh"' if mark.ghost else "",
                            x + pw / 2, y + ph / 2 + sdy * 0.72, col, sub_op, ff, sfs,
                            R["sublabel"]["font_weight"], _esc(sub)))
    p.append("</svg>")
    render_svg.last_size = (W, H)
    return "".join(p)


def render_chord_svg(chord, grid: Optional[Grid] = None, title: Optional[str] = None,
                     subtitle: Optional[str] = None, ghosts: bool = True,
                     id_prefix: str = "g", **kw) -> str:
    """Готовая схема одного аккорда на сетке Push."""
    g = grid or Grid()
    v = voice_chord(g, chord, ghosts=ghosts)
    if title is None:
        title = v.spec.symbol
    if subtitle is None:
        subtitle = " · ".join(v.note_names)
    kw.setdefault("flats", v.spec.prefers_flats)
    kw.setdefault("spelling", v.spec.spelling())
    return render_svg(g, overlay=v.overlay, title=title, subtitle=subtitle,
                      id_prefix=id_prefix, **kw)


# ------------------------------------------------------------ HTML-схемы ----
#
# Схемы на странице рисуются HTML'ом, а не SVG. Причины две:
#
#   1) РАЗМЕР ПОДПИСЕЙ. В SVG текст живёт внутри viewBox и уменьшается вместе с
#      картинкой: на колонке 260px имя ноты падало до 7px и читать было нечего.
#      В HTML размер задан через clamp() и снизу упирается в пол — схема может
#      быть мелкой, буквы читаемыми.
#   2) КЛИК ПО ПЭДУ. Аппликатура на странице перестаёт быть картинкой: солвер
#      предлагает свой вариант, а рука человека его переопределяет.
#
# SVG никуда не делся — он остался форматом ЭКСПОРТА (флаг --svg), где текст
# внутри картинки и должен масштабироваться вместе с ней.

def _grad_css(stops: Sequence[str], g: dict) -> str:
    """Тот же радиальный градиент пэда, что в SVG, только средствами CSS."""
    offs = g.get("offsets") or [i / (len(stops) - 1.0) for i in range(len(stops))]
    r = g.get("r", .72) * 100
    body = ", ".join("%s %.4g%%" % (s, o * 100) for o, s in zip(offs, stops))
    return ("radial-gradient(ellipse %.4g%% %.4g%% at %.4g%% %.4g%%, %s)"
            % (r, r, g.get("cx", .5) * 100, g.get("cy", .5) * 100, body))


def grid_css() -> str:
    """CSS схемы. Цвета и пропорции берутся из push_grid.json, а не из головы."""
    R, st = RENDER, PALETTE["states"]
    W = R["margin"] * 2 + COLS * R["pad_w"] + (COLS - 1) * R["gap_x"]
    var = "".join("--g-%s:%s;--l-%s:%s;" % (k, _grad_css(v["stops"], R["gradient"]),
                                            k, v["label_color"])
                  for k, v in st.items())
    return """
/* Схема — это ПЛОТНАЯ вещь: их на странице сразу столько, сколько аккордов в песне,
   и все должны быть видны без прокрутки. Отсюда два правила.
   1. Кегль НЕ привязан к ширине схемы (было clamp(...,3.1cqw,15px)) — иначе «сжать
      схему» автоматически значило «уменьшить текст». Имя ноты 14px, ступень 9-10px
      рядом с ним — и схема живёт в 300px вместо 380.
   2. Обвязка стоит дороже сетки: 94px хрома на 205px сетки. Поэтому имя аккорда и
      ступени сведены в ОДНУ строку над сеткой, а рамки-обёртки нет вовсе. */
.pg{%(vars)s container-type:inline-size;background:%(bg)s;border-radius:11px;
  padding:7px;font-family:%(ff)s;min-width:0}
/* подпись НАД сеткой: имя аккорда слева, ступени справа. ОБЕ половины обязаны
   уметь сжиматься (min-width:0) и переноситься — иначе аккорд с десятком
   выделенных руками нот распирает строку, а с ней и всю карточку */
.pg .pgcap{display:flex;flex-wrap:wrap;align-items:baseline;
  justify-content:space-between;gap:2px 10px;margin-bottom:6px}
.pg .pgh{display:flex;align-items:baseline;gap:7px;min-width:0;flex:1 1 auto}
.pg .sym{font-size:14px;font-weight:700;color:#eef2ef;letter-spacing:-.01em;
  flex:0 0 auto}
.pg .sub{font-size:11.5px;color:#8b9691;min-width:0;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.pg .pads{display:grid;grid-template-columns:repeat(%(cols)d,1fr);
  gap:%(gy).3gcqw %(gx).3gcqw}
/* grid, а не flex: у flex с align-items:baseline подпись прилипает к ВЕРХУ пэда
   (0px сверху, 13px снизу — так работает выравнивание по базовой линии). В гриде
   align-content:center центрирует саму строку, а align-items:baseline при этом
   продолжает сажать ступень на общую с именем базовую линию */
.pg .p{position:relative;aspect-ratio:%(pw).4g/%(ph).4g;border-radius:%(rad).3gcqw;
  display:grid;grid-auto-flow:column;align-content:center;justify-content:center;
  align-items:baseline;gap:1.5px;line-height:1;user-select:none;overflow:hidden}
.pg .p b{position:relative;z-index:1;font-weight:600;
  font-size:clamp(14px,3.1cqw,15px)}
/* ступень стоит СБОКУ от имени, а не под ним: снизу она упиралась в край пэда
   и обрезалась — скобки вылезают за строку при line-height:1. Скобок больше нет,
   они стоили 6px ширины, а её тут в обрез: «Bb bb7» у dim7 занимает 36px при
   пэде 36px */
.pg .p u{display:none;position:relative;z-index:1;text-decoration:none;
  font-weight:700;opacity:.8;letter-spacing:-.2px;
  font-size:clamp(9px,2.1cqw,10.5px)}
.pg .p u.l3{font-size:clamp(8.5px,1.95cqw,10px);letter-spacing:-.35px}
/* ступень подписана только там, где нота выбрана: у нот аккорда, у их обращений
   и у нот, добавленных руками. У остальных 64 пэдов подпись лежит в разметке
   наготове — JS её просто показывает, ничего не сочиняя */
.pg .p.on u,.pg .p.gh u,.pg .p.ex u{display:block}
.pg .p.b-root{background:var(--g-root);color:var(--l-root)}
.pg .p.b-in_key{background:var(--g-in_key);color:var(--l-in_key)}
.pg .p.b-off{background:var(--g-off);color:var(--l-off)}
.pg .p.on{background:var(--g-chord);color:var(--l-chord);
  box-shadow:inset 0 0 0 max(1px,.36cqw) rgba(255,255,255,.9)}
.pg .p.on.rt{background:var(--g-chord_root);color:var(--l-chord_root)}
.pg .p.gh::after{content:"";position:absolute;inset:0;border-radius:inherit;
  background:var(--g-chord);opacity:%(gop).2g}
.pg .p.gh.rt::after{background:var(--g-chord_root)}
.pg .p.gh{cursor:pointer}
.pg .p.gh:hover::after{opacity:.72}
.pg .p:focus-visible{outline:2px solid #8fdcff;outline-offset:1px}
/* нота, добавленная руками: НЕ из аккорда, поэтому и цвет не из палитры аккорда,
   и рамка не белая — сразу видно, что это отсебятина, а не часть гармонии */
.pg .p.ex{background:var(--g-extra);color:var(--l-extra);
  box-shadow:inset 0 0 0 max(1px,.36cqw) %(exedge)s}
.pg .p.ex::after{display:none}
.pg .pads{cursor:pointer}
.pg .p.on{cursor:default}   /* ноту аккорда снять нельзя — гармония не рушится */
.pg .pgf{display:flex;align-items:baseline;gap:7px;justify-content:flex-end;
  min-width:0;flex:0 1 auto;font-size:11.5px;color:#8b9691}
.pg .pgm{min-width:0}
.pg .pgm b{color:#e9efeb;font-weight:600}
.pg .pgm .exd{color:%(exedge)s;font-weight:600}
.pg .sub .exd{color:%(exedge)s}
.pg .rs{display:none;background:#1b2320;color:#cdd6d1;border:1px solid #26312d;
  border-radius:6px;font:inherit;font-size:11px;line-height:1;padding:3px 6px;
  cursor:pointer}
.pg .rs:hover{border-color:#3ea0cc;color:#eef2ef}
/* подпись обращения: пока схема такая, как её выбрал солвер, писать нечего —
   он бас не трогает. Появляется ровно тогда, когда бас переставили руками.
   Рамки вокруг изменённой схемы нет — она кричала на всю карточку. Вместо неё
   маленькая точка у имени аккорда */
.pg .vlab{display:none;color:#4fd98a;font-weight:600}
.pg.edited .rs,.pg.edited .vlab{display:inline-block}
.pg.edited .sym::after{content:"";display:inline-block;width:5px;height:5px;
  border-radius:50%%;background:#4fd98a;margin-left:5px;vertical-align:middle}
@media print{
  .pg .rs{display:none}
  .pg .p{box-shadow:none}
}
""" % {"vars": var, "bg": PALETTE["background"], "cols": COLS,
       "ff": R["label"]["font_family"],
       "pw": R["pad_w"], "ph": R["pad_h"], "rad": R["corner_radius"] / W * 100,
       "gx": R["gap_x"] / W * 100, "gy": R["gap_y"] / W * 100,
       "gop": PALETTE.get("ghost_opacity", .4),
       "exedge": PALETTE.get("extra_edge", "#e0c2ff")}


GRID_JS = r"""
// Схемы аккордов. Два жеста, оба — клик по пэду:
//   по пэду ноты, которая уже в аккорде — переносит на него этот голос;
//   по любому другому                   — добавляет ноту руками (в аккорд не входит).
// Если после переноса в басу оказалась не тоника, схема коротко подписывает,
// какое обращение получилось. Никакой музыкальной математики сверх этого здесь
// нет: имена нот и ступени уже лежат в разметке каждого пэда, JS их только
// показывает. d.pcs идёт по порядку ступеней от рута — отсюда и номер обращения.
(function(){
  var INV=['осн. вид','1-е обращение','2-е обращение','3-е обращение',
           '4-е обращение','5-е обращение'];
  function midi(p){return 36+5*((p/8)|0)+(p%8);}
  function oct(m){return Math.floor(m/12)-2;}

  document.querySelectorAll('.pg').forEach(function(pg){
    var tag=pg.querySelector('script.pgd'); if(!tag) return;
    var d=JSON.parse(tag.textContent);
    // в DOM пэды идут сверху вниз, а нумерация — снизу вверх: ходим по data-p
    var pads={};
    pg.querySelectorAll('.p').forEach(function(el){pads[+el.dataset.p]=el;});
    var sub=pg.querySelector('.sub'), meta=pg.querySelector('.pgm');
    var lab=pg.querySelector('.vlab'), rs=pg.querySelector('.rs');
    var cur=d.o.slice(), ext=[], key=pg.dataset.key||'', edited=false;

    function byMidi(a,b){return midi(a)-midi(b);}
    function isChord(i){return d.pcs.indexOf(midi(i)%12)>=0;}
    function nameOf(i){return pads[i].querySelector('b').textContent+oct(midi(i));}
    function degOf(i){var u=pads[i].querySelector('u');return u?u.textContent:'?';}
    function sorted(a){return a.slice().sort(byMidi);}

    function apply(){
      var on={}, ex={};
      cur.forEach(function(p){on[p]=1;});
      ext.forEach(function(p){ex[p]=1;});
      Object.keys(pads).forEach(function(k){
        var i=+k, el=pads[i];
        var isOn=!!on[i], isEx=!!ex[i], gh=!isOn&&!isEx&&isChord(i);
        el.classList.toggle('on',isOn);
        el.classList.toggle('ex',isEx);
        el.classList.toggle('gh',gh);
        el.classList.toggle('rt',(isOn||gh)&&midi(i)%12===d.rt);
        if(gh||isEx) el.setAttribute('tabindex','0'); else el.removeAttribute('tabindex');
      });
      var s=sorted(cur), e=sorted(ext);
      sub.innerHTML=s.map(nameOf).join(' · ')
        +(e.length?' <span class="exd">+ '+e.map(nameOf).join(' · ')+'</span>':'');
      // у добавленных руками нот ступени повторяются (одна и та же нота в разных
      // октавах) — в списке от повтора никакого смысла, только длина
      var ed=[]; e.map(degOf).forEach(function(x){if(ed.indexOf(x)<0) ed.push(x);});
      meta.innerHTML='ступени <b>'+s.map(degOf).join(' · ')+'</b>'
        +(ed.length?' <span class="exd">+ '+ed.join(' · ')+'</span>':'');
      var same=cur.length===d.o.length
        &&s.every(function(p,k){return p===sorted(d.o)[k];});
      edited=!same||e.length>0;
      pg.classList.toggle('edited',edited);
      // подписываем обращение только если руками двигали САМ аккорд: добавленные
      // сбоку ноты бас не меняют, и писать «осн. вид» просто так незачем
      if(lab) lab.textContent=same?'':(INV[d.pcs.indexOf(midi(s[0])%12)]||'');
    }

    // наружу отдаём ровно то, что человек накликал; вернул как было — null,
    // чтобы в файле не копились записи «эта схема не изменена»
    function persist(){
      if(!key||!window.PG_SAVE) return;
      window.PG_SAVE(key, edited?{pads:sorted(cur),extra:sorted(ext)}:null);
    }
    // обратный ход: хранилище отдаёт сохранённую правку, схема её принимает.
    // Число нот аккорда сверяем — источник мог поменяться под тем же именем
    pg.__pgSet=function(st){
      if(st&&st.pads&&st.pads.length===d.o.length){
        cur=st.pads.slice(); ext=(st.extra||[]).slice();
      }else{cur=d.o.slice(); ext=[];}
      apply();
    };

    if(rs) rs.addEventListener('click',function(){
      cur=d.o.slice(); ext=[]; apply(); persist();});

    function hit(i){
      if(cur.indexOf(i)>=0) return;              // нота аккорда уже здесь
      var j=ext.indexOf(i);
      if(j>=0){ext.splice(j,1); apply(); persist(); return;} // повторный клик снимает
      if(isChord(i)){
        // пэд той же ноты, что уже есть в аккорде: переносим на него голос
        var pc=midi(i)%12, k=-1;
        cur.forEach(function(p,n){
          if(midi(p)%12!==pc) return;
          if(k<0||Math.abs(midi(p)-midi(i))<Math.abs(midi(cur[k])-midi(i))) k=n;
        });
        if(k<0) return;
        cur[k]=i;
      }else{
        ext.push(i);                              // нота не из аккорда — своя
      }
      apply(); persist();
    }
    Object.keys(pads).forEach(function(k){
      var i=+k, el=pads[i];
      el.addEventListener('click',function(){hit(i);});
      el.addEventListener('keydown',function(e){
        if(e.key==='Enter'||e.key===' '){hit(i);e.preventDefault();}
      });
    });
    apply();
  });
})();
"""


def _pad_index(r: int, c: int) -> int:
    return r * COLS + c


def _pad_span(cls: str, idx: int, name: str, deg: Optional[str] = None,
              tab: bool = False, data_name: bool = False) -> str:
    """Один пэд. ОДНО место, где рождается разметка пэда — и для готовой схемы,
    и для пустого шаблона: иначе две копии разъезжаются, а CSS у них общий.

    data-p — логический номер пэда (ряд снизу вверх), а в DOM пэды идут сверху
    вниз: JS обязан ходить по этому номеру, а не по позиции в querySelectorAll.
    """
    body = ("<b>%s</b>" % _esc(name)) if name else ""
    if deg is not None:
        # у трёхсимвольных ступеней (bb7, b13, #11) кегль на полпункта меньше:
        # только они и не влезают рядом с двухбуквенным именем
        body += ('<u class="l3">%s</u>' if len(deg) > 2 else "<u>%s</u>") % _esc(deg)
    return ('<span class="%s" data-p="%d"%s%s>%s</span>'
            % (cls, idx,
               (' data-n="%s"' % _esc(name)) if data_name else "",
               ' tabindex="0"' if tab else "", body))


def _cap_html(title: Optional[str], subtitle: Optional[str]) -> str:
    """Левая половина подписи над сеткой: имя аккорда и ноты.

    None — половины нет вовсе; пустая строка — половина есть, но пустая:
    так шаблон карточки получает `.sym` и `.sub`, которые заполнит JS.
    """
    if title is None and subtitle is None:
        return ""
    return '<div class="pgh">%s%s</div>' % (
        ('<b class="sym">%s</b>' % _esc(title)) if title is not None else "",
        ('<span class="sub">%s</span>' % _esc(subtitle)) if subtitle is not None else "")


def render_html(grid: Grid,
                overlay: Optional[Dict[Tuple[int, int], PadMark]] = None,
                labels: str = "note",
                degrees: bool = True,
                title: Optional[str] = None,
                subtitle: Optional[str] = None,
                flats: bool = False,
                spelling: Optional[Dict[int, Optional[str]]] = None,
                spec: Optional[ChordSpec] = None,
                live: bool = False,
                meta: str = "",
                key: str = "") -> str:
    """Схема сетки в HTML. Параметры те же, что у render_svg.

    spec + live=True — схема становится живой: пэды кликабельны, снизу появляется
    подпись обращения и кнопка сброса. Без этого — статичная картинка из дивов.
    """
    overlay = overlay or {}
    # data-key — имя схемы для хранилища правок: под ним страница песни кладёт
    # накликанную аппликатуру в state.json. Без ключа схема просто не сохраняется.
    p = ['<div class="pg"%s>' % (' data-key="%s"' % _esc(key) if key else "")]

    # ступень относительно рута аккорда — для ВСЕХ 64 пэдов, не только для нот
    # аккорда: человек может выделить руками любую ноту, и подпись должна уже
    # лежать в разметке. Показывает её CSS, JS ничего не сочиняет.
    dmap = dict(spec.degree_map()) if spec else {}
    if spec:
        for pc in range(12):
            dmap.setdefault(pc, interval_short((pc - spec.root_pc) % 12))

    pads = ['<div class="pads">']
    for r in range(grid.rows - 1, -1, -1):
        for c in range(grid.cols):
            mark = overlay.get((r, c))
            cls = ["p", "b-" + grid.state(r, c)]
            if mark:
                cls.append("gh" if mark.ghost else "on")
                if mark.is_root:
                    cls.append("rt")
            if labels == "note":
                main = (spelling or {}).get(grid.pc(r, c)) or grid.note_name(r, c, flats)
            elif labels == "midi":
                main = str(grid.midi(r, c))
            else:
                main = ""
            deg = dmap.get(grid.pc(r, c)) if degrees else None
            if deg is None and mark and degrees:
                deg = mark.degree
            pads.append(_pad_span(" ".join(cls), _pad_index(r, c), main, deg or None,
                                  tab=bool(mark and mark.ghost and live)))
    pads.append("</div>")

    # подпись идёт НАД сеткой одной строкой: имя аккорда с нотами слева,
    # ступени справа. Обе половины в одном flex-контейнере, чтобы длинный
    # список ступеней переносился, а не распирал карточку. 31 августа Сергей
    # попросил перенести её со дна наверх: сначала читаешь, что за аккорд,
    # потом смотришь на пэды
    cap = _cap_html(title if title else None, subtitle if subtitle else None)

    if live and spec:
        p.append('<div class="pgcap">%s<div class="pgf"><span class="vlab"></span>'
                 '<button class="rs" title="вернуть аппликатуру солвера">'
                 '&#10227;</button><span class="pgm">%s</span></div></div>'
                 % (cap, meta))
        p.extend(pads)
        # имена нот и ступени в payload не кладём: они уже написаны на пэдах,
        # JS читает их прямо из разметки — одна копия вместо двух.
        # pcs — ПО ПОРЯДКУ СТУПЕНЕЙ от рута: индекс баса в этом списке и есть
        # номер обращения, больше для подписи ничего не нужно.
        pcs = sorted(set(spec.pitch_classes), key=lambda pc: (pc - spec.root_pc) % 12)
        data = {
            "pcs": pcs,
            "rt": spec.root_pc % 12,
            "o": sorted(_pad_index(r, c) for r, c in overlay
                        if not overlay[(r, c)].ghost),
        }
        p.append('<script type="application/json" class="pgd">%s</script>'
                 % json.dumps(data, ensure_ascii=False).replace("<", "\\u003c"))
    elif cap or meta:
        p.append('<div class="pgcap">%s%s</div>'
                 % (cap, ('<div class="pgf"><span class="pgm">%s</span></div>' % meta)
                    if meta else ""))
        p.extend(pads)
    else:
        p.extend(pads)
    p.append("</div>")
    return "".join(p)


def render_card_template(grid: Optional[Grid] = None, cls: str = "pg",
                         caption: bool = True, foot: str = "",
                         flats: bool = False) -> str:
    """Пустая карточка схемы: та же разметка и тот же CSS, что у render_html,
    только без аккорда — подписи проставит JS.

    Нужна там, где аккорд заранее неизвестен: страница определения рисует этим
    шаблоном и большую сетку, и каждую карточку подбора. Благодаря общей
    разметке схема в подборе выглядит ровно так же, как схема в песне.

    Имя ноты лежит и в теле пэда, и в data-n: JS переписывает подпись под
    найденный аккорд (Bb вместо A#), а по data-n возвращает её обратно.
    """
    g = grid or Grid()
    p = ['<div class="%s">' % cls]
    if caption:
        p.append('<div class="pgcap">%s<div class="pgf">%s'
                 '<span class="pgm"></span></div></div>'
                 % (_cap_html("", ""), foot))
    p.append('<div class="pads">')
    for r in range(g.rows - 1, -1, -1):
        for c in range(g.cols):
            p.append(_pad_span("p b-" + g.state(r, c), _pad_index(r, c),
                               g.note_name(r, c, flats), "", data_name=True))
    p.append("</div></div>")
    return "".join(p)


# ------------------------------------------------------------------- CLI ----

def _main(argv=None):
    import argparse
    p = argparse.ArgumentParser(
        description="Сетка Ableton Push (Chromatic + 4ths): схемы аккордов в SVG")
    p.add_argument("chord", nargs="?", help="символ аккорда, напр. Bbmaj7b5, Gm6, Am/C")
    p.add_argument("--no-ghosts", action="store_true", help="не показывать обращения")
    p.add_argument("--labels", default="note", choices=["note", "midi", "none"])
    p.add_argument("--no-degrees", action="store_true", help="не подписывать ступени")
    p.add_argument("--sharps", action="store_true", help="всегда диезы")
    p.add_argument("--fixed", action="store_true", help="фиксированный размер вместо резинового")
    p.add_argument("--ascii", dest="as_ascii", default=None,
                   choices=["note", "degree", "midi", "state"])
    p.add_argument("--shape", help="ASCII-фигура типа аккорда, напр. maj7")
    p.add_argument("-o", "--out", default=None, help="файл .svg")
    a = p.parse_args(argv)

    if a.shape:
        sh = find_shape(a.shape)
        print("%s  %s" % (a.shape, chord_intervals(a.shape)))
        print(shape_to_ascii(sh, a.shape))
        return 0
    if a.as_ascii:
        print(Grid().to_ascii(a.as_ascii))
        return 0
    if not a.chord:
        p.error("укажите аккорд или --ascii/--shape")

    g = Grid()
    v = voice_chord(g, a.chord, ghosts=not a.no_ghosts)
    kw = {"flats": False} if a.sharps else {}
    svg = render_chord_svg(v.spec, grid=g, ghosts=not a.no_ghosts, labels=a.labels,
                           degrees=not a.no_degrees, responsive=not a.fixed, **kw)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(svg)
        print("записано: %s  (%s: %s)" % (a.out, v.spec.symbol, " ".join(v.note_names)))
    else:
        print(svg)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
