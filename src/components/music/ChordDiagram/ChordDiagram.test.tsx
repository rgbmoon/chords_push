import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ghostPads } from "../../../core/diagram/diagram";
import { padPc } from "../../../core/grid/grid";
import { voiceChord } from "../../../core/grid/voicing";
import { parseChord } from "../../../core/theory/chord";
import { ChordDiagram } from "./ChordDiagram";

afterEach(cleanup);

const am = parseChord("Am");
const { pads } = voiceChord(am);
const pad = (p: number) => document.querySelector(`[data-pad="${p}"]`) as HTMLElement;
const outside = [...Array(64).keys()].find((p) => ![9, 0, 4].includes(padPc(p)))!;

describe("схема аккорда", () => {
  it("перенос голоса подписывает обращение, ⟲ возвращает раскладку солвера", () => {
    const onChange = vi.fn();
    render(<ChordDiagram chord={am} pads={pads} onChange={onChange} />);
    expect(screen.queryByText(/inversion/)).toBeNull();

    const bass = pads[0];
    const up = ghostPads(am, pads).find((p) => padPc(p) === padPc(bass) && p > Math.max(...pads))!;
    fireEvent.click(pad(up));
    expect(pad(up).dataset.role).toBe("chord");
    expect(screen.getByText("1st inversion")).toBeTruthy();
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ extra: [] }));

    fireEvent.click(screen.getByTitle("restore the solver's voicing"));
    expect(pad(up).dataset.role).toBe("ghost");
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("своя нота — фиолетовая, без подписи обращения; повторный клик снимает", () => {
    render(<ChordDiagram chord={am} pads={pads} />);
    fireEvent.click(pad(outside));
    expect(pad(outside).dataset.role).toBe("extra");
    expect(screen.queryByText(/inversion/)).toBeNull();
    fireEvent.keyDown(pad(outside), { key: "Enter" });
    expect(pad(outside).dataset.role).toBeUndefined();
  });

  it("сохранённая правка встаёт на место", () => {
    render(<ChordDiagram chord={am} pads={pads} saved={{ pads: [...pads], extra: [outside] }} />);
    expect(pad(outside).dataset.role).toBe("extra");
  });
});
