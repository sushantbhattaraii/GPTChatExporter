// Browser-renderer integration. Chrome runtime is a test double; not an installed-extension test.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { standard, fixture, turn } from "./fixtures.mjs";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox"],
});
const context = await browser.newContext();
context.setDefaultTimeout(20000);
const errors = [],
  results = [];
await mkdir("test-results", { recursive: true });
await context.addInitScript(() => {
  window.__listeners = [];
  window.__settings = {};
  window.__blobs = {};
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    window.__blobs[url] = blob;
    return url;
  };
  window.__invoke = (msg) =>
    new Promise((resolve) => {
      for (const listener of window.__listeners) {
        const r = listener(msg, {}, resolve);
        if (r === true) return;
      }
    });
  const local = {
    get: async () => ({ settings: window.__settings }),
    set: async (x) => {
      window.__settings = x.settings;
    },
  };
  window.close = () => {
    window.__closed = true;
  };
  window.chrome = {
    tabs: {
      query: async () => [
        { id: 1, url: window.__activeUrl || "https://chatgpt.com/c/test" },
      ],
      sendMessage: async (id, msg) => {
        window.__popupRequest = msg;
        return msg.type === "CGE_PROBE"
          ? { ok: true, messages: 6 }
          : { ok: true };
      },
    },
    runtime: {
      onMessage: { addListener: (f) => window.__listeners.push(f) },
      sendMessage: (msg) =>
        window.__send ? window.__send(msg) : Promise.resolve({ ok: true }),
      openOptionsPage: async () => {},
    },
    storage: { local, session: { get: async () => ({}) } },
  };
});
await context.route("https://exporter.test/**", async (route) => {
  const name = new URL(route.request().url()).pathname.slice(1);
  const allowed = [
    "popup.html",
    "popup.js",
    "offscreen.html",
    "offscreen.js",
    "content.js",
    "options.html",
    "options.js",
    "app.css",
    "icons/48.png",
  ];
  if (!allowed.includes(name)) {
    await route.abort();
    return;
  }
  const body = await readFile("dist/" + name);
  await route.fulfill({
    body,
    contentType: name.endsWith(".js")
      ? "text/javascript"
      : name.endsWith(".css")
        ? "text/css"
        : name.endsWith(".png")
          ? "image/png"
          : "text/html",
    headers: {
      "Content-Security-Policy":
        "script-src 'self'; object-src 'none'; connect-src 'none'",
    },
  });
});
await context.route("https://chatgpt.com/**", async (route) => {
  if (route.request().url().endsWith("/content.js"))
    await route.fulfill({
      body: await readFile("dist/content.js"),
      contentType: "text/javascript",
    });
  else await route.fulfill({ body: standard, contentType: "text/html" });
});
const generator = await context.newPage();
generator.on("pageerror", (e) => {
  errors.push(e.message);
  console.log("GEN ERROR", e.message);
});
generator.on("console", (m) => {
  if (m.type() === "error") console.log("GEN CONSOLE", m.text());
});
await generator.goto("https://exporter.test/offscreen.html");
await generator.waitForFunction(() => window.__listeners.length > 0);
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
let exported = [],
  requests = [];
await page.exposeFunction("__send", async (msg) => {
  if (msg.type !== "CGE_EXPORT") return { ok: true };
  requests.push(msg);
  console.log("Generating", msg.format, requests.length);
  const settings = {
    font: "sans",
    fontSize: 11,
    orientation: "portrait",
    margin: 48,
    includeTitle: true,
    includeUsers: true,
    includeCode: true,
    includeTimestamps: false,
  };
  const result = await generator.evaluate((data) => window.__invoke(data), {
    ...msg,
    type: "GENERATE",
    target: "offscreen",
    settings,
    key: "test-" + requests.length,
  });
  console.log("Generated", msg.format, result.ok, result.error || "");
  if (!result.ok) return result;
  const bytes = await generator.evaluate(
    async (url) =>
      Array.from(new Uint8Array(await window.__blobs[url].arrayBuffer())),
    result.url,
  );
  const name = `renderer-${requests.length}.${msg.format}`;
  await writeFile("test-results/" + name, new Uint8Array(bytes));
  exported.push(name);
  return { ok: true, downloadId: requests.length };
});
try {
  await page.goto("https://chatgpt.com/c/fixture");
  await page.addScriptTag({ url: "https://chatgpt.com/content.js" });
  await page
    .getByRole("button", { name: "↓ Export this Q&A", exact: true })
    .first()
    .waitFor();
  assert.equal(await page.locator('[data-cge="pair"]').count(), 3);
  async function pair(format) {
    const count = exported.length,
      scope = page.locator('[data-cge="pair"]').nth(1);
    await scope
      .getByRole("button", { name: "↓ Export this Q&A", exact: true })
      .click();
    await scope
      .getByRole("button", {
        name: format === "pdf" ? "PDF" : "Word (.docx)",
        exact: true,
      })
      .click();
    await waitExport(count);
  }
  async function waitExport(count) {
    const start = Date.now();
    while (exported.length === count && Date.now() - start < 30000)
      await page.waitForTimeout(100);
    assert.equal(
      exported.length,
      count + 1,
      await page.locator('[data-cge="toolbar"] .status').textContent(),
    );
    await page.waitForFunction(
      async () => !(await window.__invoke({ type: "CGE_PROBE" })).busy,
    );
  }
  await pair("pdf");
  await pair("docx");
  assert.equal(requests[0].document.messages[0].id, "user-2");
  assert.equal(requests[0].document.messages[1].id, "assistant-3");
  results.push(
    "Middle Q&A buttons invoke real bundled PDF/DOCX generators with only Q2/A2.",
  );
  async function collect(format, expected) {
    const count = exported.length,
      scope = page.locator('[data-cge="toolbar"]');
    await scope
      .getByRole("button", { name: "Export conversation", exact: true })
      .click();
    await scope
      .getByRole("button", {
        name: format === "pdf" ? "PDF" : "Word (.docx)",
        exact: true,
      })
      .click();
    await page.getByRole("dialog").waitFor({ timeout: 30000 });
    assert.match(
      await page.getByRole("dialog").innerText(),
      new RegExp(`Collected ${expected} messages`),
    );
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", {
        name: `Download ${format === "pdf" ? "PDF" : "Word"}`,
        exact: true,
      })
      .click();
    await waitExport(count);
  }
  await collect("pdf", 6);
  await collect("docx", 6);
  assert.deepEqual(
    requests.at(-1).document.messages.map((x) => x.id),
    ["user-0", "assistant-1", "user-2", "assistant-3", "user-4", "assistant-5"],
  );
  results.push(
    "Full history scan, review dialog, chronological PDF and DOCX generation.",
  );
  await page.evaluate(() => {
    document.querySelector('[data-message-id="user-2"]').textContent =
      "Question TWO edited";
    document.querySelector(
      '[data-message-id="assistant-3"] .markdown',
    ).innerHTML = "<p>Regenerated answer TWO</p>";
  });
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-cge="pair"]').count(), 3);
  await pair("docx");
  assert.match(JSON.stringify(requests.at(-1)), /Question TWO edited/);
  results.push(
    "Edited prompt/regenerated answer stays paired; observer does not duplicate buttons.",
  );
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.dataset.testid = "stop-button";
    b.id = "stream-stop";
    document.body.append(b);
  });
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-cge="pair"]').count(), 2);
  await page.evaluate(() => document.querySelector("#stream-stop").remove());
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-cge="pair"]').count(), 3);
  results.push("Streaming disables the last response export until completion.");
  await page.screenshot({
    path: "test-results/fixture-ui.png",
    fullPage: false,
  });
  // Synthetic virtualized history: only nearby turns exist in DOM at any time.
  await page.evaluate(() => {
    const main = document.querySelector("main");
    main.style.cssText =
      "height:600px;overflow-y:auto;position:relative;padding:0";
    main.innerHTML =
      '<div id="canvas" style="height:6000px;position:relative"></div>';
    const render = () => {
      const first = Math.max(0, Math.floor(main.scrollTop / 150) - 1),
        last = Math.min(40, first + 7);
      document.querySelector("#canvas").innerHTML = Array.from(
        { length: last - first },
        (_, k) => {
          const i = k + first,
            role = i % 2 ? "assistant" : "user";
          return `<article data-testid="conversation-turn-${i}" style="position:absolute;top:${i * 150}px;height:150px;width:100%"><div data-message-author-role="${role}" data-message-id="${role}-${i}"><p>${role} message ${i}</p></div>${i % 2 ? '<button data-testid="copy-turn-action-button">Copy</button>' : ""}</article>`;
        },
      ).join("");
    };
    main.addEventListener("scroll", render);
    render();
  });
  await page.waitForTimeout(600);
  await collect("docx", 40);
  assert.deepEqual(
    requests.at(-1).document.messages.map((x) => x.turnIndex),
    Array.from({ length: 40 }, (_, i) => i),
  );
  results.push(
    "Virtualized 40-turn history recovered through ordinary scrolling without omissions/duplicates.",
  );
  const settings = await context.newPage();
  settings.on("pageerror", (e) => errors.push(e.message));
  await settings.goto("https://exporter.test/options.html");
  await settings.locator('[name="fontSize"]').fill("13");
  await settings.locator('[name="orientation"]').selectOption("landscape");
  await settings.locator('[name="includeUsers"]').uncheck();
  await settings
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await settings.getByText("Settings saved.", { exact: true }).waitFor();
  assert.equal(await settings.evaluate(() => window.__settings.fontSize), 13);
  await settings.screenshot({
    path: "test-results/settings.png",
    fullPage: true,
  });
  results.push(
    "Settings interface operates under shipped CSP with mock Chrome Storage.",
  );
  const popup = await context.newPage();
  popup.on("pageerror", (e) => errors.push(e.message));
  await popup.goto("https://exporter.test/popup.html");
  await popup
    .getByText("Ready · 6 messages currently rendered.", { exact: true })
    .waitFor();
  await popup
    .getByRole("button", { name: "Export conversation as PDF", exact: true })
    .click();
  assert.equal(await popup.evaluate(() => window.__popupRequest.format), "pdf");
  assert.equal(await popup.evaluate(() => window.__closed), true);
  const wrong = await context.newPage();
  await wrong.addInitScript(() => {
    window.__activeUrl = "https://example.com/";
  });
  await wrong.goto("https://exporter.test/popup.html");
  await wrong
    .getByText("Open a conversation at chatgpt.com to begin.", { exact: true })
    .waitFor();
  assert.equal(await wrong.locator("#pdf").isDisabled(), true);
  results.push(
    "Popup detects ChatGPT, dispatches export, and disables export on other sites (mock tabs API).",
  );
  assert.deepEqual(errors, []);
  await writeFile(
    "test-results/render-results.json",
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        environment:
          "Standalone Chromium renderer with synthetic DOM and mocked chrome.runtime/storage; no real Chrome download API",
        results,
        errors,
        files: exported,
      },
      null,
      2,
    ),
  );
  console.log(results.map((x) => "PASS " + x).join("\n"));
} finally {
  await browser.close();
}
