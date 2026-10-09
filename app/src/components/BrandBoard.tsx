import type { BrandKit } from "@/lib/agents/schema";

/** Renders a generated brand kit. The logo SVG is already sanitized
 * server-side (sanitize-svg.ts) before it ever reaches the database, but we
 * still never use dangerouslySetInnerHTML on agent-supplied markup — a data
 * URI <img> is a hard sandbox boundary regardless of how trusted the source
 * claims to be.
 *
 * `revealed` gates the paid parts of the deliverable (palette, fonts,
 * moodboard, rationale, and an unmarked logo) behind the bounty actually
 * being awarded — before that, only the name/tagline (enough to judge
 * quality) and a watermarked logo are shown. This is a UI deterrent against
 * casual copying, not real access control: the anon Supabase key is public
 * by construction, so the underlying row is still fetchable directly. Real
 * protection would need wallet-signature auth, which this project doesn't
 * have. */
export function BrandBoard({
  kit,
  revealed,
  watermark,
}: {
  kit: BrandKit;
  revealed: boolean;
  watermark: string;
}) {
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(kit.logoSvg, "utf8").toString("base64")}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg bg-white/5">
          <img
            src={logoDataUri}
            alt={`${kit.names[0]} logo`}
            className="h-full w-full object-contain p-2"
          />
          {!revealed && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 flex items-center justify-center"
            >
              <span className="w-[140%] -rotate-45 bg-black/5 py-px text-center text-[8px] font-bold uppercase tracking-widest text-white/30 backdrop-blur-[1px]">
                {watermark}
              </span>
            </div>
          )}
        </div>
        <div className="min-w-0">
          <h3
            className="break-words text-lg font-semibold text-zinc-50"
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

      {!revealed ? (
        <p className="rounded-lg border border-dashed border-zinc-800 p-3 text-xs text-zinc-600">
          Palette, fonts, moodboard, and rationale unlock once this bounty is awarded.
        </p>
      ) : (
        <>
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

          <button
            type="button"
            onClick={() => downloadKitZip(kit)}
            className="self-start rounded-full border border-zinc-700 px-4 py-1.5 text-xs font-semibold text-zinc-300 transition hover:border-accent hover:text-accent"
          >
            Download kit (.zip)
          </button>
        </>
      )}
    </div>
  );
}

function kitSummaryText(kit: BrandKit): string {
  return `${kit.names[0]} — brand kit
${"=".repeat(40)}

Tagline: ${kit.tagline}

Name options:
${kit.names.map((n) => `  - ${n}`).join("\n")}

Palette:
${kit.palette.map((c) => `  - ${c.name}: ${c.hex}`).join("\n")}

Fonts:
  Heading: ${kit.fonts.heading}
  Body: ${kit.fonts.body}

Moodboard:
${kit.moodboard.map((m, i) => `  ${i + 1}. ${m}`).join("\n")}

Rationale:
${kit.rationale}
`;
}

/** Agent-generated SVGs tend to carry a small viewBox (e.g. "0 0 64 64")
 * with no explicit width/height, so apps that don't auto-fit to their
 * viewport (Preview, Illustrator, Figma import) render them at that literal
 * tiny native size. Stamping a large width/height — scaled to the viewBox's
 * aspect ratio — fixes that for the exported file without touching how the
 * logo renders on the page (that's sized by its CSS container instead). */
function upscaleSvgForExport(svgText: string, targetSize = 512): string {
  const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.querySelector("parsererror")) return svgText;

  let width = targetSize;
  let height = targetSize;
  const viewBox = svg.getAttribute("viewBox");
  if (viewBox) {
    const parts = viewBox.trim().split(/\s+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      const aspect = parts[2] / parts[3];
      if (aspect >= 1) {
        height = Math.round(targetSize / aspect);
      } else {
        width = Math.round(targetSize * aspect);
      }
    }
  }
  svg.setAttribute("width", String(width));
  svg.setAttribute("height", String(height));
  return new XMLSerializer().serializeToString(svg);
}

async function downloadKitZip(kit: BrandKit): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("logo.svg", upscaleSvgForExport(kit.logoSvg));
  zip.file("brand-kit.txt", kitSummaryText(kit));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kit.names[0].toLowerCase().replace(/[^a-z0-9]+/g, "-")}-brand-kit.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
