import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { fixture, turn, standard, rich } from "./fixtures.mjs";
import {
  messageNodes,
  extractPair,
  snapshot,
  completed,
  associate,
} from "../src/modules/extractor.js";
import { blocks, plainText, safeLink } from "../src/modules/normalize.js";
import { filename } from "../src/modules/filename.js";
import { normalizeSettings } from "../src/modules/settings.js";
import { prepareDocument, tableGrid } from "../src/modules/document.js";
const dom = (html) =>
  new JSDOM(html, { url: "https://chatgpt.com/c/test" }).window.document;
test("single pair includes exactly question and answer", () => {
  const d = dom(
    fixture(
      turn(0, "user", "Only question") +
        turn(1, "assistant", "<p>Only answer</p>"),
    ),
  );
  const p = extractPair(messageNodes(d)[1], d);
  assert.equal(p.length, 2);
  assert.equal(p[1].parentId, "user-0");
});
test("middle answer pairs with Q2, never Q1 or Q3", () => {
  const d = dom(standard),
    p = extractPair(messageNodes(d)[3], d);
  assert.equal(plainText(p[0].blocks), "Question TWO");
  assert.equal(p[1].parentId, "user-2");
  assert.doesNotMatch(
    JSON.stringify(p),
    /Question ONE|Question THREE|Answer THREE/,
  );
});
test("active regenerated branch excludes hidden alternative", () => {
  const d = dom(
    fixture(
      turn(0, "user", "Edited question") +
        turn(1, "assistant", "Old branch", { hidden: true, id: "old" }) +
        turn(1, "assistant", "New branch", { id: "new" }),
    ),
  );
  const p = extractPair(messageNodes(d)[1], d);
  assert.equal(p[1].id, "new");
  assert.equal(plainText(p[0].blocks), "Edited question");
});
test("streaming response is rejected even when old action button remains", () => {
  const d = dom(
    fixture(
      turn(0, "user", "q") +
        turn(1, "assistant", "partial") +
        '<button data-testid="stop-button">Stop</button>',
    ),
  );
  assert.equal(completed(messageNodes(d)[1]), false);
  assert.throws(() => snapshot(d), /incomplete/);
});
test("no completion evidence on final response fails safely", () => {
  const d = dom(
    fixture(
      turn(0, "user", "q") +
        turn(1, "assistant", "maybe done", { done: false }),
    ),
  );
  assert.throws(() => extractPair(messageNodes(d)[1], d), /completed/);
});
test("orphan and missing turn gap are refused", () => {
  const a = dom(fixture(turn(3, "assistant", "answer")));
  assert.throws(
    () => extractPair(messageNodes(a)[0], a),
    /corresponding question/,
  );
  const b = dom(fixture(turn(0, "user", "old") + turn(5, "assistant", "new")));
  assert.throws(() => extractPair(messageNodes(b)[1], b), /gap/);
});
test("chronological ordering and parent identifiers", () => {
  const ms = associate(snapshot(dom(standard)));
  assert.deepEqual(
    ms.map((m) => m.turnIndex),
    [0, 1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    ms.filter((m) => m.role === "assistant").map((m) => m.parentId),
    ["user-0", "user-2", "user-4"],
  );
});
test("duplicates removed, conflicting same ID rejected", () => {
  const d = dom(
    fixture(
      turn(0, "user", "q") +
        turn(1, "assistant", "a") +
        turn(1, "assistant", "a"),
    ),
  );
  assert.equal(snapshot(d).length, 2);
  const bad = dom(
    fixture(
      turn(0, "user", "q") +
        turn(1, "assistant", "a") +
        turn(1, "assistant", "changed"),
    ),
  );
  assert.throws(() => snapshot(bad), /Conflicting/);
});
test("rich content preserves code, math once, nested lists, table, hyperlink and Unicode", () => {
  const d = dom(standard),
    p = extractPair(messageNodes(d)[3], d),
    bs = p[1].blocks,
    txt = plainText(bs);
  assert.match(txt, /    return/);
  assert.match(txt, /x\^2 \+ y\^2/);
  assert.doesNotMatch(txt, /duplicate formula|Copy code|Unrelated sidebar/);
  assert.ok(bs.some((b) => b.type === "table"));
  assert.ok(bs.some((b) => b.type === "list" && b.start === 3));
  assert.match(JSON.stringify(bs), /https:\/\/example.com\/paper/);
  assert.match(txt, /Ελληνικά/);
  assert.match(txt, /A labeled graph/);
});
test("unsafe links and UI scripts are excluded", () => {
  assert.equal(safeLink("javascript:alert(1)"), undefined);
  assert.equal(safeLink("data:text/html,hi"), undefined);
  const d = dom(
    '<div id="x"><p>safe<button>delete</button><script>alert(1)</script><span hidden>secret</span></p></div>',
  );
  assert.equal(plainText(blocks(d.querySelector("#x"))), "safe");
});
test("settings validated and exclusions are recursive", () => {
  const s = normalizeSettings({
    fontSize: 999,
    margin: -2,
    font: "bad",
    includeUsers: false,
    includeCode: false,
  });
  assert.equal(s.fontSize, 18);
  assert.equal(s.margin, 24);
  assert.equal(s.font, "sans");
  const ms = associate(snapshot(dom(standard)));
  const doc = prepareDocument({ scope: "conversation", messages: ms }, s);
  assert.equal(doc.messages.length, 3);
  assert.ok(
    doc.messages.every((m) => m.blocks.every((b) => b.type !== "code")),
  );
});
test("filenames portable and deterministic", () => {
  const date = new Date(2026, 10, 3, 14, 5, 6);
  assert.equal(
    filename({ scope: "pair" }, "docx", date),
    "ChatGPT_QA_2026-11-03_14-05-06.docx",
  );
  assert.equal(
    filename({ scope: "conversation", title: "Research: A/B?" }, "pdf", date),
    "ChatGPT_Research A B_2026-11-03.pdf",
  );
  assert.throws(() => filename({}, "exe"), /Unsupported/);
});
test("merged table grid preserves cells without shifting", () => {
  const result = tableGrid([
    [
      { blocks: [], rowSpan: 2, colSpan: 2, header: true },
      { blocks: [], colSpan: 1, rowSpan: 1 },
    ],
    [{ blocks: [{ type: "paragraph", runs: [{ text: "last" }] }] }],
  ]);
  assert.equal(result[1].length, 3);
  assert.equal(plainText(result[1][2].blocks), "last");
});
test("large text content is preserved", () => {
  const text = "Long paragraph α. ".repeat(5000);
  const d = dom(
    fixture(turn(0, "user", "q") + turn(1, "assistant", `<p>${text}</p>`)),
  );
  assert.equal(
    plainText(extractPair(messageNodes(d)[1], d)[1].blocks),
    text.trim(),
  );
});
