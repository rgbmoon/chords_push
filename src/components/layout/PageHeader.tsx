import clsx from "clsx";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import styles from "./PageHeader.module.scss";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** короткие факты рядом с названием: тональность, темп */
  facts?: ReactNode;
  /** органы управления справа */
  actions?: ReactNode;
  /** ссылка назад; null — без неё */
  back?: { to: string; label: string } | null;
  /** прилипает к верху окна, пока листается страница */
  sticky?: boolean;
}

export function PageHeader({
  title,
  subtitle,
  facts,
  actions,
  back = { to: "/", label: "home" },
  sticky,
}: PageHeaderProps) {
  return (
    <header className={clsx(styles.header, sticky && styles.sticky)}>
      <div className={styles.inner}>
        {back && (
          <Link className={styles.back} to={back.to}>
            &larr; {back.label}
          </Link>
        )}
        <h1 className={styles.title}>
          {title}
          {subtitle && <small className={styles.subtitle}>{subtitle}</small>}
        </h1>
        {facts && <div className={styles.facts}>{facts}</div>}
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </header>
  );
}
