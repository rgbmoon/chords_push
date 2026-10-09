import { HTMLAttributes, KeyboardEvent, PointerEvent, RefObject, useState } from "react";

const MIN_MAIN = 300;
const KEY_STEP = 24;
const KEY_STEP_LARGE = 80;

/**
 * Ручка между колонками: тянем мышкой или пальцем, стрелками (Shift — шаг
 * крупнее), двойной клик и Home — поровну. Левая колонка не уже 300px,
 * правая — не уже minAside (обычно одна схема).
 */
export function useSplitResize(container: RefObject<HTMLElement | null>, minAside: number) {
  const [split, setSplit] = useState(50);
  const [dragging, setDragging] = useState(false);

  const box = () => container.current?.getBoundingClientRect();

  const resizeTo = (px: number) => {
    const rect = box();
    if (!rect) return;
    const clamped = Math.max(MIN_MAIN, Math.min(Math.max(MIN_MAIN, rect.width - minAside), px));
    setSplit((clamped / rect.width) * 100);
  };

  const stopDragging = (e: PointerEvent<HTMLElement>) => {
    if (!dragging) return;
    setDragging(false);
    document.body.classList.remove("dragging");
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const gutterProps: HTMLAttributes<HTMLElement> = {
    role: "separator",
    "aria-orientation": "vertical",
    "aria-label": "column width",
    "aria-valuenow": Math.round(split),
    tabIndex: 0,
    title: "drag to resize the columns · double-click to split evenly",
    onPointerDown(e) {
      if (window.matchMedia("(max-width: 900px)").matches) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragging(true);
      // курсор «ресайз» на всё время перетаскивания, где бы ни была мышь
      document.body.classList.add("dragging");
      e.preventDefault();
    },
    onPointerMove(e) {
      if (dragging) resizeTo(e.clientX - (box()?.left ?? 0));
    },
    onPointerUp: stopDragging,
    onPointerCancel: stopDragging,
    onDoubleClick: () => setSplit(50),
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
      const current = ((box()?.width ?? 0) * split) / 100;
      if (e.key === "ArrowLeft") resizeTo(current - step);
      else if (e.key === "ArrowRight") resizeTo(current + step);
      else if (e.key === "Home" || e.key === "Enter") setSplit(50);
      else return;
      e.preventDefault();
    },
  };

  return { split, dragging, gutterProps };
}
