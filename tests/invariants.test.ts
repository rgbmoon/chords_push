/**
 * Инварианты модели — перенесены из test_push_grid.py. Паритет с Python
 * проверяется фикстурами, а здесь — то, ради чего всё задумано: свойства сетки,
 * раскраска с фотографии Push, запрет солверу менять аккорд, компактность.
 */
import { describe, expect, it } from "vitest";
import { ChordSpec, chordIntervals, parseChordSymbol, parseProgression } from "../src/core/chord";
import { ALIASES, CHORDS, PALETTE, ROW_SEMITONES, VOICE_LEADING, WEIGHTS } from "../src/core/data";
import { Grid, padIndex } from "../src/core/grid";
import { identify, MAX_NOTES, padsToMidi, suffixOf } from "../src/core/identify";
import { intervalShort, noteToPc, pcToName, spellFrom } from "../src/core/notes";
import { mod } from "../src/core/py";
import {
  allPlacements,
  chordPitches,
  edgeCost,
  invert,
  spanCols,
  voiceChord,
  voiceDistance,
  voiceProgression,
  Voicing,
} from "../src/core/voicing";
import { baseCss, CARD_MAX, CARD_MIN, gridCss, LAYOUT_CSS } from "../src/styles/css";

const g = new Grid();

describe("1–3. сетка: Chromatic, 4ths", () => {
  it("базовая формула", () => {
    expect(ROW_SEMITONES).toBe(5);
    expect(g.midiRc(0, 0)).toBe(36);
    expect(g.midiRc(7, 7)).toBe(78);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) expect(g.midiRc(r, c)).toBe(36 + 5 * r + c);
  });
  it("43 уникальные высоты, диапазон 42, ряды перекрываются, (+2,+2) — октава", () => {
    expect(g.uniquePitches().length).toBe(43);
    expect(g.highestMidi - g.lowestMidi).toBe(42);
    for (let r = 0; r < 7; r++) for (let c = 5; c < 8; c++) expect(g.midiRc(r, c)).toBe(g.midiRc(r + 1, c - 5));
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) expect(g.midiRc(r, c) + 12).toBe(g.midiRc(r + 2, c + 2));
    const rc = [...Array(8).keys()].map((r) => [...Array(8).keys()].find((c) => (5 * r + c) % 12 === 0) ?? null);
    expect(rc).toEqual([0, 7, 2, null, 4, null, 6, 1]);
  });
  it("сдвиг на (dr,dc) всегда транспонирует ровно на 5*dr+dc", () => {
    for (let dr = 0; dr < 3; dr++)
      for (let dc = -3; dc < 4; dc++)
        for (let r = 0; r < 8 - dr; r++)
          for (let c = 0; c < 8; c++) if (c + dc >= 0 && c + dc < 8) expect(g.midiRc(r + dr, c + dc) - g.midiRc(r, c)).toBe(5 * dr + dc);
  });
});

it("4. раскраска совпадает с фотографией Push (C major)", () => {
  const expected = `W O . W . W W .
. W . W . W O .
. W . W W . W .
. W . W O . W .
. W W . W . W .
. W O . W . W W
W . W . W . W O
O . W . W W . W`;
  const sym = { root: "O", in_key: "W", off: "." } as const;
  const got = [...Array(8).keys()]
    .map((rr) => [...Array(8).keys()].map((c) => sym[g.state(padIndex(7 - rr, c))]).join(" "))
    .join("\n");
  expect(got).toBe(expected);
  expect([g.root, g.scale]).toEqual(["C", "major"]);
});

describe("6–8. символы, последовательности, правописание", () => {
  it("символы разбираются верно", () => {
    const cases: Record<string, [string, number, number | null]> = {
      Bb: ["maj", 10, null], Bbmaj7b5: ["maj7b5", 10, null], Gm: ["min", 7, null], Gm6: ["min6", 7, null],
      Dsus2: ["sus2", 2, null], Dm: ["min", 2, null], Csus4: ["sus4", 0, null], C: ["maj", 0, null],
      Am: ["min", 9, null], "Am/C": ["min", 9, 0], "C6/9": ["6_9", 0, null], "F#m7b5": ["m7b5", 6, null],
      Ebaug: ["aug", 3, null], Bdim7: ["dim7", 11, null], A7sus4: ["7sus4", 9, null],
      "C(add9)": ["add9", 0, null], "  Dm7  ": ["min7", 2, null],
    };
    for (const [s, want] of Object.entries(cases)) {
      const spec = parseChordSymbol(s);
      expect([spec.kind, spec.rootPc, spec.bassPc], s).toEqual(want);
    }
  });
  it("регистр значим, алиасы живые, мусор — ошибка", () => {
    expect(parseChordSymbol("CM7").kind).toBe("maj7");
    expect(parseChordSymbol("Cm7").kind).toBe("min7");
    expect(parseChordSymbol("CMAJ7").kind).toBe("maj7");
    for (const v of ALIASES.values()) expect(CHORDS.has(v)).toBe(true);
    // 'Cb5' читается как квинта от Cb — неустранимая двусмысленность нотации
    for (const [a, k] of ALIASES) if (a !== "b5") expect(parseChordSymbol("C" + a).kind, a).toBe(k);
    expect(parseChordSymbol("C(b5)").kind).toBe("majb5");
    expect(parseChordSymbol("Cb5").rootPc).toBe(11);
    for (const wrong of ["Hmaj7", "Cwat", ""]) expect(() => parseChordSymbol(wrong)).toThrow();
  });
  it("последовательности", () => {
    expect(parseProgression("Bb Gm A").map((s) => s.symbol)).toEqual(["Bb", "Gm", "A"]);
    expect(parseProgression("Bb | Gm -> A, Dm").map((s) => s.symbol)).toEqual(["Bb", "Gm", "A", "Dm"]);
    expect(parseProgression("C C C Am").map((s) => s.symbol)).toEqual(["C", "Am"]);
  });
  it("правописание: Bb, а не A#; неудобных имён на пэдах нет", () => {
    expect(spellFrom("G", "b3", 10)).toBe("Bb");
    expect(spellFrom("F#", "b3", 9)).toBe("A");
    const names = (s: string) => [...parseChordSymbol(s).spelling().values()].filter(Boolean).sort();
    expect(names("Gm")).toEqual(["Bb", "D", "G"]);
    expect(names("Ebaug")).toEqual(["B", "Eb", "G"]);
    expect(names("Bdim7")).toEqual(["Ab", "B", "D", "F"]);
    const all = ["Gm", "Bb", "Ebaug", "Bdim7", "C#m7"].flatMap(names) as string[];
    expect(all.filter((n) => ["Fb", "Cb", "E#", "B#"].includes(n) || n.length > 2)).toEqual([]);
    expect([noteToPc("Bb"), noteToPc("A#")]).toEqual([10, 10]);
  });
});

describe("9–12. размещение, рут, призраки, ступени", () => {
  const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  it("все типы × 12 тоник размещаются корректно", () => {
    for (const kind of CHORDS.keys())
      for (let root = 0; root < 12; root++) {
        const v = voiceChord(g, new ChordSpec(NAMES[root] + kind, root, kind, chordIntervals(kind), null, NAMES[root]));
        expect(v.pads.map((p) => g.midi(p)).sort((a, b) => a - b)).toEqual(v.notes);
        expect(v.pads.filter((p) => v.ghosts.includes(p))).toEqual([]);
      }
  });
  it("зелёный — рут аккорда, даже когда в басу не он", () => {
    for (const s of ["Bb", "Gm6", "Am/C", "C6/9", "F#m7b5", "Bbmaj7b5"]) {
      const v = voiceChord(g, s);
      for (const [p, m] of v.overlay) expect(m.isRoot).toBe(g.pc(p) === v.spec.rootPc);
      expect([...v.overlay.values()].some((m) => m.isRoot && !m.ghost)).toBe(true);
    }
    const v = voiceChord(g, "Am/C");
    const low = v.pads.reduce((a, b) => (g.midi(b) < g.midi(a) ? b : a));
    expect(g.pc(low)).toBe(0);
    expect(v.overlay.get(low)!.isRoot).toBe(false);
  });
  it("призраки — все прочие пэды тех же классов высот", () => {
    const v = voiceChord(g, "Gm6");
    const pcs = new Set(v.spec.pitchClasses);
    const everywhere = [...Array(64).keys()].filter((p) => pcs.has(g.pc(p)));
    expect([...v.pads, ...v.ghosts].sort((a, b) => a - b)).toEqual(everywhere);
    expect(voiceChord(g, "Gm6", { ghosts: false }).ghosts).toEqual([]);
  });
  it("ступени: aug — #5, dim7 — bb7, нона — 9", () => {
    expect(parseChordSymbol("Caug").degrees).toEqual(["1", "3", "#5"]);
    expect(parseChordSymbol("Cdim7").degrees).toEqual(["1", "b3", "b5", "bb7"]);
    expect(parseChordSymbol("Cm9").degrees.at(-1)).toBe("9");
  });
});

describe("13. голосоведение по цепочке", () => {
  const PROGS = {
    демо: "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am",
    поп: "C G Am F",
    джаз: "Dm7 G7 Cmaj7 Em7b5 A7 Dm7",
    кварты: "C F Bb Eb Ab Db",
    далеко: "C F#m7 Bb13 Em9",
    бардовский: "Am Dm E7 Am F C E7 Am",
  };
  const measure = (vs: Voicing[]) => {
    let move = 0;
    let hold = 0;
    let voice = 0;
    for (let i = 1; i < vs.length; i++) {
      const [, h, d] = edgeCost(vs[i - 1].notes, vs[i - 1].pads, vs[i].notes, vs[i].pads);
      move += d;
      hold += h;
      voice += voiceDistance(vs[i - 1].notes, vs[i].notes);
    }
    return [move, hold, voice];
  };

  it("invert и выбор вариантов", () => {
    expect(invert([60, 64, 67], 1)).toEqual([64, 67, 72]);
    expect(invert([60, 64, 67], 2)).toEqual([67, 72, 76]);
    expect(allPlacements(g, [48, 52, 55]).length).toBeGreaterThanOrEqual(2);
  });

  it("путь руки короче, общих нот больше, голоса ходят меньше", () => {
    const sums = [0, 0, 0, 0, 0, 0];
    for (const prog of Object.values(PROGS)) {
      const sp = parseProgression(prog);
      const a = measure(voiceProgression(g, sp, { voiceLeading: false }));
      const b = measure(voiceProgression(g, sp));
      expect(b[0]).toBeLessThanOrEqual(a[0] + 1e-9);
      for (let i = 0; i < 3; i++) {
        sums[i] += a[i];
        sums[3 + i] += b[i];
      }
    }
    expect(sums[3]).toBeLessThan(sums[0] * 0.7);
    expect(sums[4]).toBeGreaterThan(sums[1] * 1.4);
    expect(sums[5]).toBeLessThan(sums[2]);
  });

  it("СТРУКТУРА НЕ НАРУШЕНА: рут в басу, интервалы те же, обращений нет", () => {
    for (const prog of Object.values(PROGS))
      for (const v of voiceProgression(g, parseProgression(prog))) {
        const want = v.spec.bassPc ?? v.spec.rootPc;
        expect(mod(Math.min(...v.notes), 12)).toBe(want);
        expect(v.inversion).toBe(0);
        if (v.spec.bassPc === null)
          expect(v.notes.map((n) => mod(n - Math.min(...v.notes), 12)).sort((a, b) => a - b)).toEqual(
            v.spec.intervals.map((i) => i % 12).sort((a, b) => a - b),
          );
      }
    expect(voiceProgression(g, parseProgression(PROGS.демо), { allowInversions: true }).some((v) => v.inversion)).toBe(true);
    const slash = voiceProgression(g, parseProgression("C Am/C G"), { allowInversions: true })[1];
    expect([mod(Math.min(...slash.notes), 12), slash.inversion]).toEqual([0, 0]);
  });

  it("крайние случаи цепочки", () => {
    const vs = voiceProgression(g, parseProgression(PROGS.демо));
    expect(vs[0].move).toBeNull();
    const shared = vs.slice(1).map((c, i) => c.pads.filter((p) => vs[i].pads.includes(p)).length);
    expect(shared.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    const single = voiceProgression(g, parseProgression("Gm6"));
    expect([single.length, single[0].move]).toEqual([1, null]);
    expect(voiceProgression(g, [])).toEqual([]);
  });
});

describe("16. данные согласованы", () => {
  it("веса, ступени, интервалы", () => {
    expect(Object.keys(WEIGHTS).sort()).toEqual(Object.keys(VOICE_LEADING.weights).sort());
    for (const [k, v] of CHORDS) {
      expect(v.degrees.length, k).toBe(v.intervals.length);
      expect([...v.intervals].sort((a, b) => a - b), k).toEqual(v.intervals);
      expect(new Set(v.intervals).size, k).toBe(v.intervals.length);
    }
  });
  it("сторож: у двух типов не совпадает множество классов высот от одного рута", () => {
    const seen = new Map<string, string>();
    for (const [k, v] of CHORDS) {
      const key = [...new Set(v.intervals.map((i) => i % 12))].sort((a, b) => a - b).join(",");
      expect(seen.get(key), `${k} == ${seen.get(key)}`).toBeUndefined();
      seen.set(key, k);
    }
  });
});

describe("17. CSS страницы и схемы", () => {
  const css = gridCss();
  it("раскладка", () => {
    expect(LAYOUT_CSS).not.toContain("position:sticky");
    expect(LAYOUT_CSS.replace(/\n/g, "")).toMatch(/body\{[^}]*overflow:hidden/);
    expect(LAYOUT_CSS).toMatch(/\.pane\{overflow-y:auto/);
    expect(LAYOUT_CSS).toContain("--split:50%");
    expect(baseCss()).toContain("minmax(min(100%,var(--card-min)),1fr)");
    expect(baseCss()).toContain(`--card-min:${CARD_MIN}px`);
    expect(baseCss()).toContain(`--card-max:${CARD_MAX}px`);
    expect(CARD_MIN).toBeGreaterThanOrEqual(315);
  });
  it("схема", () => {
    expect(css).toContain(".pg .p.on u,.pg .p.gh u,.pg .p.ex u{display:block}");
    expect(css).toContain("u.l3{font-size");
    expect(css).toContain(".pgcap{display:flex;flex-wrap:wrap");
    expect((css.match(/min-width:0/g) || []).length).toBeGreaterThanOrEqual(4);
    expect(css.split(".pg .pgf{")[1].slice(0, 200)).not.toContain("white-space:nowrap");
    expect(css).not.toContain("outline:1px solid #4fd98a");
    expect(css).toContain(".pg.edited .sym::after");
    expect(css).toContain("border-radius:50%");
    const st = PALETTE.states;
    expect([st.chord.stops[1], st.chord_root.stops[1]]).not.toContain(st.extra.stops[1]);
    expect(css).toContain(PALETTE.extra_edge);
  });
});

describe("18. компактный режим: аккорд под одну руку", () => {
  const MAXC = VOICE_LEADING.compact_mode.max_cols;
  const seq = ["Bb", "Gm", "Dm", "C", "Am"];
  const cmp = voiceProgression(g, seq, { compact: true });
  const wide = voiceProgression(g, seq, { compact: false });
  it("ни один аккорд не шире 4 колонок, структура та же", () => {
    expect(MAXC).toBe(4);
    expect(cmp.every((v) => spanCols(v.pads) <= MAXC)).toBe(true);
    expect(cmp.every((c, i) => spanCols(c.pads) <= spanCols(wide[i].pads))).toBe(true);
    expect(cmp.some((c, i) => spanCols(c.pads) < spanCols(wide[i].pads))).toBe(true);
    expect(cmp.map((v) => v.notes.map((n) => n % 12).sort())).toEqual(wide.map((v) => v.notes.map((n) => n % 12).sort()));
    expect([spanCols(wide[0].pads), spanCols(cmp[0].pads)]).toEqual([5, 4]);
  });
  // Потолок в 4 колонки МЯГКИЙ: у широко расставленных типов солвер его отпускает,
  // иначе пришлось бы выбрасывать ноты. Список исключений держим поимённо — чтобы
  // новый тип не попал в него незаметно.
  it("шире 4 колонок — ровно шесть типов, и все в пять колонок", () => {
    const wide: string[] = [];
    for (const [kind, ent] of CHORDS) {
      const spec = new ChordSpec("C", 0, kind, ent.intervals);
      const pads = allPlacements(g, chordPitches(spec, 48), { limit: 1, maxCols: MAXC, compact: true });
      if (pads.length && spanCols(pads[0]) > MAXC) wide.push(`${kind}:${spanCols(pads[0])}`);
    }
    expect(wide.sort()).toEqual(["13b9:5", "m11b5:5", "maj7sharp11:5", "maj9sharp11:5", "min13:5", "minMaj9:5"]);
    const triad = allPlacements(g, chordPitches(parseChordSymbol("C"), 48), { limit: 1, maxCols: MAXC, compact: true });
    expect(spanCols(triad[0])).toBe(4);
    const sus = allPlacements(g, chordPitches(parseChordSymbol("Csus2"), 48), { limit: 1, maxCols: MAXC, compact: true });
    expect(spanCols(sus[0])).toBeLessThanOrEqual(3);
    expect(allPlacements(g, chordPitches(parseChordSymbol("Cmin13"), 48), { limit: 1, maxCols: MAXC, compact: true }).length).toBe(1);
  });
});

describe("19. определение аккорда", () => {
  it("тип пишется так, что читается обратно", () => {
    for (const kind of CHORDS.keys()) expect(parseChordSymbol("C" + suffixOf(kind)).kind, kind).toBe(kind);
  });
  it("круговая проверка: аппликатура солвера узнаётся обратно", () => {
    for (const [kind, ent] of CHORDS)
      for (let root = 0; root < 12; root++) {
        const v = voiceChord(g, new ChordSpec("x", root, kind, ent.intervals));
        const top = identify(padsToMidi(v.pads)).candidates[0];
        expect([top?.kind, top?.root_pc], `${kind}@${root}`).toEqual([kind, root]);
      }
  });
  it("рут называет страница, а не бас", () => {
    expect(identify([57, 60, 64, 67]).candidates[0].sym).toBe("Am7");
    expect(identify([60, 64, 67, 69]).candidates[0].sym).toBe("C6");
    expect(identify([60, 64, 67, 69]).candidates.some((c) => c.sym === "Am7/C" && c.inv === 1)).toBe(true);
    expect(identify([57, 60, 64, 67], 9).candidates.map((c) => c.sym)).toEqual(["Am7", "C6/A"]);
    expect(identify([57, 60, 64, 67], 0).candidates[0].sym).toBe("C6/A");
    expect(identify([60, 64, 67, 69], 4).candidates[0].sym).toBe("C6");
  });
  it("не называем аккорд по двум нотам из трёх и не гадаем", () => {
    expect(identify([54, 59, 60]).candidates).toEqual([]);
    expect(identify([54, 59, 55]).candidates.map((c) => c.sym)).toEqual(["Gmaj7/F#"]);
    expect(identify([57, 60, 62, 64, 67], 0).candidates[0].sym).toBe("C69/A");
    expect(MAX_NOTES).toBe(6);
    const r = identify([54, 59, 61, 64]);
    expect(r.candidates[0].sym).toBe("F#7sus4");
    expect(r.candidates.every((c) => c.exact)).toBe(true);
    expect(identify([60, 63, 66, 70, 73]).candidates.every((c) => !(c.missing.length && c.extra.length))).toBe(true);
  });
  it("без квинты, add9, лишняя нота, запись нот", () => {
    const no5 = identify([60, 64, 71]).candidates[0];
    expect([no5.sym, no5.missing]).toEqual(["Cmaj7", ["5"]]);
    expect(identify([60, 64, 67, 62]).candidates[0].sym).toBe("Cadd9");
    const ext = identify([60, 64, 67, 63]).candidates[0];
    expect([ext.sym, ext.extra]).toEqual(["C", ["Eb"]]);
    expect(identify([60, 64, 67, 61]).candidates[0].sym).toBe("C#dim(maj7)/C");
    const bb = identify([58, 62, 65]).candidates[0];
    expect([bb.sym, bb.spelling["10"]]).toEqual(["Bb", "Bb"]);
    expect(Object.keys(identify([57, 60, 64, 67]).candidates[0].degrees).length).toBe(12);
  });
  it("интервалы — по реальному расстоянию", () => {
    expect(identify([]).candidates).toEqual([]);
    expect(identify([60, 67]).interval).toBe("чистая квинта");
    expect(identify([60, 61]).interval).toBe("малая секунда");
    expect(identify([60, 73]).interval).toBe("малая нона");
    expect(identify([60, 72]).interval).toBe("октава");
    expect(identify([60, 85]).interval).toBe("малая секунда через 2 октавы");
    expect(identify([60, 84]).interval).toBe("две октавы");
    const pd = identify([36, 38], 0).pad_degrees;
    expect([pd["2"], pd["20"], pd["4"]]).toEqual(["2", "9", "3"]);
    expect(Object.keys(pd).length).toBe(64);
    expect(identify([36, 38]).pad_degrees).toEqual({});
    expect(padsToMidi([0, 63])).toEqual([36, 78]);
    expect(padsToMidi([99])).toEqual([]);
    expect(intervalShort(14)).toBe("9");
    expect(pcToName(10, true)).toBe("Bb");
  });
});
