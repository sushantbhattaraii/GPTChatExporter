import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mkdir, writeFile } from "node:fs/promises";
import { fixture, turn, standard, rich } from "./fixtures.mjs";
import {
  snapshot,
  associate,
  extractPair,
  messageNodes,
} from "../src/modules/extractor.js";
import { generatePDF } from "../src/modules/pdf-exporter.js";
import { generateDOCX } from "../src/modules/docx-exporter.js";
import { normalizeSettings } from "../src/modules/settings.js";
const root = new JSDOM(standard, { url: "https://chatgpt.com/c/test" }).window
  .document;
const pair = {
  title: "Research Chat",
  scope: "pair",
  exportedAt: "2026-11-03T12:00:00Z",
  messages: extractPair(messageNodes(root)[3], root),
};
const all = {
  ...pair,
  scope: "conversation",
  messages: associate(snapshot(root)),
};
const defaults = normalizeSettings();
await mkdir("test-results", { recursive: true });
async function save(name, blob) {
  await writeFile(
    "test-results/" + name,
    new Uint8Array(await blob.arrayBuffer()),
  );
}
test("PDF pair has valid header and emits real bytes", async () => {
  const blob = await generatePDF(pair, defaults);
  assert.equal(await blob.slice(0, 5).text(), "%PDF-");
  await save("pair.pdf", blob);
});
test("DOCX pair is a real ZIP package", async () => {
  const blob = await generateDOCX(pair, defaults);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), "PK");
  await save("pair.docx", blob);
});
test("full conversation exports in both formats", async () => {
  await save("conversation.pdf", await generatePDF(all, defaults));
  await save("conversation.docx", await generateDOCX(all, defaults));
});
test("long response, long code, oversize table and landscape settings", async () => {
  const doc = new JSDOM(
    fixture(
      turn(0, "user", "Long question") +
        turn(
          1,
          "assistant",
          rich +
            "<pre><code>" +
            "x".repeat(900) +
            "</code></pre>" +
            (
              "<p>Long technical paragraph. " +
              "distributed systems ".repeat(20) +
              "</p>"
            ).repeat(45) +
            "<table><tr><th>Long row</th></tr><tr><td>" +
            "A lengthy cell. ".repeat(800) +
            "</td></tr></table>",
        ),
    ),
    { url: "https://chatgpt.com/c/test" },
  ).window.document;
  const data = { ...pair, messages: associate(snapshot(doc)) };
  await save("long.pdf", await generatePDF(data, defaults));
  await save("long.docx", await generateDOCX(data, defaults));
  const landscape = normalizeSettings({
    font: "serif",
    fontSize: 13,
    orientation: "landscape",
    includeTitle: false,
    includeUsers: false,
    includeCode: false,
    includeTimestamps: true,
  });
  await save("settings.pdf", await generatePDF(all, landscape));
  await save("settings.docx", await generateDOCX(all, landscape));
});
test("invalid document rejects cleanly", async () => {
  await assert.rejects(generatePDF({}, defaults), /Invalid export request/);
  assert.throws(() => generateDOCX({}, defaults), /Invalid export request/);
});
