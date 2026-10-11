import { DOTLESS_I, WORD_BOX, WORD_PATH } from "./wordmark-path";

// The bounty-hunter hat, drawn in a 100-wide box; the brim's lowest point is at y=64.
// Colours come from the --hat and --hat-band tokens in globals.css.
const HAT_CROWN =
  "M28 53 C 28 40, 30 27, 36 22.5 C 41 19, 45 24.5, 50 24.5 C 55 24.5, 59 19, 64 22.5 C 70 27, 72 40, 72 53 Z";
const HAT_BRIM =
  "M4 49 C 12 59, 32 64, 50 64 C 68 64, 88 59, 96 49 C 89 47, 81 52, 72 53 L 28 53 C 19 52, 11 47, 4 49 Z";

/** Geometric B (stem + two bowls), counters cut with even-odd filling. */
const GEO_B =
  "M25 14 H54 A17 17 0 0 1 62.12 45.93 A20.5 20.5 0 0 1 56 86 H25 A4 4 0 0 1 21 82 V18 A4 4 0 0 1 25 14 Z " +
  "M38 24.5 H51 A6.5 6.5 0 0 1 51 37.5 H38 Z M38 58 H55 A8 8 0 0 1 55 74 H38 Z";

function Hat() {
  return (
    <>
      <path d={HAT_CROWN} fill="var(--hat)" />
      <rect x="28.5" y="44.5" width="43" height="7" fill="var(--hat-band)" />
      <path d={HAT_BRIM} fill="var(--hat)" />
    </>
  );
}

// Hat over the dotless i: 0.82em wide, brim just above the letter, tilted 12°.
const HAT_W = 0.82;
const HAT_X = DOTLESS_I.cx - 50 * HAT_W;
const HAT_Y = DOTLESS_I.top - 5.5 - 64 * HAT_W;
const HAT_ON_I = `rotate(-12 ${DOTLESS_I.cx} ${HAT_Y + 40 * HAT_W}) translate(${HAT_X} ${HAT_Y}) scale(${HAT_W})`;

/** "Bountiful" with the hat on the i. The letters take the current text colour. */
export function Wordmark({ className }: { className?: string }) {
  const width = WORD_BOX.x2 - WORD_BOX.x1 + 8;
  return (
    <svg viewBox={`${WORD_BOX.x1 - 4} -6 ${width} ${WORD_BOX.y2 + 10}`} className={className} role="img" aria-label="Bountiful">
      <path d={WORD_PATH} fill="currentColor" />
      <g transform={HAT_ON_I}>
        <Hat />
      </g>
    </svg>
  );
}

/** The B with the hat resting on it. The B takes the current text colour. */
export function BMark({ className, label = "Bountiful" }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label={label}>
      <g transform="translate(16.9 35) scale(.68)">
        <path d={GEO_B} fillRule="evenodd" fill="currentColor" />
      </g>
      <g transform="rotate(-9 50 34) translate(18.5 6.5) scale(.63)">
        <Hat />
      </g>
    </svg>
  );
}
