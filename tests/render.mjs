// Browser-renderer integration. Chrome runtime is a test double; not an installed-extension test.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
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
        if (window.__tabRelay) return window.__tabRelay(msg);
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
let failCapture = false;
let approvedFixtureImage,
  assetRequests = 0;
let exported = [],
  requests = [];
await page.exposeFunction("__send", async (msg) => {
  if (msg.type === "CGE_SCREEN" && failCapture)
    return { ok: false, error: "Fixture capture denied" };
  if (msg.type === "CGE_SCREEN")
    return {
      ok: true,
      data:
        "data:image/png;base64," +
        (await page.screenshot({ type: "png" })).toString("base64"),
    };
  if (msg.type === "CGE_IMAGE") {
    if (msg.url === "https://cdn.oaiusercontent.com/example-generated.png") {
      assetRequests++;
      return { ok: true, data: approvedFixtureImage };
    }
    return { ok: false, error: "Fixture asset unavailable" };
  }
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
  // Replace the fixture with grouped Chat / Work turns without legacy role markers.
  await page.evaluate(() => {
    document.querySelector("main").outerHTML =
      "<main>" +
      Array.from(
        { length: 3 },
        (_, i) =>
          `<section data-turn-key="fallback-turn-${i}"><div data-chatgpt-search-unit-key="fallback-turn-${i}:0:user"><div data-user-message-bubble="true">Updated Q${i}</div></div><div data-chatgpt-search-unit-key="fallback-turn-${i}:1:assistant"><div data-markdown-text-style="assistant-message"><p>Updated A${i}</p></div></div><div class="turn-action-controls"><button aria-label="Copy response">Copy</button></div></section>`,
      ).join("") +
      "</main>";
  });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-cge="pair"]').length === 3,
  );
  assert.equal(
    (await page.evaluate(() => window.__invoke({ type: "CGE_PROBE" })))
      .messages,
    6,
  );
  await pair("pdf");
  await pair("docx");
  assert.equal(
    requests.at(-1).document.messages[0].id,
    "fallback-turn-1:0:user",
  );
  assert.equal(
    requests.at(-1).document.messages[1].id,
    "fallback-turn-1:1:assistant",
  );
  await collect("docx", 6);
  results.push(
    "New Chat / Work layout: real page probe finds six messages, controls appear, exact middle pair and full conversation generate.",
  );
  // Two assistant units occupy the same numerical turn. A single-pair download
  // must not make the next full export treat those units as conflicting versions.
  await page.evaluate(() => {
    const turn = document.querySelector('[data-turn-key="fallback-turn-2"]');
    const unit = document.createElement("div");
    unit.dataset.chatgptSearchUnitKey = "fallback-turn-2:2:assistant";
    unit.innerHTML = "<p>Second assistant unit</p>";
    turn.insertBefore(unit, turn.querySelector(".turn-action-controls"));
  });
  await pair("pdf");
  await page.evaluate(() => {
    const form = document.createElement("form");
    form.setAttribute("data-chatgpt-composer", "");
    form.style.cssText =
      "position:fixed;bottom:0;right:0;width:75vw;height:150px;background:white";
    form.append(document.createElement("textarea"));
    document.body.append(form);
  });
  for (const size of [
    { width: 1100, height: 750 },
    { width: 410, height: 530 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate(
      () =>
        (document.querySelector("form").style.height =
          innerWidth < 500 ? "295px" : "150px"),
    );
    await page.waitForFunction(() => {
      const a = document
        .querySelector('[data-cge="toolbar"]')
        .shadowRoot.querySelector(".toolbar")
        .getBoundingClientRect();
      const b = document.querySelector("form").getBoundingClientRect();
      return a.height > 0 && a.bottom + 8 <= b.top;
    });
  }
  await page.evaluate(() => document.querySelector("form").remove());
  await page.setViewportSize({ width: 1280, height: 720 });
  results.push(
    "Floating toolbar clears the prompt box on desktop and on a narrow viewport with an expanded composer.",
  );
  await page.evaluate(() => {
    const host = document.querySelector('[data-cge="toolbar"]');
    const listener = (e) => {
      if (
        !e.composedPath().includes(host) ||
        e
          .composedPath()
          .find((n) => n.tagName === "BUTTON")
          ?.getAttribute("aria-label") !== "Word (.docx)"
      )
        return;
      document.removeEventListener("click", listener, true);
      setTimeout(
        () =>
          (document.querySelector(
            '[data-chatgpt-search-unit-key="fallback-turn-2:2:assistant"] p',
          ).textContent = "Settled second unit"),
        650,
      );
    };
    document.addEventListener("click", listener, true);
  });
  await collect("docx", 7);
  const collected = requests.at(-1).document.messages;
  assert.equal(new Set(collected.map((m) => m.id)).size, 7);
  assert.deepEqual(
    collected.slice(-2).map((m) => m.unitOrder),
    [1, 2],
  );
  assert.equal(collected.at(-1).blocks[0].runs[0].text, "Settled second unit");
  results.push(
    "Single-pair PDF followed by full Word export preserves sibling assistant units and retries an actual mid-scan content update.",
  );
  await page.evaluate(() =>
    document
      .querySelector(
        '[data-chatgpt-search-unit-key="fallback-turn-2:2:assistant"]',
      )
      .remove(),
  );
  const connectedPopup = await context.newPage();
  await connectedPopup.exposeFunction("__tabRelay", (msg) =>
    page.evaluate((data) => window.__invoke(data), msg),
  );
  await page.evaluate(() => (document.querySelector("main").hidden = true));
  await connectedPopup.goto("https://exporter.test/popup.html");
  await connectedPopup.getByText(/Connected to ChatGPT/).waitFor();
  assert.equal(await connectedPopup.locator("#pdf").isDisabled(), true);
  await page.evaluate(() => (document.querySelector("main").hidden = false));
  await connectedPopup
    .getByText("Ready · 6 messages currently rendered.", { exact: true })
    .waitFor();
  assert.equal(await connectedPopup.locator("#pdf").isEnabled(), true);
  assert.equal(await connectedPopup.locator("#docx").isEnabled(), true);
  await connectedPopup.close();
  results.push(
    "Popup uses the content script's real probe, retries after hydration, and enables PDF and Word for the updated layout.",
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
  await page.bringToFront();
  await page.evaluate(() => {
    const main = document.querySelector("main");
    const art = document.createElement("canvas");
    art.width = 240;
    art.height = 120;
    const ctx = art.getContext("2d");
    ctx.fillStyle = "#136ac9";
    ctx.fillRect(0, 0, 120, 120);
    ctx.fillStyle = "#ed8b24";
    ctx.fillRect(120, 0, 120, 120);
    main.innerHTML = `<section data-turn-key="fallback-turn-0"><div data-chatgpt-search-unit-key="fallback-turn-0:0:user"><p>Draw a two-color image.</p></div><div class="group/imagegen-image"><button><img alt="Generated image: two colors" width="240" height="120" src="${art.toDataURL()}"></button></div></section>`;
  });
  await page
    .getByRole("button", { name: "↓ Export this Q&A", exact: true })
    .waitFor();
  assert.equal(await page.locator('[data-cge="pair"]').count(), 1);
  async function imagePair(format) {
    const count = exported.length,
      scope = page.locator('[data-cge="pair"]').first();
    await scope
      .getByRole("button", { name: "↓ Export this Q&A", exact: true })
      .click();
    await scope.getByRole("button", { name: format, exact: true }).click();
    await waitExport(count);
  }
  await imagePair("PDF");
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/image-pair.pdf",
  );
  await imagePair("Word (.docx)");
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/image-pair.docx",
  );
  const checkArt = () => {
    const messages = requests.at(-1).document.messages;
    assert.equal(messages.length, 2);
    const b = messages[1].blocks.find((b) => b.type === "image");
    assert.ok(b.image.data.startsWith("data:image/png;base64,"));
    assert.equal(b.image.width, 240);
    assert.equal(b.image.height, 120);
  };
  checkArt();
  await collect("pdf", 2);
  checkArt();
  await collect("docx", 2);
  checkArt();
  results.push(
    "Generated-image-only card without a text role or footer receives its Q&A button and embeds pixels in both pair and whole-chat PDF and Word exports.",
  );
  await page.evaluate(() => {
    const section = document.querySelector("[data-turn-key]");
    const body = document.createElement("div");
    body.dataset.chatgptSearchUnitKey = "fallback-turn-0:1:assistant";
    body.innerHTML =
      '<p style="color:#1244bd">A plotted result with <b>formatted text</b>.</p><pre style="background:#202124;color:#fff"><code><span style="color:#ee7898">print</span>("colors")</code></pre><canvas width="300" height="90"></canvas><svg width="90" height="55"><rect width="90" height="55" fill="#dd3344"></rect></svg><iframe style="display:block;width:125px;height:45px;border:0" srcdoc="&lt;body style=&quot;margin:0;background:#00a98f&quot;&gt;Widget&lt;/body&gt;"></iframe><div style="height:850px;background:linear-gradient(#aaddff,#114488)">Tall visual output</div>';
    const ctx = body.querySelector("canvas").getContext("2d");
    ctx.fillStyle = "#bb29a5";
    ctx.fillRect(0, 0, 300, 90);
    section.insertBefore(body, section.querySelector("div[class]"));
    const overlay = document.createElement("div");
    overlay.style.cssText =
      "position:fixed;top:20px;left:40%;width:160px;height:82px;background:#00ff00;z-index:2147483647;pointer-events:none";
    document.body.append(overlay);
    section.insertAdjacentHTML(
      "beforeend",
      '<div class="turn-action-controls"><button>Copy response</button></div>',
    );
  });
  await page.waitForTimeout(600);
  assert.equal(await page.locator('[data-cge="pair"]').count(), 1);
  await imagePair("PDF as shown");
  assert.ok(requests.at(-1).document.pages.length);
  const count = exported.length,
    tool = page.locator('[data-cge="toolbar"]');
  await tool
    .getByRole("button", { name: "Export conversation", exact: true })
    .click();
  await tool.getByRole("button", { name: "PDF as shown", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Download PDF as shown", exact: true })
    .click();
  await waitExport(count);
  assert.equal(requests.at(-1).document.layout, "appearance");
  results.push(
    "As-shown pair and whole-chat PDFs capture real Chromium viewport pixels across a tall response with an image, styled code and canvas; the Chrome capture API is simulated with Playwright screenshots.",
  );
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/as-shown.pdf",
  );
  approvedFixtureImage = await page
    .locator('img[alt^="Generated image"]')
    .getAttribute("src");
  await context.route(
    "https://cdn.oaiusercontent.com/example-generated.png",
    (r) =>
      r.fulfill({
        contentType: "image/png",
        body: Buffer.from(approvedFixtureImage.split(",")[1], "base64"),
      }),
  );
  await page.evaluate(() => {
    const img = document.querySelector('img[alt^="Generated image"]');
    const card = img.closest('[class*="group/imagegen-image"]');
    const turn = card.closest("[data-turn-key]");
    turn.querySelector('[data-chatgpt-search-unit-key$=":assistant"]').remove();
    turn.querySelector(".turn-action-controls")?.remove();
    turn.after(card);
    img.src = "https://cdn.oaiusercontent.com/example-generated.png";
  });
  await page.waitForFunction(
    () =>
      document.querySelector('img[alt^="Generated image"]').naturalWidth ===
      240,
  );
  await page.waitForTimeout(500);
  assert.equal(await page.locator('[data-cge="pair"]').count(), 1);
  await imagePair("PDF");
  checkArt();
  assert.ok(assetRequests >= 1);
  results.push(
    "A cross-origin gallery adjacent to its user turn exports through the raster asset fallback (simulated worker response) with no duplicate button.",
  );
  await page.evaluate((src) => {
    document.querySelector("main").innerHTML = `
      <div style="overflow:auto;height:370px;width:85vw"><div style="display:contents;overflow:hidden">
        <section data-turn-key="fallback-turn-0" style="overflow:clip;height:135px">
          <div data-chatgpt-search-unit-key="fallback-turn-0:0:user" style="position:relative;top:-36px;height:100px"><span style="display:block;height:28px;background:#f49e11">First stripe</span>Give me a random image.</div>
          <div data-chatgpt-search-unit-key="fallback-turn-0:1:assistant"><img alt="Sunrise over a mountain" aria-hidden="true" width="240" height="120" src="${src}"></div>
        </section>
        <section data-turn-key="fallback-turn-1"><div data-chatgpt-search-unit-key="fallback-turn-1:0:user">What do you see?</div>
        <div data-chatgpt-search-unit-key="fallback-turn-1:1:assistant" data-is-streaming="false"><p>Two colors.</p></div></section>
      </div></div>`;
  }, approvedFixtureImage);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-cge="pair"]').length === 2,
  );
  const accessible = await page
    .locator('[data-cge="pair"]')
    .first()
    .getByRole("button", { name: "↓ Export this Q&A", exact: true })
    .isVisible();
  assert.equal(accessible, true);
  assert.ok(
    await page.evaluate(() =>
      document
        .querySelector("[data-turn-key]")
        .nextElementSibling.matches('[data-cge="image-action-row"]'),
    ),
  );
  const styleBefore = await page
    .locator("[data-chatgpt-search-unit-key]")
    .first()
    .getAttribute("style");
  await imagePair("PDF");
  checkArt();
  await imagePair("PDF as shown");
  assert.equal(
    await page
      .locator("[data-chatgpt-search-unit-key]")
      .first()
      .getAttribute("style"),
    styleBefore,
  );
  const n = exported.length;
  await tool
    .getByRole("button", { name: "Export conversation", exact: true })
    .click();
  await tool.getByRole("button", { name: "PDF as shown", exact: true }).click();
  await page.getByRole("dialog").waitFor();
  await page.getByRole("checkbox").check();
  await page
    .getByRole("button", { name: "Download PDF as shown", exact: true })
    .click();
  await waitExport(n);
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/nested-appearance.pdf",
  );
  assert.equal(
    await page.locator(":popover-open,[data-cge-visual-target]").count(),
    0,
  );
  results.push(
    "Nested scroll/clip containers: pair and whole-chat capture succeed and restore the original styles. A descriptive, aria-hidden bitmap gets a visible control outside its clipped turn.",
  );
  assert.equal(
    await tool
      .getByRole("button", { name: "Export conversation", exact: true })
      .textContent(),
    "",
  );
  assert.equal(
    await tool
      .getByRole("button", { name: "Settings", exact: true })
      .textContent(),
    "",
  );
  await tool
    .getByRole("button", { name: "Export conversation", exact: true })
    .focus();
  await page.keyboard.press("Enter");
  await tool
    .getByRole("button", { name: "Word (.docx)", exact: true })
    .waitFor();
  await page.keyboard.press("Escape");
  results.push(
    "Floating export/settings buttons have icon-only faces, accessible names, tooltips and a keyboard-operable format menu.",
  );
  failCapture = true;
  const action = page.locator('[data-cge="pair"]').first();
  await action
    .getByRole("button", { name: "↓ Export this Q&A", exact: true })
    .click();
  await action
    .getByRole("button", { name: "PDF as shown", exact: true })
    .click();
  await page.getByText("Fixture capture denied", { exact: true }).waitFor();
  failCapture = false;
  assert.equal(
    await page.locator(":popover-open,[data-cge-visual-target]").count(),
    0,
  );
  assert.equal(
    await page
      .locator("[data-chatgpt-search-unit-key]")
      .first()
      .getAttribute("style"),
    styleBefore,
  );
  results.push(
    "A refused screenshot restores the original message styles and removes all temporary capture markers.",
  );
  await page.evaluate(() => {
    const turn = document.querySelector("[data-turn-key]"),
      slot = turn.nextElementSibling;
    const outer = document.createElement("div");
    outer.style.cssText = "height:130px;overflow:clip";
    turn.before(outer);
    outer.append(turn, slot);
    document.querySelector("main div[style*=overflow]").scrollTop = 0;
    window.dispatchEvent(new Event("resize"));
  });
  const pinned = page.locator('body > [data-cge="pair"]');
  await pinned
    .getByRole("button", { name: "↓ Export this Q&A", exact: true })
    .click();
  await pinned.getByRole("button", { name: "PDF", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  results.push(
    "When an outer wrapper clips the entire image action row, the same button is pinned at the visible picture and remains clickable.",
  );
  // Generated media can be delivered through an unlabelled CSS-backed card between user turns.
  await page.evaluate((src) => {
    document.querySelector("main").innerHTML =
      `<section data-turn-key="fallback-turn-0"><div data-chatgpt-search-unit-key="fallback-turn-0:0:user">Draw a mountain.</div></section>
      <div aria-hidden="true"></div><div><div><button><span role="img" aria-label="Mountain sunrise" style="display:block;width:240px;height:120px;"></span></button></div></div>
      <section data-turn-key="fallback-turn-1"><div data-chatgpt-search-unit-key="fallback-turn-1:0:user">Describe it.</div><div data-chatgpt-search-unit-key="fallback-turn-1:1:assistant" data-is-streaming="false">A mountain.</div></section>`;
  }, approvedFixtureImage);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-cge="pair"]').length === 1,
  );
  await page.evaluate(
    (src) =>
      (document.querySelector('[role="img"]').style.backgroundImage =
        `url("${src}")`),
    approvedFixtureImage,
  );
  await page.waitForFunction(
    () => document.querySelectorAll('[data-cge="pair"]').length === 2,
  );
  await imagePair("PDF");
  checkArt();
  assert.match(
    JSON.stringify(requests.at(-1).document.messages[0].blocks),
    /Draw a mountain/,
  );
  results.push(
    "A CSS-backed image card without imagegen classes between two prompts gets a clickable Export this Q&A control and exports with its original prompt.",
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
