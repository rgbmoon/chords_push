/**
 * Модель схемы — то, что раньше собирал render_html (push_grid.py) в строку.
 * Компоненты её только показывают: вся логика подписей живёт здесь, в одном месте.
 *
 * Пэды идут в порядке DOM — сверху вниз, — а нумеруются снизу вверх (data-p):
 * код, который ищет пэд, обязан ходить по номеру, а не по позиции.
 */
import { ChordSpec } from "../core/chord";
import { BaseState, Grid, Pad } from "../core/grid";
import { intervalShort } from "../core/notes";
import { mod } from "../core/py";
import { Overlay, PadMark } from "../core/voicing";

export interface PadCell {
  p: Pad;
  base: BaseState;
  mark?: PadMark;
  name: string; // имя ноты на пэде
  deg: string | null; // ступень; null — подписи нет вовсе
}

/** Номера пэдов в порядке DOM: верхний ряд первым. */
export function domOrder(grid: Grid): Pad[] {
  const out: Pad[] = [];
  for (let r = grid.rows - 1; r >= 0; r--) for (let c = 0; c < grid.cols; c++) out.push(r * grid.cols + c);
  return out;
}

export interface CellOptions {
  overlay?: Overlay;
  spelling?: ReadonlyMap<number, string | null>;
  flats?: boolean;
  spec?: ChordSpec | null;
  degrees?: boolean;
}

/**
 * Ступень относительно рута — для ВСЕХ 64 пэдов, не только для нот аккорда:
 * человек может выделить руками любую ноту, и подпись должна уже лежать в
 * разметке. Показывает её CSS, код ничего не сочиняет.
 */
export function padCells(grid: Grid, opts: CellOptions = {}): PadCell[] {
  const { overlay = new Map(), spelling, flats = false, spec = null, degrees = true } = opts;
  const dmap = new Map(spec ? spec.degreeMap() : []);
  if (spec) for (let pc = 0; pc < 12; pc++) if (!dmap.has(pc)) dmap.set(pc, intervalShort(mod(pc - spec.rootPc, 12)));
  return domOrder(grid).map((p) => {
    const mark = overlay.get(p);
    const pc = grid.pc(p);
    const name = spelling?.get(pc) || grid.noteName(p, flats);
    let deg: string | null = degrees ? (dmap.get(pc) ?? null) : null;
    if (deg === null && mark && degrees) deg = mark.degree;
    return { p, base: grid.state(p), mark, name, deg: deg || null };
  });
}

/** Классы пэда так, как их ставил Python: «p b-<база> on|gh rt». */
export function staticPadClass(cell: PadCell): string {
  const cls = ["p", "b-" + cell.base];
  if (cell.mark) {
    cls.push(cell.mark.ghost ? "gh" : "on");
    if (cell.mark.isRoot) cls.push("rt");
  }
  return cls.join(" ");
}

/** Данные живой схемы (бывший блок script.pgd). */
export interface LiveData {
  /** классы высот аккорда ПО ПОРЯДКУ СТУПЕНЕЙ от рута: индекс баса = номер обращения */
  pcs: number[];
  rt: number;
  /** исходные пэды аккорда — аппликатура солвера */
  o: Pad[];
}

export function liveData(spec: ChordSpec, overlay: Overlay): LiveData {
  const pcs = [...new Set(spec.pitchClasses)].sort((a, b) => mod(a - spec.rootPc, 12) - mod(b - spec.rootPc, 12));
  const o = [...overlay].filter(([, m]) => !m.ghost).map(([p]) => p).sort((a, b) => a - b);
  return { pcs, rt: mod(spec.rootPc, 12), o };
}

/** Всё, что нужно живой схеме песни или последовательности. */
export interface SchemeModel {
  key: string;
  title: string;
  cells: PadCell[];
  data: LiveData;
}

export function schemeModel(grid: Grid, spec: ChordSpec, overlay: Overlay, title: string, key: string): SchemeModel {
  return {
    key,
    title,
    cells: padCells(grid, { overlay, spelling: spec.spelling(), flats: spec.prefersFlats, spec }),
    data: liveData(spec, overlay),
  };
}
