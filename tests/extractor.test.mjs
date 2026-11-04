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

test("Chat / Work search units expose one pair per grouped turn", () => {
  for (const attr of [
    "data-content-search-unit-key",
    "data-chatgpt-search-unit-key",
  ]) {
    const turn = (i) =>
      `<section data-turn-key="fallback-turn-${i}"><div ${attr}="fallback-turn-${i}:0:user"><div data-user-message-bubble="true">Q${i}</div></div><div class="turn-action-controls"><button>Copy question</button></div><div ${attr}="fallback-turn-${i}:1:assistant"><h4 data-conversation-role="assistant">ChatGPT said:</h4><div data-markdown-text-style="assistant-message"><p>A${i}</p></div></div><div class="turn-action-controls"><button>Copy answer</button></div></section>`;
    const d = dom(fixture(turn(0) + turn(1) + turn(2)));
    const nodes = messageNodes(d);
    assert.equal(nodes.length, 6);
    const middle = extractPair(nodes[3], d);
    assert.deepEqual(
      middle.map((m) => plainText(m.blocks)),
      ["Q1", "A1"],
    );
    assert.deepEqual(
      snapshot(d).map((m) => m.turnIndex),
      [0, 0, 1, 1, 2, 2],
    );
    assert.equal(middle[1].parentId, "fallback-turn-1:0:user");
    nodes[5].parentElement.lastElementChild.remove();
    assert.equal(
      completed(nodes[5], nodes),
      false,
      "a question toolbar cannot mark the answer complete",
    );
  }
});
test("section-only roles support pair extraction without legacy markers", () => {
  const d = dom(
    fixture(
      '<section data-turn="user" data-testid="conversation-turn-0"><p>Hello</p></section><section data-turn="assistant" data-testid="conversation-turn-1"><p>Hi</p><button aria-label="Copy response">Copy</button></section>',
    ),
  );
  const nodes = messageNodes(d);
  assert.equal(nodes.length, 2);
  assert.deepEqual(
    extractPair(nodes[1], d).map((m) => plainText(m.blocks)),
    ["Hello", "Hi"],
  );
});

test("a partly mounted grouped turn cannot borrow an earlier question", () => {
  const d = dom(
    fixture(
      '<section data-turn-key="fallback-turn-0"><div data-content-search-unit-key="fallback-turn-0:0:user">Earlier Q</div></section><section data-turn-key="fallback-turn-1"><div data-content-search-unit-key="fallback-turn-1:1:assistant">Answer to missing Q</div><button aria-label="Copy">Copy</button></section>',
    ),
  );
  const nodes = messageNodes(d);
  assert.equal(completed(nodes[1], nodes), true);
  assert.throws(() => extractPair(nodes[1], d), /question from this response/);
  assert.throws(() => associate(snapshot(d)), /question from this response/);
});

test("a visible introduction in a single assistant turn precedes its body in both export scopes", () => {
  const dom = new JSDOM(
    fixture(
      turn(0, "user", "Question") +
        turn(1, "assistant", "<h1>Final answer</h1>"),
    ),
  );
  const root = dom.window.document;
  const answer = root.querySelector('[data-message-author-role="assistant"]');
  answer.insertAdjacentHTML(
    "beforebegin",
    '<div class="markdown"><p>Public introduction.</p></div><div data-testid="reasoning"><p class="markdown">Private reasoning.</p></div><div hidden class="markdown">Hidden alternative.</div>',
  );
  for (const messages of [extractPair(answer, root), snapshot(root)]) {
    assert.equal(
      plainText(messages[1].blocks),
      "Public introduction.\nFinal answer",
    );
  }
});
