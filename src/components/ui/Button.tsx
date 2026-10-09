import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";
import { Link, LinkProps } from "react-router-dom";
import styles from "./Button.module.scss";

interface Look {
  variant?: "default" | "primary";
  size?: "default" | "small";
}

const lookClass = ({ variant = "default", size = "default" }: Look, className?: string) =>
  clsx(styles.button, variant === "primary" && styles.primary, size === "small" && styles.small, className);

export function Button({ variant, size, className, type = "button", ...rest }: Look & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type={type} className={lookClass({ variant, size }, className)} {...rest} />;
}

/** Ссылка, которая выглядит как кнопка. */
export function ButtonLink({ variant, size, className, ...rest }: Look & LinkProps) {
  return <Link className={lookClass({ variant, size }, className)} {...rest} />;
}
