/**
 * Паритет ядра с Python: каждая функция прогоняется на тех же входах, что и
 * Python-версия, и обязана ответить ровно то же самое.
 */
import { describe, expect, it } from "vitest";
import { ChordSpec, chordIntervals, parseChordSymbol, parseProgression } from "../src/core/chord";
import { ALIAS_PAIRS, CHORDS, INTERVALS, PALETTE, SCALES, VOICE_LEADING } from "../src/core/data";
import { Grid } from "../src/core/grid";
import {
  degreeFromRoot,
  enrich,
  identify,
  intervalName,
  MAX_NOTES,
  padsToMidi,
  rootName,
  suffixOf,
} from "../src/core/identify";
import { intervalShort, midiToName, noteToPc, spellFrom } from "../src/core/notes";
import {
  buildCards,
  chordPositions,
  hasLyrics,
  isChordLine,
  parseSource,
  songChain,
  splitUnits,
} from "../src/core/sheet";
import { allPlacements, chordPitches, invert, Overlay, Voicing, voiceChord, voiceProgression } from "../src/core/voicing";
import { enIdentify, enInterval, fixture } from "./fixtures";

const G = new Grid();
const r9 = (x: number | null) => (x === null ? null : Math.round(x * 1e9) / 1e9);

function specOut(s: ChordSpec) {
  return {
    symbol: s.symbol,
    root_pc: s.rootPc,
    kind: s.kind,
    intervals: [...s.intervals],
    bass_pc: s.bassPc,
    root_written: s.rootWritten,
    bass_written: s.bassWritten,
    degrees: s.degrees,
    root_name: s.rootName,
    spelling: [...s.spelling()],
    degree_map: [...s.degreeMap()],
    prefers_flats: s.prefersFlats,
    pitch_classes: s.pitchClasses,
  };
}

const overlayOut = (ov: Overlay) => [...ov].map(([p, m]) => [p, m.degree, m.isRoot, m.ghost, m.midi]);

const voicingOut = (v: Voicing) => ({
  symbol: v.spec.symbol,
  notes: v.notes,
  pads: v.pads,
  ghosts: v.ghosts,
  inversion: v.inversion,
  move: r9(v.move),
  overlay: overlayOut(v.overlay),
});

describe("данные", () => {
  const d = fixture("data.json");
  it("таблица аккордов — в том же порядке и с теми же полями", () => {
    // названия типов переведены на английский — сверяются всё, кроме них
    const strip = ([k, v]: [string, { intervals: number[]; size: number; degrees: string[] }]) => [
      k,
      { intervals: v.intervals, size: v.size, degrees: v.degrees },
    ];
    expect([...CHORDS].map(strip)).toEqual(d.chords.map(strip));
    expect([...CHORDS.values()].filter((v) => !/^[a-z0-9 /,-]+$/.test(v.name))).toEqual([]);
  });
  it("алиасы — в том же порядке", () => {
    expect(ALIAS_PAIRS.map(([a, k]) => [a, k])).toEqual(d.chord_aliases);
  });
  it("интервалы, гаммы, палитра, веса", () => {
    expect([...INTERVALS].map(([n, v]) => [String(n), v.short])).toEqual(d.intervals.map(([n, v]: [string, { short: string }]) => [n, v.short]));
    expect(Object.fromEntries([...SCALES])).toEqual(d.rest.scales);
    expect(PALETTE).toEqual(d.rest.palette);
    const strip = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith("_")));
    expect(VOICE_LEADING.weights).toEqual(strip(d.rest.voice_leading.weights));
    expect(VOICE_LEADING.compact_mode).toEqual(strip(d.rest.voice_leading.compact_mode));
  });
});

describe("разбор символов", () => {
  const f = fixture("parse.json");
  it("все алиасы × все тоники + каверзные символы", () => {
    const bad: string[] = [];
    for (const c of f.symbols) {
      let got: unknown;
      try {
        got = { out: specOut(parseChordSymbol(c.in)) };
      } catch {
        got = { error: true };
      }
      const want = c.error ? { error: true } : { out: c.out };
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${c.in}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`);
    }
    expect(bad.slice(0, 5)).toEqual([]);
  });
  it("последовательности", () => {
    for (const c of f.progressions) {
      if (c.error) expect(() => parseProgression(c.in), c.in).toThrow();
      else expect(parseProgression(c.in).map((s) => s.symbol), c.in).toEqual(c.out);
    }
  });
  it("ноты, правописание, интервалы, имена", () => {
    for (const [n, pc] of Object.entries(f.notes)) {
      if (pc === null) expect(() => noteToPc(n), n).toThrow();
      else expect(noteToPc(n), n).toBe(pc);
    }
    for (const [rn, deg, pc, want] of f.spell) expect(spellFrom(rn, deg, pc), `${rn} ${deg} ${pc}`).toBe(want);
    for (const [n, want] of f.interval_short) expect(intervalShort(n)).toBe(want);
    for (const [m, a, b, c] of f.midi_to_name) {
      expect(midiToName(m)).toBe(a);
      expect(midiToName(m, true)).toBe(b);
      expect(midiToName(m, false, false)).toBe(c);
    }
  });
});

describe("аппликатуры", () => {
  const f = fixture("voicing.json");
  it("voiceChord: все типы × 12 тоник, компактно и нет", () => {
    const bad: string[] = [];
    for (const c of f.singles) {
      let spec: ChordSpec | string;
      if (c.symbol) spec = c.symbol;
      else {
        const name = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"][c.root];
        spec = new ChordSpec(name + c.kind, c.root, c.kind, chordIntervals(c.kind), null, name);
      }
      let got: unknown;
      try {
        got = voicingOut(voiceChord(G, spec, { compact: c.compact, ghosts: c.ghosts ?? true }));
      } catch {
        got = "error";
      }
      const want = c.error ? "error" : c.out;
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${c.symbol ?? c.kind + "@" + c.root}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
  it("voiceProgression: случайные и именные цепочки во всех режимах", () => {
    const bad: string[] = [];
    for (const c of f.progressions) {
      const o = c.opts;
      let got: unknown;
      try {
        got = voiceProgression(G, c.chain, {
          voiceLeading: o.voice_leading ?? true,
          compact: o.compact ?? true,
          allowInversions: o.allow_inversions ?? false,
        }).map(voicingOut);
      } catch {
        got = "error";
      }
      const want = c.error ? "error" : c.out;
      if (JSON.stringify(got) !== JSON.stringify(want)) bad.push(`${c.chain.join(" ")} ${JSON.stringify(o)}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
  it("allPlacements, chordPitches, invert", () => {
    for (const c of f.placements) {
      const kw = c.kw;
      expect(
        allPlacements(G, c.notes, { limit: kw.limit ?? null, maxCols: kw.max_cols ?? null, compact: kw.compact ?? false }).slice(0, 40),
        JSON.stringify(c),
      ).toEqual(c.out);
    }
    for (const c of f.pitches) expect(chordPitches(parseChordSymbol(c.symbol), c.low)).toEqual(c.out);
    for (const [p, n, want] of f.invert) expect(invert(p, n)).toEqual(want);
  });
});

describe("определение аккорда", () => {
  const f = fixture("identify.json");
  it("identify на случайных и именных наборах", () => {
    const bad: string[] = [];
    for (const c of f.cases) {
      const midis = c.pads ? padsToMidi(c.pads) : c.midi;
      const got = identify(midis, c.root_pc);
      try {
        expect(got).toEqual(enIdentify(c.out));
      } catch {
        bad.push(JSON.stringify(c.pads ?? c.midi) + " " + c.root_pc);
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
  });
  it("enrich", () => {
    expect(enrich(f.enrich_in)).toEqual(f.enrich_out);
  });
  it("интервалы, ступени, суффиксы, руты", () => {
    for (const [n, want] of f.interval_name) expect(intervalName(n), String(n)).toBe(enInterval(want));
    for (const [n, want] of f.degree_from_root) expect(degreeFromRoot(n), String(n)).toBe(want);
    for (const [k, want] of f.suffix_of) expect(suffixOf(k), k).toBe(want);
    for (const [pc, m, want] of f.root_name) expect(rootName(pc, m)).toBe(want);
    expect(MAX_NOTES).toBe(f.max_notes);
    for (const [p, want] of f.pads_to_midi) expect(padsToMidi(p)).toEqual(want);
  });
});

describe("текст песни", () => {
  const f = fixture("sheet.json");
  const songOut = (text: string) => {
    const s = parseSource(text);
    return {
      meta: s.meta,
      sections: s.sections.map((sec) => ({
        title: sec.title,
        has_lyrics: hasLyrics(sec),
        lines: sec.lines.map((l) => ({ kind: l.kind, lyric: l.lyric, chords: l.chords })),
      })),
    };
  };
  const cardOut = (chain: string[]) =>
    buildCards(new Grid(), chain).map((c) => ({
      symbol: c.symbol,
      notes: c.notes,
      pads: c.pads,
      names: c.names,
      degrees: c.degrees,
      width: c.width,
      overlay: overlayOut(c.overlay),
    }));
  for (const src of f.sources) {
    it(`источник «${src.name}»`, () => {
      expect(songOut(src.text)).toEqual(src.song);
      const song = parseSource(src.text);
      expect(songChain(song, true)).toEqual(src.chain_lyrics);
      expect(songChain(song, false)).toEqual(src.chain_all);
      for (const u of src.units) expect(splitUnits(u.lyric, u.chords)).toEqual(u.units);
      if (src.cards_lyrics) expect(cardOut(src.chain_lyrics)).toEqual(src.cards_lyrics);
      if (src.cards_all) expect(cardOut(src.chain_all)).toEqual(src.cards_all);
    });
  }
  it("строка аккордов, позиции, разрез строки", () => {
    for (const [l, want] of f.is_chord_line) expect(isChordLine(l), JSON.stringify(l)).toBe(want);
    for (const [l, want] of f.chord_positions) expect(chordPositions(l), JSON.stringify(l)).toEqual(want);
    for (const c of f.split_units) expect(splitUnits(c.lyric, c.chords)).toEqual(c.out);
  });
});
