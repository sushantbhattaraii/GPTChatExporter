import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { build } from "esbuild";

export const scrollSources = {
  routes: [
    "# Partition routing table",
    "ROUTES = {",
    ...Array.from(
      { length: 150 },
      (_, i) =>
        `    "shard_${String(i + 1).padStart(3, "0")}": "node_${(i % 8) + 1}",`,
    ),
    "}",
    "",
    "# Repeated deliberately.",
    "# Repeated deliberately.",
    "",
    'audit_key = "' +
      Array.from(
        { length: 72 },
        (_, i) => "K" + String(i).padStart(3, "0"),
      ).join("_") +
      '_WIDE_END"',
    "",
    "def primary_for(shard):",
    "    return ROUTES[shard]",
    "# ROUTES_END",
    "",
  ].join("\n"),
  indexed: [
    "# Register each checkpoint",
    ...Array.from(
      { length: 34 },
      (_, i) => `register("checkpoint_${String(i + 1).padStart(2, "0")}")`,
    ),
    "",
    "# Exactly once",
    "# Exactly once",
    "# CHECKPOINTS_END",
  ].join("\n"),
  legacy: [
    "# Replication slots",
    "replicas = [",
    ...Array.from(
      { length: 85 },
      (_, i) => `    "replica_${String(i + 1).padStart(3, "0")}",`,
    ),
    "]",
    "# REPLICAS_END",
  ].join("\n"),
  native:
    "# Plain scrolling code\n" +
    'flags = "' +
    Array.from({ length: 53 }, (_, i) => "F" + String(i).padStart(3, "0")).join(
      "_",
    ) +
    '_NATIVE_WIDE_END"\n\n# PLAIN_END\n',
  windows: [
    "# Validate slot order",
    ...Array.from({ length: 19 }, (_, i) => `verify_slot(${i + 1})`),
    "",
    "# Same check",
    "# Same check",
    "# SLOTS_END",
  ].join("\n"),
};

// Exercise a real virtualizing CodeMirror 5 from the pinned Playwright test
// dependency. Only its application shell's default-export interop is needed.
export async function installScrollFixture(page, context) {
  const dir = "node_modules/playwright-core/lib/vite/recorder/assets";
  const files = await readdir(dir);
  const js = files.find((n) => /^codeMirrorModule-.*\.js$/.test(n));
  const css = files.find((n) => /^codeMirrorModule-.*\.css$/.test(n));
  const base = "https://chatgpt.com/test-code-editor/";
  await context.route(base + "**", async (route) => {
    const name = new URL(route.request().url()).pathname.split("/").at(-1);
    if (name === js || name === css)
      return route.fulfill({
        body: await readFile(dir + "/" + name),
        contentType: name === css ? "text/css" : "text/javascript",
      });
    if (/^index-.*\.js$/.test(name))
      return route.fulfill({
        body: "export const g = m => m?.__esModule ? m.default : m;",
        contentType: "text/javascript",
      });
    return route.abort();
  });
  await page.addStyleTag({ url: base + css });
  await page.addScriptTag({
    content: await readFile("dist/code-editor.js", "utf8"),
  });
  await page.evaluate(
    async ({ sources, mod }) => {
      const { default: CodeMirror } = await import(mod);
      document.title = "Scrollable code";
      const q = document.querySelector(
        '[data-chatgpt-search-unit-key$=":user"]',
      );
      const a = document.querySelector(
        '[data-chatgpt-search-unit-key$=":assistant"]',
      );
      q.innerHTML =
        "<p>Show the full routing, checkpoint and replication examples.</p>";
      a.innerHTML = `<h2>Partition routing table</h2><div style="display:flex;border:1px solid #ddd"><div class="cm-editor" data-language="python">
      <div class="cm-scroller" style="overflow:auto;width:420px;height:88px">
      <div class="cm-content" style="white-space:pre;font:14px/20px monospace"></div></div></div></div>
      <h2>Checkpoint registration</h2><pre data-language="python" style="overflow:auto;width:360px;height:80px;margin:0"><code id="indexed-code" style="display:block;position:relative;font:14px/20px monospace"></code></pre>
      <h2>Replication slots</h2><div id="legacy-code" data-language="python"></div>
      <h2>Plain code block</h2><pre style="overflow:auto;width:180px;height:30px"><code id="plain-code" class="language-python"></code></pre>`;
      const cm6 = a.querySelector(".cm-content"),
        lines = sources.routes.split("\n");
      const from = 70,
        to = 76;
      cm6.innerHTML = '<div class="cm-gap" style="height:1400px"></div>';
      const offsets = new Map();
      for (let i = from; i < to; i++) {
        const row = document.createElement("div");
        row.className = "cm-line";
        const span = document.createElement("span");
        span.style.color = "#2875aa";
        span.textContent = lines[i];
        row.append(span);
        cm6.append(row);
        offsets.set(row, lines.slice(0, i).join("\n").length + 1);
      }
      cm6.insertAdjacentHTML(
        "beforeend",
        '<div class="cm-gap" style="height:1800px"></div>',
      );
      cm6.cmTile = {
        root: {
          view: {
            contentDOM: cm6,
            state: { doc: { toString: () => sources.routes } },
            posAtDOM: (row) => offsets.get(row),
          },
        },
      };
      cm6.parentElement.scrollTop = from * 20;
      const numbered = a.querySelector("#indexed-code"),
        pane = numbered.parentElement,
        records = sources.indexed.split("\n");
      numbered.setAttribute("data-line-count", records.length);
      numbered.style.height = 20 * records.length + "px";
      function paint() {
        const first = Math.floor(pane.scrollTop / 20);
        numbered.replaceChildren();
        for (let i = first; i < Math.min(first + 5, records.length); i++) {
          const row = document.createElement("span");
          row.dataset.lineNumber = String(i + 1);
          row.style.cssText = `position:absolute;display:block;top:${20 * i}px;height:20px`;
          row.textContent = records[i];
          numbered.append(row);
        }
      }
      pane.addEventListener("scroll", paint);
      pane.scrollTop = 180;
      paint();
      const cm = CodeMirror(a.querySelector("#legacy-code"), {
        value: sources.legacy,
        mode: "python",
        readOnly: true,
        lineNumbers: true,
        viewportMargin: 2,
      });
      cm.setSize(420, 84);
      cm.refresh();
      cm.scrollTo(0, 600);
      const plain = a.querySelector("#plain-code");
      plain.textContent = sources.native;
      plain.parentElement.scrollTop = 20;
      plain.parentElement.scrollLeft = 100;
      a.insertAdjacentHTML(
        "beforeend",
        '<h2>Slot checks</h2><div data-language="python" style="overflow:auto;height:73px;width:310px"><div id="geometry-code" class="cm-content" style="position:relative;font:14px/20px monospace"></div></div>',
      );
      const geo = a.querySelector("#geometry-code"),
        local = geo.parentElement,
        list = sources.windows.split("\n");
      geo.style.height = list.length * 20 + "px";
      function renderWindow() {
        const first = Math.floor(local.scrollTop / 20),
          end = Math.min(list.length, first + 5);
        const spacer = (h) => {
          const n = document.createElement("div");
          n.className = "cm-gap";
          n.style.height = h + "px";
          return n;
        };
        geo.replaceChildren(spacer(first * 20));
        for (let n = first; n < end; n++) {
          const row = document.createElement("div");
          row.className = "cm-line";
          row.style.height = "20px";
          row.textContent = list[n];
          geo.append(row);
        }
        geo.append(spacer((list.length - end) * 20));
      }
      local.addEventListener("scroll", renderWindow);
      local.scrollTop = 120;
      renderWindow();
    },
    { sources: scrollSources, mod: base + js },
  );
  await page.waitForFunction(
    () =>
      !document
        .querySelector(".CodeMirror-code")
        .textContent.includes("REPLICAS_END") &&
      document
        .querySelector(".CodeMirror-code")
        .querySelector("pre.CodeMirror-line"),
  );
}

export async function checkIsolatedReader(page) {
  const entry = await build({
    stdin: {
      contents: `import {readCode} from "./src/modules/pdf-style.js"; window.readFixture = (s) => readCode(document.querySelector(s),true).text;`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    write: false,
    format: "iife",
  });
  const session = await page.context().newCDPSession(page);
  try {
    const { frameTree } = await session.send("Page.getFrameTree");
    const { executionContextId: contextId } = await session.send(
      "Page.createIsolatedWorld",
      { frameId: frameTree.frame.id, worldName: "code-export-test" },
    );
    const script =
      entry.outputFiles[0].text +
      "; [!!document.querySelector('.cm-content').cmTile, readFixture('.cm-editor'), readFixture('.CodeMirror')]";
    const { result, exceptionDetails } = await session.send(
      "Runtime.evaluate",
      { contextId, expression: script, returnByValue: true },
    );
    assert.equal(exceptionDetails, undefined);
    assert.deepEqual(result.value, [
      false,
      scrollSources.routes,
      scrollSources.legacy,
    ]);
  } finally {
    await session.detach();
  }
}
