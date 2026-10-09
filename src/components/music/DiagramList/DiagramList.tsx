import clsx from "clsx";
import { forwardRef, HTMLAttributes } from "react";
import styles from "./DiagramList.module.scss";

interface DiagramListProps extends HTMLAttributes<HTMLDivElement> {
  /** strip — в боковой колонке: на телефоне становится лентой; grid — вся страница из схем */
  layout?: "strip" | "grid";
}

export const DiagramList = forwardRef<HTMLDivElement, DiagramListProps>(function DiagramList({ layout = "strip", className, ...rest }, ref) {
  return <div ref={ref} className={clsx(styles.list, layout === "strip" ? styles.strip : styles.roomy, className)} {...rest} />;
});
