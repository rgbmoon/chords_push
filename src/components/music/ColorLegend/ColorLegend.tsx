import clsx from "clsx";
import styles from "./ColorLegend.module.scss";

const ITEMS = {
  full: [
    ["root", "chord root"],
    ["chord", "other notes"],
    ["ghost", "pale — inversions: the same notes on other pads"],
    ["extra", "added by hand — not part of the chord"],
    ["tonic", "note C — tonic of the grid coloring"],
    ["scale", "C major scale"],
    ["off", "outside the scale"],
  ],
  short: [
    ["root", "chord root"],
    ["chord", "other notes"],
    ["ghost", "pale — inversions"],
    ["extra", "added by hand — not in the chord"],
    ["tonic", "note C"],
    ["scale", "C major scale"],
    ["off", "outside the scale"],
  ],
} as const;

/** Что значат цвета пэдов. */
export function ColorLegend({ variant = "full", className }: { variant?: keyof typeof ITEMS; className?: string }) {
  return (
    <div className={clsx(styles.legend, className)}>
      {ITEMS[variant].map(([color, text]) => (
        <span key={color} className={styles.item}>
          <i className={styles.swatch} data-color={color} />
          {text}
        </span>
      ))}
    </div>
  );
}
