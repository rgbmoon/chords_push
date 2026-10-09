import { expect, it } from "vitest";
import { baseCss, CARD_MAX, CARD_MIN, gridCss, LAYOUT_CSS } from "../src/styles/css";
import { fixture } from "./fixtures";

it("CSS собирается из палитры ровно так же, как в Python", () => {
  const f = fixture("css.json");
  expect(baseCss()).toBe(f.base);
  expect(LAYOUT_CSS).toBe(f.layout);
  expect(gridCss()).toBe(f.grid);
  expect([CARD_MIN, CARD_MAX]).toEqual([f.card_min, f.card_max]);
});
