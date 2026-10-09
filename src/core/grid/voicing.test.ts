import { describe, expect, it } from "vitest";
import { mod } from "../math";
import { makeChord, parseChord, parseProgression } from "../theory/chord";
import { CHORD_TYPES } from "../theory/chordTypes";
import { byPadPitch, padMidi, spanCols } from "./grid";
import { chordPitches, handMove, heldPads, placements, SOLVER, voiceChord, Voicing, voiceDistance, voiceProgression } from "./voicing";

const PROGRESSIONS = [
  "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am",
  "C G Am F",
  "Dm7 G7 Cmaj7 Em7b5 A7 Dm7",
  "C F Bb Eb Ab Db",
  "C F#m7 Bb13 Em9",
  "Am Dm E7 Am F C E7 Am",
];
const ROOTS = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

describe("один аккорд", () => {
  it("все типы × 12 тоник размещаются: пэды ровно на своих нотах", () => {
    for (const t of CHORD_TYPES)
      for (let root = 0; root < 12; root++) {
        const v = voiceChord(makeChord(ROOTS[root] + t.kind, t.kind, root, ROOTS[root]));
        expect(v.pads.map(padMidi), `${t.kind}@${root}`).toEqual(v.notes);
      }
  });

  it("слэш-бас — нижний голос", () => {
    const v = voiceChord(parseChord("Am/C"));
    expect(mod(v.notes[0], 12)).toBe(0);
    expect(chordPitches(parseChord("G/B"), 48)[0] % 12).toBe(11);
  });
});

describe("компактность: аккорд под одну руку", () => {
  it("трезвучие — ровно 4 колонки, sus — 3", () => {
    expect(spanCols(placements(chordPitches(parseChord("C")), { limit: 1 })[0])).toBe(4);
    expect(spanCols(placements(chordPitches(parseChord("Csus2")), { limit: 1 })[0])).toBeLessThanOrEqual(3);
  });

  it("шире четырёх колонок — ровно шесть типов, и все в пять: потолок мягкий, ноты не режет", () => {
    const wide = CHORD_TYPES.map((t) => [t.kind, spanCols(placements(chordPitches(makeChord("C", t.kind, 0, "C")), { limit: 1 })[0])] as const)
      .filter(([, w]) => w > SOLVER.maxCols)
      .map(([k, w]) => `${k}:${w}`);
    expect(wide.sort()).toEqual(["13b9:5", "m11b5:5", "maj7sharp11:5", "maj9sharp11:5", "min13:5", "minMaj9:5"]);
  });

  it("компактная раскладка никогда не шире обычной и хотя бы раз уже (Bb: 5 -> 4)", () => {
    const chords = parseProgression("Bb Gm Dm C Am");
    const narrow = voiceProgression(chords);
    const wide = voiceProgression(chords, { compact: false });
    narrow.forEach((v, i) => expect(spanCols(v.pads)).toBeLessThanOrEqual(spanCols(wide[i].pads)));
    expect([spanCols(wide[0].pads), spanCols(narrow[0].pads)]).toEqual([5, 4]);
  });
});

describe("голосоведение по цепочке", () => {
  const measure = (vs: Voicing[]) =>
    vs.slice(1).reduce(
      ([move, held, voice], v, i) => [move + handMove(vs[i].pads, v.pads), held + heldPads(vs[i].pads, v.pads), voice + voiceDistance(vs[i].notes, v.notes)],
      [0, 0, 0],
    );

  it("путь руки короче минимум на 30%, общих нот больше в 1.4 раза, голоса ходят меньше", () => {
    const sums = [0, 0, 0, 0, 0, 0];
    for (const p of PROGRESSIONS) {
      const chords = parseProgression(p);
      const alone = measure(voiceProgression(chords, { voiceLeading: false }));
      const smart = measure(voiceProgression(chords));
      expect(smart[0]).toBeLessThanOrEqual(alone[0] + 1e-9);
      for (let i = 0; i < 3; i++) {
        sums[i] += alone[i];
        sums[i + 3] += smart[i];
      }
    }
    expect(sums[3]).toBeLessThan(sums[0] * 0.7);
    expect(sums[4]).toBeGreaterThan(sums[1] * 1.4);
    expect(sums[5]).toBeLessThan(sums[2]);
  });

  it("СТРУКТУРА НЕ НАРУШЕНА: рут (или слэш-бас) в басу, интервалы те же", () => {
    for (const p of [...PROGRESSIONS, "C Am/C G/B D/F#"])
      for (const v of voiceProgression(parseProgression(p))) {
        expect(mod(v.notes[0], 12), v.chord.symbol).toBe(v.chord.bassPc ?? v.chord.rootPc);
        if (v.chord.bassPc === null)
          expect(v.notes.map((n) => mod(n - v.notes[0], 12)).sort((a, b) => a - b)).toEqual(
            v.chord.intervals.map((i) => i % 12).sort((a, b) => a - b),
          );
        expect([...v.pads].sort(byPadPitch).map(padMidi)).toEqual(v.notes);
      }
  });

  it("крайние случаи: пустая цепочка, один аккорд, у первого сдвига нет", () => {
    expect(voiceProgression([])).toEqual([]);
    const [one] = voiceProgression([parseChord("Gm6")]);
    expect(one.move).toBeNull();
    const vs = voiceProgression(parseProgression(PROGRESSIONS[0]));
    expect(vs[1].move).toBeGreaterThanOrEqual(0);
  });
});
