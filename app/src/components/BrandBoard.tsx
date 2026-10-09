import type { BrandKit } from "@/lib/agents/schema";

/** Renders a generated brand kit. The logo SVG is already sanitized
 * server-side (sanitize-svg.ts) before it ever reaches the database, but we
 * still never use dangerouslySetInnerHTML on agent-supplied markup — a data
 * URI <img> is a hard sandbox boundary regardless of how trusted the source
 * claims to be. */
export function BrandBoard({ kit }: { kit: BrandKit }) {
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(kit.logoSvg, "utf8").toString("base64")}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <img
          src={logoDataUri}
          alt={`${kit.names[0]} logo`}
          className="h-16 w-16 shrink-0 rounded-lg bg-white/5 object-contain p-2"
        />
        <div>
          <h3
            className="text-lg font-semibold text-zinc-50"
            style={{ fontFamily: `"${kit.fonts.heading}", sans-serif` }}
          >
            {kit.names[0]}
          </h3>
          <p
            className="text-sm text-zinc-400"
            style={{ fontFamily: `"${kit.fonts.body}", sans-serif` }}
          >
            {kit.tagline}
          </p>
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs uppercase tracking-wider text-zinc-500">Name options</div>
        <ul className="flex flex-wrap gap-2 text-sm text-zinc-300">
          {kit.names.map((name) => (
            <li key={name} className="rounded-full border border-zinc-800 px-3 py-1">
              {name}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <div className="mb-1 text-xs uppercase tracking-wider text-zinc-500">Palette</div>
        <div className="flex flex-wrap gap-3">
          {kit.palette.map((color) => (
            <div key={color.hex} className="flex flex-col items-center gap-1">
              <span
                className="h-10 w-10 rounded-full border border-zinc-800"
                style={{ backgroundColor: color.hex }}
              />
              <span className="text-[10px] text-zinc-500">{color.name}</span>
              <span className="font-mono text-[10px] text-zinc-600">{color.hex}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-xs uppercase tracking-wider text-zinc-500">
          Fonts — {kit.fonts.heading} / {kit.fonts.body}
        </div>
        <p
          className="text-xl text-zinc-200"
          style={{ fontFamily: `"${kit.fonts.heading}", sans-serif` }}
        >
          {kit.names[0]}
        </p>
        <p
          className="text-sm text-zinc-400"
          style={{ fontFamily: `"${kit.fonts.body}", sans-serif` }}
        >
          The quick brown fox jumps over the lazy dog.
        </p>
      </div>

      <div>
        <div className="mb-1 text-xs uppercase tracking-wider text-zinc-500">Moodboard</div>
        <div className="grid grid-cols-2 gap-2">
          {kit.moodboard.map((scene, i) => (
            <div
              key={i}
              className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-xs text-zinc-400"
            >
              {scene}
            </div>
          ))}
        </div>
      </div>

      <details className="text-xs text-zinc-500">
        <summary className="cursor-pointer select-none">Rationale</summary>
        <p className="mt-2 leading-relaxed">{kit.rationale}</p>
      </details>
    </div>
  );
}
