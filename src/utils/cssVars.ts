import type { CSSProperties } from "react";

/** CSS-переменные для style={…}: cssVars({ "--card-min": "400px" }). */
export const cssVars = (vars: Record<`--${string}`, string | number>): CSSProperties => vars as CSSProperties;
