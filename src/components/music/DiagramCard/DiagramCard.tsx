import clsx from "clsx";
import { ButtonHTMLAttributes, forwardRef, HTMLAttributes, ReactNode } from "react";
import styles from "./DiagramCard.module.scss";

export interface CardText {
  /** ноты аккорда снизу вверх */
  notes: readonly string[];
  /** ноты, добавленные руками */
  extraNotes?: readonly string[];
  degrees: readonly string[];
  extraDegrees?: readonly string[];
}

interface DiagramCardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title">, CardText {
  title: string;
  edited?: boolean;
  /** справа от подписи, перед ступенями: подпись обращения, кнопки */
  actions?: ReactNode;
  /** сетка */
  children: ReactNode;
}

const joined = (xs: readonly string[]) => xs.join(" · ");

/** Карточка схемы: подпись над сеткой и сама сетка. */
export const DiagramCard = forwardRef<HTMLDivElement, DiagramCardProps>(function DiagramCard(
  { title, notes, extraNotes = [], degrees, extraDegrees = [], edited, actions, children, className, ...rest },
  ref,
) {
  return (
    <div ref={ref} className={clsx(styles.card, edited && styles.edited, className)} {...rest}>
      <div className={styles.caption}>
        <div className={styles.heading}>
          <b className={styles.symbol}>{title}</b>
          <span className={styles.notes}>
            {joined(notes)}
            {extraNotes.length > 0 && <span className={styles.extra}> + {joined(extraNotes)}</span>}
          </span>
        </div>
        <div className={styles.side}>
          {actions}
          {(degrees.length > 0 || extraDegrees.length > 0) && (
            <span className={styles.degrees}>
              degrees <b>{joined(degrees)}</b>
              {extraDegrees.length > 0 && <span className={styles.extra}> + {joined(extraDegrees)}</span>}
            </span>
          )}
        </div>
      </div>
      {children}
    </div>
  );
});

/** Мелкая кнопка на карточке: ⟲, ×. */
export function CardButton({ className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={clsx(styles.cardButton, className)} {...rest} />;
}
