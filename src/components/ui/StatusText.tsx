import clsx from "clsx";
import styles from "./StatusText.module.scss";

export interface Status {
  text: string;
  error?: boolean;
}

/** Короткий статус рядом с кнопкой: «saved», «name required». */
export function StatusText({ status }: { status: Status | null }) {
  if (!status) return null;
  return (
    <span className={clsx(styles.status, status.error && styles.error)} role="status">
      {status.text}
    </span>
  );
}
