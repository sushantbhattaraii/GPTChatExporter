import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
const source = await readFile("dist/background.js", "utf8");
async function setup({ downloadError = false, state = "in_progress" } = {}) {
  const session = {},
    sent = [],
    generated = [],
    listeners = [],
    events = [];
  let created = 0;
  const store = {
    get: async (key) =>
      typeof key === "string" ? { [key]: session[key] } : session,
    set: async (obj) => Object.assign(session, obj),
    remove: async (key) => {
      delete session[key];
    },
  };
  const chrome = {
    storage: { local: { get: async () => ({}) }, session: store },
    tabs: { sendMessage: async (id, msg) => sent.push(msg) },
    offscreen: {
      createDocument: async () => {
        created++;
      },
    },
    runtime: {
      getURL: (p) => "chrome-extension://test/" + p,
      getContexts: async () => (created ? [{}] : []),
      sendMessage: async (msg) => {
        generated.push(msg);
        return msg.type === "GENERATE"
          ? { ok: true, url: "blob:chrome-extension://test/doc" }
          : { ok: true };
      },
      onMessage: { addListener: (f) => listeners.push(f) },
      openOptionsPage: () => {},
    },
    downloads: {
      onChanged: { addListener: (f) => events.push(f) },
      download: async () => {
        if (downloadError) throw new Error("USER_CANCELED");
        return 7;
      },
      search: async () => [{ id: 7, state }],
    },
  };
  vm.runInNewContext(source, {
    chrome,
    crypto: webcrypto,
    console,
    setTimeout,
    clearTimeout,
  });
  const request = (
    sender = { tab: { id: 4 }, url: "https://chatgpt.com/c/test" },
  ) =>
    new Promise((resolve) =>
      listeners[0](
        {
          type: "CGE_EXPORT",
          format: "pdf",
          document: { scope: "pair", messages: [] },
        },
        sender,
        resolve,
      ),
    );
  return {
    call: (msg, sender) =>
      new Promise((reply) => listeners[0](msg, sender, reply)),
    session,
    sent,
    generated,
    request,
    event: (e) => events[0](e),
    created: () => created,
  };
}
test("download status waits for browser completion and releases Blob", async () => {
  const app = await setup();
  assert.equal((await app.request()).ok, true);
  assert.equal(app.sent.at(-1).state, "working");
  assert.ok(app.session["download:7"]);
  app.event({ id: 7, state: { current: "complete" } });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(app.sent.at(-1).state, "success");
  assert.equal(app.session["download:7"], undefined);
  assert.equal(app.generated.at(-1).type, "RELEASE");
});
test("download interruption is an error, never success", async () => {
  const app = await setup();
  await app.request();
  app.event({
    id: 7,
    state: { current: "interrupted" },
    error: { current: "FILE_ACCESS_DENIED" },
  });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(app.sent.at(-1).state, "error");
  assert.match(app.sent.at(-1).text, /FILE_ACCESS_DENIED/);
});
test("cancelled download releases Blob and reports failure", async () => {
  const app = await setup({ downloadError: true });
  assert.equal((await app.request()).ok, false);
  assert.equal(app.generated.at(-1).type, "RELEASE");
  assert.equal(app.sent.at(-1).state, "error");
});
test("very fast download completion is reconciled", async () => {
  const app = await setup({ state: "complete" });
  await app.request();
  assert.equal(app.sent.at(-1).state, "success");
  assert.equal(app.session["download:7"], undefined);
});
test("non-ChatGPT sender cannot initiate export", async () => {
  const app = await setup();
  assert.equal(
    (await app.request({ tab: { id: 4 }, url: "https://evil.example/" })).ok,
    false,
  );
  assert.equal(app.created(), 0);
  assert.equal(app.generated.length, 0);
});

test("the worker forwards chunks and generation requests under the same tab and document identity", async () => {
  const app = await setup(),
    from = {
      url: "https://chatgpt.com/c/a",
      tab: { id: 4 },
      documentId: "docA",
    },
    key = "sample";
  assert(
    (
      await app.call(
        { type: "CGE_STAGE", key, chunk: "{}", offset: 0, bytes: 2 },
        from,
      )
    ).ok,
  );
  const staged = app.generated.at(-1);
  assert.deepEqual(
    [staged.target, staged.type, staged.owner, staged.chunk],
    ["offscreen", "STAGE", "4/docA", "{}"],
  );
  assert(
    (
      await app.call(
        {
          type: "CGE_EXPORT",
          key,
          format: "pdf",
          meta: { scope: "conversation", title: "Case" },
        },
        from,
      )
    ).ok,
  );
  const gen = app.generated.find((m) => m.type === "GENERATE");
  assert.equal(gen.owner, staged.owner);
  assert.equal(gen.stagedKey, key);
  assert.equal(
    (
      await app.call(
        { type: "CGE_STAGE", key, offset: 0, bytes: 2, chunk: "{}" },
        { url: "https://elsewhere.example/", tab: { id: 5 } },
      )
    ).ok,
    false,
  );
});
