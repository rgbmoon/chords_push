/**
 * Поведение интерфейса: живая схема, страница определения, сквозной путь
 * «вставил текст — получил разбор — поправил схему — открыл заново».
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseChordSymbol } from "../src/core/chord";
import { Grid } from "../src/core/grid";
import { voiceChord } from "../src/core/voicing";
import { Scheme } from "../src/components/Scheme";
import { routes } from "../src/router";
import { getAnalysis, listPicks, resetForTests, savePick } from "../src/store/db";
import { padMidi } from "../src/view/live";
import { schemeModel } from "../src/view/scheme";

beforeEach(async () => {
  await resetForTests();
});
afterEach(() => {
  cleanup();
});

const pad = (root: ParentNode, p: number) => root.querySelector(`[data-p="${p}"]`) as HTMLElement;
const classes = (el: Element) => [...el.classList].sort().join(" ");

function app(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("живая схема", () => {
  const g = new Grid();
  const v = voiceChord(g, "Am");
  const m = schemeModel(g, v.spec, v.overlay, "Am", "Am");

  it("перенос голоса на бледный пэд подписывает обращение, ⟲ возвращает как было", () => {
    const onSave = vi.fn();
    const { container } = render(<Scheme model={m} onSave={onSave} />);
    const card = container.querySelector(".pg")!;
    expect(card.querySelector(".vlab")!.textContent).toBe("");
    // бас A уезжает на октаву вверх — в басу оказывается C: 1-е обращение
    const bass = v.pads.reduce((a, b) => (g.midi(a) < g.midi(b) ? a : b));
    const up = v.ghosts.find((p) => g.pc(p) === g.pc(bass) && g.midi(p) > Math.max(...v.notes))!;
    fireEvent.click(pad(card, up));
    expect(card.classList.contains("edited")).toBe(true);
    expect(card.querySelector(".vlab")!.textContent).toBe("1-е обращение");
    expect(classes(pad(card, up))).toContain("on");
    expect(onSave).toHaveBeenLastCalledWith("Am", expect.objectContaining({ extra: [] }));
    fireEvent.click(card.querySelector("button.rs")!);
    expect(card.classList.contains("edited")).toBe(false);
    expect(onSave).toHaveBeenLastCalledWith("Am", null);
  });

  it("клик по ноте не из аккорда добавляет её фиолетовым, повторный — снимает", () => {
    const { container } = render(<Scheme model={m} />);
    const card = container.querySelector(".pg")!;
    const other = [...Array(64).keys()].find((p) => ![9, 0, 4].includes(padMidi(p) % 12))!;
    fireEvent.click(pad(card, other));
    expect(classes(pad(card, other))).toContain("ex");
    expect(card.querySelector(".sub .exd")).not.toBeNull();
    expect(card.querySelector(".vlab")!.textContent).toBe(""); // бас не тронут — подписи нет
    fireEvent.click(pad(card, other));
    expect(classes(pad(card, other))).not.toContain("ex");
    expect(card.classList.contains("edited")).toBe(false);
  });

  it("сохранённая правка принимается, если число нот совпало", () => {
    const moved = { pads: [...v.pads.slice(1), v.ghosts.find((p) => g.pc(p) === g.pc(v.pads[0]))!], extra: [] };
    const { container } = render(<Scheme model={m} saved={moved} />);
    expect(container.querySelector(".pg")!.classList.contains("edited")).toBe(true);
    cleanup();
    const { container: c2 } = render(<Scheme model={m} saved={{ pads: [1, 2], extra: [] }} />);
    expect(c2.querySelector(".pg")!.classList.contains("edited")).toBe(false);
  });
});

describe("страница определения", () => {
  // A2 C3 E3 G3 на пэдах: A=45 (r1c4), C=48 (r2c2), E=52 (r3c1), G=55 (r3c4)
  const A = 12;
  const C = 18;
  const E = 25;
  const G = 28;

  it("рут — первый нажатый пэд: от A это Am7, от C — C6/A", async () => {
    app("/find");
    const big = await waitFor(() => document.querySelector(".pg.big") as HTMLElement);
    for (const p of [A, C, E, G]) fireEvent.click(pad(big, p));
    expect(screen.getByText("Am7", { selector: "#sym" })).toBeTruthy();
    expect(big.classList.contains("rooted")).toBe(true);
    // повторный клик по руту сбрасывает сетку целиком
    fireEvent.click(pad(big, A));
    expect(document.querySelector("#sym")!.textContent).toBe("—");
    for (const p of [C, A, E, G]) fireEvent.click(pad(big, p));
    expect(document.querySelector("#sym")!.textContent).toBe("C6/A");
    // Am7 остаётся вариантом — клик по нему переносит рут
    fireEvent.click(screen.getByText("Am7", { selector: "button.alt" }));
    expect(document.querySelector("#sym")!.textContent).toBe("Am7");
  });

  it("больше шести нот не берёт", async () => {
    app("/find");
    const big = await waitFor(() => document.querySelector(".pg.big") as HTMLElement);
    for (const p of [0, 1, 2, 3, 4, 5]) fireEvent.click(pad(big, p));
    expect(big.classList.contains("full")).toBe(true);
    fireEvent.click(pad(big, 6));
    expect(document.querySelector("#warn")!.textContent).toContain("не больше 6 нот");
    expect(classes(pad(big, 6))).not.toContain("on");
  });

  it("подбор: добавить, сохранить, открыть заново", async () => {
    const router = app("/find");
    const big = await waitFor(() => document.querySelector(".pg.big") as HTMLElement);
    for (const p of [A, C, E, G]) fireEvent.click(pad(big, p));
    fireEvent.click(screen.getByText("Добавить в подбор"));
    fireEvent.click(screen.getByText("Очистить сетку"));
    for (const p of [C, E, G]) fireEvent.click(pad(big, p));
    fireEvent.keyDown(document, { key: "Enter" });
    expect(document.querySelectorAll("#strip > .pg").length).toBe(2);
    expect(document.querySelector("#cnt")!.textContent).toBe("Подбор: 2 аккорда");

    fireEvent.click(screen.getByText("Сохранить"));
    expect(document.querySelector("#st")!.textContent).toBe("нужно название");
    fireEvent.change(document.querySelector("#nm")!, { target: { value: "Проба пера" } });
    await act(async () => {
      fireEvent.click(screen.getByText("Сохранить"));
    });
    await waitFor(() => expect(document.querySelector("#st")!.textContent).toBe("сохранено"));
    const [saved] = await listPicks();
    expect(saved.name).toBe("Проба пера");
    expect(saved.chords.map((c) => c.sym)).toEqual(["Am7", "C"]);
    expect(saved.chords[0].root).toBe(A); // рутовый пэд запоминается
    expect(router.state.location.pathname).toBe(`/find/${saved.id}`);
    // сетка после сохранения не сбросилась
    expect(document.querySelector("#sym")!.textContent).toBe("C");
    // а «новый подбор» после сохранения — чистый лист
    await act(async () => {
      await router.navigate("/find");
    });
    await waitFor(() => expect(document.querySelectorAll("#strip > .pg").length).toBe(0));
    expect((document.querySelector("#nm") as HTMLInputElement).value).toBe("");

    cleanup();
    app(`/find/${saved.id}`);
    await waitFor(() => expect(document.querySelectorAll("#strip > .pg").length).toBe(2));
    await waitFor(() => expect(document.querySelector("#sym")!.textContent).toBe("Am7")); // первый аккорд сразу на сетке
    expect((document.querySelector("#nm") as HTMLInputElement).value).toBe("Проба пера");
  });

  it("сохранённый подбор с выбранным вариантом открывается с ним же", async () => {
    const p = await savePick({ name: "x", chords: [{ sym: "C6/A", pads: [A, C, E, G], root: C, root_pc: 0, kind: "6" }] });
    app(`/find/${p.id}`);
    await waitFor(() => expect(document.querySelector("#sym")!.textContent).toBe("C6/A"));
  });
});

describe("сквозной путь", () => {
  it("вставил текст песни — получил разбор, правка схемы пережила перезагрузку", async () => {
    const router = app("/");
    const ta = await waitFor(() => document.querySelector("textarea")!);
    fireEvent.change(ta, {
      target: {
        value: "[Verse]\nAm                F\nВечер тихо ходит по крыше\nC                     G\nВетер пишет письма воде\n",
      },
    });
    expect(document.querySelector(".einfo")!.textContent).toContain("схем: 4");
    await act(async () => {
      fireEvent.click(screen.getByText("Разобрать"));
    });
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/a\//));
    const id = router.state.location.pathname.split("/")[2];
    await waitFor(() => expect(document.querySelectorAll(".side .pg").length).toBe(4));
    expect(document.title).toContain("Вечер тихо ходит по крыше");
    expect(document.querySelector(".sheet h2")!.textContent).toBe("Verse");

    // поправили схему Am: добавили свою ноту — в базу она уходит через 120 мс
    const am = document.querySelector('.side .pg[data-key="Am"]')!;
    const other = [...Array(64).keys()].find((p) => ![9, 0, 4].includes(padMidi(p) % 12))!;
    fireEvent.click(pad(am, other));
    await waitFor(async () => expect((await getAnalysis(id))!.state.Am?.extra).toEqual([other]));

    cleanup();
    app(`/a/${id}`);
    await waitFor(() => expect(document.querySelectorAll(".side .pg").length).toBe(4));
    const again = document.querySelector('.side .pg[data-key="Am"]')!;
    expect(again.classList.contains("edited")).toBe(true);
    expect(classes(pad(again, other))).toContain("ex");
  });

  it("голая последовательность — лента схем, у каждого места своя", async () => {
    const router = app("/");
    const ta = await waitFor(() => document.querySelector("textarea")!);
    fireEvent.change(ta, { target: { value: "Am Dm E7 Am" } });
    expect(document.querySelector(".einfo")!.textContent).toContain("последовательность: 4 аккорда");
    await act(async () => {
      fireEvent.click(screen.getByText("Разобрать"));
    });
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/a\//));
    await waitFor(() => expect(document.querySelectorAll(".cards .pg").length).toBe(4));
    expect([...document.querySelectorAll(".cards .pg")].map((e) => e.getAttribute("data-key"))).toEqual([
      "0:Am",
      "1:Dm",
      "2:E7",
      "3:Am",
    ]);
    expect(document.querySelector(".seq")!.textContent).toBe("Am → Dm → E7 → Am");
  });

  it("неизвестный аккорд в последовательности не даёт сохранить", async () => {
    app("/");
    const ta = await waitFor(() => document.querySelector("textarea")!);
    fireEvent.change(ta, { target: { value: "Am Cmaj7#9 F" } });
    expect(document.querySelector(".einfo")!.textContent).toContain("не распознаны: Cmaj7#9");
    expect((screen.getByText("Разобрать") as HTMLButtonElement).disabled).toBe(true);
  });

  it("нет такой страницы / нет такого разбора", async () => {
    app("/nope");
    await waitFor(() => expect(document.querySelector("h1")!.textContent).toBe("Нет такой страницы"));
    cleanup();
    app("/a/missing");
    await waitFor(() => expect(document.querySelector("h1")!.textContent).toBe("Нет такого разбора"));
  });
});

it("символ из модели — тот же, что в ядре", () => {
  expect(parseChordSymbol("Am").symbol).toBe("Am");
});
