/** Сквозные сценарии: вставил текст — получил разбор; подбор на странице определения. */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { padPc } from "../core/grid/grid";
import { resetStoreForTests } from "../storage/db";
import { getChart, listCollections } from "../storage";
import { routes } from "./routes";

beforeEach(resetStoreForTests);
afterEach(cleanup);

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

const pad = (root: ParentNode, p: number) => root.querySelector(`[data-pad="${p}"]`) as HTMLElement;
const diagrams = () => [...document.querySelectorAll("[aria-label=diagrams] [data-chord]")];

async function createChart(text: string) {
  const router = open("/");
  fireEvent.change(await screen.findByLabelText("chords or lyrics with chords"), { target: { value: text } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Create chart" })).toHaveProperty("disabled", false));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Create chart" }));
  });
  await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/charts\//));
  return { router, id: router.state.location.pathname.split("/")[2] };
}

describe("разбор", () => {
  it("песня: текст слева, схемы справа; правка схемы переживает перезагрузку", async () => {
    const lyrics = "[Verse]\nAm                F\nEvening walks across the rooftops\nC                     G\nWind is writing letters to the sea\n";
    const { id } = await createChart(lyrics);
    await waitFor(() => expect(diagrams().map((d) => d.getAttribute("data-chord"))).toEqual(["Am", "F", "C", "G"]));
    expect(screen.getByRole("heading", { level: 2, name: "Verse" })).toBeTruthy();
    expect(document.title).toContain("Evening walks across the rooftops");

    const am = document.querySelector('[data-chord="Am"]')!;
    const outside = [...Array(64).keys()].find((p) => ![9, 0, 4].includes(padPc(p)))!;
    fireEvent.click(pad(am, outside));
    await waitFor(async () => expect((await getChart(id))!.edits.Am?.extra).toEqual([outside]));

    cleanup();
    open(`/charts/${id}`);
    await waitFor(() => expect(diagrams().length).toBe(4));
    expect(pad(document.querySelector('[data-chord="Am"]')!, outside).dataset.role).toBe("extra");
  });

  it("последовательность: своя схема у каждого места в цепочке", async () => {
    await createChart("Am Dm E7 Am");
    await waitFor(() => expect(diagrams().map((d) => d.getAttribute("data-chord"))).toEqual(["Am", "Dm", "E7", "Am"]));
    expect(screen.getByLabelText("progression").textContent).toBe("Am → Dm → E7 → Am");
  });

  it("сводка под полем и запрет на нераспознанный аккорд в последовательности", async () => {
    open("/");
    const field = await screen.findByLabelText("chords or lyrics with chords");
    fireEvent.change(field, { target: { value: "Am Cmaj7#9 F" } });
    await waitFor(() => expect(screen.getByText(/not recognized/).textContent).toContain("Cmaj7#9"));
    expect(screen.getByRole("button", { name: "Create chart" })).toHaveProperty("disabled", true);
  });

  it("правка источника — в тот же разбор", async () => {
    const { router, id } = await createChart("C G Am F");
    await act(async () => {
      await router.navigate(`/charts/${id}/edit`);
    });
    const field = await screen.findByLabelText("chords or lyrics with chords");
    fireEvent.change(field, { target: { value: "C G Am F C" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toHaveProperty("disabled", false));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    await waitFor(() => expect(router.state.location.pathname).toBe(`/charts/${id}`));
    expect((await getChart(id))!.source).toBe("C G Am F C");
  });

  it("нет такой страницы, нет такого разбора", async () => {
    open("/nope");
    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeTruthy();
    cleanup();
    open("/charts/missing");
    expect(await screen.findByRole("heading", { name: "No such chart" })).toBeTruthy();
  });
});

describe("определение аккорда", () => {
  // A2 C3 E3 G3
  const [A, C, E, G] = [12, 18, 25, 28];
  const symbol = () => screen.getByTestId("finder-symbol").textContent;

  it("рут — первый пэд; подбор сохраняется, открывается заново, «новый» — чистый лист", async () => {
    const router = open("/finder");
    const grid = await screen.findByRole("group", { name: "pad grid" });
    for (const p of [A, C, E, G]) fireEvent.click(pad(grid, p));
    expect(symbol()).toBe("Am7");
    fireEvent.click(screen.getByRole("button", { name: "Add to collection" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear grid" }));
    for (const p of [C, E, G]) fireEvent.click(pad(grid, p));
    fireEvent.keyDown(document.body, { key: "Enter" });
    expect(screen.getByText("Collection: 2 chords")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("name required")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("collection name"), { target: { value: "Demo" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });
    await waitFor(() => expect(router.state.location.pathname).toMatch(/^\/finder\/.+/));
    const [saved] = await listCollections();
    expect(saved.chords.map((c) => [c.symbol, c.rootPad])).toEqual([
      ["Am7", A],
      ["C", C],
    ]);
    expect(symbol()).toBe("C"); // сетка после сохранения не сбросилась

    await act(async () => {
      await router.navigate("/finder");
    });
    await waitFor(() => expect(screen.getByText("Collection is empty")).toBeTruthy());

    cleanup();
    open(`/finder/${saved.id}`);
    await waitFor(() => expect(screen.getByText("Collection: 2 chords")).toBeTruthy());
    expect(symbol()).toBe("Am7"); // первый аккорд подбора сразу на сетке
    expect((screen.getByLabelText("collection name") as HTMLInputElement).value).toBe("Demo");
  });

  it("больше шести нот не берёт и говорит об этом", async () => {
    open("/finder");
    const grid = await screen.findByRole("group", { name: "pad grid" });
    for (const p of [0, 1, 2, 3, 4, 5, 6]) fireEvent.click(pad(grid, p));
    expect(screen.getByText(/at most 6 notes/)).toBeTruthy();
    expect(pad(grid, 6).dataset.role).toBeUndefined();
  });
});
