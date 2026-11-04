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
