/**
 * Паритет разметки: схемы и строки текста из React сравниваются с HTML, который
 * собирал Python. Сравнение по DOM, а не по байтам: React иначе пишет &nbsp; и
 * порядок атрибутов, но пэд за пэдом — классы, имена, ступени, номера — обязаны
 * совпасть.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { parseChordSymbol, parseProgression } from "../src/core/chord";
import { Grid } from "../src/core/grid";
import { buildCards, parseSource } from "../src/core/sheet";
import { voiceProgression } from "../src/core/voicing";
import { Pads } from "../src/components/Pads";
import { Scheme } from "../src/components/Scheme";
import { LineView } from "../src/pages/Analysis";
import { domOrder, schemeModel } from "../src/view/scheme";
import { enPgm, fixture } from "./fixtures";

const parse = (html: string) => new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, "text/html");
const text = (el: Element | null) => (el ? el.textContent : null);

function padsOf(root: Element) {
  return [...root.querySelectorAll(".pads > span")].map((el) => ({
    p: el.getAttribute("data-p"),
    cls: [...el.classList].sort().join(" "),
    n: el.getAttribute("data-n"),
    b: text(el.querySelector("b")),
    u: text(el.querySelector("u")),
    ucls: el.querySelector("u")?.getAttribute("class") ?? null,
    tab: el.getAttribute("tabindex"),
  }));
}

function cardOf(root: Element, withSub = true) {
  return {
    sym: text(root.querySelector(".sym")),
    sub: withSub ? text(root.querySelector(".sub")) : null,
    pgm: text(root.querySelector(".pgm")),
    vlab: text(root.querySelector(".vlab")),
    rs: !!root.querySelector("button.rs"),
    pads: padsOf(root),
  };
}

const CHAINS = [
  "Bb Bbmaj7b5 Gm Gm6 Dsus2 Dm Csus4 C Am",
  "Dm7 G7 Cmaj7 Em7b5 A7 Dm7",
  "Am/C G/B Bdim7 C7alt F#m7b5 Cmin13",
  "Bb(b5)/D Dmadd9/A Bbadd#11 Ebaug C6/9",
];

describe("схемы", () => {
  const f = fixture("html.json");

  it("схемы песни совпадают с songpage.py пэд в пэд", () => {
    const g = new Grid();
    const models = CHAINS.flatMap((ch) =>
      buildCards(g, parseProgression(ch).map((s) => s.symbol)).map((c) => schemeModel(g, c.spec, c.overlay, c.symbol, c.symbol)),
    );
    expect(models.length).toBe(f.cards_song.length);
    models.forEach((m, k) => {
      const want = parse(f.cards_song[k].html).querySelector(".pg")!;
      const got = parse(renderToStaticMarkup(<Scheme model={m} />)).querySelector(".pg")!;
      expect(cardOf(got), m.title).toEqual({ ...cardOf(want), pgm: enPgm(cardOf(want).pgm) });
      expect(padsOf(got).length).toBe(64);
      expect(got.getAttribute("data-key")).toBe(want.getAttribute("data-key"));
      expect(m.data).toEqual(JSON.parse(want.querySelector("script.pgd")!.textContent!));
    });
  });

  it("схемы последовательности совпадают с song.py (после первой отрисовки)", () => {
    const g = new Grid();
    const models = CHAINS.flatMap((ch) =>
      voiceProgression(g, parseProgression(ch), { compact: true }).map((v, i) =>
        schemeModel(g, v.spec, v.overlay, v.spec.symbol, `${i}:${v.spec.symbol}`),
      ),
    );
    expect(models.length).toBe(f.cards_seq.length);
    models.forEach((m, k) => {
      const fx = f.cards_seq[k];
      const want = parse(fx.html).querySelector(".pg")!;
      const got = parse(renderToStaticMarkup(<Scheme model={m} />)).querySelector(".pg")!;
      expect(cardOf(got, false), m.title).toEqual({ ...cardOf(want, false), pgm: enPgm(cardOf(want, false).pgm) });
      // song.py писал в подпись describe() через пробел, а GRID_JS при загрузке
      // сразу переписывал её через « · » — сравниваем с тем, что видел человек
      expect(text(got.querySelector(".sub"))).toBe(fx.describe.split(" ").join(" · "));
      expect(m.data).toEqual(JSON.parse(want.querySelector("script.pgd")!.textContent!));
    });
  });

  it("пустая сетка страницы определения — тот же шаблон, что render_card_template", () => {
    const g = new Grid();
    const pads = domOrder(g).map((p) => ({ p, cls: `p b-${g.state(p)}`, name: g.noteName(p), deg: "", dataName: true }));
    const got = parse(renderToStaticMarkup(<div className="pg big free"><Pads pads={pads} /></div>)).querySelector(".pg")!;
    const want = parse(f.static.template_big).querySelector(".pg")!;
    expect(padsOf(got)).toEqual(padsOf(want));
    expect(padsOf(got).length).toBe(64);
    expect(padsOf(got).slice(0, 8).map((x) => x.p)).toEqual(["56", "57", "58", "59", "60", "61", "62", "63"]);
  });
});

describe("строки текста", () => {
  const f = fixture("sheet.json");
  const unitsOf = (root: Element) =>
    [...root.querySelectorAll(":scope > div")].map((d) => ({
      cls: d.getAttribute("class"),
      units: [...d.querySelectorAll(".u")].map((u) => [text(u.querySelector(".c")), text(u.querySelector(".t"))]),
      text: d.querySelector(".u") ? null : d.textContent,
    }));
  for (const src of f.sources) {
    it(`«${src.name}» — строки как у render_line`, () => {
      const song = parseSource(src.text);
      const lines = song.sections.flatMap((s) => s.lines);
      const got = parse(renderToStaticMarkup(<>{lines.map((l, i) => <LineView line={l} key={i} />)}</>)).body;
      const want = parse(src.lines_html.join("")).body;
      expect(unitsOf(got)).toEqual(unitsOf(want));
      expect(unitsOf(want).length).toBe(lines.length);
    });
  }
});

it("символ из шаблона схемы читается обратно", () => {
  expect(parseChordSymbol("Bb(b5)/D").symbol).toBe("Bb(b5)/D");
});
