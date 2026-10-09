import { describe, expect, it } from "vitest";
import { padMidi } from "../grid/grid";
import { voiceChord } from "../grid/voicing";
import { makeChord } from "../theory/chord";
import { CHORD_TYPES, MAX_CHORD_NOTES } from "../theory/chordTypes";
import { identifyChord } from "./identify";

const top = (midis: number[], root: number | null = null) => identifyChord(midis, root).candidates[0];
const symbols = (midis: number[], root: number | null = null) => identifyChord(midis, root).candidates.map((c) => c.symbol);

describe("определение аккорда", () => {
  it("круговая проверка: раскладка солвера узнаётся обратно — все типы × 12 тоник", () => {
    for (const t of CHORD_TYPES)
      for (let root = 0; root < 12; root++) {
        const v = voiceChord(makeChord("x", t.kind, root, "C"));
        const c = top(v.pads.map(padMidi));
        expect([c?.kind, c?.rootPc], `${t.kind}@${root}`).toEqual([t.kind, root]);
      }
  });

  it("рут называет человек, а не бас", () => {
    expect(top([57, 60, 64, 67]).symbol).toBe("Am7");
    expect(top([60, 64, 67, 69]).symbol).toBe("C6");
    expect(symbols([57, 60, 64, 67], 9)).toEqual(["Am7", "C6/A"]);
    expect(top([57, 60, 64, 67], 0).symbol).toBe("C6/A");
    expect(identifyChord([60, 64, 67, 69]).candidates.some((c) => c.symbol === "Am7/C" && c.inversion === 1)).toBe(true);
    expect(top([60, 64, 67, 69], 4).symbol).toBe("C6");
  });

  it("не называет аккорд по двум нотам из трёх и не гадает", () => {
    expect(symbols([54, 59, 60])).toEqual([]);
    expect(symbols([54, 59, 55])).toEqual(["Gmaj7/F#"]);
    expect(top([57, 60, 62, 64, 67], 0).symbol).toBe("C69/A");
    const exact = identifyChord([54, 59, 61, 64]).candidates;
    expect(exact[0].symbol).toBe("F#7sus4");
    expect(exact.every((c) => c.exact)).toBe(true);
    expect(identifyChord([60, 63, 66, 70, 73]).candidates.every((c) => !(c.missing.length && c.extra.length))).toBe(true);
    expect(MAX_CHORD_NOTES).toBe(6);
  });

  it("без квинты, add9, лишняя нота, правописание", () => {
    expect([top([60, 64, 71]).symbol, top([60, 64, 71]).missing]).toEqual(["Cmaj7", ["5"]]);
    expect(top([60, 64, 67, 62]).symbol).toBe("Cadd9");
    expect([top([60, 64, 67, 63]).symbol, top([60, 64, 67, 63]).extra]).toEqual(["C", ["Eb"]]);
    expect(top([60, 64, 67, 61]).symbol).toBe("C#dim(maj7)/C");
    expect([top([58, 62, 65]).symbol, top([58, 62, 65]).nameByPc.get(10)]).toEqual(["Bb", "Bb"]);
    expect(top([57, 60, 64, 67]).degreeByPc.length).toBe(12);
  });

  it("интервал двух нот и ступени пэдов — по реальному расстоянию", () => {
    expect(identifyChord([60, 67]).interval).toBe("perfect fifth");
    expect(identifyChord([60, 73]).interval).toBe("minor ninth");
    const degrees = identifyChord([36, 38], 0).padDegrees!;
    expect([degrees[2], degrees[20], degrees[4]]).toEqual(["2", "9", "3"]);
    expect(degrees.length).toBe(64);
    expect(identifyChord([36, 38]).padDegrees).toBeNull();
    expect(identifyChord([]).candidates).toEqual([]);
  });
});
