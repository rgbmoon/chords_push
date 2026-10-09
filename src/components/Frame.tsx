/**
 * Общая рама страниц (бывший webapp.py): шапка, раскладка «две колонки с ручкой»,
 * переключатель размера, легенда, страничный CSS.
 * Правило то же: понадобилось второй странице — переезжает сюда, а не копируется.
 */
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PALETTE } from "../core/data";

/** Шапка страницы. back — куда ведёт «главная»; null убирает ссылку. */
export function Header({
  title,
  subtitle,
  chips,
  ctl,
  back = "/",
  backText = "home",
}: {
  title: string;
  subtitle?: string;
  chips?: ReactNode;
  ctl?: ReactNode;
  back?: string | null;
  backText?: string;
}) {
  return (
    <header className="top">
      <div className="topin">
        {back !== null ? (
          <Link className="back" to={back}>
            &larr; {backText}
          </Link>
        ) : null}
        <h1>
          {title}
          {subtitle ? <small>{subtitle}</small> : null}
        </h1>
        {chips ? <div className="chips">{chips}</div> : null}
        {ctl ? <div className="ctl">{ctl}</div> : null}
      </div>
    </header>
  );
}

/**
 * CSS страницы. Живёт ровно пока страница смонтирована: у страниц свои `.legend`,
 * `footer`, `h2`, а двухколоночные вдобавок запрещают скролл `body` — в одном
 * приложении они иначе мешали бы друг другу.
 */
export function PageStyle({ css }: { css: string }) {
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

/**
 * Ручка между колонками: тянем мышкой/пальцем, стрелками, двойной клик — 50/50.
 * Левая колонка ужимается до 300px, правая — не уже одной карточки схемы:
 * иначе подписи на пэдах становится не разобрать.
 */
export function SplitLayout({ left, right }: { left: ReactNode; right: ReactNode }) {
  const layRef = useRef<HTMLDivElement>(null);
  const gutRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const lay = layRef.current;
    const gut = gutRef.current;
    if (!lay || !gut) return;
    const left = lay.firstElementChild as HTMLElement;
    const MIN = 300;
    const MINR = parseInt(getComputedStyle(lay).getPropertyValue("--card-min"), 10) + 26 || 406;
    const widthNow = () => left.getBoundingClientRect().width;
    const setSplit = (px: number) => {
      const w = lay.getBoundingClientRect().width;
      const g = gut.getBoundingClientRect().width;
      const x = Math.max(MIN, Math.min(Math.max(MIN, w - g - MINR), px));
      lay.style.setProperty("--split", ((x / w) * 100).toFixed(2) + "%");
      gut.setAttribute("aria-valuenow", String(Math.round((x / w) * 100)));
    };
    const half = () => lay.style.setProperty("--split", "50%");
    let drag = false;
    const down = (e: PointerEvent) => {
      if (window.innerWidth <= 900) return;
      drag = true;
      gut.setPointerCapture(e.pointerId);
      gut.classList.add("drag");
      document.body.classList.add("dragging");
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (drag) setSplit(e.clientX - lay.getBoundingClientRect().left);
    };
    const stop = (e: PointerEvent) => {
      if (!drag) return;
      drag = false;
      gut.classList.remove("drag");
      document.body.classList.remove("dragging");
      if (gut.hasPointerCapture(e.pointerId)) gut.releasePointerCapture(e.pointerId);
    };
    const key = (e: KeyboardEvent) => {
      const step = e.shiftKey ? 80 : 24;
      if (e.key === "ArrowLeft") setSplit(widthNow() - step);
      else if (e.key === "ArrowRight") setSplit(widthNow() + step);
      else if (e.key === "Home" || e.key === "Enter") half();
      else return;
      e.preventDefault();
    };
    gut.addEventListener("pointerdown", down);
    gut.addEventListener("pointermove", move);
    gut.addEventListener("pointerup", stop);
    gut.addEventListener("pointercancel", stop);
    gut.addEventListener("dblclick", half);
    gut.addEventListener("keydown", key);
    return () => {
      gut.removeEventListener("pointerdown", down);
      gut.removeEventListener("pointermove", move);
      gut.removeEventListener("pointerup", stop);
      gut.removeEventListener("pointercancel", stop);
      gut.removeEventListener("dblclick", half);
      gut.removeEventListener("keydown", key);
      document.body.classList.remove("dragging");
    };
  }, []);

  return (
    <div className="layout" ref={layRef}>
      {left}
      <div
        className="gutter"
        id="gutter"
        ref={gutRef}
        tabIndex={0}
        role="separator"
        aria-orientation="vertical"
        aria-label="column width"
        aria-valuenow={50}
        title="drag to resize the columns · double-click to split evenly"
      >
        <b />
      </div>
      {right}
    </div>
  );
}

export type Size = "S" | "M" | "L";

/**
 * Переключатель размера S / M / L. Что именно он меняет, решает страница:
 * кегль текста песни или ширину схем. Уходя со страницы, всё возвращаем —
 * переменные висят на <html>, а приложение одно на все страницы.
 */
export function Sizer({ label, apply, vars }: { label: string; apply: (s: Size) => void; vars: readonly string[] }) {
  const [cur, setCur] = useState<Size>("M");
  useEffect(
    () => () => {
      for (const v of vars) document.documentElement.style.removeProperty(v);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="sizer">
      {label}
      {(["S", "M", "L"] as const).map((s) => (
        <button
          key={s}
          data-size={s}
          aria-pressed={cur === s}
          onClick={() => {
            setCur(s);
            apply(s);
          }}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

const st = PALETTE.states;

/** Легенда цветов. Полная — для страницы со схемами, короткая — для песни. */
export const LEGEND_LONG: [string, string][] = [
  [st.chord_root.stops[1], "chord root"],
  [st.chord.stops[1], "other notes"],
  [st.chord.stops[1] + "66", "pale — inversions: the same notes on other pads"],
  [st.extra.stops[1], "added by hand — not part of the chord"],
  [st.root.stops[0], "note C — tonic of the grid coloring"],
  [st.in_key.stops[0], "C major scale"],
  [st.off.stops[0], "outside the scale"],
];

export const LEGEND_SHORT: [string, string][] = [
  [st.chord_root.stops[1], "chord root"],
  [st.chord.stops[1], "other notes"],
  [st.chord.stops[1] + "66", "pale — inversions"],
  [st.extra.stops[1], "added by hand — not in the chord"],
  [st.root.stops[0], "note C"],
  [st.in_key.stops[0], "C major scale"],
  [st.off.stops[0], "outside the scale"],
];

export function Legend({ items }: { items: readonly [string, string][] }) {
  return (
    <div className="legend">
      {items.map(([c, t]) => (
        <span key={t}>
          <i style={{ background: c }} />
          {t}
        </span>
      ))}
    </div>
  );
}
