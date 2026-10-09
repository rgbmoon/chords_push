import { describe, expect, it } from "vitest";
import { describeSelection } from "./describe";
import { chosenCandidate, finderReducer, FinderState, initialFinderState, isFull, restoreItem, toStored } from "./finderState";
import { readingCells, readingText } from "./reading";

// A2 C3 E3 G3: A = r1c4, C = r2c2, E = r3c1, G = r3c4
const A = 12;
const C = 18;
const E = 25;
const G = 28;

const click = (s: FinderState, ...pads: number[]) => pads.reduce((st, pad) => finderReducer(st, { type: "clickPad", pad }), s);
const start = () => initialFinderState([]);

describe("определение аккорда", () => {
  it("рут — первый нажатый пэд: от A это Am7, от C — C6/A", () => {
    expect(describeSelection(click(start(), A, C, E, G)).symbol).toBe("Am7");
    const fromC = click(start(), C, A, E, G);
    expect(describeSelection(fromC).symbol).toBe("C6/A");
    expect(describeSelection(fromC).description).toBe("major sixth · 3rd inversion");
    // Am7 остаётся вариантом; выбрал — рут переехал на A
    const am7 = fromC.identification.candidates.findIndex((c) => c.symbol === "Am7");
    const chosen = finderReducer(fromC, { type: "chooseCandidate", index: am7 });
    expect([chosenCandidate(chosen)?.symbol, chosen.lockPc]).toEqual(["Am7", 9]);
  });

  it("повторный клик по руту сбрасывает сетку; одна нота — это заявленный рут", () => {
    const s = click(start(), A, C);
    expect(click(s, A).selection).toEqual([]);
    expect(describeSelection(click(start(), A)).description).toBe("root A — now add notes");
  });

  it("если от залоченного рута аккорда нет — заголовка нет, рут не уезжает", () => {
    // C C# E: от C аккорда нет; C#mMaj7/C — только вариант
    const s = click(start(), 18, 19, 22);
    expect(chosenCandidate(s)).toBeNull();
    expect(describeSelection(s).symbol).toBe("?");
    expect(s.lockPc).toBe(0);
  });

  it("больше шести нот не берёт", () => {
    const s = click(start(), 0, 1, 2, 3, 4, 5);
    expect(isFull(s)).toBe(true);
    expect(click(s, 6)).toBe(s);
  });

  it("подбор: добавить, открыть, переставить, убрать", () => {
    let s = click(start(), A, C, E, G);
    s = finderReducer(s, { type: "addToCollection" });
    s = finderReducer(s, { type: "clearGrid" });
    s = finderReducer(click(s, C, E, G), { type: "addToCollection" });
    expect(s.items.map((i) => i.symbol)).toEqual(["Am7", "C"]);
    s = finderReducer(s, { type: "moveItem", from: 1, to: 0 });
    expect(s.items.map((i) => i.symbol)).toEqual(["C", "Am7"]);
    s = finderReducer(s, { type: "openItem", index: 1 });
    expect([describeSelection(s).symbol, s.selection[0]]).toEqual(["Am7", A]);
    s = finderReducer(s, { type: "removeItem", index: 0 });
    expect([s.items.length, s.current]).toEqual([1, 0]);
  });

  it("сохранённый аккорд открывается тем же вариантом и тем же рутом", () => {
    const stored = { symbol: "C6/A", pads: [A, C, E, G], rootPad: C, rootPc: 0, kind: "6" };
    const item = restoreItem(stored);
    expect(item.candidate?.symbol).toBe("C6/A");
    expect(toStored(item)).toEqual(stored);
    const s = initialFinderState([item]);
    expect([describeSelection(s).symbol, s.selection[0]]).toEqual(["C6/A", C]);
  });

  it("раскраска: ноты аккорда, рут, лишняя нота, ступени от рута", () => {
    const s = click(start(), 18, 22, 28, 24); // C E G + Eb
    const cells = readingCells({ pads: s.selection, candidate: chosenCandidate(s), rootPc: 0, padDegrees: s.identification.padDegrees });
    const cell = (p: number) => cells.find((c) => c.pad === p)!;
    expect([cell(18).role, cell(18).isRoot]).toEqual(["chord", true]);
    expect([cell(24).role, cell(24).name]).toEqual(["extra", "Eb"]);
    expect(readingText({ pads: s.selection, candidate: chosenCandidate(s), rootPc: 0, padDegrees: null })).toMatchObject({
      notes: ["C2", "E2", "G2"],
      extraNotes: ["Eb2"], // своя нота — в правописании аккорда: Eb, а не D#
    });
  });
});
