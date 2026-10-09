import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeSvg } from "./sanitize-svg";

const BASE = (inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${inner}</svg>`;

test("a clean minimal logo SVG passes through with its viewBox intact", () => {
  const svg = BASE('<circle cx="50" cy="50" r="40" fill="#112233" />');
  const out = sanitizeSvg(svg);
  assert.match(out, /viewBox="0 0 100 100"/);
  assert.match(out, /<circle/);
});

test("strips <script> tags", () => {
  const svg = BASE('<script>alert(document.cookie)</script><circle r="1" />');
  const out = sanitizeSvg(svg);
  assert.ok(!/script/i.test(out), `expected no script tag, got: ${out}`);
});

test("strips onload (and other on*) event handler attributes", () => {
  const svg = BASE('<rect width="10" height="10" onload="alert(1)" onclick="alert(2)" />');
  const out = sanitizeSvg(svg);
  assert.ok(!/onload/i.test(out), `expected onload stripped, got: ${out}`);
  assert.ok(!/onclick/i.test(out), `expected onclick stripped, got: ${out}`);
});

test("strips javascript: hrefs", () => {
  const svg = BASE('<a href="javascript:alert(1)"><circle r="1" /></a>');
  const out = sanitizeSvg(svg);
  assert.ok(!/javascript:/i.test(out), `expected javascript: stripped, got: ${out}`);
});

test("strips external image references (<image> tag entirely forbidden)", () => {
  const svg = BASE('<image href="https://evil.example/track.png" width="1" height="1" />');
  const out = sanitizeSvg(svg);
  assert.ok(!/<image/i.test(out), `expected <image> removed, got: ${out}`);
  assert.ok(!/evil\.example/i.test(out), `expected external URL removed, got: ${out}`);
});

test("strips external xlink:href references", () => {
  const svg = BASE('<use xlink:href="https://evil.example/sprite.svg#x" />');
  const out = sanitizeSvg(svg);
  assert.ok(!/evil\.example/i.test(out), `expected external xlink:href removed, got: ${out}`);
});

test("keeps an internal gradient reference (fill=\"url(#id)\")", () => {
  const svg = BASE(
    '<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>' +
      '<rect width="10" height="10" fill="url(#g)" />',
  );
  const out = sanitizeSvg(svg);
  assert.match(out, /fill="url\(#g\)"/);
});

test("strips <style> blocks containing @import / url()", () => {
  const svg = BASE(
    '<style>@import url("https://evil.example/style.css"); .x { fill: url(#x); }</style>' +
      '<circle r="1" class="x" />',
  );
  const out = sanitizeSvg(svg);
  assert.ok(!/@import/i.test(out), `expected @import stripped, got: ${out}`);
  assert.ok(!/evil\.example/i.test(out), `expected external style URL stripped, got: ${out}`);
});

test("strips a style attribute containing url()/@import", () => {
  const svg = BASE('<rect width="10" height="10" style="fill:url(https://evil.example/x.png)" />');
  const out = sanitizeSvg(svg);
  assert.ok(!/evil\.example/i.test(out), `expected external style url() stripped, got: ${out}`);
});

test("strips <foreignObject>", () => {
  const svg = BASE('<foreignObject><body xmlns="http://www.w3.org/1999/xhtml">hi</body></foreignObject>');
  const out = sanitizeSvg(svg);
  assert.ok(!/foreignObject/i.test(out), `expected foreignObject removed, got: ${out}`);
});

test("throws when the SVG has no viewBox", () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><circle r="1" /></svg>';
  assert.throws(() => sanitizeSvg(svg), /viewBox/);
});

test("throws when the sanitized SVG exceeds the size limit", () => {
  const manyCircles = Array.from(
    { length: 2000 },
    (_, i) => `<circle cx="${i % 100}" cy="${Math.floor(i / 100)}" r="1" fill="#112233" />`,
  ).join("");
  const big = BASE(manyCircles);
  assert.throws(() => sanitizeSvg(big), /exceeds/);
});
