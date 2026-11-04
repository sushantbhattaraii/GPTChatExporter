import test from "node:test";
import assert from "node:assert/strict";
import {
  allowedAsset,
  readDisplayedAsset,
} from "../src/modules/media-fetch.js";
test("media fetch is limited to image-serving origins and signed-in ChatGPT page callers", async () => {
  assert.equal(
    allowedAsset("https://chatgpt.com/backend-api/estuary/content?id=fixture"),
    true,
  );
  assert.equal(allowedAsset("https://cdn.oaiusercontent.com/asset.png"), true);
  for (const url of [
    "https://chatgpt.com/backend-api/conversations",
    "https://oaiusercontent.com.evil.example/file",
    "https://test@cdn.oaiusercontent.com/file",
    "http://cdn.oaiusercontent.com/x",
  ])
    assert.equal(allowedAsset(url), false);
  await assert.rejects(
    readDisplayedAsset("https://cdn.oaiusercontent.com/x", {
      url: "https://example.org/",
      tab: { id: 1 },
    }),
  );
});
test("binary media response must have an actual raster signature", async () => {
  const old = globalThis.fetch,
    url = "https://cdn.oaiusercontent.com/file",
    sender = { tab: { id: 1 }, url: "https://chatgpt.com/c/example" };
  const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2]);
  let bytes = png,
    observed;
  globalThis.fetch = async (_, options) => {
    observed = options;
    const res = new Response(bytes, {
      headers: { "Content-Type": "application/octet-stream" },
    });
    Object.defineProperty(res, "url", { value: url });
    return res;
  };
  try {
    const asset = await readDisplayedAsset(url, sender);
    assert.match(asset.data, /^data:image\/png;base64,/);
    assert.equal(observed.credentials, "omit");
    bytes = new TextEncoder().encode("<html>not an image</html>");
    await assert.rejects(
      readDisplayedAsset(url, sender),
      /not a supported image/,
    );
  } finally {
    globalThis.fetch = old;
  }
});

test("source-image hosts use anonymous HTTPS; restricted external sites return a request for just their own origin", async () => {
  const oldFetch = globalThis.fetch,
    oldChrome = globalThis.chrome;
  const { publicImageOrigin } = await import("../src/modules/image-origins.js");
  const url =
    "https://www.microsoft.com/en-us/research/wp-content/uploads/2022/07/example.jpg";
  for (const invalid of [
    "https://127.0.0.1/a",
    "https://[::1]/a",
    "https://x.local/a",
    "https://chatgpt.com/backend-api/conversations",
    "https://name:password@foo.com/a",
    "file:///a",
  ])
    assert.equal(publicImageOrigin(invalid), null);
  assert.equal(
    allowedAsset("https://images.openai.com/thumbnails/example.jpeg"),
    true,
  );
  let granted = false,
    opts;
  globalThis.chrome = {
    permissions: {
      contains: async (spec) => {
        assert.deepEqual(spec.origins, ["https://www.microsoft.com/*"]);
        return granted;
      },
    },
  };
  globalThis.fetch = async (_, options) => {
    opts = options;
    if (!granted) throw new TypeError("Blocked by CORS");
    const res = new Response(Uint8Array.from([255, 216, 255, 0]), {
      headers: { "content-type": "application/octet-stream" },
    });
    Object.defineProperty(res, "url", { value: url });
    return res;
  };
  const sender = { url: "https://chatgpt.com/c/test", tab: { id: 1 } };
  try {
    assert.deepEqual(await readDisplayedAsset(url, sender), {
      ok: false,
      permissionOrigin: "https://www.microsoft.com",
    });
    granted = true;
    assert.match(
      (await readDisplayedAsset(url, sender)).data,
      /^data:image\/jpeg;base64,/,
    );
    assert.equal(opts.credentials, "omit");
    assert.equal(opts.referrerPolicy, "no-referrer");
    await assert.rejects(readDisplayedAsset("http://127.0.0.1/a.jpg", sender));
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.chrome = oldChrome;
  }
});

test("withheld OpenAI thumbnail access returns the exact host that Chrome can grant", async () => {
  const oldFetch = globalThis.fetch,
    oldChrome = globalThis.chrome;
  globalThis.chrome = { permissions: { contains: async () => false } };
  globalThis.fetch = async () => {
    throw new TypeError("Origin blocked");
  };
  try {
    assert.deepEqual(
      await readDisplayedAsset("https://images.openai.com/thumbnails/test", {
        tab: { id: 1 },
        url: "https://chatgpt.com/c/test",
      }),
      { ok: false, permissionOrigin: "https://images.openai.com" },
    );
  } finally {
    globalThis.fetch = oldFetch;
    globalThis.chrome = oldChrome;
  }
});
