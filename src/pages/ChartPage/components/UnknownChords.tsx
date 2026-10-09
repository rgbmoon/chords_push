import { Link } from "react-router-dom";
import type { UnknownChord } from "../../../core/sheet/analyze";
import styles from "./UnknownChords.module.scss";

export function UnknownChords({ unknown }: { unknown: readonly UnknownChord[] }) {
  if (!unknown.length) return null;
  return (
    <p className={styles.warning}>
      Not recognized: <b>{[...new Set(unknown.map((u) => u.symbol))].join(", ")}</b> — no diagrams for these. The format help on the{" "}
      <Link to="/">home page</Link> lists the spellings it understands.
    </p>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  return message ? <p className={styles.warning}>{message}</p> : null;
}
