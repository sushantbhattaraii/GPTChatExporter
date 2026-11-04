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

test("list item styles reach direct text and nested spans without styling the next item", () => {
  const { document } = new JSDOM(`<ol>
    <li style="font-weight:700"><span>Bold text</span><span style="font-weight:400">: Regular</span></li>
    <li><u><del><span>Both decorations</span></del></u> Plain</li>
  </ol>`).window;
  const [list] = blocks(document.body);
  const [bold, regular] = list.items[0][0].runs;
  assert.ok(bold.bold);
  assert.ok(!regular.bold);
  const [both, plain] = list.items[1][0].runs;
  assert.ok(both.underline && both.strike);
  assert.ok(!plain.underline && !plain.strike);
});

test("a code block's declared copy source contains its full text without consuming its neighbor's source", () => {
  const text = "begin\n\nrepeat\nrepeat\nend\n";
  const { document } = new JSDOM(
    '<section><div class="code-block"><button>Copy</button><pre><code>repeat</code></pre></div><pre><code><span aria-hidden="true">neighbor</span></code></pre></section>',
  ).window;
  document.querySelector("button").setAttribute("data-clipboard-text", text);
  const [first, second] = blocks(document.querySelector("section"));
  assert.equal(first.text, text);
  assert.equal(first.tokens.map((t) => t.text).join(""), text);
  assert.equal(second.text, "neighbor");
});

test("unverifiable code gaps stop an export without blocking an export that excludes code", async () => {
  const { withCompleteCode } = await import("../src/modules/code-source.js");
  const { document } = new JSDOM(
    '<section><div class="cm-content"><div class="cm-gap"></div><div class="cm-line">only visible line</div></div></section>',
  ).window;
  const read = () => blocks(document.querySelector("section"));
  await assert.rejects(withCompleteCode(read), /full code/);
  assert.equal(
    (await withCompleteCode(read, { includeCode: false }))[0].text,
    "only visible line",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    withCompleteCode(read, { signal: controller.signal }),
    /cancelled/,
  );
});

test("a standalone multiline code element and a scoped read-only source retain all lines", () => {
  const { document } = new JSDOM(
    '<section><div style="overflow:auto"><code style="white-space:pre">first\n\nlast</code></div><div data-code-block><pre><code>middle</code></pre><textarea readonly hidden data-code-source></textarea></div></section>',
  ).window;
  document.querySelector("textarea").value = "one\nmiddle\nthree\n";
  assert.deepEqual(
    blocks(document.querySelector("section")).map((b) => [b.type, b.text]),
    [
      ["code", "first\n\nlast"],
      ["code", "one\nmiddle\nthree\n"],
    ],
  );
});
