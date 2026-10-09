import clsx from "clsx";
import { ChordMark, SheetLine, splitLyric } from "../../../core/sheet/sheet";
import styles from "./LyricLine.module.scss";

const NBSP = " ";

function Chord({ mark }: { mark: ChordMark | null }) {
  if (!mark) return <span className={styles.chord}>{NBSP}</span>;
  return (
    <span className={styles.chord} data-unknown={!mark.known || undefined} title={mark.known ? undefined : "not recognized — no diagram"}>
      {mark.symbol}
    </span>
  );
}

/** Строка песни: аккорды над своими слогами. */
export function LyricLine({ line }: { line: SheetLine }) {
  switch (line.kind) {
    case "blank":
      return <div className={styles.blank} />;
    case "lyric":
      return <div className={styles.line}>{line.lyric || NBSP}</div>;
    case "chords":
      return (
        <div className={clsx(styles.line, styles.chordsOnly)}>
          {line.chords.map((mark) => (
            <span className={styles.piece} key={mark.column}>
              <Chord mark={mark} />
              <span className={styles.text}>{NBSP}</span>
            </span>
          ))}
        </div>
      );
    case "pair":
      return (
        <div className={styles.line}>
          {splitLyric(line.lyric, line.chords).map((piece, i) => (
            <span className={styles.piece} key={i}>
              <Chord mark={piece.chord} />
              <span className={styles.text}>{piece.text || NBSP}</span>
            </span>
          ))}
        </div>
      );
  }
}
