import { describe, expect, it } from "vitest";
import { ALL_PADS, HIGHEST_MIDI, LOWEST_MIDI, padAt, padColor, padMidi, padsOfMidi, PADS_TOP_DOWN } from "./grid";

describe("сетка: Chromatic, 4ths", () => {
  it("midi(r, c) = 36 + 5r + c", () => {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) expect(padMidi(padAt(r, c))).toBe(36 + 5 * r + c);
    expect([LOWEST_MIDI, HIGHEST_MIDI]).toEqual([36, 78]);
  });

  it("43 уникальные высоты на 64 пэдах; (+1,−5) — та же нота, (+2,+2) — октава", () => {
    expect(new Set(ALL_PADS.map(padMidi)).size).toBe(43);
    for (let r = 0; r < 7; r++) for (let c = 5; c < 8; c++) expect(padMidi(padAt(r, c))).toBe(padMidi(padAt(r + 1, c - 5)));
    for (let r = 0; r < 6; r++) for (let c = 0; c < 6; c++) expect(padMidi(padAt(r, c)) + 12).toBe(padMidi(padAt(r + 2, c + 2)));
    expect(padsOfMidi(48)).toEqual([padAt(1, 7), padAt(2, 2)]);
  });

  it("раскраска совпадает с фотографией Push (тоника C, гамма C major)", () => {
    const photo = `W O . W . W W .
. W . W . W O .
. W . W W . W .
. W . W O . W .
. W W . W . W .
. W O . W . W W
W . W . W . W O
O . W . W W . W`;
    const mark = { tonic: "O", scale: "W", off: "." } as const;
    const rows = [];
    for (let i = 0; i < 8; i++) rows.push(PADS_TOP_DOWN.slice(i * 8, i * 8 + 8).map((p) => mark[padColor(p)]).join(" "));
    expect(rows.join("\n")).toBe(photo);
  });

  it("в порядке отрисовки верхний ряд первым", () => {
    expect(PADS_TOP_DOWN.slice(0, 8)).toEqual([56, 57, 58, 59, 60, 61, 62, 63]);
    expect(PADS_TOP_DOWN.slice(-8)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
