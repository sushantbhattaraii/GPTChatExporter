import test from "node:test";
import assert from "node:assert/strict";
import { stagedDocuments, sendExport, CHUNK } from "../src/modules/transfer.js";
import { generatePDF } from "../src/modules/pdf-exporter.js";
import { normalizeSettings } from "../src/modules/settings.js";

test("a whole-chat model larger than 20 MiB is transferred in order and generates a complete PDF", async () => {
  const store = stagedDocuments(),
    before = globalThis.chrome;
  const title = "The complete chat",
    text = "chunk 📓 ".repeat(3_000_000);
  const model = {
    scope: "conversation",
    title,
    messages: [
      {
        role: "user",
        blocks: [{ type: "paragraph", runs: [{ text: "Keep both ends" }] }],
      },
      {
        role: "assistant",
        blocks: [
          { type: "code", text },
          { type: "paragraph", runs: [{ text: "Final reply" }] },
        ],
      },
    ],
  };
  let chunks = 0,
    result;
  globalThis.chrome = {
    runtime: {
      sendMessage: async (msg) => {
        if (msg.type === "CGE_STAGE") {
          chunks++;
          assert(msg.chunk.length <= CHUNK);
          store.append({ ...msg, owner: "tab1" });
          return { ok: true };
        }
        if (msg.type === "CGE_DISCARD") {
          store.discard(msg.key, "tab1");
          return { ok: true };
        }
        assert.equal(msg.type, "CGE_EXPORT");
        const received = store.take(msg.key, "tab1");
        assert.equal(received.messages[1].blocks[0].text, text);
        result = await generatePDF(
          received,
          normalizeSettings({ includeCode: false }),
        );
        return { ok: true };
      },
    },
  };
  try {
    assert.equal(
      (await sendExport(model, "pdf", new AbortController().signal, () => {}))
        .ok,
      true,
    );
    assert(chunks > 40);
    assert.equal(await result.slice(0, 5).text(), "%PDF-");
  } finally {
    globalThis.chrome = before;
  }
});
test("incomplete, cross-document and out-of-order transfers never generate partial exports", () => {
  const store = stagedDocuments(),
    part = { key: "k", owner: "tab/doc", bytes: 2, offset: 0, chunk: "[" };
  store.append(part);
  assert.throws(() => store.take("k", "tab/doc"), /incomplete/);
  assert.throws(() =>
    store.append({ ...part, owner: "other", offset: 1, chunk: "]" }),
  );
  assert.throws(() => store.append({ ...part, offset: 0, chunk: "[" }));
  store.append({ ...part, offset: 1, chunk: "]" });
  assert.throws(() => store.take("k", "other"));
  assert.deepEqual(store.take("k", "tab/doc"), []);
  assert.throws(() => store.take("k", "tab/doc"));
});
