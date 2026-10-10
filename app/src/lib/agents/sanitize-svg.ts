import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";

const MAX_SVG_BYTES = 20_000;

// jsdom is pinned to exactly 25.0.0, with cssstyle forced to 4.1.0 via a
// package.json "overrides" entry — not arbitrary choices. Two separate
// transitive dependencies break this Vercel/Turbopack serverless build with
// "require() of ES Module ... not supported" (never reproduces locally,
// only in production): html-encoding-sniffer >=5 depends on the ESM-only
// @exodus/bytes, and cssstyle >=4.2.1 depends on the ESM-only
// @asamuzakjp/css-color -> @csstools/css-calc. jsdom 25.0.0 + cssstyle
// 4.1.0 is the newest combination that avoids both chains entirely (we
// tried linkedom as a lighter replacement first — it broke 8 of our 12
// SVG-sanitization tests, including the <script>/onload/javascript:-href
// XSS-prevention ones, so it's not a safe DOMPurify pairing here, despite
// being commonly cited as one). Bump either pin only after re-running
// `npm ls --all | grep -iE "asamuzakjp|exodus/bytes|csstools"` to confirm
// it's still empty.
const window = new JSDOM("").window;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const DOMPurify = createDOMPurify(window as unknown as any);

DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
  const name = data.attrName.toLowerCase();

  // Defense in depth: DOMPurify already strips on* handlers by default, but
  // reject explicitly too rather than rely solely on that default.
  if (name.startsWith("on")) {
    data.keepAttr = false;
    return;
  }

  if (name === "href" || name === "xlink:href") {
    const value = data.attrValue.trim();
    // Only allow same-document fragment references (e.g. gradient/pattern
    // defs via href="#id") — reject every external or javascript: target.
    if (!value.startsWith("#")) {
      data.keepAttr = false;
    }
    return;
  }

  if (name === "style" && /url\s*\(|@import/i.test(data.attrValue)) {
    data.keepAttr = false;
  }
});

/** Sanitizes an untrusted SVG string for safe storage and rendering (only
 * ever via `<img src="data:image/svg+xml;...">`, never dangerouslySetInnerHTML).
 * Throws if the result isn't a safe, well-formed logo SVG. */
export function sanitizeSvg(rawSvg: string): string {
  const clean = DOMPurify.sanitize(rawSvg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["script", "foreignObject", "image", "style"],
    FORBID_ATTR: ["onload", "onerror", "onclick"],
  });

  if (!clean || !/<svg[\s>]/i.test(clean)) {
    throw new Error("sanitizeSvg: input is not a valid SVG after sanitization");
  }

  if (!/<svg[^>]*\bviewBox\s*=/i.test(clean)) {
    throw new Error("sanitizeSvg: <svg> must have a viewBox attribute");
  }

  if (Buffer.byteLength(clean, "utf8") > MAX_SVG_BYTES) {
    throw new Error(`sanitizeSvg: sanitized SVG exceeds ${MAX_SVG_BYTES} bytes`);
  }

  return clean;
}
