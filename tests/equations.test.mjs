import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { renderEquation } from "../src/modules/equations.js";
import { blocks } from "../src/modules/normalize.js";
test("explicit TeX delimiters and formula fences render, while prices and code stay literal", () => {
  const dom = new JSDOM(
    String.raw`<main><p>Pay $5 and $10. Solve \(x^2\) and <code>\(y^2\)</code>.</p><pre><code class="language-latex">\[x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}\]</code></pre><pre><code class="language-python">x = a / b</code></pre></main>`,
  );
  const bs = blocks(dom.window.document.querySelector("main"));
  assert.equal(bs[0].runs.filter((r) => r.math).length, 1);
  assert.ok(bs[0].runs.some((r) => r.code && r.text.includes("y^2")));
  assert.equal(bs[1].type, "math");
  assert.equal(bs[2].type, "code");
  const eq = renderEquation(bs[1].text, true);
  assert.match(eq.svg, /<path/);
  assert.match(eq.omml, /<m:f>/);
  assert.match(eq.omml, /<m:rad>/);
});
test("unannotated presentation MathML preserves its fraction structure", () => {
  const dom = new JSDOM(
    "<p><math><mfrac><mi>a</mi><mi>b</mi></mfrac></math></p>",
  );
  const run = blocks(dom.window.document.body)[0].runs[0];
  const eq = renderEquation(run.text, false, run.mathml);
  assert.match(eq.omml, /<m:f>/);
  assert.ok(eq.svg);
});
test("invalid TeX falls back per formula", () => {
  assert.equal(renderEquation(String.raw`\notARealCommand{x}`).error, true);
  assert.equal(renderEquation("x^2").inline, "x²");
});

test("block-level math markers and unlabelled display fences keep the formula", () => {
  const d = new JSDOM(
    String.raw`<main><div data-latex="\frac{a}{b}"></div><pre><code>\[x^2\]</code></pre></main>`,
  ).window.document;
  const bs = blocks(d.querySelector("main"));
  assert.deepEqual(
    bs.map((b) => b.type),
    ["math", "math"],
  );
  assert.match(renderEquation(bs[0].text, true).omml, /<m:f>/);
});
