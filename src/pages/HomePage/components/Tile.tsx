import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./Tile.module.scss";

export function Tiles({ children }: { children: ReactNode }) {
  return <div className={styles.tiles}>{children}</div>;
}

interface TileProps {
  to: string;
  title: string;
  subtitle: string;
  meta: string;
  /** что удаляется — для вопроса «Delete chart "…"?» */
  kind: string;
  onDelete: () => void;
}

export function Tile({ to, title, subtitle, meta, kind, onDelete }: TileProps) {
  return (
    <div className={styles.tile}>
      <Link className={styles.link} to={to}>
        <b className={styles.title}>{title}</b>
        <span className={styles.subtitle}>{subtitle}</span>
        <span className={styles.meta}>{meta}</span>
      </Link>
      <button
        type="button"
        className={styles.delete}
        title={`delete ${kind}`}
        aria-label={`delete ${kind} ${title}`}
        onClick={() => confirm(`Delete ${kind} "${title}"?`) && onDelete()}
      >
        &times;
      </button>
    </div>
  );
}

export function AddTile({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link className={styles.add} to={to}>
      {children}
    </Link>
  );
}
