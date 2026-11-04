import { chromium } from "playwright";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fixture, turn, standard, rich } from "./fixtures.mjs";
const root = process.cwd(),
  out = path.join(root, "test-results");
await mkdir(out, { recursive: true });
const profile = await mkdtemp(path.join(tmpdir(), "cge-test-"));
const errors = [];
const results = [];
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  acceptDownloads: true,
  args: [
    `--disable-extensions-except=${root}/dist`,
    `--load-extension=${root}/dist`,
    "--no-sandbox",
  ],
});
try {
  await context.route("https://chatgpt.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: standard }),
  );
  const worker =
    context.serviceWorkers()[0] ||
    (await context.waitForEvent("serviceworker"));
  const extensionId = worker.url().split("/")[2];
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("https://chatgpt.com/c/fixture");
  await page
    .getByRole("button", { name: "↓ Export this Q&A", exact: true })
    .first()
    .waitFor();
  assert.equal(await page.locator('[data-cge="pair"]').count(), 3);
  results.push("Completed responses receive one button each.");
  async function downloads() {
    return worker.evaluate(() => chrome.downloads.search({}));
  }
  async function waitDownload(before, filename) {
    let item;
    const start = Date.now();
    while (Date.now() - start < 45000) {
      const all = await downloads();
      item = all.find((x) => !before.includes(x.id) && x.state === "complete");
      if (item) break;
      await page.waitForTimeout(200);
    }
    if (!item)
      throw new Error(
        "Download not completed: " +
          (await page.locator('[data-cge="toolbar"]').innerText()),
      );
    const destination = path.join(out, filename);
    await copyFile(item.filename, destination);
    return destination;
  }
  async function pair(format, file) {
    const before = (await downloads()).map((x) => x.id);
    const scope = page.locator('[data-cge="pair"]').nth(1);
    await scope
      .getByRole("button", { name: "↓ Export this Q&A", exact: true })
      .click();
    await scope
      .getByRole("button", {
        name: format === "pdf" ? "PDF" : "Word (.docx)",
        exact: true,
      })
      .click();
    return waitDownload(before, file);
  }
  await pair("pdf", "pair.pdf");
  results.push(
    "Actual MV3 pair PDF generation and chrome.downloads completion.",
  );
  await pair("docx", "pair.docx");
  results.push(
    "Actual MV3 pair DOCX generation and chrome.downloads completion.",
  );
  async function full(format, file) {
    const before = (await downloads()).map((x) => x.id);
    const scope = page.locator('[data-cge="toolbar"]');
    await scope
      .getByRole("button", { name: "Export conversation", exact: true })
      .click();
    await scope
      .getByRole("button", {
        name: format === "pdf" ? "PDF" : "Word (.docx)",
        exact: true,
      })
      .click();
    await page.getByRole("dialog").waitFor({ timeout: 20000 });
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", {
        name: `Download ${format === "pdf" ? "PDF" : "Word"}`,
        exact: true,
      })
      .click();
    return waitDownload(before, file);
  }
  await full("pdf", "conversation.pdf");
  await full("docx", "conversation.docx");
  results.push(
    "Full-conversation history scan, review, PDF and DOCX downloads.",
  );
  // Branch replacement, edited question, streaming and observer de-duplication.
  await page.evaluate(() => {
    document.querySelector('[data-message-id="user-2"]').textContent =
      "Question TWO edited";
    document.querySelector(
      '[data-message-id="assistant-3"] .markdown',
    ).innerHTML = "<p>Regenerated answer TWO</p>";
  });
  await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-cge="pair"]').count(), 3);
  await pair("docx", "regenerated.docx");
  results.push(
    "Edited prompt and regenerated visible answer export without duplicate controls.",
  );
  await page.evaluate(() => {
    const b = document.createElement("button");
    b.dataset.testid = "stop-button";
    b.id = "stream-stop";
    document.body.append(b);
  });
  await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-cge="pair"]').count(), 2);
  await page.evaluate(() => document.getElementById("stream-stop").remove());
  await page.waitForTimeout(700);
  assert.equal(await page.locator('[data-cge="pair"]').count(), 3);
  results.push(
    "Streaming suppresses the last export control and completion restores it.",
  );
  // Extension pages run under the shipped CSP.
  const settings = await context.newPage();
  settings.on("pageerror", (e) => errors.push(e.message));
  await settings.goto(`chrome-extension://${extensionId}/options.html`);
  await settings.locator('[name="fontSize"]').fill("13");
  await settings.locator('[name="orientation"]').selectOption("landscape");
  await settings.locator('[name="includeUsers"]').uncheck();
  await settings
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await settings.getByText("Settings saved.", { exact: true }).waitFor();
  const stored = await worker.evaluate(() =>
    chrome.storage.local.get("settings"),
  );
  assert.equal(stored.settings.fontSize, 13);
  assert.equal(stored.settings.includeUsers, false);
  await settings.screenshot({
    path: path.join(out, "settings.png"),
    fullPage: true,
  });
  await settings.close();
  results.push("Settings page persistence under Manifest V3 CSP.");
  await worker.evaluate(() => chrome.storage.local.clear());
  // Long content, long unbroken code, long table row and real pagination.
  await page.evaluate(
    (html) => {
      document.querySelector("main").innerHTML = html;
    },
    turn(0, "user", "Question ONE") +
      turn(1, "assistant", "<p>Answer ONE</p>") +
      turn(2, "user", "Question TWO long") +
      turn(
        3,
        "assistant",
        rich +
          "<pre><code>" +
          "x".repeat(900) +
          "</code></pre>" +
          (
            "<p>Long technical paragraph with enough prose to verify pagination and retained content. " +
            "distributed systems ".repeat(20) +
            "</p>"
          ).repeat(45) +
          "<table><tr><th>Long row</th></tr><tr><td>" +
          "A lengthy cell. ".repeat(800) +
          "</td></tr></table>",
      ),
  );
  await page.waitForTimeout(700);
  await pair("pdf", "long.pdf");
  await pair("docx", "long.docx");
  results.push(
    "Long response, unbroken code and oversized table row generate PDF and DOCX.",
  );
  await page.screenshot({
    path: path.join(out, "fixture-ui.png"),
    fullPage: false,
  });
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(out, "browser-results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: context.browser()?.version(),
        environment:
          "Local synthetic ChatGPT-shaped DOM; not signed-in ChatGPT",
        results,
        errors,
      },
      null,
      2,
    ),
  );
  console.log(results.map((x) => "PASS " + x).join("\n"));
} finally {
  await context.close();
}
