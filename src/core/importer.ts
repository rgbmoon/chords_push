/**
 * Ввод человека: вставил что угодно — получил разбор.
 *
 * Два вида входа:
 *   * ПОСЛЕДОВАТЕЛЬНОСТЬ — только аккорды («Bb Gm | A -> Dm»), без текста;
 *   * ПЕСНЯ — «аккорды над текстом», как на любом сайте с подборами.
 * Какой из них, решает detect: остались после шапки, секций и пустых строк
 * только строки аккордов — последовательность, иначе песня.
 *
 * Сырой копипаст с ultimate-guitar, amdm и прочих чистится до формата, который
 * понимает разбор песни (sheet.ts), — и ни один аккорд при этом не съезжает со
 * своего слога: всё лишнее заменяется ПРОБЕЛАМИ той же ширины, а не вырезается.
 *
 *   [Verse 1], «Припев:»            -> секция `# …`
 *   «Intro: Am F C G»               -> секция + строка аккордов
 *   неразрывные пробелы, табы       -> пробелы (табы — по 8 колонок)
 *   E*  F*                          -> звёздочки (сноски) срезаются
 *   A7 (E string - 3 1 0)           -> пометки в скобках убираются
 *   x2, (x2), 2x, N.C., | Am | F |  -> шум, убирается
 *   H, Hm7 (немецкая/русская запись) -> B, Bm7
 *   Bm7-5, C+5                      -> Bm7b5, C#5
 *
 * Аккорд, которого нет в таблице, но который выглядит как аккорд (Cmaj7#9),
 * не превращает строку в текст: она остаётся строкой аккордов, сам символ
 * виден в тексте, но схемы не получает и попадает в предупреждения.
 */
import { isChordSymbol, parseChordSymbol } from "./chord";
import { NON_WS_RUN_RE, PY_WS_CHARS, pyLstrip, pySplit, pySplitLines, pyStrip } from "./py";
import { META_KEYS, parseSource, Song, songChain } from "./sheet";

const SENT_END = ",.?!;:";
const ZERO_WIDTH = /[​‌‍⁠﻿]/g;
const ODD_SPACE = /[  -   　]/g;

/**
 * Похоже на символ аккорда, даже если такого типа в таблице нет: тоника, потом
 * только «аккордовые» кусочки. Обычное слово сюда не пролезет — «Bad», «Day»,
 * «Down» спотыкаются на строчных буквах.
 */
const CHORD_SHAPE =
  /^[A-H][#b♯♭]?(?:maj|min|dim|aug|sus|add|alt|omit|no|dom|m|M|j|b|[0-9#+\-°ø∆Δ△()/,^])*(?:\/[A-H][#b♯♭]?)?$/;

/** Токены, которые в строке аккордов ничего не значат для гармонии. */
const NOISE = /^(?:\(?[xх×]\d+\)?|\(?\d+[xх×]\)?|n\.?c\.?|[|/%:\-–—>→.]+)$/i;

const LABEL = /^(\s*)([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9 .'’-]{0,30}):(.*)$/;
const BRACKET = /^\s*\[([^[\]]{1,40})\]\s*$/;

const cpLen = (s: string): number => Array.from(s).length;
const spaces = (s: string): string => " ".repeat(cpLen(s));

function expandTabs(line: string, size = 8): string {
  if (!line.includes("\t")) return line;
  let out = "";
  let col = 0;
  for (const ch of line) {
    if (ch === "\t") {
      const n = size - (col % size);
      out += " ".repeat(n);
      col += n;
    } else {
      out += ch;
      col += 1;
    }
  }
  return out;
}

/** Поправить символ, записанный «не по-нашему», не меняя его ширины. */
export function fixToken(tok: string): string {
  if (isChordSymbol(tok)) return tok;
  const tries = [tok.replace(/^H/, "B"), tok.replace(/-5/g, "b5"), tok.replace(/\+5/g, "#5")];
  tries.push(tries[0].replace(/-5/g, "b5").replace(/\+5/g, "#5"));
  for (const t of tries) if (t !== tok && isChordSymbol(t)) return t;
  return tok;
}

/**
 * Строка аккордов в мягком смысле: все токены — аккорды, шум или хотя бы
 * похожи на аккорд, и хотя бы один аккорд настоящий. Строка, где ВСЕ токены
 * аккорды, длины не ограничена (до 24): проигрыш бывает длинным.
 */
export function isChordishLine(s: string): boolean {
  const t = pyStrip(s);
  if (!t) return false;
  if (t[0] === ".") return true;
  if (t[0] === "|") return false;
  if (SENT_END.includes(t[t.length - 1]) || /['"’“”«»]/.test(t)) return false;
  const toks = pySplit(t);
  const known = toks.filter(isChordSymbol).length;
  if (!known) return false;
  if (known === toks.length) return toks.length <= 24;
  if (toks.length > 12) return false;
  return toks.every((tok) => isChordSymbol(tok) || CHORD_SHAPE.test(tok));
}

/** Убрать шум из строки, которая МОЖЕТ оказаться строкой аккордов. Ширина та же. */
function cleanChordLine(line: string): string {
  const lead = pyLstrip(line);
  if (lead.startsWith(".")) return line;
  const pipes = (line.match(/\|/g) || []).length;
  if (lead.startsWith("|") && pipes === 1) return line; // `|` в начале = «это точно текст»
  let s = line;
  if (pipes >= 2 || pyStrip(s).endsWith("|")) s = s.replace(/\|/g, " ");
  // пометки в скобках, отделённые пробелом: «A7 (E string - 3 1 0)». Скобки,
  // приклеенные к аккорду, — часть символа: C(b5), Cm(maj7)
  s = s.replace(/(^|[^\S\n])(\([^()]*\)\*?)/g, (_m, pre: string, par: string) => pre + spaces(par));
  return s.replace(NON_WS_RUN_RE, (tok) => {
    let t = tok.replace(/\*+$/, (st) => spaces(st));
    const core = t.trimEnd();
    const tail = t.slice(core.length);
    if (NOISE.test(core)) return spaces(tok);
    t = fixToken(core) + tail;
    return t;
  });
}

function isSectionWord(inner: string): boolean {
  return !isChordSymbol(pyStrip(inner)) && /[A-Za-zА-Яа-яЁё]/.test(inner);
}

/** Сырой копипаст -> формат разбора песни. Колонки аккордов не сдвигаются. */
export function normalizePaste(text: string): string {
  const out: string[] = [];
  for (const raw of pySplitLines(text)) {
    const line = expandTabs(raw.replace(ZERO_WIDTH, "")).replace(ODD_SPACE, " ");

    const br = BRACKET.exec(line);
    if (br && isSectionWord(br[1])) {
      out.push("# " + pyStrip(br[1]));
      continue;
    }
    const lab = LABEL.exec(line);
    if (lab && !pyStrip(line).startsWith("@") && isSectionWord(lab[2])) {
      const rest = lab[3];
      if (!pyStrip(rest)) {
        out.push("# " + pyStrip(lab[2])); // «Припев:» на своей строке
        continue;
      }
      const blanked = spaces(lab[1] + lab[2] + ":") + rest;
      const cleaned = cleanChordLine(blanked);
      if (isChordishLine(cleaned)) {
        out.push("# " + pyStrip(lab[2]), cleaned); // «Intro: Am F C G»
        continue;
      }
    }
    const cleaned = cleanChordLine(line);
    out.push(isChordishLine(cleaned) ? cleaned : line);
  }
  return out.join("\n");
}

// ------------------------------------------------------------------ разбор --

const META_RE = /^@(\w+)\s*:\s*(.*)$/;
const PROG_SPLIT = new RegExp(`[${PY_WS_CHARS},;|–—>→]+`);

export interface Unknown {
  sym: string;
  line: number; // номер строки во ВСТАВЛЕННОМ тексте после чистки, с единицы
}

export type InputAnalysis =
  | { kind: "empty"; meta: Record<string, string> }
  | {
      kind: "progression";
      meta: Record<string, string>;
      syms: string[];
      unknown: Unknown[];
    }
  | {
      kind: "sheet";
      meta: Record<string, string>;
      song: Song;
      /** аккорды, по которым строятся схемы */
      chain: string[];
      /** true — под текстом аккордов нет, схемы по всем, включая проигрыши */
      allChords: boolean;
      /** аккорды, которые видны в тексте, но схемы не получают */
      skipped: string[];
      sections: number;
      unknown: Unknown[];
    };

const lenient = { isChordLine: isChordishLine };

/** Нераспознанные «аккорды» в строках аккордов. */
function unknownTokens(lines: readonly string[]): Unknown[] {
  const out: Unknown[] = [];
  lines.forEach((l, i) => {
    if (!isChordishLine(l)) return;
    const t = pyLstrip(l).startsWith(".") ? pyLstrip(l).slice(1) : l;
    for (const tok of pySplit(t)) if (!isChordSymbol(tok)) out.push({ sym: tok, line: i + 1 });
  });
  return out;
}

/** Разобрать вставленный текст: что это и что из него выйдет. */
export function analyzeInput(text: string): InputAnalysis {
  const norm = normalizePaste(text);
  const lines = pySplitLines(norm);
  const meta: Record<string, string> = {};
  const body: { text: string; line: number }[] = [];
  lines.forEach((l, i) => {
    const m = META_RE.exec(pyStrip(l));
    if (m && (META_KEYS as readonly string[]).includes(m[1].toLowerCase())) meta[m[1].toLowerCase()] = pyStrip(m[2]);
    else if (pyStrip(l) && !pyStrip(l).startsWith("#")) body.push({ text: l, line: i + 1 });
  });
  if (!body.length) return { kind: "empty", meta };

  // последовательность: КАЖДАЯ строка — только аккорды (разделители как у parseProgression)
  const progTokens = body.map(({ text, line }) => ({
    line,
    toks: pyStrip(text.replaceAll("->", " ").replace(/^\s*\./, " "))
      .split(PROG_SPLIT)
      .filter((t) => t && !NOISE.test(t))
      .map(fixToken),
  }));
  const isProg = progTokens.every(
    ({ toks }) => toks.length > 0 && toks.some(isChordSymbol) && toks.every((t) => isChordSymbol(t) || CHORD_SHAPE.test(t)),
  );
  if (isProg) {
    const syms: string[] = [];
    const unknown: Unknown[] = [];
    for (const { toks, line } of progTokens) {
      for (const t of toks) {
        if (!isChordSymbol(t)) {
          unknown.push({ sym: t, line });
          continue;
        }
        const sym = parseChordSymbol(t).symbol;
        if (syms[syms.length - 1] !== sym) syms.push(sym);
      }
    }
    return { kind: "progression", meta, syms, unknown };
  }

  const song = parseSource(norm, lenient);
  let chain = songChain(song, true);
  let allChords = false;
  if (!chain.length) {
    chain = songChain(song, false);
    allChords = chain.length > 0;
  }
  const withSchemes = new Set(chain);
  const skipped = [...new Set(songChain(song, false))].filter((s) => !withSchemes.has(s));
  return {
    kind: "sheet",
    meta: { ...song.meta, ...meta },
    song,
    chain,
    allChords,
    skipped,
    sections: song.sections.filter((s) => s.title && s.lines.length).length,
    unknown: unknownTokens(lines),
  };
}
