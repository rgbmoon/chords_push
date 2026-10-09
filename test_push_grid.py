# -*- coding: utf-8 -*-
"""Тесты модели сетки и генератора схем. Запуск: python3 test_push_grid.py"""
import re
import sys
import xml.etree.ElementTree as ET

from push_grid import (ALIASES, CHORDS, DATA, ROW_SEMITONES, ChordSpec, Grid,
                       all_placements, chord_intervals, find_shape, interval_short,
                       invert, note_to_pc, parse_chord_symbol, parse_progression,
                       pc_to_name, render_chord_svg, render_svg, spell_from,
                       voice_chord, voice_progression)
from push_grid import _edge_cost, _voice_distance
import song as song_mod

FAILS = []


def check(cond, msg):
    print(("  ok   " if cond else "  FAIL ") + msg)
    if not cond:
        FAILS.append(msg)


g = Grid()

print("1. Базовая формула (Chromatic, 4ths)")
check(ROW_SEMITONES == 5, "смещение ряда = 5 полутонов (кварта)")
check(g.midi(0, 0) == 36, "нижний левый пэд = MIDI 36 (C1)")
check(g.midi(7, 7) == 78, "верхний правый = MIDI 78")
check(all(g.midi(r, c) == 36 + 5 * r + c for r in range(8) for c in range(8)),
      "midi(r,c) == 36 + 5r + c для всех 64 пэдов")

print("2. Свойства сетки")
check(len(g.unique_pitches()) == 43, "43 уникальные высоты на 64 пэдах")
check(g.highest_midi - g.lowest_midi == 42, "диапазон 42 полутона = 3.5 октавы")
check(all(g.midi(r, c) == g.midi(r + 1, c - 5) for r in range(7) for c in range(5, 8)),
      "вектор (+1,-5) — та же нота; ряды перекрываются на 3 пэда")
check(all(g.midi(r, c) + 12 == g.midi(r + 2, c + 2) for r in range(6) for c in range(6)),
      "вектор (+2,+2) — октава")
rc = [next((c for c in range(8) if (5 * r + c) % 12 == 0), None) for r in range(8)]
check(rc == [0, 7, 2, None, 4, None, 6, 1], "колонки тоник по рядам: 0,7,2,-,4,-,6,1")
check(rc == DATA["derived"]["root_column_per_row"], "то же значение записано в JSON")

print("3. Трансляционная инвариантность")
ok = all(g.midi(r + dr, c + dc) - g.midi(r, c) == 5 * dr + dc
         for dr in range(3) for dc in range(-3, 4)
         for r in range(8 - dr) for c in range(8) if 0 <= c + dc < 8)
check(ok, "сдвиг на (dr,dc) всегда транспонирует ровно на 5*dr+dc")

print("4. Раскраска совпадает с фотографией Push (C major)")
expect = """W O . W . W W .
. W . W . W O .
. W . W W . W .
. W . W O . W .
. W W . W . W .
. W O . W . W W
W . W . W . W O
O . W . W W . W"""
sym = {"root": "O", "in_key": "W", "off": "."}
got = "\n".join(" ".join(sym[g.state(7 - rr, c)] for c in range(8)) for rr in range(8))
check(got == expect, "все 64 пэда совпали с фотографией")
check(g.root == "C" and g.scale == "major", "визуальная база по умолчанию — C major")

print("5. Модель зафиксирована: только Chromatic + 4ths")
src = open("push_grid.py", encoding="utf-8").read()
check("row_degrees" not in src and "In Key" not in src,
      "в коде не осталось режима In Key ('in_key' остался только как имя цвета)")
check("thirds" not in src and "sequential" not in src, "в коде не осталось других раскладок")
js = open("push_grid.json", encoding="utf-8").read()
check("sequential" not in js and '"thirds"' not in js, "в JSON не осталось других раскладок")
check(len(DATA["scales"]) <= 3, "гамм ровно столько, сколько реально нужно (%d)"
      % len(DATA["scales"]))

print("6. Разбор символов аккордов")
cases = {
    "Bb": ("maj", 10, None), "Bbmaj7b5": ("maj7b5", 10, None),
    "Gm": ("min", 7, None), "Gm6": ("min6", 7, None),
    "Dsus2": ("sus2", 2, None), "Dm": ("min", 2, None),
    "Csus4": ("sus4", 0, None), "C": ("maj", 0, None), "Am": ("min", 9, None),
    "Am/C": ("min", 9, 0), "C6/9": ("6_9", 0, None), "F#m7b5": ("m7b5", 6, None),
    "Ebaug": ("aug", 3, None), "Bdim7": ("dim7", 11, None), "A7sus4": ("7sus4", 9, None),
    "C(add9)": ("add9", 0, None), "  Dm7  ": ("min7", 2, None),
}
bad = []
for symbol, (kind, root, bass) in cases.items():
    s = parse_chord_symbol(symbol)
    if (s.kind, s.root_pc, s.bass_pc) != (kind, root, bass):
        bad.append("%s -> %s/%s/%s" % (symbol, s.kind, s.root_pc, s.bass_pc))
check(not bad, "%d символов разобраны верно%s"
      % (len(cases), (": " + "; ".join(bad)) if bad else ""))
check(parse_chord_symbol("CM7").kind == "maj7" and parse_chord_symbol("Cm7").kind == "min7",
      "регистр значим: CM7 = мажорный, Cm7 = минорный")
check(parse_chord_symbol("CM9").kind == "maj9" and parse_chord_symbol("Cm9").kind == "min9",
      "регистр значим и для нонаккордов")
check(parse_chord_symbol("CMAJ7").kind == "maj7", "CMAJ7 ловится запасным поиском по регистру")
check(all(v in CHORDS for v in ALIASES.values()),
      "все %d алиасов указывают на реальные аккорды" % len(ALIASES))
# 'Cb5' читается как квинта от Cb — это неустранимая двусмысленность нотации,
# для мажора с пониженной квинтой пишем 'C(b5)'.
AMBIGUOUS = {"b5"}
bad = [a for a in ALIASES
       if a not in AMBIGUOUS and parse_chord_symbol("C" + a).kind != ALIASES[a]]
check(not bad, "каждый алиас парсится в составе символа%s"
      % ((": " + ", ".join(bad[:5])) if bad else ""))
check(parse_chord_symbol("C(b5)").kind == "majb5", "скобки снимаются только с суффикса: C(b5)")
check(parse_chord_symbol("Cb5").root_pc == 11, "жадный разбор тоники: Cb5 = квинта от Cb")
for wrong in ["Hmaj7", "Cwat", ""]:
    try:
        parse_chord_symbol(wrong)
        check(False, "%r должен давать ошибку" % wrong)
    except ValueError:
        pass
check(True, "мусорные символы дают понятную ошибку, а не тихо парсятся")

print("7. Последовательности")
check([s.symbol for s in parse_progression("Bb Gm A")] == ["Bb", "Gm", "A"],
      "'Bb Gm A' -> три аккорда")
check([s.symbol for s in parse_progression("Bb | Gm -> A, Dm")] == ["Bb", "Gm", "A", "Dm"],
      "разделители |, ->, запятая")
check([s.symbol for s in parse_progression("C C C Am")] == ["C", "Am"],
      "подряд идущие повторы схлопываются")

print("8. Правописание нот")
check(spell_from("G", "b3", 10) == "Bb", "G + b3 -> Bb, а не A#")
check(spell_from("F#", "b3", 9) == "A", "F# + b3 -> A")
sp = {k: parse_chord_symbol(k).spelling() for k in ["Gm", "Bb", "Ebaug", "Bdim7", "C#m7"]}
check(sorted(x for x in sp["Gm"].values() if x) == ["Bb", "D", "G"], "Gm = G Bb D")
check(sorted(x for x in sp["Ebaug"].values() if x) == ["B", "Eb", "G"], "Ebaug = Eb G B (#5)")
check(sorted(x for x in sp["Bdim7"].values() if x) == ["Ab", "B", "D", "F"],
      "Bdim7 = B D F Ab (bb7)")
allnames = [n for d in sp.values() for n in d.values() if n]
check(not any(n in ("Fb", "Cb", "E#", "B#") or len(n) > 2 for n in allnames),
      "неудобных написаний (Fb, E#, двойные знаки) на пэдах нет")

print("9. Голосоведение и размещение")
_NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"]
fails = []
for kind in CHORDS:
    for root in range(12):
        spec = ChordSpec("%s%s" % (_NAMES[root], kind), root, kind,
                         chord_intervals(kind), None, _NAMES[root])
        try:
            v = voice_chord(g, spec)
        except ValueError as e:
            fails.append("%s: %s" % (spec.symbol, e))
            continue
        if sorted(g.midi(*p) for p in v.pads) != v.notes:
            fails.append("%s: пэды не совпадают с нотами" % spec.symbol)
        if set(v.pads) & set(v.ghosts):
            fails.append("%s: призрак пересекается с основной аппликатурой" % spec.symbol)
check(not fails, "%d типов x 12 тоник размещаются корректно%s"
      % (len(CHORDS), (" — " + "; ".join(fails[:3])) if fails else ""))

print("10. Подсветка: зелёный = рут аккорда")
bad = []
for symbol in ["Bb", "Gm6", "Am/C", "C6/9", "F#m7b5", "Bbmaj7b5"]:
    v = voice_chord(g, symbol)
    for pad, mark in v.overlay.items():
        if mark.is_root != (g.pc(*pad) == v.spec.root_pc):
            bad.append("%s %s" % (symbol, pad))
    if not any(m.is_root and not m.ghost for m in v.overlay.values()):
        bad.append("%s: рут не подсвечен в основной аппликатуре" % symbol)
check(not bad, "рут помечен ровно на всех пэдах своего класса высоты")
v = voice_chord(g, "Am/C")
low = min(v.pads, key=lambda rc: g.midi(*rc))
check(g.pc(*low) == 0, "Am/C: нижняя нота — C (слэш-бас работает)")
check(v.overlay[low].is_root is False
      and any(v.overlay[p].is_root for p in v.pads),
      "Am/C: зелёный на A, хотя в басе C")

print("11. Обращения (призраки)")
v = voice_chord(g, "Gm6")
pcs = set(v.spec.pitch_classes)
check(all(g.pc(*p) in pcs for p in v.ghosts), "все призраки — классы высот аккорда")
everywhere = {(r, c) for r in range(8) for c in range(8) if g.pc(r, c) in pcs}
check(everywhere == set(v.pads) | set(v.ghosts),
      "подсвечены ВСЕ пэды аккорда: %d основных + %d призраков"
      % (len(v.pads), len(v.ghosts)))
check(all(m.ghost for p, m in v.overlay.items() if p in v.ghosts),
      "призраки помечены ghost=True")
check(len(voice_chord(g, "Gm6", ghosts=False).ghosts) == 0, "ghosts=False отключает призраки")

print("12. Подписи ступеней")
bad = []
for symbol in ["Bbmaj7b5", "Gm6", "C6/9", "Ebaug", "Bdim7", "Am/C"]:
    v = voice_chord(g, symbol)
    allowed = set(v.spec.degrees)
    if v.spec.bass_pc is not None:
        allowed.add(interval_short((v.spec.bass_pc - v.spec.root_pc) % 12))
    for mark in v.overlay.values():
        if mark.degree not in allowed:
            bad.append("%s: %s не из %s" % (symbol, mark.degree, sorted(allowed)))
check(not bad, "ступени на пэдах взяты из описания аккорда")
check(parse_chord_symbol("Caug").degrees == ["1", "3", "#5"], "aug подписан как #5, не b6")
check(parse_chord_symbol("Cdim7").degrees == ["1", "b3", "b5", "bb7"], "dim7 подписан как bb7")
check(parse_chord_symbol("Cm9").degrees[-1] == "9", "нона подписана как 9, а не 2")

print("13. Голосоведение по цепочке")
PROGS = {
    "демо": "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am",
    "поп": "C G Am F",
    "джаз": "Dm7 G7 Cmaj7 Em7b5 A7 Dm7",
    "кварты": "C F Bb Eb Ab Db",
    "далеко": "C F#m7 Bb13 Em9",
    "бардовский": "Am Dm E7 Am F C E7 Am",
}


def measure(vs):
    move = hold = voice = 0.0
    for a, b in zip(vs, vs[1:]):
        _c, h, d = _edge_cost(a.notes, a.pads, b.notes, b.pads)
        move += d
        hold += h
        voice += _voice_distance(a.notes, b.notes)
    return move, int(hold), voice


check(invert([60, 64, 67], 1) == [64, 67, 72], "invert(): 1-е обращение C = E G C")
check(invert([60, 64, 67], 2) == [67, 72, 76], "invert(): 2-е обращение C = G C E")
check(len(all_placements(g, [48, 52, 55])) >= 2,
      "all_placements даёт больше одного варианта — есть из чего выбирать")

tot_a = tot_b = [0.0, 0, 0.0]
worse = []
sums = [0.0, 0, 0.0, 0.0, 0, 0.0]
for nm, prog in PROGS.items():
    sp = parse_progression(prog)
    plain = voice_progression(g, sp, voice_leading=False)
    smart = voice_progression(g, sp)
    if [v.spec.symbol for v in smart] != [x.symbol for x in sp]:
        check(False, "%s: порядок аккордов поехал" % nm)
    a, b = measure(plain), measure(smart)
    for i in range(3):
        sums[i] += a[i]
        sums[3 + i] += b[i]
    if b[0] > a[0] + 1e-9:
        worse.append("%s (%.2f -> %.2f)" % (nm, a[0], b[0]))
check(not worse, "на всех %d последовательностях путь руки не вырос%s"
      % (len(PROGS), (": " + ", ".join(worse)) if worse else ""))
check(sums[3] < sums[0] * 0.70,
      "путь руки сократился на %.0f%% (%.1f -> %.1f)"
      % (100 * (1 - sums[3] / sums[0]), sums[0], sums[3]))
check(sums[4] > sums[1] * 1.4,
      "общих нот стало в %.1f раза больше (%d -> %d)"
      % (sums[4] / max(1, sums[1]), sums[1], sums[4]))
check(sums[5] < sums[2],
      "движение голосов сократилось на %.0f%% (%.1f -> %.1f)"
      % (100 * (1 - sums[5] / sums[2]), sums[2], sums[5]))

# --- главное ограничение: солвер не имеет права менять аккорд -------------
bad = []
for nm, prog in PROGS.items():
    for v in voice_progression(g, parse_progression(prog)):
        want = v.spec.bass_pc if v.spec.bass_pc is not None else v.spec.root_pc
        if min(v.notes) % 12 != want:
            bad.append("%s/%s бас=%s" % (nm, v.spec.symbol,
                                         pc_to_name(min(v.notes) % 12)))
        if v.inversion != 0:
            bad.append("%s/%s обращение %d" % (nm, v.spec.symbol, v.inversion))
        got = sorted((n - min(v.notes)) % 12 for n in v.notes)
        want_pcs = sorted(i % 12 for i in v.spec.intervals)
        if v.spec.bass_pc is None and got != want_pcs:
            bad.append("%s/%s структура %s != %s" % (nm, v.spec.symbol, got, want_pcs))
check(not bad, "СТРУКТУРА НЕ НАРУШЕНА: рут в басу, интервалы те же%s"
      % ((" — " + "; ".join(bad[:4])) if bad else ""))
check(all(v.inversion == 0 for nm, pr in PROGS.items()
          for v in voice_progression(g, parse_progression(pr))),
      "по умолчанию обращений в аппликатуре нет ни в одной последовательности")
inv_on = voice_progression(g, parse_progression(PROGS["демо"]), allow_inversions=True)
check(any(v.inversion for v in inv_on),
      "allow_inversions=True возвращает солверу право менять бас (для экспериментов)")

vs = voice_progression(g, parse_progression(PROGS["демо"]))
check(vs[0].move is None, "у первого аккорда нет сдвига руки")
check(not hasattr(vs[0], "held") and not hasattr(vs[0].overlay[vs[0].pads[0]], "held"),
      "удержание с прошлого аккорда больше не хранится: точку с пэдов убрали")
shared = [len(set(p.pads) & set(c.pads)) for p, c in zip(vs, vs[1:])]
check(sum(shared) > 0, "солвер по-прежнему оставляет общие пэды соседям (%d шт.)" % sum(shared))
bad = [v.spec.symbol for v in vs if sorted(g.midi(*p) for p in v.pads) != v.notes]
check(not bad, "после солвера пэды по-прежнему соответствуют нотам")

slash = voice_progression(g, parse_progression("C Am/C G"), allow_inversions=True)[1]
check(min(slash.notes) % 12 == 0 and slash.inversion == 0,
      "у слэш-аккорда бас остаётся заданным даже при allow_inversions=True")

single = voice_progression(g, parse_progression("Gm6"))
check(len(single) == 1 and single[0].move is None, "цепочка из одного аккорда не ломается")
check(voice_progression(g, []) == [], "пустая цепочка возвращает пустой список")

svg = render_svg(g, overlay=vs[3].overlay)
check("<circle" not in svg, "точек удержания на пэдах больше нет")

print("14. SVG (формат экспорта, --svg)")
svg = render_chord_svg("Gm6")
ET.fromstring(svg)
check(True, "SVG парсится как валидный XML")
head = svg.split(">", 1)[0]
check('viewBox="' in head and 'width="100%"' in head, "есть viewBox и width=100%")
check(not re.search(r'\bheight="\d', head), "у корневого svg нет height в пикселях")
check("height:auto" in head, "style задаёт height:auto — svg тянется по контейнеру")
check(svg.count('class="gh"') > 0, "элементы призраков помечены class=gh")
check(svg.count("<rect") >= 65, "нарисованы фон + 64 пэда")
fixed = render_chord_svg("Gm6", responsive=False)
check(re.search(r'width="\d+(\.\d+)?" height="\d', fixed),
      "responsive=False даёт фиксированный размер")
ids = re.findall(r'<radialGradient id="([^"]+)"', svg)
check(len(ids) == len(set(ids)), "id градиентов уникальны")
check("(b3)" in svg, "по умолчанию ступени подписаны в скобках")
check("(b3)" not in render_chord_svg("Gm6", degrees=False), "degrees=False убирает подписи")

print("15. Страница песни")
html = song_mod.build_page(
    parse_progression("Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am"), "Тест")
missing = [s for s in ["Bb", "Bbmaj7b5", "Gm6", "Dsus2", "Csus4", "Am"]
           if "<b>%s</b>" % s not in html]
check(not missing, "все аккорды перечислены на странице")
check("<svg" not in html and "radialGradient" not in html,
      "на странице song.py схемы тоже HTML: градиенты уехали в CSS, id больше не плодятся")
check(html.count('<div class="pg"') == 9, "9 схем — одна на аккорд")
check("держим" not in html and "dot-legend" not in html,
      "точку удержания и строку «держим N нот» с карточек убрали")
plain_html = song_mod.build_page(parse_progression("C G Am F"), "T", voice_leading=False)
check('class="pg"' in plain_html, "страница строится и без голосоведения")
check("auto-fit" in html and "viewport" in html, "сетка карточек резиновая, есть meta viewport")
check('id="ghosts"' not in html and 'id="compact"' not in html,
      "переключателей «обращения» и «компактно» больше нет: всегда и то, и другое")
check(song_mod.slugify("Bb — Gm — Dm — Am") == "bb-gm-dm-am", "slugify делает годное имя папки")
check(song_mod.slugify("Пример Песни") == "primer-pesni", "slugify транслитерирует кириллицу")

print("16. JSON согласован с кодом")
for n, offs in DATA["interval_to_offsets"].items():
    if n.startswith("$"):
        continue
    if any(5 * dr + dc != int(n) for dr, dc in offs):
        check(False, "interval_to_offsets неверен для %s" % n)
        break
else:
    check(True, "interval_to_offsets: все векторы дают свой интервал")
check(DATA["derived"]["unique_pitches"] == 43 and DATA["derived"]["duplicate_pads"] == 21,
      "JSON: 43 уникальные высоты, 21 повтор")
from push_grid import WEIGHTS
check(set(WEIGHTS) == set(DATA["voice_leading"]["weights"]),
      "веса солвера берутся из JSON, а не из кода")
bad = [k for k, v in CHORDS.items() if len(v["degrees"]) != len(v["intervals"])]
check(not bad, "у каждого аккорда столько же подписей ступеней, сколько интервалов")
bad = [k for k, v in CHORDS.items() if sorted(v["intervals"]) != v["intervals"]
       or len(set(v["intervals"])) != len(v["intervals"])]
check(not bad, "интервалы всех %d аккордов отсортированы и без дублей" % len(CHORDS))
for name in CHORDS:
    sh = find_shape(name)
    if sh is None or [5 * dr + dc for dr, dc in sh] != chord_intervals(name):
        check(False, "фигура %s неверна" % name)
        break
else:
    check(True, "все %d фигур дают ровно свои интервалы" % len(CHORDS))
check(note_to_pc("Bb") == 10 and note_to_pc("A#") == 10, "Bb == A# == 10")


print("17. Страница песни с текстом (songpage)")
import push_grid
import songpage as songpage_mod
from songpage import (parse_source, split_units, build_cards, build_page,
                      is_chord_line, Song)

SRC = """@title: Проба
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
"""
sg = parse_source(SRC)
check(sg.meta["title"] == "Проба" and sg.meta["key"] == "Dm"
      and sg.meta["source"].startswith("https://"), "шапка @ключ: значение читается")
check([s.title for s in sg.sections if s.lines] == ["Intro", "Verse 1"],
      "секции по '# Название'")
intro, verse = [s for s in sg.sections if s.lines]
check(not intro.has_lyrics and verse.has_lyrics,
      "секция без текста отличается от секции с текстом")
check([l.kind for l in intro.lines] == ["chords"],
      "аккорды без текста под ними — это проигрыш, а не пара")
kinds = [l.kind for l in verse.lines]
check(kinds == ["pair", "pair", "lyric", "pair"],
      "строка аккордов + строка текста = пара; текст без аккордов остаётся текстом")
check(verse.lines[1].chords == [(0, "Am"), (19, "C")],
      "колонки аккордов сохраняются как есть")

check(sg.chain(with_lyrics_only=True) == ["Bb", "Am", "C", "Dm", "Gm"],
      "в цепочку идут только аккорды, звучащие под текстом")
check(sg.chain(with_lyrics_only=False)[:2] == ["Bb", "Bbmaj7b5"],
      "--all-chords возвращает и проигрыши")
check("Bbmaj7b5" not in sg.chain(with_lyrics_only=True),
      "аккорд, который встречается только в интро, схемы не получает")

check(is_chord_line("Bb   Gm") and not is_chord_line("Counting all the gulls"),
      "строка аккордов отличается от строки текста")
check(not is_chord_line("Am I still here?") and not is_chord_line("But you're never"),
      "текст со знаками препинания и апострофами не принимается за аккорды")
check(is_chord_line(".Am") and not is_chord_line("|Am"),
      "'.' форсирует аккорды, '|' форсирует текст")

lyr = "Walk to the harbor"
units = split_units(lyr, [(0, "Am"), (8, "C")])
check("".join(t for _s, t in units) == lyr, "разрез строки по колонкам ничего не теряет")
check([s for s, _t in units] == ["Am", "C"] and units[1][1].startswith("the"),
      "аккорд встаёт над своим слогом")
units = split_units(lyr, [(5, "C")])
check(units[0][0] is None and units[0][1] == "Walk " and units[1][0] == "C",
      "кусок текста до первого аккорда остаётся без аккорда")
units = split_units("(go)", [(0, "Bb"), (5, "Gm"), (10, "Dm")])
check([s for s, _t in units] == ["Bb", "Gm", "Dm"] and units[2][1] == "",
      "аккорд за концом строки не теряется")

g2 = Grid()
cards = build_cards(g2, sg.chain(with_lyrics_only=True))
check([c.symbol for c in cards] == ["Bb", "Am", "C", "Dm", "Gm"],
      "одна карточка на уникальный аккорд, порядок — по первому появлению")
check(all(min(c.notes) % 12 == c.spec.root_pc for c in cards),
      "СТРУКТУРА НЕ НАРУШЕНА: рут в басу и на странице с текстом")
check(all(c.overlay[rc].degree for c in cards for rc in c.pads),
      "у каждого пэда карточки есть подпись ступени")
from push_grid import COMPACT as _CMP, span_cols as _span
check(all(_span(c.pads) <= _CMP["max_cols"] for c in cards),
      "раскладка всегда компактная — широкой на странице больше нет")

html = build_page(sg, cards, g2, "Проба", sg.chain(with_lyrics_only=True))
check("Lanterns in the rain" in html.replace("&nbsp;", " ")
      or "Lanterns" in html, "текст песни попал на страницу")
check(html.count('<div class="pg"') == len(cards),
      "одна схема на аккорд — вторую, широкую, выпилили вместе с галочкой")
check("<svg" not in html, "схемы на странице — HTML, а не SVG")
check("Bbmaj7b5" in html, "аккорд проигрыша виден в тексте, хоть и без схемы")
check("meta name=\"viewport\"" in html, "страница резиновая, есть meta viewport")

# шапка не скроллится, текст и схемы — две независимые области со своим скроллом
check('class="top"' in html and "position:sticky" not in html,
      "шапка стоит намертво, липкого сайдбара внутри общего скролла больше нет")
check(re.search(r"body\{[^}]*overflow:hidden", html.replace("\n", "")),
      "страница целиком не скроллится — скроллятся только колонки")
check(re.search(r"\.pane\{overflow-y:auto", html)
      and 'class="pane sheet"' in html and 'class="pane side"' in html,
      "у текста и у схем свой скролл, независимо друг от друга")
check('class="back"' in html and 'href="../../"' in html,
      "со страницы песни есть выход на главную, ссылка относительная")
check(html.index('class="top"') < html.index('class="layout"'),
      "шапка идёт до колонок")
check(html.count("<footer") == 1
      and html.index("<footer") < html.index('class="pane side"'),
      "подвал с легендой уехал вниз текстовой колонки, из шапки — вон")
check("no-ghosts" not in html and "body.wide" not in html,
      "режимов «без обращений» и «широко» в странице не осталось ни следа")
check("--split:50%" in html and 'id="gutter"' in html,
      "колонки поделены пополам, между ними ручка-ресайзер")
check('role="separator"' in html and 'tabindex="0"' in html,
      "ручку можно поймать не только мышкой")
check("minmax(min(100%,var(--card-min)),1fr)" in html,
      "схемы в сайдбаре встают в несколько колонок, когда есть место")
check("--card-min:%dpx" % songpage_mod.CARD_MIN in html
      and "--card-max:%dpx" % songpage_mod.CARD_MAX in html
      and songpage_mod.CARD_MIN >= 300 <= songpage_mod.CARD_MAX,
      "у схемы есть и пол (%dpx), и потолок (%dpx) ширины"
      % (songpage_mod.CARD_MIN, songpage_mod.CARD_MAX))
check("MINR" in html, "ручку-ресайзер не дают утянуть за минимальную ширину схемы")
check(not re.search(r"r\\dc\\d", html),
      "координат пэдов (rNcN) на странице нет — Сергею они не нужны")
check("держим" not in html and "dot-legend" not in html,
      "ни точки удержания, ни строки «держим N нот» на странице не осталось")

print("17б. Схемы кликабельны")
check(html.count('class="pgd"') == len(cards),
      "у каждой схемы свой блок данных для интерактива")
check(html.count('class="vlab"') == len(cards)
      and html.count('class="rs"') == len(cards),
      "у каждой схемы есть подпись обращения и кнопка сброса")
check("<button" not in html.split("<aside")[1].split("</aside>")[0]
      .replace('<button class="rs"', ""),
      "стрелок вариантов у схемы нет — обращение задаётся кликом по пэду")
import json as _json
_m = re.search(r'<script type="application/json" class="pgd">(.*?)</script>', html)
_d = _json.loads(_m.group(1))
check(set(_d) == {"pcs", "rt", "o"}, "формат данных схемы не разъехался")
check(all(0 <= p < 64 for p in _d["o"]), "исходные пэды лежат внутри сетки 8×8")
check(_d["pcs"][0] == _d["rt"],
      "pcs идут по ступеням от рута: индекс баса в этом списке = номер обращения")
check([( p - _d["rt"]) % 12 for p in _d["pcs"]]
      == sorted((p - _d["rt"]) % 12 for p in _d["pcs"]),
      "и порядок этот именно возрастающий, иначе обращение подпишется неверно")

# ступень наготове у ВСЕХ пэдов: человек может выделить руками любую ноту
_pads_html = html.split('<div class="pads">')[1].split("</div>")[0]
check(_pads_html.count("<u>") == 64,
      "ступень относительно рута подписана у всех 64 пэдов, а не только у нот аккорда")
check(".p.ex u{display:block}" in html.replace(",", ",").replace("\n", "")
      or ".pg .p.on u,.pg .p.gh u,.pg .p.ex u{display:block}" in html,
      "показывает подпись CSS — по классу выбранности, а не JS")
check("ширина" not in html.split("<footer")[0],
      "ширину фигуры под схемой больше не печатаем — бесполезная цифра")

# в DOM пэды идут сверху вниз, а нумеруются снизу вверх: если JS начнёт считать
# по позиции в DOM, подсветятся не те пэды — сторож ровно на этот случай
_nums = [int(x) for x in re.findall(r'data-p="(\d+)"', html.split('<div class="pads">')[1])][:64]
check(_nums[:8] == [56, 57, 58, 59, 60, 61, 62, 63] and _nums[-8:] == list(range(8)),
      "первый ряд в разметке — верхний (пэды 56..63), последний — нижний (0..7)")
_marked = sorted(int(m) for m in
                 re.findall(r'class="p [^"]*\bon\b[^"]*" data-p="(\d+)"',
                            html.split('<div class="pads">')[1].split("</div>")[0]))
check(_marked == sorted(_d["o"]),
      "подсвеченные в разметке пэды — те же, что JS считает исходными")
check("render_html" in dir(push_grid) and "grid_css" in dir(push_grid),
      "рендер схемы живёт в ядре, а не в двух копиях")

# ступень стоит СБОКУ от имени ноты: снизу она упиралась в край пэда и обрезалась
_css = push_grid.grid_css()
check('u::before{content:"("' not in _css and "(%s)" % "b3" not in html,
      "скобок у ступени больше нет — они стоили 6px ширины, а её в обрез")
check(".pg .p{" in _css and "flex-direction:column" not in _css.split(".pg .p{")[1][:200],
      "имя и ступень стоят в строку, а не столбиком")
_dim = push_grid.render_html(g2, overlay=voice_chord(g2, "Bdim7").overlay,
                             spec=parse_chord_symbol("Bdim7"), live=True)
check('u class="l3"' in _dim and "u.l3{font-size" in _css,
      "трёхсимвольные ступени (bb7, b13, #11) получают свой класс и кегль поменьше")
check(songpage_mod.CARD_MIN >= 315,
      "нижний порог ширины схемы держит худшую подпись «Gb b13» — это 35px на пэд")

# длинный список ступеней не должен распирать карточку
check(".pgcap{display:flex;flex-wrap:wrap" in _css,
      "подпись под сеткой переносится, а не растягивает схему")
check(_css.count("min-width:0") >= 4,
      "обе половины подписи умеют сжиматься — иначе десяток своих нот ломает вёрстку")
check("white-space:nowrap" not in _css.split(".pg .pgf{")[1][:200],
      "у строки ступеней нет nowrap: именно он и ломал карточку")

# изменённая схема помечается точкой у имени, а не рамкой на всю карточку
check("outline:1px solid #4fd98a" not in _css, "зелёной обводки у изменённой схемы нет")
check(".pg.edited .sym::after" in _css and "border-radius:50%" in _css,
      "вместо неё — маленькая точка у имени аккорда")

# нота, выделенная руками, не должна выглядеть как нота аккорда
_st = DATA["palette"]["states"]
check("extra" in _st, "у выделенной руками ноты своё состояние в палитре")
check(_st["extra"]["stops"][1] not in
      (_st["chord"]["stops"][1], _st["chord_root"]["stops"][1]),
      "и свой цвет — не цвет аккорда")
_edge = DATA["palette"]["extra_edge"]
check(".p.ex{" in html.replace("\n", "").replace(".pg ", "") and _edge in html,
      "рамка у своей ноты не белая, а %s" % _edge)
check(html.count(_edge) >= 2 and "rgba(255,255,255,.9)" in html.replace(" ", ""),
      "у нот аккорда рамка осталась белой — разница видна с одного взгляда")
check("выделено руками" in html, "в легенде объяснено, что значит фиолетовый пэд")



print("18. Компактный режим: аккорд под одну руку")
from push_grid import COMPACT, span_cols, span_rows, all_placements, chord_pitches

MAXC = COMPACT["max_cols"]
check(MAXC == 4, "потолок ширины берётся из JSON и равен 4 колоннам")

seq = ["Bb", "Gm", "Dm", "C", "Am"]
cmp_v = voice_progression(g, seq, compact=True)
wide_v = voice_progression(g, seq, compact=False)
check(all(span_cols(v.pads) <= MAXC for v in cmp_v),
      "в компактном режиме ни один аккорд не шире %d колонок" % MAXC)
check(all(span_cols(c.pads) <= span_cols(w.pads) for c, w in zip(cmp_v, wide_v)),
      "компактная раскладка никогда не шире обычной")
check(any(span_cols(c.pads) < span_cols(w.pads) for c, w in zip(cmp_v, wide_v)),
      "и хотя бы на одном аккорде реально уже (Bb: 5 -> 4)")
check([sorted(n % 12 for n in v.notes) for v in cmp_v]
      == [sorted(n % 12 for n in w.notes) for w in wide_v],
      "СТРУКТУРА НЕ НАРУШЕНА: компактность не подменила ноты аккорда")
check(all(min(v.notes) % 12 == v.spec.root_pc for v in cmp_v),
      "рут остаётся в басу и в компактном режиме")

bad = []
for kind in CHORDS:
    spec = parse_chord_symbol("C")
    spec.kind, spec.intervals = kind, CHORDS[kind]["intervals"]
    pads = all_placements(g, chord_pitches(spec, low=48), limit=1,
                          max_cols=MAXC, compact=True)
    if pads and span_cols(pads[0]) > MAXC and len(spec.intervals) <= 5:
        bad.append((kind, span_cols(pads[0])))
# Потолок в 4 колонки МЯГКИЙ: у широко расставленных типов солвер его отпускает,
# иначе пришлось бы выбрасывать ноты. Список исключений держим поимённо — чтобы
# новый тип не попал в него незаметно.
WIDE_OK = {"minMaj9", "maj7sharp11"}
check({k for k, _ in bad} == WIDE_OK,
      "шире %d колонок раскладываются только %s — остальные аккорды до пяти нот влезают%s"
      % (MAXC, ", ".join(sorted(WIDE_OK)),
         "" if {k for k, _ in bad} == WIDE_OK else ": " + str(bad)))

triad = all_placements(g, chord_pitches(parse_chord_symbol("C"), low=48), limit=1,
                       max_cols=MAXC, compact=True)
check(span_cols(triad[0]) == 4,
      "трезвучие уже четырёх колонок не бывает: интервалы 4 и 7 дают минимум 4")
sus = all_placements(g, chord_pitches(parse_chord_symbol("Csus2"), low=48), limit=1,
                     max_cols=MAXC, compact=True)
check(span_cols(sus[0]) <= 3, "sus-аккорд ложится в три колонки")

check(span_cols(wide_v[0].pads) == 5 and span_cols(cmp_v[0].pads) == 4,
      "Bb в цепочке: было 5 колонок, стало 4 — ровно то, на что жаловался Сергей")
check(max(span_cols(v.pads) for v in wide_v) == 5
      and max(span_cols(v.pads) for v in cmp_v) == 4,
      "по всей цепочке максимум ширины упал с 5 до 4")

# широкий аккорд не должен пропадать: потолок отпускается, а не режет
big = all_placements(g, chord_pitches(parse_chord_symbol("Cmin13"), low=48), limit=1,
                     max_cols=MAXC, compact=True)
check(bool(big), "аккорд, который в потолок не влезает, всё равно раскладывается")

page = song_mod.build_page([parse_chord_symbol("Bb")], "Проба")
check('id="compact"' not in page and "body.wide" not in page,
      "галочек на странице song.py тоже не осталось")
check(page.count('<div class="pg"') == 1, "song.py рисует одну схему на аккорд")


print("19. Определение аккорда: пэды -> символ")
import json as _json
import os as _os
import tempfile as _tf
import threading as _th
import urllib.error as _ue
import urllib.request as _ur

import identify as ident
import serve as srv
import webapp

# как тип пишется в символе — эта запись обязана читаться обратно
for _kind in CHORDS:
    _sym = "C" + ident.suffix_of(_kind)
    try:
        _back = parse_chord_symbol(_sym).kind
    except ValueError:
        _back = None
    check(_back == _kind, "символ %-10s читается обратно как %s" % (_sym, _kind))

# круговая проверка: строим аппликатуру солвером и узнаём аккорд обратно
_bad = []
for _kind, _ent in CHORDS.items():
    for _root in range(12):
        _v = voice_chord(g, ChordSpec("x", _root, _kind, list(_ent["intervals"])))
        _r = ident.identify(ident.pads_to_midi([r * 8 + c for r, c in _v.pads]))
        _top = _r["candidates"][0] if _r["candidates"] else None
        if not _top or _top["kind"] != _kind or _top["root_pc"] != _root:
            _bad.append("%s от %d -> %s" % (_kind, _root, _top and _top["sym"]))
check(not _bad, "все 42 типа x 12 тоник узнаются по аппликатуре солвера (мимо: %d)"
      % len(_bad))

_am7 = ident.identify([57, 60, 64, 67])          # A C E G, бас A
check(_am7["candidates"][0]["sym"] == "Am7", "A C E G от A — это Am7")
check(_am7["candidates"][0]["exact"], "и совпадение точное")
_c6 = ident.identify([60, 64, 67, 69])           # те же классы, бас C
check(_c6["candidates"][0]["sym"] == "C6", "те же ноты от C — это C6, а не Am7")
check(any(c["sym"] == "Am7/C" and c["inv"] == 1 for c in _c6["candidates"]),
      "Am7 при этом остаётся вариантом и подписан как 1-е обращение")

# рут называет страница (первый нажатый пэд), а не бас
check(ident.identify([57, 60, 64, 67], 9)["candidates"][0]["sym"] == "Am7"
      and ident.identify([57, 60, 64, 67], 0)["candidates"][0]["sym"] == "C6/A",
      "один и тот же набор нот от A — это Am7, от C — C6: рут решает")
check([c["sym"] for c in ident.identify([57, 60, 64, 67], 9)["candidates"]]
      == ["Am7", "C6/A"],
      "аккорды от других рутов не выкидываются, а уходят ниже — их можно выбрать")
check(ident.identify([60, 64, 67, 69], 4)["candidates"][0]["sym"] == "C6",
      "если от заданного рута аккорда нет, порядок решает бас, как раньше")

# «квинта плюс лишняя нота» — так три ноты назывались по двум из них
check(ident.identify([54, 59, 60])["candidates"] == [],
      "F# B C — это не «B5 плюс C»: аккорд не называется по двум нотам из трёх")
check([c["sym"] for c in ident.identify([54, 59, 55])["candidates"]] == ["Gmaj7/F#"],
      "F# B G — это Gmaj7 без квинты, а не «B5 плюс G»")
check(ident.identify([57, 60, 62, 64, 67], 0)["candidates"][0]["sym"] == "C69/A"
      and parse_chord_symbol("C69").kind == "6_9",
      "аккорд 6/9 с басом в слэше пишется C69/A, а не ребусом C6/9/A")
check(ident.MAX_NOTES == 6
      and ident.MAX_NOTES == max(len({i % 12 for i in e["intervals"]})
                                 for e in CHORDS.values()),
      "потолок нот в аккорде берётся из таблицы, а не пишется руками")

_res = ident.identify([54, 59, 61, 64])          # F# B C# E
check(_res["candidates"][0]["sym"] == "F#7sus4"
      and all(c["exact"] for c in _res["candidates"]),
      "когда есть точное совпадение, приблизительные не показываем")
check(all(not (c["missing"] and c["extra"]) for c in
          ident.identify([60, 63, 66, 70, 73])["candidates"]),
      "никогда не показываем «и не хватает, и лишняя» — это гадание")

_no5 = ident.identify([60, 64, 71])              # C E B — квинты нет
check(_no5["candidates"][0]["sym"] == "Cmaj7" and _no5["candidates"][0]["missing"] == ["5"],
      "аккорд без квинты узнаётся и помечен «без 5»")
check(ident.identify([60, 64, 67, 62])["candidates"][0]["sym"] == "Cadd9",
      "C E G D — это Cadd9 целиком, а не «до-мажор плюс ре»")
_ext = ident.identify([60, 64, 67, 63])          # C E G + Eb, такого типа нет
check(_ext["candidates"][0]["sym"] == "C" and _ext["candidates"][0]["extra"] == ["Eb"],
      "нота, которой нет ни в одном типе, не мешает узнать трезвучие — она отмечена")
check(ident.identify([60, 64, 67, 61])["candidates"][0]["sym"] == "C#dim(maj7)/C",
      "а C E G Db теперь читается целиком: это C#dim(maj7) с C в басу")

_bb = ident.identify([58, 62, 65])
check(_bb["candidates"][0]["sym"] == "Bb" and _bb["candidates"][0]["spelling"]["10"] == "Bb",
      "ноты подписаны правильно: Bb, а не A#")
check(len(_am7["candidates"][0]["degrees"]) == 12,
      "ступени приходят для всех 12 классов высот — и для нот вне аккорда")
check(ident.identify([])["candidates"] == [], "пустой выбор — пустой ответ")
check(ident.identify([60, 67])["interval"] == "чистая квинта",
      "две ноты подписаны интервалом")
# интервал считается по РЕАЛЬНОМУ расстоянию: C и Db октавой выше — нона, а не
# секунда. Тот же принцип, что в таблице аккордов, где add9 хранится как 14
check(ident.identify([60, 61])["interval"] == "малая секунда"
      and ident.identify([60, 73])["interval"] == "малая нона"
      and ident.identify([60, 72])["interval"] == "октава",
      "нота октавой выше даёт другой интервал, со своим именем")
check(ident.identify([60, 85])["interval"] == "малая секунда через 2 октавы"
      and ident.identify([60, 84])["interval"] == "две октавы",
      "дальше терцдецимы таблицы нет — интервал называется составным")
_pd = ident.identify([36, 38], 0)["pad_degrees"]
check(_pd["2"] == "2" and _pd["20"] == "9" and _pd["4"] == "3",
      "ступень пэда тоже настоящая: D рядом с рутом — 2, D октавой выше — 9")
check(len(_pd) == 64 and ident.identify([36, 38])["pad_degrees"] == {},
      "ступени пэдов приходят на все 64 пэда и только когда назван рут")
check(ident.pads_to_midi([0, 63]) == [36, 78] and ident.pads_to_midi([99]) == [],
      "номер пэда -> нота, мусор отбрасывается")


print("20. Локальный сервер")

_picks = _tf.mkdtemp()
srv.PICKS_DIR = _picks
_httpd = srv._bind(0)                            # 0 — свободный порт от системы
_base = "http://127.0.0.1:%d" % _httpd.server_address[1]
_th.Thread(target=_httpd.serve_forever, daemon=True).start()


def _get(path):
    with _ur.urlopen(_base + path) as r:
        return r.status, r.read().decode()


def _post(path, obj=None):
    rq = _ur.Request(_base + path, data=_json.dumps(obj or {}).encode(),
                     headers={"Content-Type": "application/json"})
    try:
        with _ur.urlopen(rq) as r:
            return r.status, _json.loads(r.read().decode())
    except _ue.HTTPError as e:
        return e.code, _json.loads(e.read().decode())


try:
    _s, _home = _get("/")
    check(_s == 200 and "Подборы" in _home and "Песни" in _home,
          "главная отдаётся и знает про подборы и песни")

    _s, _find = _get("/find")
    check(_s == 200 and _find.count('class="p b-') == 128,
          "две сетки по 64 пэда: живая и шаблон карточки для подбора")
    check("localStorage" not in _find, "состояние в браузере не храним — только в picks/")
    check(not re.search(r"r\dc\d", _find), "координат пэдов на странице нет")
    check(_find.index('class="pane find"') < _find.index('id="gutter"')
          < _find.index('class="pane side"'),
          "сетка слева, схемы справа, ручка между ними")
    check('<template id="tpl">' in _find and _find.count('class="pgcap"') == 1,
          "карточка подбора рисуется тем же шаблоном схемы, что и в песне")
    check("--card-min:%dpx" % webapp.CARD_MIN in _find,
          "и той же ширины, что схемы в песне")
    check(_find.count("--split:50%") == 1 and "MINR" in _find,
          "раскладка с ручкой — та же самая, что на странице песни")

    _s, _d = _post("/api/identify", {"pads": [16, 21, 24]})
    check(_s == 200 and _d["candidates"], "api/identify отвечает по номерам пэдов")
    _s, _a = _post("/api/identify", {"midi": [57, 60, 64, 67], "root_pc": 9})
    _s, _b = _post("/api/identify", {"midi": [57, 60, 64, 67], "root_pc": 0})
    check(_a["candidates"][0]["sym"] == "Am7" and _b["candidates"][0]["sym"] == "C6/A"
          and _a["max_notes"] == ident.MAX_NOTES,
          "рут передаётся страницей и меняет ответ")
    check("window.__MAX=%d;" % ident.MAX_NOTES in _find,
          "страница знает потолок нот и дальше пэды не принимает")

    _s, _saved = _post("/api/picks", {"name": "Проба пера", "chords": [
        {"sym": "Am7", "pads": [12, 17, 20, 25], "root": 20, "root_pc": 9,
         "kind": "min7"}]})
    check(_saved["chords"][0]["root"] == 20,
          "в подборе запоминается и сам рутовый пэд — подбор открывается с ним же")
    check(srv._clean_chords([{"sym": "x", "pads": [3, 9], "root": 55}])[0]["root"] == 3,
          "рут не из выбранных пэдов не принимается")
    check(_s == 200 and _saved["slug"] == "proba-pera",
          "подбор сохраняется, имя транслитерируется в имя файла")
    check(_os.path.exists(_os.path.join(_picks, "proba-pera.json")),
          "и это обычный json в папке проекта")
    _s, _again = _post("/api/picks", {"name": "Проба пера", "slug": "proba-pera",
                                      "chords": [{"sym": "C", "pads": [0, 4, 9]}]})
    check(_again["created"] == _saved["created"] and len(_os.listdir(_picks)) == 1,
          "повторное сохранение того же подбора не плодит файлы")
    _s, _twin = _post("/api/picks", {"name": "Проба пера",
                                     "chords": [{"sym": "C", "pads": [0, 4, 9]}]})
    check(_twin["slug"] == "proba-pera-2", "новый подбор с занятым именем не затирает старый")
    _s, _err = _post("/api/picks", {"name": "", "chords": []})
    check(_s == 400 and _err.get("error"), "подбор без имени не сохраняется")

    _s, _page = _get("/find?pick=proba-pera")
    check("__PICK" in _page and "Проба пера" in _page, "сохранённый подбор открывается")
    _s, _lst = _get("/api/picks")
    check(len(_json.loads(_lst)["picks"]) == 2, "список подборов отдаётся")

    _raw = _json.loads(open(_os.path.join(_picks, "proba-pera.json"),
                            encoding="utf-8").read())
    check(all("degrees" not in c and "spelling" not in c for c in _raw["chords"]),
          "в файле подбора лежит только выбор человека — символ и пэды")
    check(all(c.get("degrees") and c.get("spelling")
              for c in srv.load_pick("proba-pera")["chords"]),
          "ступени и запись нот пересчитываются при открытии, а не хранятся")

    try:
        _get("/songs/../serve.py")
        check(False, "выход за пределы songs/ закрыт")
    except _ue.HTTPError as e:
        check(e.code == 404, "выход за пределы songs/ закрыт")

    _s, _dl = _post("/api/picks/proba-pera/delete")
    check(_dl.get("deleted") and len(_os.listdir(_picks)) == 1, "подбор удаляется")
finally:
    _httpd.shutdown()
    _httpd.server_close()
    for _f in _os.listdir(_picks):
        _os.remove(_os.path.join(_picks, _f))
    _os.rmdir(_picks)


print("21. Подпись сверху и сохранение накликанных аппликатур")

_card = push_grid.render_html(push_grid.Grid(), title="Dm", subtitle="D2 · F2 · A2",
                              meta="ступени 1 · b3 · 5", key="Dm")
check(_card.index('class="pgcap"') < _card.index('<div class="pads">'),
      "подпись стоит НАД сеткой, а не под ней")
check(_card.count("<div") == _card.count("</div>"),
      "дивы схемы сбалансированы после переноса подписи")
_tpl = push_grid.render_card_template()
check(_tpl.index('class="pgcap"') < _tpl.index('<div class="pads">'),
      "и в пустом шаблоне карточки тоже — разметка у них одна")
check('data-key="Dm"' in _card and "data-key" not in push_grid.render_html(push_grid.Grid()),
      "ключ хранилища пишется в разметку только когда его дали")

_gjs = push_grid.GRID_JS
check("window.PG_SAVE" in _gjs and "pg.__pgSet" in _gjs,
      "схема умеет отдать правку наружу и принять сохранённую обратно")
check("edited?{pads:sorted(cur),extra:sorted(ext)}:null" in _gjs.replace(" ", ""),
      "вернул схему как была — в хранилище уходит null, записи не копятся")

_sp_html = songpage_mod.build_page(sg, cards, g2, "Проба",
                               sg.chain(with_lyrics_only=True), slug="proba")
check(_sp_html.count("data-key=") == len(cards),
      "у каждой схемы песни свой ключ — символ аккорда")
check("/api/song/proba/state" in _sp_html,
      "страница знает свой слаг и стучится за состоянием по нему")
check(_sp_html.index("window.PG_SAVE=function") > _sp_html.index("pg.__pgSet=function"),
      "хранилище подключается после GRID_JS, иначе __pgSet ещё не существует")
check("catch(function(){})" in _sp_html,
      "без сервера (file://) fetch падает молча, схемы работают как раньше")
check("/api/song/" not in songpage_mod.build_page(sg, cards, g2, "Проба",
                                                 sg.chain(with_lyrics_only=True)),
      "без слага хранилище не подключается вовсе")

import shutil as _shutil
import serve as _srv2
_sd = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "_t_songs")
_os.makedirs(_os.path.join(_sd, "proba"), exist_ok=True)
try:
    check(_srv2.song_state("proba", _sd) == {"chords": {}},
          "у песни без правок состояние пустое, а не ошибка")
    _srv2.save_song_state("proba", {"chords": {"Dm": {"pads": [7, 2, 2, 99, 9]}}}, _sd)
    _st = _srv2.song_state("proba", _sd)
    check(_st["chords"]["Dm"]["pads"] == [2, 7, 9],
          "пэды чистятся: дубли и всё, что вне сетки 8×8, выбрасываются")
    check(_st["chords"]["Dm"]["extra"] == [], "своих нот нет — пустой список, не пропажа")
    _raw2 = _json.loads(open(_os.path.join(_sd, "proba", "state.json"),
                             encoding="utf-8").read())
    check(set(_raw2) == {"slug", "chords", "updated"} and "Dm" in _raw2["chords"],
          "в файле песни лежит только выбор человека, ключ — символ аккорда")
    _srv2.save_song_state("proba", {"chords": {}}, _sd)
    check(_srv2.song_state("proba", _sd)["chords"] == {},
          "снял правки — файл пустеет, а не хранит мусор")
    for _bad in ("../serve", "/etc", "proba/../..", "нет-такой"):
        check(_srv2.song_state(_bad, _sd) == {"chords": {}},
              "чужой слаг %r состояния не отдаёт" % _bad)
        try:
            _srv2.save_song_state(_bad, {"chords": {}}, _sd)
            check(False, "чужой слаг %r на запись не пускается" % _bad)
        except ValueError:
            check(True, "чужой слаг %r на запись не пускается" % _bad)
finally:
    _shutil.rmtree(_sd, ignore_errors=True)


print()
if FAILS:
    print("ПРОВАЛЕНО %d проверок:" % len(FAILS))
    for f in FAILS:
        print("  -", f)
    sys.exit(1)
print("Все проверки пройдены.")
