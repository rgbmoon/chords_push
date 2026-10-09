import clsx from "clsx";
import { forwardRef, InputHTMLAttributes } from "react";
import styles from "./TextField.module.scss";

export const TextField = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextField(
  { className, type = "text", ...rest },
  ref,
) {
  return <input ref={ref} type={type} className={clsx(styles.field, className)} {...rest} />;
});
