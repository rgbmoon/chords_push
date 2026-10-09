import styles from "./ChartEditor.module.scss";

export function FormatHelp() {
  return (
    <details className={styles.help}>
      <summary>Format help</summary>
      <p>
        <b>Progression</b> — chords separated by spaces, commas, <code>|</code> or <code>-&gt;</code>: <code>Bb | Gm -&gt; A, Dm</code>.
        You get a strip of diagrams, with voicings chosen for the whole chain at once.
      </p>
      <p>
        <b>Song</b> — &ldquo;chords over lyrics&rdquo;, like on any chords site: a line of chords, a line of lyrics under it, and each
        chord sits over its syllable. Paste from ultimate-guitar or similar sites as is: sections like <code>[Verse 1]</code> or{" "}
        <code>Chorus:</code>, notes in brackets, <code>x2</code>, <code>N.C.</code>, asterisks and bar lines are cleaned up
        automatically, and <code>H</code> is read as <code>B</code>. Diagrams are built for the chords played under the lyrics; intros
        and interludes stay in the text.
      </p>
      <p>
        Optional header: <code>@title:</code>, <code>@artist:</code>, <code>@key:</code>, <code>@bpm:</code>, <code>@capo:</code>,{" "}
        <code>@source:</code>. A line starting with <code>.</code> is always chords, one starting with <code>|</code> is always lyrics.
      </p>
      <p>
        <b>Case matters</b>: <code>CM7</code> is major seventh, <code>Cm7</code> is minor seventh. Slash bass — <code>Am/C</code>; major
        flat five — <code>C(b5)</code> (a bare <code>Cb5</code> is a power chord on Cb). Understood, for example:{" "}
        <code>C Cm Cdim Caug Csus2 Csus4 C5 C6 Cm6 C6/9 Cmaj7 Cm7 C7 CmMaj7 Cm7b5 Cdim7 Cadd9 Cmaj9 Cm9 C9 C7b9 C7#9 C11 Cm11 C13 C7alt</code>.
      </p>
    </details>
  );
}
