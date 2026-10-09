/**
 * Чистка сырого копипаста с ultimate-guitar, amdm и прочих сайтов до формата,
 * который понимает parseSheet. Ни один аккорд при этом не съезжает со своего
 * слога: лишнее заменяется ПРОБЕЛАМИ той же ширины, а не вырезается.
 *
 *   [Verse 1], «Chorus:»              -> секция `# …`
 *   «Intro: Am F C G»                 -> секция + строка аккордов
 *   неразрывные пробелы, табы         -> пробелы (табы — по 8 колонок)
 *   E*  F*                            -> звёздочки-сноски срезаются
 *   A7 (E string - 3 1 0)             -> пометки в скобках убираются
 *   x2, (x2), 2x, N.C., | Am | F |    -> шум, убирается
 *   H, Hm7 (немецкая/русская запись)  -> B, Bm7
 *   Bm7-5, C+5                        -> Bm7b5, C#5
 */
import { isChordSymbol } from "../theory/chord";
import { isChordLine } from "./sheet";

const ZERO_WIDTH = /[​‌‍⁠﻿]/g;
const ODD_SPACE = /[  -   　]/g;

/** Токены, которые в строке аккордов ничего не значат для гармонии. */
export const NOISE_TOKEN = /^(?:\(?[xх×]\d+\)?|\(?\d+[xх×]\)?|n\.?c\.?|[|/%:\-–—>→.]+)$/i;

const LABEL = /^(\s*)([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9 .'’-]{0,30}):(.*)$/;
const BRACKETED = /^\s*\[([^[\]]{1,40})\]\s*$/;

const blank = (s: string): string => " ".repeat([...s].length);

function expandTabs(line: string, size = 8): string {
  let out = "";
  let column = 0;
  for (const ch of line) {
    const add = ch === "\t" ? " ".repeat(size - (column % size)) : ch;
    out += add;
    column += ch === "\t" ? add.length : 1;
  }
  return out;
}

/** Поправить символ, записанный «не по-нашему», не меняя его ширины. */
export function fixChordToken(token: string): string {
  if (isChordSymbol(token)) return token;
  const h = token.replace(/^H/, "B");
  const tries = [h, token.replace(/-5/g, "b5"), token.replace(/\+5/g, "#5"), h.replace(/-5/g, "b5").replace(/\+5/g, "#5")];
  return tries.find((t) => t !== token && isChordSymbol(t)) ?? token;
}

/** Убрать шум из строки, которая МОЖЕТ оказаться строкой аккордов. Ширина та же. */
function cleanChordLine(line: string): string {
  const lead = line.trimStart();
  if (lead.startsWith(".")) return line;
  const pipes = line.split("|").length - 1;
  if (lead.startsWith("|") && pipes === 1) return line; // `|` в начале — «это точно текст»
  let s = pipes >= 2 || line.trimEnd().endsWith("|") ? line.replaceAll("|", " ") : line;
  // пометки в скобках, отделённые пробелом; приклеенные к аккорду — часть символа: C(b5)
  s = s.replace(/(^|[ \t])(\([^()]*\)\*?)/g, (_m, pre: string, note: string) => pre + blank(note));
  return s.replace(/\S+/g, (token) => {
    const core = token.replace(/\*+$/, "");
    if (NOISE_TOKEN.test(core)) return blank(token);
    return fixChordToken(core) + blank(token.slice(core.length));
  });
}

const isSectionName = (s: string): boolean => !isChordSymbol(s.trim()) && /[A-Za-zА-Яа-яЁё]/.test(s);

export function normalizePaste(text: string): string {
  const out: string[] = [];
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = expandTabs(raw.replace(ZERO_WIDTH, "")).replace(ODD_SPACE, " ");

    const bracketed = BRACKETED.exec(line);
    if (bracketed && isSectionName(bracketed[1])) {
      out.push(`# ${bracketed[1].trim()}`);
      continue;
    }

    const label = LABEL.exec(line);
    if (label && !line.trim().startsWith("@") && isSectionName(label[2])) {
      const [, indent, name, rest] = label;
      if (!rest.trim()) {
        out.push(`# ${name.trim()}`); // «Chorus:» на своей строке
        continue;
      }
      const chords = cleanChordLine(blank(`${indent}${name}:`) + rest);
      if (isChordLine(chords)) {
        out.push(`# ${name.trim()}`, chords); // «Intro: Am F C G»
        continue;
      }
    }

    const cleaned = cleanChordLine(line);
    out.push(isChordLine(cleaned) ? cleaned : line);
  }
  return out.join("\n");
}
