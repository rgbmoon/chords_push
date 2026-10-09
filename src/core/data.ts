/**
 * Данные сетки — единственный источник правды (бывшие build_json.py + push_grid.json).
 *
 * Модель зафиксирована: Ableton Push, Note Mode, **Chromatic + 4ths**.
 * Никаких In Key, 3rds и Sequential — они в проекте не используются.
 * Визуальная база тоже зафиксирована: тоника C (оранжевая) + гамма C major.
 *
 * ВАЖНО: таблицы аккордов и алиасов — МАССИВЫ ПАР, а не объекты. Среди ключей
 * есть "5", "6", "7", "9", "11", "13", "69": в JS-объекте целочисленные ключи
 * уезжают в начало, и порядок таблицы ломается. А от порядка зависит многое:
 * какой из одинаково хороших вариантов определитель назовёт первым и какой
 * алиас станет «каноническим» написанием типа.
 */

export const NOTE_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export const NOTE_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

export const ROW_SEMITONES = 5; // вверх на ряд = чистая кварта
export const COL_SEMITONES = 1; // вправо на пэд = полутон
export const ROWS = 8;
export const COLS = 8;
export const BASE_MIDI = 36; // нижний левый пэд = C1 (нотация Ableton: C3 = MIDI 60)

export interface IntervalInfo {
  short: string;
  name: string;
}

export const INTERVALS: ReadonlyMap<number, IntervalInfo> = new Map(
  (
    [
      [0, "1", "unison"], [1, "b2", "minor second"],
      [2, "2", "major second"], [3, "b3", "minor third"],
      [4, "3", "major third"], [5, "4", "perfect fourth"],
      [6, "b5", "tritone"], [7, "5", "perfect fifth"],
      [8, "b6", "minor sixth"], [9, "6", "major sixth"],
      [10, "b7", "minor seventh"], [11, "7", "major seventh"],
      [12, "8", "octave"], [13, "b9", "minor ninth"],
      [14, "9", "major ninth"], [15, "#9", "augmented ninth"],
      [16, "10", "major tenth"], [17, "11", "perfect eleventh"],
      [18, "#11", "augmented eleventh"], [19, "12", "perfect twelfth"],
      [20, "b13", "minor thirteenth"], [21, "13", "major thirteenth"],
    ] as const
  ).map(([n, short, name]) => [n, { short, name }]),
);

// Гамм нужно ровно столько, сколько раскрасок сетки мы реально используем.
// Рабочая — всегда C major: Scale на железе не переключается, чтобы строить
// любые аккорды от одного и того же визуала.
export interface ScaleInfo {
  steps: number[];
  name: string;
  size: number;
}

export const SCALES: ReadonlyMap<string, ScaleInfo> = new Map(
  (
    [
      ["major", [0, 2, 4, 5, 7, 9, 11], "мажор — рабочая раскраска сетки"],
      ["natural_minor", [0, 2, 3, 5, 7, 8, 10], "натуральный минор — на случай другой раскраски"],
      ["chromatic", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], "все пэды в тональности (тёмных нет)"],
    ] as const
  ).map(([k, steps, name]) => [k, { steps: [...steps], name, size: steps.length }]),
);

export const DEFAULT_SCALE = "major";
export const DEFAULT_ROOT = "C";

// Таблица аккордов — это парсер: она превращает символ вроде "Bbmaj7b5"
// в набор интервалов. Каждая строка = один тип аккорда, который мы умеем читать.
const CHORD_ROWS: readonly (readonly [string, readonly number[], string])[] = [
  // трезвучия
  ["maj", [0, 4, 7], "major triad"],
  ["min", [0, 3, 7], "minor triad"],
  ["dim", [0, 3, 6], "diminished triad"],
  ["aug", [0, 4, 8], "augmented triad"],
  ["sus2", [0, 2, 7], "suspended second"],
  ["sus4", [0, 5, 7], "suspended fourth"],
  ["5", [0, 7], "fifth / power chord"],
  ["majb5", [0, 4, 6], "major flat five"],
  ["sus4add9", [0, 5, 7, 14], "sus4 add nine"],
  // сексты
  ["6", [0, 4, 7, 9], "major sixth"],
  ["min6", [0, 3, 7, 9], "minor sixth"],
  ["6_9", [0, 4, 7, 9, 14], "six-nine"],
  ["min6_9", [0, 3, 7, 9, 14], "minor six-nine"],
  ["6sus4", [0, 5, 7, 9], "sixth sus4"],
  // септаккорды
  ["maj7", [0, 4, 7, 11], "major seventh"],
  ["min7", [0, 3, 7, 10], "minor seventh"],
  ["7", [0, 4, 7, 10], "dominant seventh"],
  ["minMaj7", [0, 3, 7, 11], "minor-major seventh"],
  ["m7b5", [0, 3, 6, 10], "half-diminished seventh"],
  ["dim7", [0, 3, 6, 9], "diminished seventh"],
  ["aug7", [0, 4, 8, 10], "augmented seventh"],
  ["maj7b5", [0, 4, 6, 11], "major seventh flat five"],
  ["maj7sharp5", [0, 4, 8, 11], "major seventh sharp five"],
  ["7b5", [0, 4, 6, 10], "seventh flat five"],
  ["7sus4", [0, 5, 7, 10], "seventh sus4"],
  ["7sus2", [0, 2, 7, 10], "seventh sus2"],
  ["maj7sus2", [0, 2, 7, 11], "major seventh sus2"],
  ["maj7sus4", [0, 5, 7, 11], "major seventh sus4"],
  ["dimMaj7", [0, 3, 6, 11], "diminished major seventh"],
  // ноны
  ["add9", [0, 4, 7, 14], "major add nine"],
  ["madd9", [0, 3, 7, 14], "minor add nine"],
  ["maj9", [0, 4, 7, 11, 14], "major ninth"],
  ["min9", [0, 3, 7, 10, 14], "minor ninth"],
  ["9", [0, 4, 7, 10, 14], "dominant ninth"],
  ["7b9", [0, 4, 7, 10, 13], "seventh flat nine"],
  ["7sharp9", [0, 4, 7, 10, 15], "seventh sharp nine"],
  ["m9b5", [0, 3, 6, 10, 14], "half-diminished ninth"],
  ["m7b9", [0, 3, 7, 10, 13], "minor seventh flat nine"],
  ["minMaj9", [0, 3, 7, 11, 14], "minor-major ninth"],
  ["9sus4", [0, 5, 7, 10, 14], "ninth sus4"],
  ["7susb9", [0, 5, 7, 10, 13], "seventh sus4 flat nine"],
  ["9b5", [0, 4, 6, 10, 14], "ninth flat five"],
  ["9sharp5", [0, 4, 8, 10, 14], "ninth sharp five"],
  ["7b9sharp5", [0, 4, 8, 10, 13], "seventh flat nine sharp five"],
  ["7sharp9sharp5", [0, 4, 8, 10, 15], "seventh sharp nine sharp five"],
  // ундецимы и терцдецимы
  ["add11", [0, 4, 7, 17], "major add eleven"],
  ["addsharp11", [0, 4, 7, 18], "major add sharp eleven"],
  ["madd11", [0, 3, 7, 17], "minor add eleven"],
  ["maj11", [0, 4, 7, 11, 14, 17], "major eleventh"],
  ["min11", [0, 3, 7, 10, 14, 17], "minor eleventh"],
  ["11", [0, 4, 7, 10, 14, 17], "dominant eleventh"],
  ["7sharp11", [0, 4, 7, 10, 18], "seventh sharp eleven"],
  ["maj7sharp11", [0, 4, 7, 11, 18], "major seventh sharp eleven"],
  ["maj9sharp11", [0, 4, 7, 11, 14, 18], "major ninth sharp eleven"],
  ["9sharp11", [0, 4, 7, 10, 14, 18], "ninth sharp eleven"],
  ["m11b5", [0, 3, 6, 10, 14, 17], "half-diminished eleventh"],
  ["maj13", [0, 4, 7, 11, 14, 21], "major thirteenth"],
  ["min13", [0, 3, 7, 10, 14, 21], "minor thirteenth"],
  ["13", [0, 4, 7, 10, 14, 21], "dominant thirteenth"],
  ["13sus4", [0, 5, 7, 10, 14, 21], "thirteenth sus4"],
  ["13b9", [0, 4, 7, 10, 13, 21], "thirteenth flat nine"],
  // у 13#11 квинта опущена: с ней вышло бы семь нот, а живой пианист в этом
  // аккорде как раз квинту и убирает — её место занимает #11
  ["13sharp11", [0, 4, 10, 14, 18, 21], "thirteenth sharp eleven"],
  ["7b13", [0, 4, 7, 10, 20], "seventh flat thirteen"],
  ["7b9b13", [0, 4, 7, 10, 13, 20], "seventh flat nine flat thirteen"],
  ["7sharp9b13", [0, 4, 7, 10, 15, 20], "seventh sharp nine flat thirteen"],
  ["7alt", [0, 4, 10, 13, 15, 20], "altered dominant"],
];

// Ступени аккорда для подписей. По умолчанию берутся из INTERVALS, но у
// увеличенных и уменьшённых аккордов правильное написание другое.
const DEGREE_OVERRIDES: Readonly<Record<string, readonly string[]>> = {
  aug: ["1", "3", "#5"],
  aug7: ["1", "3", "#5", "b7"],
  maj7sharp5: ["1", "3", "#5", "7"],
  dim7: ["1", "b3", "b5", "bb7"],
  "9sharp5": ["1", "3", "#5", "b7", "9"],
  "7b9sharp5": ["1", "3", "#5", "b7", "b9"],
  "7sharp9sharp5": ["1", "3", "#5", "b7", "#9"],
};

export interface ChordInfo {
  intervals: number[];
  name: string;
  size: number;
  degrees: string[];
}

/** Тип аккорда → описание. Map хранит порядок вставки — это и есть порядок таблицы. */
export const CHORDS: ReadonlyMap<string, ChordInfo> = new Map(
  CHORD_ROWS.map(([k, ivs, name]) => [
    k,
    {
      intervals: [...ivs],
      name,
      size: ivs.length,
      degrees: [...(DEGREE_OVERRIDES[k] ?? ivs.map((i) => INTERVALS.get(i)!.short))],
    },
  ]),
);

// Как писать аккорд текстом. Ключ — суффикс символа аккорда, значение — тип из CHORDS.
// ВАЖНО: регистр значим — "M7" это большой мажорный, "m7" это малый минорный.
// Парсер сначала ищет точное совпадение, и только потом — по нижнему регистру.
export const ALIAS_PAIRS: readonly (readonly [string, string])[] = [
  // трезвучия
  ["", "maj"], ["maj", "maj"], ["major", "maj"], ["M", "maj"], ["△", "maj"],
  ["m", "min"], ["min", "min"], ["minor", "min"], ["-", "min"],
  ["dim", "dim"], ["o", "dim"], ["°", "dim"],
  ["aug", "aug"], ["+", "aug"],
  ["sus", "sus4"], ["sus2", "sus2"], ["sus4", "sus4"],
  ["5", "5"], ["no3", "5"],
  ["b5", "majb5"], ["majb5", "majb5"],
  ["sus4add9", "sus4add9"], ["susadd9", "sus4add9"], ["sus2sus4", "sus4add9"],
  // сексты
  ["6", "6"], ["m6", "min6"], ["min6", "min6"], ["-6", "min6"],
  ["6/9", "6_9"], ["69", "6_9"], ["6add9", "6_9"],
  ["m6/9", "min6_9"], ["m69", "min6_9"],
  ["6sus4", "6sus4"], ["6sus", "6sus4"],
  // септаккорды
  ["maj7", "maj7"], ["ma7", "maj7"], ["M7", "maj7"], ["△7", "maj7"], ["j7", "maj7"],
  ["m7", "min7"], ["min7", "min7"], ["-7", "min7"],
  ["7", "7"], ["dom7", "7"],
  ["mmaj7", "minMaj7"], ["mMaj7", "minMaj7"], ["minmaj7", "minMaj7"], ["-maj7", "minMaj7"],
  ["m7b5", "m7b5"], ["ø", "m7b5"], ["ø7", "m7b5"], ["halfdim", "m7b5"],
  ["min7b5", "m7b5"],
  ["dim7", "dim7"], ["o7", "dim7"], ["°7", "dim7"],
  ["7#5", "aug7"], ["aug7", "aug7"], ["+7", "aug7"], ["7+5", "aug7"],
  ["maj7b5", "maj7b5"], ["M7b5", "maj7b5"],
  ["maj7#5", "maj7sharp5"], ["M7#5", "maj7sharp5"], ["+maj7", "maj7sharp5"],
  ["7b5", "7b5"],
  ["7sus4", "7sus4"], ["7sus", "7sus4"], ["7sus2", "7sus2"],
  ["maj7sus2", "maj7sus2"], ["M7sus2", "maj7sus2"],
  ["maj7sus4", "maj7sus4"], ["maj7sus", "maj7sus4"], ["M7sus4", "maj7sus4"],
  ["dimmaj7", "dimMaj7"], ["dimMaj7", "dimMaj7"], ["omaj7", "dimMaj7"],
  ["°maj7", "dimMaj7"],
  // ноны
  ["add9", "add9"], ["add2", "add9"],
  ["madd9", "madd9"], ["madd2", "madd9"], ["minadd9", "madd9"],
  ["maj9", "maj9"], ["M9", "maj9"], ["△9", "maj9"],
  ["m9", "min9"], ["min9", "min9"], ["-9", "min9"],
  ["9", "9"],
  ["7b9", "7b9"], ["7#9", "7sharp9"],
  ["m9b5", "m9b5"],
  ["m7b9", "m7b9"], ["min7b9", "m7b9"],
  ["mmaj9", "minMaj9"], ["mMaj9", "minMaj9"], ["minmaj9", "minMaj9"],
  ["9sus4", "9sus4"], ["9sus", "9sus4"],
  ["7susb9", "7susb9"], ["7sus4b9", "7susb9"], ["susb9", "7susb9"],
  ["9b5", "9b5"], ["9#5", "9sharp5"], ["9+5", "9sharp5"],
  ["7b9#5", "7b9sharp5"], ["7#5b9", "7b9sharp5"],
  ["7#9#5", "7sharp9sharp5"], ["7#5#9", "7sharp9sharp5"],
  // ундецимы и терцдецимы
  ["add11", "add11"], ["add4", "add11"],
  ["add#11", "addsharp11"], ["addsharp11", "addsharp11"], ["add#4", "addsharp11"],
  ["maj11", "maj11"], ["M11", "maj11"],
  ["m11", "min11"], ["min11", "min11"], ["11", "11"],
  ["7#11", "7sharp11"],
  ["maj7#11", "maj7sharp11"], ["M7#11", "maj7sharp11"], ["△7#11", "maj7sharp11"],
  ["maj9#11", "maj9sharp11"], ["M9#11", "maj9sharp11"],
  ["9#11", "9sharp11"],
  ["m11b5", "m11b5"], ["min11b5", "m11b5"],
  ["madd11", "madd11"], ["madd4", "madd11"], ["minadd11", "madd11"],
  ["maj13", "maj13"], ["M13", "maj13"],
  ["m13", "min13"], ["min13", "min13"], ["13", "13"],
  ["13sus4", "13sus4"], ["13sus", "13sus4"],
  ["13b9", "13b9"], ["13#11", "13sharp11"],
  ["7b13", "7b13"], ["alt", "7alt"], ["7alt", "7alt"],
  ["7b9b13", "7b9b13"], ["7#9b13", "7sharp9b13"],
  // треугольник набирают двумя разными символами: △ и греческой дельтой
  ["Δ", "maj"], ["Δ7", "maj7"], ["Δ9", "maj9"],
  ["Δ11", "maj11"], ["Δ13", "maj13"],
  ["△11", "maj11"], ["△13", "maj13"],
];

/** Суффикс → тип. Map, а не объект: порядок вставки важен (см. шапку файла). */
export const ALIASES: ReadonlyMap<string, string> = new Map(ALIAS_PAIRS);

// ---- палитра снята попиксельно с фотографии Push --------------------------
export interface PadState {
  stops: string[];
  label_color: string;
  desc: string;
}

export const PALETTE = {
  background: "#080a09",
  ghost_opacity: 0.4,
  states: {
    root: {
      stops: ["#fc9650", "#e59060", "#b07d68", "#8b7469", "#5a5b55"],
      label_color: "#2a1405",
      desc: "нота C — тоника раскраски сетки (оранжевая на железе)",
    },
    in_key: {
      stops: ["#f2eaf9", "#d8d4e2", "#aeacb0", "#919091", "#4d524e"],
      label_color: "#22252a",
      desc: "нота входит в гамму C major",
    },
    off: {
      stops: ["#606a66", "#606a66", "#5f6a66", "#5c6663", "#575d59"],
      label_color: "#aab3af",
      desc: "нота вне гаммы — пэд не светится",
    },
    chord_root: {
      stops: ["#7ff0a8", "#4fd98a", "#33b871", "#258f58", "#0d5232"],
      label_color: "#04240f",
      desc: "РУТОВАЯ нота аккорда — всегда зелёная, где бы ни стояла",
    },
    chord: {
      stops: ["#8fdcff", "#5cc4f2", "#3ea0cc", "#2d7ea6", "#1d4a63"],
      label_color: "#04212e",
      desc: "остальные ноты выбранного голосоведения",
    },
    extra: {
      stops: ["#e8ccff", "#cea4f7", "#ac7fe2", "#8a5cc6", "#4b2f74"],
      label_color: "#1d0d33",
      desc:
        "нота, добавленная руками прямо на схеме — В АККОРД НЕ ВХОДИТ. " +
        "Цвет специально не из палитры аккорда: фиолетовый = «это я сам»",
    },
  } satisfies Record<string, PadState>,
  extra_edge: "#e0c2ff",
};

export type StateName = keyof typeof PALETTE.states;

// Веса солвера голосоведения. Аккорд выбирается не сам по себе, а с оглядкой
// на соседей: рука должна ходить по гриду как можно меньше.
//
// цена узла = компактность + регистр + штраф за обращение;
// цена перехода = движение голосов + сдвиг руки − премия за общие пэды.
// Обращения по умолчанию ЗАПРЕЩЕНЫ: рут всегда в басу, солвер играет только
// октавой и выбором пэда — структура аккорда не меняется.
// Замер на 6 последовательностях против независимого выбора: путь руки -51%,
// общих нот x1.7, движение голосов -14%. С разрешёнными обращениями было бы
// -70% / x2.3 / -59%, но ценой смены баса.
export const VOICE_LEADING = {
  // режим компактных аккордов: фигура должна укладываться в узкую полосу
  // колонок, чтобы браться одной рукой. Считаем именно КОЛОНКИ — пальцы
  // разъезжаются вбок, а не по рядам. Трезвучие уже колонки в 4 не ложится
  // (интервалы 3/4 и 7 дают минимум 4), sus- и квартовые фигуры ложатся в 3.
  compact_mode: {
    max_cols: 4, // потолок занятых колонок: шире не предлагаем
    relax_cols: [5, 6, 7, 8], // если аккорд в потолок не лезет — отпускаем по шагам
    col_weight: 3.0, // в компактном режиме колонка дороже ряда…
    row_weight: 1.0, // …в обычном наоборот: 3 за ряд, 1 за колонку
  },
  weights: {
    compact: 0.35, // габарит фигуры (bbox рядов*3 + колонок), делится на 4
    register: 1.4, // уход центра фигуры от середины грида
    inversion: 1.0, // штраф за смену баса; работает только если обращения разрешены
    inversion_step: 0.15, // добавка за каждое следующее обращение
    voice: 1.0, // среднее движение голосов в полутонах
    hand: 1.2, // сдвиг центра фигуры по пэдам
    hold: 0.85, // премия за каждую ноту, остающуюся на том же пэде
  },
};

export const WEIGHTS = VOICE_LEADING.weights;
export const COMPACT = VOICE_LEADING.compact_mode;

// Пропорции измерены со скриншота: шаг 74.17 x 55.5, тело пэда 69 x 50, зазор ~5.
export const RENDER = {
  pad_w: 69.0,
  pad_h: 50.0,
  gap_x: 5.2,
  gap_y: 5.5,
  corner_radius: 8.0,
  margin: 14.0,
  gradient: { type: "radial", cx: 0.5, cy: 0.5, r: 0.72, offsets: [0.0, 0.25, 0.5, 0.75, 1.0] },
  label: {
    font_family: "-apple-system, 'SF Pro Text', 'Helvetica Neue', Arial, sans-serif",
    font_size: 15.0,
    font_weight: 600,
  },
};
