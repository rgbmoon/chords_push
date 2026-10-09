import { Button } from "./Button";
import styles from "./SizeSwitch.module.scss";

export type Size = "S" | "M" | "L";
const SIZES: readonly Size[] = ["S", "M", "L"];

/** Переключатель S / M / L. Что именно он меняет, решает страница. */
export function SizeSwitch({ label, value, onChange }: { label: string; value: Size; onChange: (size: Size) => void }) {
  return (
    <div className={styles.switch} role="group" aria-label={label}>
      {label}
      {SIZES.map((s) => (
        <Button key={s} className={styles.option} aria-pressed={s === value} onClick={() => onChange(s)}>
          {s}
        </Button>
      ))}
    </div>
  );
}
