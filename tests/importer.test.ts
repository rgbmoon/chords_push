/**
 * Импорт сырого копипаста. Текст выдуман, но шум в нём ровно тот, что бывает
 * на ultimate-guitar и amdm: секции в квадратных скобках, пометки в скобках,
 * звёздочки-сноски, x2, N.C., тактовые черты, табы и неразрывные пробелы.
 */
import { describe, expect, it } from "vitest";
import { analyzeInput, isChordishLine, normalizePaste } from "../src/core/importer";
import { parseSource, songChain } from "../src/core/sheet";

const NBSP = " ";

const RAW = [
  "[Intro]",
  "Dm",
  NBSP,
  "[Verse]",
  "Dm                       Bb(b5)/D",
  "Somewhere a kettle is singing",
  "          A7         Dsus2",
  "Morning spills across the floor",
  NBSP,
  "Bbadd#11                               Bb(b5)/D",
  "Paper boats along the window sill tonight",
  "A7 (E string - 3 1 0)*         Dsus2",
  "Nobody knows where they go",
  NBSP,
  "F*     E*",
  "Oh-ooo-o",
  NBSP,
  "[Chorus]",
  "  Dm    Bbadd#11     Dmadd9/A",
  "Oh--oh--oh, the kettle sings",
  "        A7",
  "As the window fogs",
].join("\n");

// то же самое, вычищенное руками — как это делалось раньше
const CLEAN = [
  "# Intro",
  "Dm",
  "",
  "# Verse",
  "Dm                       Bb(b5)/D",
  "Somewhere a kettle is singing",
  "          A7         Dsus2",
  "Morning spills across the floor",
  "",
  "Bbadd#11                               Bb(b5)/D",
  "Paper boats along the window sill tonight",
  "A7                             Dsus2",
  "Nobody knows where they go",
  "",
  "F      E",
  "Oh-ooo-o",
  "",
  "# Chorus",
  "  Dm    Bbadd#11     Dmadd9/A",
  "Oh--oh--oh, the kettle sings",
  "        A7",
  "As the window fogs",
].join("\n");

describe("сырой копипаст", () => {
  it("даёт те же секции, строки и колонки аккордов, что ручная чистка", () => {
    const a = parseSource(normalizePaste(RAW), { isChordLine: isChordishLine });
    const b = parseSource(CLEAN);
    expect(a.sections.map((s) => s.title)).toEqual(b.sections.map((s) => s.title));
    expect(a.sections.map((s) => s.lines.map((l) => [l.kind, l.chords]))).toEqual(
      b.sections.map((s) => s.lines.map((l) => [l.kind, l.chords])),
    );
    expect(songChain(a)).toEqual(songChain(b));
  });

  it("определяется как песня, без ложных предупреждений", () => {
    const r = analyzeInput(RAW);
    expect(r.kind).toBe("sheet");
    if (r.kind !== "sheet") return;
    expect(r.unknown).toEqual([]);
    expect(r.sections).toBe(3);
    expect(r.chain).toEqual(songChain(parseSource(CLEAN)));
  });

  it("табы раскрываются по 8 колонок, а не в один пробел", () => {
    expect(normalizePaste("C\tG\nla la la la la la la la la")).toBe("C       G\nla la la la la la la la la");
  });

  it("«Припев:» и «Intro: Am F» становятся секциями", () => {
    const n = normalizePaste("Припев:\nAm F\nла-ла\nIntro: Am  F  C  G");
    expect(n.split("\n")).toEqual(["# Припев", "Am F", "ла-ла", "# Intro", "       Am  F  C  G"]);
  });

  it("тактовые черты и повторы убираются, `|` в начале строки по-прежнему значит «текст»", () => {
    expect(normalizePaste("| Am | F | x2")).toBe("  Am   F     ");
    expect(normalizePaste("|Am I wrong")).toBe("|Am I wrong");
    expect(normalizePaste(".Am")).toBe(".Am");
  });

  it("H — это B, Bm7-5 — это Bm7b5", () => {
    expect(normalizePaste("Hm7  E  Bm7-5 C+5")).toBe("Bm7  E  Bm7b5 C#5");
  });

  it("неизвестный аккорд не превращает строку в текст и попадает в предупреждения", () => {
    const r = analyzeInput("Am       Cmaj7#9\nкакой-то текст песни");
    expect(r.kind).toBe("sheet");
    if (r.kind !== "sheet") return;
    expect(r.song.sections[0].lines[0].kind).toBe("pair");
    expect(r.chain).toEqual(["Am"]);
    expect(r.unknown).toEqual([{ sym: "Cmaj7#9", line: 1 }]);
  });

  it("обычные слова за аккорды не принимаются", () => {
    for (const l of ["A Bad Day", "Am I wrong?", "Down by the river", "Hello Dolly"]) expect(isChordishLine(l), l).toBe(false);
  });
});

describe("что вставили", () => {
  it("голая последовательность", () => {
    const r = analyzeInput("Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am");
    expect(r).toMatchObject({ kind: "progression", syms: ["Bb", "Bbmaj7b5", "Gm", "Gm6", "Dsus2", "Dm", "Csus4", "C", "Am"] });
  });

  it("последовательность с разделителями, секциями и шапкой", () => {
    const r = analyzeInput("@title: Проба\n[Куплет]\nBb | Gm -> A, Dm\n\n[Припев]\nC C Am x2");
    expect(r).toMatchObject({ kind: "progression", meta: { title: "Проба" }, syms: ["Bb", "Gm", "A", "Dm", "C", "Am"] });
  });

  it("неизвестный аккорд в последовательности — в списке, а не молча", () => {
    const r = analyzeInput("Am Cmaj7#9 F");
    expect(r).toMatchObject({ kind: "progression", syms: ["Am", "F"], unknown: [{ sym: "Cmaj7#9", line: 1 }] });
  });

  it("текст без аккордов под строками — схемы по проигрышам", () => {
    const r = analyzeInput("# Intro\nAm F C G\n\n# Verse\nпросто текст");
    expect(r.kind).toBe("sheet");
    if (r.kind !== "sheet") return;
    expect(r.allChords).toBe(true);
    expect(r.chain).toEqual(["Am", "F", "C", "G"]);
  });

  it("пусто", () => {
    expect(analyzeInput("  \n\n@title: x\n# Секция").kind).toBe("empty");
  });

  it("исходный формат проекта читается так же, как раньше", () => {
    const src = "@title: Проба\n@key: Dm\n\n# Intro\nBb        Bbmaj7b5\n\n# Verse 1\nBb\nLanterns in the rain\nAm                 C\nWalk to the harbor\n";
    const r = analyzeInput(src);
    expect(r.kind).toBe("sheet");
    if (r.kind !== "sheet") return;
    expect(r.meta).toEqual({ title: "Проба", key: "Dm" });
    expect(r.chain).toEqual(songChain(parseSource(src)));
    expect(r.skipped).toEqual(["Bbmaj7b5"]);
  });
});
