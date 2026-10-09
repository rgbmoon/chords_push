import clsx from "clsx";
import { ReactNode, useRef } from "react";
import { cssVars } from "../../utils/cssVars";
import styles from "./SplitPane.module.scss";
import { useSplitResize } from "./useSplitResize";

interface SplitPaneProps {
  main: ReactNode;
  aside: ReactNode;
  /** правая колонка не уже этого — обычно одна схема */
  minAside: number;
  /**
   * На телефоне:
   *   asideFirst — правая колонка лентой наверху, левая листается под ней;
   *   stacked    — левая первой, всё листается целиком.
   */
  mobile: "asideFirst" | "stacked";
}

/** Две колонки, каждая со своим скроллом, и ручка между ними. */
export function SplitPane({ main, aside, minAside, mobile }: SplitPaneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { split, dragging, gutterProps } = useSplitResize(ref, minAside);
  return (
    <div ref={ref} className={clsx(styles.split, styles[mobile], dragging && styles.dragging)} style={cssVars({ "--split": `${split}%` })}>
      <div className={styles.pane}>{main}</div>
      <div className={styles.gutter} {...gutterProps}>
        <span className={styles.handle} />
      </div>
      <div className={clsx(styles.pane, styles.aside)}>{aside}</div>
    </div>
  );
}
