# -*- coding: utf-8 -*-
"""Определение аккорда по набору нот: пэды -> список названий.

Обратная задача ко всему остальному проекту: там символ -> схема, здесь схема ->
символ. Логика живёт на сервере, а не в браузере, ровно по той же причине, по
которой в схемах не дублируются имена нот: таблица 42 типов, подписи ступеней и
правильная запись нот (Bb, а не A#) уже есть в push_grid, и второй копии в JS
быть не должно. Запрос идёт на localhost, задержки не видно.

Что считаем совпадением:
  точное      — классы высот выбранных нот в точности равны классам аккорда;
  + лишняя    — ровно одна нота сверх аккорда, и только поверх аккорда от трёх
                нот: иначе три ноты F# B C становились «B5 (это квинта B–F#)
                плюс C», то есть аккорд назывался по двум нотам из трёх;
  - квинта    — не хватает ровно квинты, и только у аккордов от четырёх нот
                (пианист квинту опускает, терцию или септиму — нет).
Одновременно «и не хватает, и лишняя» не бывает: так под любые четыре ноты
подгонялась половина таблицы (B C# E F# объявлялись то Db7sus4, то C#m7).
И если точное совпадение нашлось хоть одно — приблизительные не показываем
вовсе, иначе список кандидатов превращается в мусор.

Рут не угадывается: его называет страница (первый нажатый пэд), и кандидаты с
этим рутом идут первыми. Бас на порядок больше не влияет — он решает только,
писать ли аккорд через слэш и какое это обращение.
"""
from typing import Dict, List, Optional, Sequence

import push_grid as pg

CHORDS = pg.CHORDS
ALIASES = pg.ALIASES
INTERVALS = {int(k): v for k, v in pg.DATA["intervals"].items()}

# порядок типов в таблице = порядок от простого к сложному, им и разводим
# одинаково хорошие варианты (C6 раньше, чем 6/9)
_ORDER = {k: i for i, k in enumerate(CHORDS)}

# Больше шести нот в таблице аккордов нет (13, maj11, min13, 7alt и родня).
# Число считается из таблицы, а не пишется руками: добавится семизвучие —
# страница сама начнёт пускать седьмую ноту.
MAX_NOTES = max(len({i % 12 for i in ent["intervals"]}) for ent in CHORDS.values())

_FIRST_ALIAS: Dict[str, str] = {}
for _a, _k in ALIASES.items():
    _FIRST_ALIAS.setdefault(_k, _a)

# Как тип показывается в символе. По умолчанию — первый алиас из таблицы,
# несколько случаев поправлены руками:
_SUFFIX_FIX = {
    "maj": "",           # C, а не Cmaj
    "sus4": "sus4",      # 'sus' короче, но 'sus4' понятнее
    "majb5": "(b5)",     # 'Cb5' прочиталось бы как нота C-бемоль плюс квинта
    "minMaj7": "mMaj7",  # регистр значим: mmaj7 и mMaj7 — один тип, но пишем так
    "minMaj9": "mMaj9",
    "dimMaj7": "dim(maj7)",   # 'C#dimmaj7' читается тяжело
    "7alt": "7alt",
}

# Тоника: диезы у минорных, бемоли у мажорных — как это пишут в нотах.
# C#m, но Db; G#m, но Ab. F#, Eb и Bb одинаковы в обе стороны.
_ROOT_FLAT = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
_ROOT_SHARP = {1: "C#", 6: "F#", 8: "G#"}


def suffix_of(kind: str) -> str:
    """Как тип пишется в символе аккорда: 'min7' -> 'm7'."""
    if kind in _SUFFIX_FIX:
        return _SUFFIX_FIX[kind]
    return _FIRST_ALIAS.get(kind, kind)


def root_name(pc: int, minorish: bool = False) -> str:
    pc %= 12
    if minorish and pc in _ROOT_SHARP:
        return _ROOT_SHARP[pc]
    return _ROOT_FLAT[pc]


def interval_name(semitones: int) -> str:
    """Название интервала по РЕАЛЬНОМУ расстоянию, а не по классам высот.

    C и Db октавой выше — малая нона, а не малая секунда: это разные интервалы,
    и у каждого своё имя. Тот же принцип, что и в таблице аккордов, где `add9`
    хранится как 14, а не как 2 ([[chord-table]]).

    Таблица знает интервалы до терцдецимы (21 полутон), а сетка растягивается
    на 42 — дальше называем составным: «малая септима через октаву».
    """
    n = abs(int(semitones))
    ent = INTERVALS.get(n)
    if ent:
        return ent["name"]
    octs, rest = divmod(n, 12)
    if rest == 0:
        return {2: "две октавы", 3: "три октавы"}.get(octs, "%d октав" % octs)
    base = INTERVALS.get(rest)
    if not base:
        return ""
    return "%s через %s" % (base["name"],
                            "октаву" if octs == 1 else "%d октавы" % octs)


def degree_from_root(semitones: int) -> str:
    """Подпись ступени по расстоянию от рута. Выше октавы — настоящая ступень
    (9, 11, 13), ниже рута и совсем далеко — свёрнутая в октаву."""
    d = int(semitones)
    if 0 <= d <= 21:
        return pg.interval_short(d)
    return pg.interval_short(d % 12)


def _spell(rname: str, degree: str, pc: int, flats: bool) -> str:
    return pg.spell_from(rname, degree, pc) or pg.pc_to_name(pc, flats)


def _candidate(root_pc: int, kind: str, ent: dict, pcs, bass_pc: int,
               lock_pc: Optional[int] = None) -> dict:
    ivs = list(ent["intervals"])
    degrees = list(ent.get("degrees") or [pg.interval_short(i) for i in ivs])
    need = [(root_pc + i) % 12 for i in ivs]          # по порядку ступеней
    need_set = set(need)
    missing = need_set - pcs
    extra = pcs - need_set

    if len(missing) > 1 or len(extra) > 1:
        return None
    if missing and extra:                             # это уже гадание, а не разбор
        return None
    if extra and len(need_set) < 3:
        # «квинта плюс лишняя нота» — не разбор, а отговорка: три ноты F# B C
        # так объявлялись аккордом B5 по двум нотам из трёх
        return None
    if missing:
        if len(need_set) < 4:
            return None
        if (list(missing)[0] - root_pc) % 12 != 7:    # опускаем только квинту
            return None
    if len(need_set & pcs) < 2:
        return None

    minorish = 3 in ivs
    rname = root_name(root_pc, minorish)
    flats = "b" in rname
    dmap, smap = {}, {}
    for i, deg in zip(ivs, degrees):
        pc = (root_pc + i) % 12
        dmap.setdefault(pc, deg)
        smap.setdefault(pc, _spell(rname, deg, pc, flats))
    for pc in range(12):                              # ступени для всех 12 —
        dmap.setdefault(pc, pg.interval_short((pc - root_pc) % 12))  # и для лишних

    inv = need.index(bass_pc) if bass_pc in need else 0
    slash = bass_pc != root_pc and bass_pc in need_set
    suf = suffix_of(kind)
    sym = rname + suf
    if slash:
        # C6/9 с басом в слэше превращается в ребус «C6/9/A» — для таких типов
        # пишем алиас без косой черты: C69/A
        sym = rname + suf.replace("/", "") + "/" \
            + smap.get(bass_pc, pg.pc_to_name(bass_pc, flats))

    return {
        "sym": sym,
        "root": rname,
        "root_pc": root_pc,
        "kind": kind,
        "name": ent.get("name", kind),
        "bass_pc": bass_pc,
        "inv": inv if slash else 0,
        "exact": not missing and not extra,
        "missing": [dmap[p] for p in sorted(missing)],
        "extra": [_spell(rname, dmap[p], p, flats) for p in sorted(extra)],
        "degrees": {str(p): d for p, d in dmap.items()},
        "spelling": {str(p): n for p, n in smap.items()},
        "pcs": need,
        # порядок: сначала аккорды от заданного рута (его называет страница —
        # это первый нажатый пэд), потом точные, потом простые по таблице.
        # Если рут не задан, его место занимает бас — так было до лока рута.
        "_sort": (0 if root_pc == (lock_pc if lock_pc is not None else bass_pc) else 1,
                  0 if not missing and not extra else 1,
                  len(missing) + len(extra),
                  _ORDER.get(kind, 99),
                  len(need_set)),
    }


def identify(midis: Sequence[int], root_pc: Optional[int] = None,
             limit: int = 8) -> dict:
    """Набор MIDI-нот -> кандидаты на название, лучший первым.

    root_pc — рут, который назвала страница (первый нажатый пэд). Это НЕ фильтр:
    аккорды от других рутов остаются в списке вариантов, просто уходят ниже.
    Выбрал вариант — сменился рут, и страница присылает уже его.

    Возвращает то, что нужно странице целиком: символ, ступени для всех 12
    классов высот и правильные имена нот — чтобы JS ничего не досочинял.
    """
    ms = sorted(set(int(m) for m in midis))
    pcs = set(m % 12 for m in ms)
    out = {"count": len(ms), "midi": ms, "candidates": [], "interval": "",
           "root_pc": root_pc % 12 if root_pc is not None else None,
           "max_notes": MAX_NOTES, "pad_degrees": {}}

    # Ступень КАЖДОГО пэда от рута — ею страница подписывает пэд под курсором.
    # Считается от реальной высоты рутовой ноты, а не от класса высоты: пэд
    # октавой выше — это 9, а не 2. Якорь — самая низкая выбранная нота рута.
    if root_pc is not None and ms:
        same = [m for m in ms if m % 12 == root_pc % 12]
        anchor = same[0] if same else ms[0]
        g = pg.Grid()
        out["pad_degrees"] = {str(p): degree_from_root(g.midi(p // g.cols, p % g.cols)
                                                       - anchor)
                              for p in range(g.rows * g.cols)}
    if not ms:
        return out
    bass_pc = ms[0] % 12

    # интервал между двумя нотами — по расстоянию, а не по классам высот
    if len(ms) == 2:
        out["interval"] = interval_name(ms[1] - ms[0])

    found = []
    lock = root_pc % 12 if root_pc is not None else None
    for rp in range(12):
        for kind, ent in CHORDS.items():
            c = _candidate(rp, kind, ent, pcs, bass_pc, lock)
            if c:
                found.append(c)
    found.sort(key=lambda c: c["_sort"])
    if any(c["exact"] for c in found):                # точное есть — «похожие» лишние
        found = [c for c in found if c["exact"]]
    for c in found[:limit]:
        c.pop("_sort", None)
    out["candidates"] = found[:limit]
    return out


def enrich(chords, grid=None) -> List[dict]:
    """Дополняет сохранённые аккорды тем, что нужно для отрисовки схемы.

    В файле подбора лежит только выбор человека: символ и пэды. Ступени и запись
    нот туда не пишем — это производное, его дешевле пересчитать при открытии,
    чем потом чинить разъехавшиеся копии. Тот же принцип, что и с подписями
    пэдов в схемах песни.
    """
    out = []
    for it in chords or []:
        d = dict(it)
        res = identify(pads_to_midi(d.get("pads") or [], grid), d.get("root_pc"))
        best = None
        for c in res["candidates"]:                   # сначала ищем тот же символ
            if c["sym"] == d.get("sym"):
                best = c
                break
        if best is None:
            same = [c for c in res["candidates"]
                    if c["kind"] == d.get("kind") and c["root_pc"] == d.get("root_pc")]
            best = same[0] if same else (res["candidates"] or [None])[0]
        if best:
            d["sym"] = d.get("sym") or best["sym"]
            d["kind"], d["root_pc"] = best["kind"], best["root_pc"]
            d["degrees"], d["spelling"] = best["degrees"], best["spelling"]
            d["padDeg"] = res.get("pad_degrees") or {}
        else:
            d["degrees"], d["spelling"], d["root_pc"] = {}, {}, None
        out.append(d)
    return out


def pads_to_midi(pads: Sequence[int], grid=None) -> List[int]:
    """Номера пэдов (снизу вверх, r*8+c) -> MIDI-ноты."""
    g = grid or pg.Grid()
    out = []
    for p in pads:
        p = int(p)
        if 0 <= p < g.rows * g.cols:
            out.append(g.midi(p // g.cols, p % g.cols))
    return out
