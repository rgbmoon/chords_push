/**
 * 64 пэда сетки. ОДНО место, где рождается разметка пэда — и для живой схемы,
 * и для пустого шаблона: иначе две копии разъезжаются, а CSS у них общий.
 *
 * data-p — логический номер пэда (ряд снизу вверх), а в DOM пэды идут сверху
 * вниз: код обязан ходить по этому номеру, а не по позиции в querySelectorAll.
 */
import type { KeyboardEvent } from "react";

export interface PadRender {
  p: number;
  cls: string;
  name: string;
  /** ступень; null — подписи нет вовсе, "" — пустая подпись (шаблон) */
  deg: string | null;
  tab?: boolean;
  /** имя ноты по умолчанию в data-n: шаблон перепишет подпись, а по data-n вернёт */
  dataName?: boolean;
}

export function Pads({ pads, onHit }: { pads: readonly PadRender[]; onHit?: (p: number) => void }) {
  const key = (p: number) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      onHit?.(p);
      e.preventDefault();
    }
  };
  return (
    <div className="pads">
      {pads.map((c) => (
        <span
          key={c.p}
          className={c.cls}
          data-p={c.p}
          data-n={c.dataName ? c.name : undefined}
          tabIndex={c.tab ? 0 : undefined}
          onClick={onHit ? () => onHit(c.p) : undefined}
          onKeyDown={onHit ? key(c.p) : undefined}
        >
          {c.name ? <b>{c.name}</b> : null}
          {/* у трёхсимвольных ступеней (bb7, b13, #11) кегль на полпункта меньше:
              только они и не влезают рядом с двухбуквенным именем */}
          {c.deg !== null ? <u className={c.deg.length > 2 ? "l3" : undefined}>{c.deg}</u> : null}
        </span>
      ))}
    </div>
  );
}
