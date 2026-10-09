import clsx from "clsx";
import type { KeyboardEvent } from "react";
import type { PadRole } from "../../../core/diagram/diagram";
import type { Pad, PadColor } from "../../../core/grid/grid";
import styles from "./PadGrid.module.scss";

export interface PadCell {
  pad: Pad;
  color: PadColor;
  name: string;
  /** ступень; null — подписи нет */
  degree: string | null;
  role: PadRole | null;
  isRoot: boolean;
  /** до пэда можно дойти с клавиатуры */
  focusable?: boolean;
}

interface PadGridProps {
  /** пэды в порядке отрисовки — верхний ряд первым */
  cells: readonly PadCell[];
  onPadClick?: (pad: Pad) => void;
  size?: "card" | "large";
  /** кликается любой пэд, а не только бледные */
  free?: boolean;
  /** пэд под курсором показывает свою ступень */
  hoverDegrees?: boolean;
  /** нот набрано максимум — добавлять нельзя */
  full?: boolean;
  /** сетка не ловит клики (карточка кликается целиком) */
  inert?: boolean;
  /** имя для чтения с экрана: «pad grid» */
  label?: string;
}

/**
 * 64 пэда. Пэд знает свой номер (data-pad): в разметке пэды идут сверху вниз,
 * а нумеруются снизу вверх — искать пэд можно только по номеру.
 */
export function PadGrid({ cells, onPadClick, size = "card", free, hoverDegrees, full, inert, label }: PadGridProps) {
  const onKey = (pad: Pad) => (e: KeyboardEvent) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    onPadClick?.(pad);
    e.preventDefault();
  };
  return (
    <div
      className={clsx(
        styles.frame,
        size === "large" && styles.large,
        onPadClick && styles.clickable,
        free && styles.free,
        hoverDegrees && styles.hoverDegrees,
        full && styles.full,
        inert && styles.inert,
      )}
      role={label ? "group" : undefined}
      aria-label={label}
    >
      <div className={styles.grid}>
        {cells.map((c) => (
          <span
            key={c.pad}
            className={styles.pad}
            data-pad={c.pad}
            data-color={c.color}
            data-role={c.role ?? undefined}
            data-root={c.isRoot || undefined}
            tabIndex={c.focusable ? 0 : undefined}
            onClick={onPadClick && (() => onPadClick(c.pad))}
            onKeyDown={onPadClick && onKey(c.pad)}
          >
            {c.name && <b className={styles.name}>{c.name}</b>}
            {c.degree !== null && (
              <span className={styles.degree} data-long={c.degree.length > 2 || undefined}>
                {c.degree}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}
