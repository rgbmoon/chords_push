import { beforeEach, describe, expect, it } from "vitest";
import { resetStoreForTests, storageMode } from "./db";
import {
  deleteChart,
  exportBackup,
  getChart,
  getCollection,
  importBackup,
  listCharts,
  listCollections,
  saveChart,
  saveChartEdits,
  saveCollection,
} from "./index";
import { cleanCollectionChords, cleanEdits } from "./sanitize";

beforeEach(resetStoreForTests);

const draft = { kind: "progression" as const, title: "Test", artist: "", source: "C G Am F", chords: ["C", "G", "Am", "F"] };

describe("чистильщики", () => {
  it("пэды: без дублей и всего, что вне сетки 8×8", () => {
    expect(cleanEdits({ Dm: { pads: [9, 2, 7, 9, 64, -1, "x", 2.7], extra: [] }, empty: { pads: [] }, junk: 5 })).toEqual({
      Dm: { pads: [2, 7, 9], extra: [] },
    });
  });
  it("рут не из выбранных пэдов не принимается", () => {
    expect(cleanCollectionChords([{ symbol: "x", pads: [3, 9], rootPad: 55 }])[0].rootPad).toBe(3);
    expect(cleanCollectionChords([{ pads: [5], rootPc: -3 }])[0]).toEqual({ symbol: "?", pads: [5], rootPad: 5, rootPc: 9, kind: "" });
    expect(cleanCollectionChords([{ pads: [99] }, "junk", null])).toEqual([]);
  });
});

describe("разборы", () => {
  it("правка источника не теряет правки схем", async () => {
    expect(await storageMode()).toBe("indexeddb");
    const a = await saveChart(draft);
    await saveChartEdits(a.id, { "0:C": { pads: [4, 0, 9], extra: [63] } });
    const b = await saveChart({ ...draft, id: a.id, source: "C G Am F C" });
    expect(b.created).toBe(a.created);
    expect(b.edits).toEqual({ "0:C": { pads: [0, 4, 9], extra: [63] } });
    await deleteChart(a.id);
    expect(await getChart(a.id)).toBeUndefined();
  });
  it("пустой источник не сохраняется, пустое название подставляется", async () => {
    await expect(saveChart({ ...draft, source: "  " })).rejects.toThrow("empty source");
    expect((await saveChart({ ...draft, title: " " })).title).toBe("Untitled");
  });
});

describe("подборы", () => {
  it("без имени и пустой — нет; повторное сохранение обновляет ту же запись", async () => {
    await expect(saveCollection({ name: "", chords: [{ symbol: "C", pads: [1], rootPad: 1, rootPc: 0, kind: "maj" }] })).rejects.toThrow(
      "name required",
    );
    await expect(saveCollection({ name: "x", chords: [] })).rejects.toThrow("collection is empty");
    const c = await saveCollection({ name: "Demo", chords: [{ symbol: "Am7", pads: [12, 17, 20, 25], rootPad: 20, rootPc: 9, kind: "min7" }] });
    const again = await saveCollection({ id: c.id, name: "Demo", chords: [{ symbol: "C", pads: [0, 4, 9], rootPad: 0, rootPc: 0, kind: "maj" }] });
    expect(again.created).toBe(c.created);
    expect((await listCollections()).length).toBe(1);
    expect((await getCollection(c.id))!.chords[0].symbol).toBe("C");
  });
});

describe("бэкап", () => {
  it("выгрузка → чистая база → загрузка возвращает всё", async () => {
    const a = await saveChart(draft);
    await saveChartEdits(a.id, { "0:C": { pads: [0, 4, 9], extra: [] } });
    await saveCollection({ name: "p", chords: [{ symbol: "C", pads: [0, 4, 9], rootPad: 0, rootPc: 0, kind: "maj" }] });
    const dump = JSON.parse(JSON.stringify(await exportBackup()));
    await resetStoreForTests();
    expect(await listCharts()).toEqual([]);
    expect(await importBackup(dump)).toEqual({ added: 2, updated: 0, skipped: 0 });
    expect((await getChart(a.id))!.edits).toEqual({ "0:C": { pads: [0, 4, 9], extra: [] } });
  });
  it("свежее побеждает, старое и мусор пропускаются, чужой файл — ошибка", async () => {
    const a = await saveChart(draft);
    const dump = JSON.parse(JSON.stringify(await exportBackup()));
    const newer = { ...dump.charts[0], title: "Newer", updated: a.updated + 1000 };
    const older = { ...dump.charts[0], title: "Older", updated: a.updated - 1000 };
    expect(await importBackup({ ...dump, charts: [newer] })).toEqual({ added: 0, updated: 1, skipped: 0 });
    expect(await importBackup({ ...dump, charts: [older, { id: "x", kind: "bogus" }], collections: [{}] })).toEqual({
      added: 0,
      updated: 0,
      skipped: 3,
    });
    expect((await getChart(a.id))!.title).toBe("Newer");
    await expect(importBackup({ hello: 1 })).rejects.toThrow("not a Chords on Push backup");
  });
});
