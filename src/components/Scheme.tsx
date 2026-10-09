/**
 * Живая схема аккорда. Подпись идёт НАД сеткой одной строкой: имя аккорда с
 * нотами слева, ступени справа — сначала читаешь, что за аккорд, потом смотришь
 * на пэды. Клик по бледному пэду переносит голос, по любому другому — добавляет
 * свою ноту (см. view/live.ts).
 */
import { useMemo, useState } from "react";
import { hit, initialState, LiveState, restore, Saved, toSaved, view } from "../view/live";
import type { SchemeModel } from "../view/scheme";
import { Pads } from "./Pads";

export function Scheme({
  model,
  saved,
  onSave,
}: {
  model: SchemeModel;
  saved?: Saved | null;
  onSave?: (key: string, st: Saved | null) => void;
}) {
  const [st, setSt] = useState<LiveState>(() => restore(model.data, saved));
  const v = useMemo(() => view(model.data, model.cells, st), [model, st]);

  const update = (next: LiveState, force = false) => {
    if (next === st && !force) return;
    setSt(next);
    onSave?.(model.key, toSaved(model.data, model.cells, next));
  };

  return (
    <div className={v.edited ? "pg edited" : "pg"} data-key={model.key || undefined}>
      <div className="pgcap">
        <div className="pgh">
          <b className="sym">{model.title}</b>
          <span className="sub">
            {v.notes.join(" · ")}
            {v.extraNotes.length ? (
              <>
                {" "}
                <span className="exd">+ {v.extraNotes.join(" · ")}</span>
              </>
            ) : null}
          </span>
        </div>
        <div className="pgf">
          <span className="vlab">{v.vlab}</span>
          <button className="rs" title="restore the solver's voicing" onClick={() => update(initialState(model.data), true)}>
            &#10227;
          </button>
          <span className="pgm">
            degrees <b>{v.degs.join(" · ")}</b>
            {v.extraDegs.length ? (
              <>
                {" "}
                <span className="exd">+ {v.extraDegs.join(" · ")}</span>
              </>
            ) : null}
          </span>
        </div>
      </div>
      <Pads
        pads={model.cells.map((c) => ({ p: c.p, cls: v.cls.get(c.p)!, name: c.name, deg: c.deg, tab: v.tab.has(c.p) }))}
        onHit={(p) => update(hit(model.data, st, p))}
      />
    </div>
  );
}
