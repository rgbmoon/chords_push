/** Хранилище: чистильщики, правки схем, подборы, бэкап и слияние. */
import { beforeEach, describe, expect, it } from "vitest";
import {
  cleanChords,
  cleanState,
  deleteAnalysis,
  exportAll,
  getAnalysis,
  getPick,
  importAll,
  listAnalyses,
  listPicks,
  resetForTests,
  saveAnalysis,
  saveAnalysisState,
  savePick,
  storageMode,
} from "../src/store/db";

beforeEach(async () => {
  await resetForTests();
});

const base = { kind: "progression" as const, title: "Проба", artist: "", source: "C G Am F", syms: ["C", "G", "Am", "F"] };

describe("чистильщики", () => {
  it("пэды чистятся: дубли и всё, что вне сетки 8×8, выбрасываются", () => {
    const st = cleanState({ Dm: { pads: [9, 2, 7, 9, 64, -1, "x", 2.7], extra: [] }, пусто: { pads: [] }, мусор: 5 });
    expect(st).toEqual({ Dm: { pads: [2, 7, 9], extra: [] } });
    expect(cleanState([1, 2])).toEqual({});
  });
  it("рут не из выбранных пэдов не принимается", () => {
    expect(cleanChords([{ sym: "x", pads: [3, 9], root: 55 }])[0].root).toBe(3);
    expect(cleanChords([{ sym: "", pads: [99] }, "мусор", null])).toEqual([]);
    expect(cleanChords([{ pads: [5], root_pc: -3 }])[0]).toEqual({ sym: "?", pads: [5], root: 5, root_pc: 9, kind: "" });
  });
});

describe("разборы", () => {
  it("сохраняются в IndexedDB, правка источника не теряет правки схем", async () => {
    expect(await storageMode()).toBe("idb");
    const a = await saveAnalysis(base);
    await saveAnalysisState(a.id, { "0:C": { pads: [4, 0, 9], extra: [63] }, "1:G": null });
    const b = await saveAnalysis({ ...base, id: a.id, source: "C G Am F C" });
    expect(b.created).toBe(a.created);
    expect(b.state).toEqual({ "0:C": { pads: [0, 4, 9], extra: [63] } });
    expect((await listAnalyses()).length).toBe(1);
    await deleteAnalysis(a.id);
    expect(await getAnalysis(a.id)).toBeUndefined();
  });
  it("пустой источник не сохраняется, пустое название подставляется", async () => {
    await expect(saveAnalysis({ ...base, source: "   " })).rejects.toThrow("empty source");
    expect((await saveAnalysis({ ...base, title: "  " })).title).toBe("Untitled");
  });
});

describe("подборы", () => {
  it("без имени и пустой — не сохраняется; повторное сохранение не плодит записи", async () => {
    await expect(savePick({ name: "", chords: [{ pads: [1] }] })).rejects.toThrow("name required");
    await expect(savePick({ name: "x", chords: [] })).rejects.toThrow("collection is empty");
    const p = await savePick({ name: "Проба пера", chords: [{ sym: "Am7", pads: [12, 17, 20, 25], root: 20, root_pc: 9, kind: "min7", degrees: { 0: "x" } }] });
    expect(p.chords[0]).toEqual({ sym: "Am7", pads: [12, 17, 20, 25], root: 20, root_pc: 9, kind: "min7" });
    const again = await savePick({ id: p.id, name: "Проба пера", chords: [{ sym: "C", pads: [0, 4, 9] }] });
    expect(again.created).toBe(p.created);
    expect((await listPicks()).length).toBe(1);
    expect((await getPick(p.id))!.chords[0].sym).toBe("C");
  });
});

describe("бэкап", () => {
  it("выгрузка → чистая база → загрузка возвращает всё", async () => {
    const a = await saveAnalysis(base);
    await saveAnalysisState(a.id, { "0:C": { pads: [0, 4, 9], extra: [] } });
    await savePick({ name: "п", chords: [{ sym: "C", pads: [0, 4, 9] }] });
    const dump = JSON.parse(JSON.stringify(await exportAll()));
    await resetForTests();
    expect(await listAnalyses()).toEqual([]);
    expect(await importAll(dump)).toEqual({ added: 2, updated: 0, skipped: 0 });
    expect((await getAnalysis(a.id))!.state).toEqual({ "0:C": { pads: [0, 4, 9], extra: [] } });
  });
  it("слияние: свежее побеждает, старое и мусор пропускаются", async () => {
    const a = await saveAnalysis(base);
    const dump = JSON.parse(JSON.stringify(await exportAll()));
    const newer = { ...dump.analyses[0], title: "Новое", updated: a.updated + 1000 };
    const older = { ...dump.analyses[0], title: "Старое", updated: a.updated - 1000 };
    expect(await importAll({ ...dump, analyses: [newer] })).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect(await importAll({ ...dump, analyses: [older, { id: "x", kind: "bogus" }], picks: [{}] })).toEqual({
      added: 0,
      updated: 0,
      skipped: 3,
    });
    expect((await getAnalysis(a.id))!.title).toBe("Новое");
    await expect(importAll({ hello: 1 })).rejects.toThrow("not a Chords on Push backup");
  });
});
