import { describe, expect, it } from "vitest";
import { mod } from "../math";
import { isChordSymbol, parseChord, parseProgression } from "./chord";
import { CHORD_TYPES, SUFFIXES, suffixOf } from "./chordTypes";
import { degreeFromRoot, intervalName } from "./intervals";
import { parseNoteName, spellNote } from "./notes";

const names = (symbol: string) => [...parseChord(symbol).nameByPc.values()].filter(Boolean).sort();

describe("разбор символов", () => {
  it("тоника, тип, слэш-бас", () => {
    const cases: Record<string, [string, number, number | null]> = {
      Bb: ["maj", 10, null], Bbmaj7b5: ["maj7b5", 10, null], Gm6: ["min6", 7, null], Dsus2: ["sus2", 2, null],
      "Am/C": ["min", 9, 0], "C6/9": ["6_9", 0, null], "F#m7b5": ["m7b5", 6, null], Ebaug: ["aug", 3, null],
      Bdim7: ["dim7", 11, null], A7sus4: ["7sus4", 9, null], "C(add9)": ["add9", 0, null], "  Dm7  ": ["min7", 2, null],
      "Bb(b5)/D": ["majb5", 10, 2], "C♯m": ["min", 1, null],
    };
    for (const [s, want] of Object.entries(cases)) {
      const c = parseChord(s);
      expect([c.kind, c.rootPc, c.bassPc], s).toEqual(want);
    }
  });

  it("регистр значим: CM7 — большой мажорный, Cm7 — малый минорный; CMAJ7 — запасным поиском", () => {
    expect([parseChord("CM7").kind, parseChord("Cm7").kind, parseChord("CMAJ7").kind]).toEqual(["maj7", "min7", "maj7"]);
  });

  it("каждое написание из таблицы читается в составе символа", () => {
    // 'Cb5' — квинта от Cb: неустранимая двусмысленность, мажор с b5 пишется C(b5)
    for (const [suffix, kind] of SUFFIXES) if (suffix !== "b5") expect(parseChord("C" + suffix).kind, suffix).toBe(kind);
    expect(parseChord("C(b5)").kind).toBe("majb5");
    expect(parseChord("Cb5").rootPc).toBe(11);
  });

  it("мусор — ошибка, а не тихий разбор", () => {
    for (const s of ["Hmaj7", "Cwat", "", "/C", "X"]) expect(isChordSymbol(s), s).toBe(false);
  });

  it("последовательности: любые разделители, повторы схлопываются", () => {
    const syms = (t: string) => parseProgression(t).map((c) => c.symbol);
    expect(syms("Bb | Gm -> A, Dm")).toEqual(["Bb", "Gm", "A", "Dm"]);
    expect(syms("C C C Am")).toEqual(["C", "Am"]);
  });
});

describe("правописание и ступени", () => {
  it("Bb, а не A#; неудобных имён (Fb, E#, двойных знаков) нет", () => {
    expect(spellNote("G", "b3", 10)).toBe("Bb");
    expect(spellNote("F#", "b3", 9)).toBe("A");
    expect(names("Gm")).toEqual(["Bb", "D", "G"]);
    expect(names("Ebaug")).toEqual(["B", "Eb", "G"]);
    expect(names("Bdim7")).toEqual(["Ab", "B", "D", "F"]);
    expect([parseNoteName("Bb"), parseNoteName("A#")]).toEqual([10, 10]);
  });

  it("aug — #5, dim7 — bb7, нона — 9", () => {
    expect([...parseChord("Caug").degreeByPc.values()]).toEqual(["1", "3", "#5"]);
    expect([...parseChord("Cdim7").degreeByPc.values()]).toEqual(["1", "b3", "b5", "bb7"]);
    expect([...parseChord("Cm9").degreeByPc.values()].at(-1)).toBe("9");
  });

  it("интервалы — по реальному расстоянию", () => {
    expect([intervalName(1), intervalName(13), intervalName(12)]).toEqual(["minor second", "minor ninth", "octave"]);
    expect([intervalName(25), intervalName(24), intervalName(-7)]).toEqual(["minor second plus 2 octaves", "two octaves", "perfect fifth"]);
    expect([degreeFromRoot(2), degreeFromRoot(14), degreeFromRoot(-3)]).toEqual(["2", "9", "6"]);
  });
});

describe("таблица типов", () => {
  it("у каждого типа интервалы отсортированы, без дублей, и подписей столько же", () => {
    for (const t of CHORD_TYPES) {
      expect([...t.intervals].sort((a, b) => a - b), t.kind).toEqual(t.intervals);
      expect(new Set(t.intervals).size, t.kind).toBe(t.intervals.length);
      expect(t.degrees.length, t.kind).toBe(t.intervals.length);
    }
  });

  it("сторож: у двух типов не совпадает множество классов высот от одного рута", () => {
    const seen = new Map<string, string>();
    for (const t of CHORD_TYPES) {
      const key = [...new Set(t.intervals.map((i) => mod(i, 12)))].sort((a, b) => a - b).join(",");
      expect(seen.get(key), `${t.kind} == ${seen.get(key)}`).toBeUndefined();
      seen.set(key, t.kind);
    }
  });

  it("как тип пишется в символе — так он и читается обратно", () => {
    for (const t of CHORD_TYPES) expect(parseChord("C" + suffixOf(t.kind)).kind, t.kind).toBe(t.kind);
  });
});
