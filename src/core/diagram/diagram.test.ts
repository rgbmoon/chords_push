import { describe, expect, it } from "vitest";
import { padPc } from "../grid/grid";
import { voiceChord } from "../grid/voicing";
import { parseChord } from "../theory/chord";
import { clickPad, ghostPads, initialDiagram, padLabels, padView, restoreDiagram, summarize } from "./diagram";

const am = parseChord("Am");
const { pads } = voiceChord(am);
const ghosts = ghostPads(am, pads);
const outside = [...Array(64).keys()].find((p) => ![9, 0, 4].includes(padPc(p)))!;

describe("схема аккорда", () => {
  it("подписи есть у всех 64 пэдов: имя по правописанию аккорда, ступень от рута", () => {
    const labels = padLabels(parseChord("Gm"));
    expect(labels.length).toBe(64);
    expect(labels.find((l) => padPc(l.pad) === 10)!.name).toBe("Bb");
    expect(labels.find((l) => padPc(l.pad) === 9)!.degree).toBe("2");
  });

  it("роли: ноты раскладки, бледные — те же ноты на других пэдах, рут отмечен везде", () => {
    const state = initialDiagram(pads);
    expect(pads.map((p) => padView(am, state, p).role)).toEqual(["chord", "chord", "chord"]);
    expect(ghosts.every((p) => padView(am, state, p).role === "ghost")).toBe(true);
    expect(ghosts.filter((p) => padPc(p) === 9).every((p) => padView(am, state, p).isRoot)).toBe(true);
    expect(padView(am, state, outside).role).toBeNull();
  });

  it("перенос голоса вниз-вверх подписывает обращение; своя нота — фиолетовая и снимается", () => {
    const bass = pads[0];
    const up = ghosts.find((p) => padPc(p) === padPc(bass) && p > Math.max(...pads))!;
    const moved = clickPad(am, initialDiagram(pads), up);
    expect(summarize(am, moved, pads)).toMatchObject({ edited: true, inversion: "1st inversion" });

    const added = clickPad(am, initialDiagram(pads), outside);
    expect(padView(am, added, outside).role).toBe("extra");
    expect(summarize(am, added, pads)).toMatchObject({ edited: true, inversion: "", extraNotes: [expect.any(String)] });
    expect(summarize(am, clickPad(am, added, outside), pads).edited).toBe(false);
  });

  it("сохранённая правка принимается, только если число нот совпало", () => {
    expect(restoreDiagram(pads, { pads: [1, 2], extra: [] })).toEqual(initialDiagram(pads));
    const saved = { pads: [...pads], extra: [outside] };
    expect(restoreDiagram(pads, saved)).toEqual(saved);
  });
});
