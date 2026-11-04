import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";
import { blocks } from "../src/modules/normalize.js";

test("editor lines preserve empty rows, inline tokens and tabs across controls", () => {
  const { document } = new JSDOM(
    '<div class="cm-content" style="tab-size:3"><div class="cm-line"><br></div><div class="cm-line"><span style="color:#db3876">let</span>\tx;</div><div class="cm-line"><br></div><div class="cm-line">  y<button>copy</button></div></div>',
  ).window;
  const [code] = blocks(document.body);
  assert.equal(code.text, "\nlet\tx;\n\n  y");
  assert.equal(code.tokens.find((r) => r.text === "let").color, "#db3876");
  assert.equal(code.tabSize, 3);
});

test("direction-relative alignment and inline code emphasis survive extraction", () => {
  const { document } = new JSDOM(
    '<div style="direction:rtl;text-align:start"><p>Use <code style="color:#247389"><b>x</b></code></p></div>',
  ).window;
  const [p] = blocks(document.body);
  assert.equal(p.alignment, "right");
  const token = p.runs.find((r) => r.code);
  assert.equal(token.pdfStyle.color, "#247389");
  assert.equal(token.bold, true);
});
