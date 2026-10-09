import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import styles from "./PageLayout.module.scss";

interface PageLayoutProps {
  header: ReactNode;
  children: ReactNode;
  /**
   * scroll — обычная страница, листается целиком;
   * fixed  — экран без общей прокрутки: шапка на месте, области внутри листаются сами.
   */
  variant?: "scroll" | "fixed";
  /** fixed-экран на телефоне становится обычной страницей */
  scrollOnMobile?: boolean;
  style?: CSSProperties;
}

export function PageLayout({ header, children, variant = "scroll", scrollOnMobile, style }: PageLayoutProps) {
  return (
    <div className={clsx(styles[variant], scrollOnMobile && styles.scrollOnMobile)} style={style}>
      {header}
      {children}
    </div>
  );
}

/** Колонка контента по центру страницы. wide — для страниц из одних схем. */
export function PageContent({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return <main className={clsx(styles.content, wide && styles.wide)}>{children}</main>;
}
