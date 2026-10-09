import { describe, expect, it } from "vitest";
import { analyzeInput } from "./analyze";
import { normalizePaste } from "./normalize";
import { chordMarks, isChordLine, parseSheet, songChords, splitLyric } from "./sheet";
import { songDiagrams } from "./songDiagrams";

const SONG = `@title: Lanterns
@artist: Someone
@key: Dm

# Intro
Bb        Bbmaj7b5

# Verse 1
Bb
Lanterns in the rain
Am                 C
Walk to the harbor
Counting all the gulls
Dm   Gm
(oh) Sail away
`;

const marks = (line: { chords?: { column: number; symbol: string }[] }) => line.chords?.map((c) => [c.column, c.symbol]);

describe("разбор текста песни", () => {
  const song = parseSheet(SONG);
  const [intro, verse] = song.sections;

  it("шапка и секции", () => {
    expect(song.meta).toEqual({ title: "Lanterns", artist: "Someone", key: "Dm" });
    expect(song.sections.map((s) => s.title)).toEqual(["Intro", "Verse 1"]);
  });

  it("строка аккордов + текст = пара; без текста — проигрыш; колонки как есть", () => {
    expect(intro.lines.map((l) => l.kind)).toEqual(["chords"]);
    expect(verse.lines.map((l) => l.kind)).toEqual(["pair", "pair", "lyric", "pair"]);
    expect(marks(verse.lines[1] as never)).toEqual([[0, "Am"], [19, "C"]]);
  });

  it("схемы — только для аккордов под текстом; проигрыш — по просьбе", () => {
    expect(songChords(song)).toEqual(["Bb", "Am", "C", "Dm", "Gm"]);
    expect(songChords(song, { lyricsOnly: false }).slice(0, 2)).toEqual(["Bb", "Bbmaj7b5"]);
  });

  it("строка аккордов отличается от текста", () => {
    expect(isChordLine("Bb   Gm")).toBe(true);
    for (const l of ["Counting all the gulls", "Am I still here?", "But you're never", "|Am", "A Bad Day", "Down by the river"])
      expect(isChordLine(l), l).toBe(false);
    expect(isChordLine(".Am")).toBe(true);
    expect(chordMarks(".Am  C")).toEqual([
      { column: 1, symbol: "Am", known: true },
      { column: 5, symbol: "C", known: true },
    ]);
  });

  it("разрез строки по колонкам ничего не теряет, аккорд встаёт над слогом", () => {
    const lyric = "Walk to the harbor";
    const pieces = splitLyric(lyric, chordMarks("Am      C"));
    expect(pieces.map((p) => p.text).join("")).toBe(lyric);
    expect(pieces[1].text.startsWith("the")).toBe(true);
    expect(splitLyric(lyric, chordMarks("     C"))[0]).toEqual({ chord: null, text: "Walk " });
    expect(splitLyric("(oh)", chordMarks("Bb   Gm   Dm")).at(-1)!.text).toBe("");
    expect(splitLyric("👋 hi there", chordMarks("  C")).at(-1)!.text).toBe("hi there"); // колонки в символах
  });

  it("одна схема на уникальный аккорд, раскладка из цепочки", () => {
    const d = songDiagrams(["Am", "F", "C", "G", "Am", "F"]);
    expect(d.map((x) => x.chord.symbol)).toEqual(["Am", "F", "C", "G"]);
  });
});

const NBSP = " ";
const RAW = [
  "[Intro]", "Dm", NBSP, "[Verse]",
  "Dm                       Bb(b5)/D", "Somewhere a kettle is singing",
  "A7 (E string - 3 1 0)*         Dsus2", "Nobody knows where they go", NBSP,
  "F*     E*", "Oh-ooo-o", NBSP, "[Chorus]",
  "  Dm    Bbadd#11     Dmadd9/A", "Oh--oh--oh, the kettle sings",
].join("\n");
const CLEAN = [
  "# Intro", "Dm", "", "# Verse",
  "Dm                       Bb(b5)/D", "Somewhere a kettle is singing",
  "A7                             Dsus2", "Nobody knows where they go", "",
  "F      E", "Oh-ooo-o", "", "# Chorus",
  "  Dm    Bbadd#11     Dmadd9/A", "Oh--oh--oh, the kettle sings",
].join("\n");

describe("сырой копипаст", () => {
  it("даёт те же секции, строки и колонки, что ручная чистка", () => {
    const shape = (text: string) => parseSheet(text).sections.map((s) => [s.title, s.lines.map((l) => [l.kind, marks(l as never)])]);
    expect(shape(normalizePaste(RAW))).toEqual(shape(CLEAN));
  });

  it("табы — по 8 колонок, секции из меток, тактовые черты и повторы — прочь", () => {
    expect(normalizePaste("C\tG")).toBe("C       G");
    expect(normalizePaste("Chorus:\nAm F\nla-la\nIntro: Am  F").split("\n")).toEqual(["# Chorus", "Am F", "la-la", "# Intro", "       Am  F"]);
    expect(normalizePaste("Припев:")).toBe("# Припев");
    expect(normalizePaste("| Am | F | x2")).toBe("  Am   F     ");
    expect(normalizePaste("|Am I wrong")).toBe("|Am I wrong");
  });

  it("H — это B, Bm7-5 — это Bm7b5", () => {
    expect(normalizePaste("Hm7  E  Bm7-5 C+5")).toBe("Bm7  E  Bm7b5 C#5");
  });
});

describe("что вставили", () => {
  it("песня из сырого копипаста — без ложных предупреждений", () => {
    const a = analyzeInput(RAW);
    expect(a.kind).toBe("sheet");
    if (a.kind !== "sheet") return;
    expect(a.unknown).toEqual([]);
    expect(a.sections).toBe(3);
    expect(a.chords).toEqual(["Dm", "Bb(b5)/D", "A7", "Dsus2", "F", "E", "Dm", "Bbadd#11", "Dmadd9/A"]);
  });

  it("неизвестный аккорд не превращает строку в текст и попадает в предупреждения", () => {
    const a = analyzeInput("Am       Cmaj7#9\nsome words of the song");
    expect(a.kind).toBe("sheet");
    if (a.kind !== "sheet") return;
    expect(a.song.sections[0].lines[0].kind).toBe("pair");
    expect(a.chords).toEqual(["Am"]);
    expect(a.unknown).toEqual([{ symbol: "Cmaj7#9", line: 1 }]);
  });

  it("голая последовательность — с разделителями, секциями и шапкой", () => {
    expect(analyzeInput("Bb Gm Dm C")).toMatchObject({ kind: "progression", chords: ["Bb", "Gm", "Dm", "C"] });
    expect(analyzeInput("@title: Test\n[Verse]\nBb | Gm -> A, Dm\n\n[Chorus]\nC C Am x2")).toMatchObject({
      kind: "progression",
      meta: { title: "Test" },
      chords: ["Bb", "Gm", "A", "Dm", "C", "Am"],
    });
    expect(analyzeInput("Am Cmaj7#9 F")).toMatchObject({ chords: ["Am", "F"], unknown: [{ symbol: "Cmaj7#9", line: 1 }] });
  });

  it("под текстом аккордов нет — схемы по проигрышам; пусто — пусто", () => {
    expect(analyzeInput("# Intro\nAm F C G\n\n# Verse\njust words")).toMatchObject({ kind: "sheet", fromInstrumental: true, chords: ["Am", "F", "C", "G"] });
    expect(analyzeInput("  \n@title: x\n# Section").kind).toBe("empty");
    expect(analyzeInput(SONG)).toMatchObject({ kind: "sheet", withoutDiagrams: ["Bbmaj7b5"] });
  });
});
