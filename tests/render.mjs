// Browser-renderer integration. Chrome runtime is a test double; not an installed-extension test.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import {
  careerFixture,
  photoURL,
  companyURL,
  labsURL,
  jobURL,
} from "./career-fixture.mjs";
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
    permissions: {
      request: async (options) => {
        window.__granted = options.origins;
        return true;
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
    "mermaid.min.js",
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
let stagedChunks = 0;
let photoBytes,
  photoAllowed = false;
let approvedFixtureImage,
  assetRequests = 0;
let exported = [],
  requests = [];
await page.exposeFunction("__send", async (msg) => {
  if (msg.type === "CGE_IMAGE") {
    if (msg.url === "https://cdn.oaiusercontent.com/example-generated.png") {
      assetRequests++;
      return { ok: true, data: approvedFixtureImage };
    }
    if (msg.url === photoURL)
      return photoAllowed
        ? { ok: true, data: photoBytes }
        : { ok: false, permissionOrigin: new URL(photoURL).origin };
    return { ok: false, error: "Fixture asset unavailable" };
  }
  if (msg.type === "CGE_STAGE" || msg.type === "CGE_DISCARD") {
    if (msg.type === "CGE_STAGE") stagedChunks++;
    return generator.evaluate((data) => window.__invoke(data), {
      ...msg,
      target: "offscreen",
      type: msg.type === "CGE_STAGE" ? "STAGE" : "DISCARD",
      owner: "fixture-tab",
    });
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
    stagedKey: msg.key,
    owner: "fixture-tab",
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
    await page
      .getByRole("dialog")
      .waitFor({ timeout: expected > 100 ? 180000 : 30000 });
    assert.match(
      await page.getByRole("dialog").innerText(),
      new RegExp(`Collected ${expected} messages`),
    );
    await page.getByRole("dialog").getByRole("checkbox").check();
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
      '<div id="canvas" style="height:93000px;position:relative"></div>';
    const render = () => {
      const first = Math.max(0, Math.floor(main.scrollTop / 150) - 1),
        last = Math.min(620, first + 7);
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
    main.scrollTop = 15000;
    render();
  });
  await page.waitForTimeout(600);
  const longStart = Date.now();
  await collect("pdf", 620);
  const longSeconds = (Date.now() - longStart) / 1000;
  assert(longSeconds > 45);
  assert.equal(await page.locator("main").evaluate((e) => e.scrollTop), 15000);
  assert.deepEqual(
    requests.at(-1).document.messages.map((x) => x.turnIndex),
    Array.from({ length: 620 }, (_, i) => i),
  );
  results.push(
    `Virtualized 620-message history exported after ${longSeconds.toFixed(1)}s, without omissions or duplicates.`,
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
  assert.equal(
    await settings.locator('[name="showPdfTitle"]').isChecked(),
    false,
  );
  await settings.locator('[name="showPdfTitle"]').check();
  await settings
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await settings.getByText("Settings saved.", { exact: true }).waitFor();
  assert.equal(await settings.evaluate(() => window.__settings.fontSize), 13);
  assert.equal(
    await settings.evaluate(() => window.__settings.showPdfTitle),
    true,
  );
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
  const tool = page.locator('[data-cge="toolbar"]');
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
    turn
      .querySelector('[data-chatgpt-search-unit-key$=":assistant"]')
      ?.remove();
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
  await imagePair("PDF");
  checkArt();
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
  await page.evaluate(() => {
    document.title = "Code and paragraph alignment";
    document.querySelector("main").innerHTML =
      `<section data-turn-key="fallback-turn-0">
    <div data-chatgpt-search-unit-key="fallback-turn-0:0:user"><p>Show a Python greeting and demonstrate paragraph alignment.</p></div>
    <div data-chatgpt-search-unit-key="fallback-turn-0:1:assistant" data-is-streaming="false">
    <p style="text-align:left">Left aligned introduction</p>
    <pre style="background:#172233;color:#f0e1d2;tab-size:4;font:16px/20px monospace"><code class="language-python" style="font:inherit"><span style="color:#ff77aa;font-weight:bold">def</span> greet(name):
\t<span style="color:#80dbc4">return</span> <span style="color:#ffcb86;font-style:italic">f"Hello, {name}!"</span>

print(greet("Ada"))</code></pre>
    <p style="text-align:center">Centered caption</p>
    <p style="text-align:right">Right aligned note</p>
    <p style="text-align:justify">The paragraph below the code uses justified alignment. Its words spread across the available line width while the last line ends naturally inside the reply.</p>
    <ol>
      <li><span style="font-weight:700">Bold text</span>: This is an important message.</li>
      <li><span style="font-style:italic">Italic text</span>: This sentence is emphasized.</li>
      <li><strong><em>Bold + Italic</em></strong>: This is very important!</li>
      <li>Underlined text: <u><span>This text is underlined.</span></u></li>
      <li>Strikethrough: <span style="text-decoration:line-through"><span>This text has been deleted.</span></span></li>
      <li>Highlighted text: <mark style="background-color:#fff19d"><span>This text is highlighted.</span></mark></li>
      <li>Colored text: <span style="color:#178146">This text is green.</span></li>
    </ol>
    </div></section>`;
  });
  await page.waitForFunction(
    () => document.querySelectorAll('[data-cge="pair"]').length === 1,
  );
  await imagePair("PDF");
  const blocks = requests.at(-1).document.messages[1].blocks;
  const snippet = blocks.find((b) => b.type === "code");
  assert.equal(
    snippet.text,
    'def greet(name):\n\treturn f"Hello, {name}!"\n\nprint(greet("Ada"))',
  );
  assert.equal(snippet.tabSize, 4);
  assert.equal(snippet.tokens.find((t) => t.text === "def").color, "#ff77aa");
  assert.deepEqual(
    blocks.filter((b) => b.type === "paragraph").map((b) => b.alignment),
    ["left", "center", "right", "justify"],
  );
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/formatted-pair.pdf",
  );
  await collect("pdf", 2);
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/formatted-chat.pdf",
  );
  results.push(
    "Pair and conversation PDF menus preserve computed syntax styling, tabs, blank lines and paragraph alignments.",
  );
  await page.evaluate(() => {
    document.title = "Rich content export";
    document.querySelector(
      '[data-chatgpt-search-unit-key$=":user"] p',
    ).textContent =
      "Show a flowchart, a checklist, multilingual text, and a Fibonacci control set to eight terms.";
    const answer = document.querySelector(
      '[data-chatgpt-search-unit-key$=":assistant"]',
    );
    answer.innerHTML = `<h2>Flowchart</h2>
      <pre><code class="language-mermaid">flowchart LR
A[Start] --> B{Ready?}
B -->|Yes| C[Process]
B -->|No| D[Retry]</code></pre>
      <button aria-label="Enlarge diagram"><svg aria-hidden="true" viewBox="0 0 180 44" width="180" height="44" role="img" aria-label="Rendered diagram"><rect x="1" y="1" width="177" height="40" rx="6" fill="#f6d772"/>
        <foreignObject x="5" y="3" width="165" height="34"><div xmlns="http://www.w3.org/1999/xhtml">Existing diagram label</div></foreignObject></svg></button>
      <blockquote><p><strong>Theorem.</strong> A connected graph contains a spanning tree.</p><p>Delete cycle edges.</p></blockquote>
      <ol start="4"><li>Fourth item<ul style="list-style-type:circle"><li>Nested circle</li></ul></li><li>Fifth item</li></ol>
      <h2>Checklist</h2><ul><li><input type="checkbox" checked> Read the paper</li><li><input type="checkbox"> Run experiments</li></ul>
      <div role="checkbox" aria-checked="mixed">Review notes</div>
      <h2>Unicode examples</h2><p>Français · नेपाली · हिन्दी · 中文 · 日本語 · 한국어 · العربية</p>
      <h2>Fibonacci generator</h2><label>Number of terms <input type="range" min="1" max="15" value="3"></label>
      <p>0, 1, 1, 2, 3, 5, 8, 13</p><select aria-label="Display mode"><option>Table</option><option selected>Sequence</option></select>
      <iframe title="Readable widget" srcdoc="&lt;p&gt;Inner widget output&lt;/p&gt;"></iframe>
      <iframe title="Isolated widget" sandbox srcdoc="&lt;p&gt;private frame contents&lt;/p&gt;"></iframe>`;
    answer.querySelector("input[type=range]").value = "8";
  });
  await page.waitForFunction(() =>
    document
      .querySelector("iframe")
      ?.contentDocument?.body?.textContent.includes("Inner widget output"),
  );
  for (const scope of ["pair", "chat"]) {
    if (scope === "pair") await imagePair("PDF");
    else await collect("pdf", 2);
    const bs = requests.at(-1).document.messages[1].blocks;
    assert(
      bs.some((b) => b.type === "diagram" && b.source?.includes("flowchart")),
    );
    assert(bs.some((b) => b.type === "diagram" && b.svg?.includes("Existing")));
    assert(bs.some((b) => b.type === "slider" && b.text.includes("8 (1–15)")));
    assert(JSON.stringify(bs).includes("Inner widget output"));
    assert(!JSON.stringify(bs).includes("private frame contents"));
    await copyFile(
      "test-results/" + exported.at(-1),
      "test-results/rich-" + scope + ".pdf",
    );
  }
  results.push(
    "Pair and full-chat PDFs export Mermaid, rendered SVG, checklist states, quotes, nested lists, multilingual text and current widget state.",
  );
  // A figure row and a proportionally sized table from the same bounded reply.
  await page.evaluate(() => {
    const q = document.querySelector('[data-chatgpt-search-unit-key$=":user"]');
    q.innerHTML = "<p>Compare these three graph configurations.</p>";
    const a = document.querySelector(
      '[data-chatgpt-search-unit-key$=":assistant"]',
    );
    a.innerHTML = `<h1>Mobile agents on a graph</h1><p>Each card shows one initial configuration.</p>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px">
      ${["Dispersed", "Rooted", "General"]
        .map(
          (
            label,
            i,
          ) => `<figure style="margin:0;padding:8px;border:1px solid #ddd">
        <svg viewBox="0 0 150 60" width="150" height="60" role="img" aria-label="${label} illustration">
          <line x1="16" y1="40" x2="130" y2="40" stroke="#555"/>
          <circle cx="16" cy="40" r="7" fill="#cccccc"/><circle cx="75" cy="40" r="7" fill="#cccccc"/><circle cx="130" cy="40" r="7" fill="#cccccc"/>
          <circle cx="${[16, 75, 130][i]}" cy="17" r="7" fill="#2864ed"/></svg>
        <figcaption style="text-align:center"><b>${label}</b></figcaption></figure>`,
        )
        .join("")}</div>
      <h2>Comparison</h2><table style="width:100%;table-layout:fixed"><colgroup><col style="width:65%"><col style="width:35%"></colgroup>
      <thead><tr><th>Configuration</th><th>Agents</th></tr></thead>
      <tbody><tr><td>Rooted configuration</td><td>3</td></tr></tbody></table>
      <p><a href="https://example.org/graph">Graph reference</a></p>`;
  });
  for (const scope of ["pair", "chat"]) {
    if (scope === "pair") await imagePair("PDF");
    else await collect("pdf", 2);
    const bs = requests.at(-1).document.messages[1].blocks;
    assert.equal(bs.find((b) => b.type === "gallery")?.columns, 3);
    assert(
      Math.abs(bs.find((b) => b.type === "table").widthShares[0] - 0.65) < 0.02,
    );
    await copyFile(
      "test-results/" + exported.at(-1),
      "test-results/layout-" + scope + ".pdf",
    );
  }
  results.push(
    "Both PDF menus keep three illustrated cards together, honor table column widths, and export the reference-style transcript.",
  );
  photoBytes = approvedFixtureImage;
  await context.route(photoURL, (r) =>
    r.fulfill({
      body: Buffer.from(photoBytes.split(",")[1], "base64"),
      contentType: "image/png",
    }),
  );
  await page.evaluate((html) => {
    document.querySelector(
      '[data-chatgpt-search-unit-key$=":user"]',
    ).innerHTML =
      "<p>Compare research opportunities and the academic career path.</p>";
    document.querySelector(
      '[data-chatgpt-search-unit-key$=":assistant"]',
    ).innerHTML = html;
  }, careerFixture());
  await page.waitForFunction(
    () => document.querySelector("img")?.naturalWidth > 0,
  );
  const capture = imagePair("PDF");
  await page
    .getByRole("dialog")
    .getByText("Include images from these sites?")
    .waitFor();
  const grantPopup = await context.newPage();
  await grantPopup.exposeFunction("__tabRelay", async (msg) => {
    if (msg.type === "CGE_IMAGE_DECISION") photoAllowed = msg.granted;
    return page.evaluate((data) => window.__invoke(data), msg);
  });
  await grantPopup.goto("https://exporter.test/popup.html");
  await grantPopup
    .getByRole("button", { name: "Allow images and continue" })
    .click();
  await capture;
  assert.deepEqual(await grantPopup.evaluate(() => window.__granted), [
    "https://www.microsoft.com/*",
  ]);
  await grantPopup.close();
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/career-pair.pdf",
  );
  await collect("pdf", 2);
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/career-chat.pdf",
  );
  const career = requests.at(-1).document.messages[1].blocks;
  const layouts = career.filter((b) => b.type === "layout");
  assert.equal(layouts.length, 2);
  assert(
    career.some(
      (b) => b.type === "image" && b.image.data?.startsWith("data:image/png"),
    ),
  );
  assert(
    career
      .find((b) => b.type === "table")
      .rows[1][0].blocks[0].runs.some(
        (r) => r.text === "Microsoft" && r.link === companyURL,
      ),
  );
  assert(
    career.find(
      (b) => b.type === "heading" && b.runs[0].text === "Cockroach Labs",
    ).runs[0].link === labsURL,
  );
  assert(layouts[1].svg.includes(jobURL));
  results.push(
    "Single and full PDF menus embed an external image after a per-site grant and preserve company names, links, the branching career diagram and the job card CTA.",
  );
  await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 900;
    canvas.height = 650;
    const ctx = canvas.getContext("2d"),
      pixels = ctx.createImageData(canvas.width, canvas.height);
    let seed = 29;
    for (let i = 0; i < pixels.data.length; i += 4) {
      seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
      pixels.data[i] = seed >>> 24;
      pixels.data[i + 1] = (seed >>> 16) & 255;
      pixels.data[i + 2] = (seed >>> 8) & 255;
      pixels.data[i + 3] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    const src = canvas.toDataURL("image/jpeg", 0.94);
    document.querySelector(
      '[data-chatgpt-search-unit-key$=":assistant"]',
    ).innerHTML =
      "<p>First large image</p>" +
      Array.from(
        { length: 3 },
        (_, i) => `<img alt="large sample ${i + 1}" width="260" src="${src}">`,
      ).join("") +
      "<p>Final image caption</p>";
  });
  await page.waitForFunction(() =>
    [...document.querySelectorAll("main img")].every(
      (i) => i.naturalWidth === 900,
    ),
  );
  await collect("pdf", 2);
  assert(stagedChunks >= 3);
  await copyFile(
    "test-results/" + exported.at(-1),
    "test-results/chunked-chat.pdf",
  );
  results.push(
    "The normal whole-chat PDF button sends an image-heavy document in acknowledged chunks and creates the complete PDF.",
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
