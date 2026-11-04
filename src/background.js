import { getSettings } from "./modules/settings.js";
import { filename } from "./modules/filename.js";
let creating;
async function ensureOffscreen() {
  if (creating) return creating;
  creating = (async () => {
    const contexts = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL("offscreen.html")],
    });
    if (!contexts.length)
      await chrome.offscreen.createDocument({
        url: "offscreen.html",
        reasons: ["BLOBS"],
        justification:
          "Generate local PDF and Word documents and retain their download Blob URLs.",
      });
  })();
  try {
    await creating;
  } finally {
    creating = null;
  }
}
async function status(tabId, text, state = "working") {
  const value = { text, state, at: Date.now(), tabId };
  await chrome.storage.session.set({ lastStatus: value });
  if (tabId)
    await chrome.tabs
      .sendMessage(tabId, { type: "CGE_STATUS", ...value })
      .catch(() => {});
}
async function settle(id, state, error) {
  const key = `download:${id}`,
    stored = await chrome.storage.session.get(key),
    job = stored[key];
  if (!job) return;
  await chrome.storage.session.remove(key);
  await chrome.runtime
    .sendMessage({ target: "offscreen", type: "RELEASE", key: job.key })
    .catch(() => {});
  await status(
    job.tabId,
    state === "complete"
      ? `Download completed: ${job.filename}`
      : `Download interrupted${error ? `: ${error}` : ""}. Check Chrome Downloads (Ctrl+J).`,
    state === "complete" ? "success" : "error",
  );
}
chrome.downloads.onChanged.addListener((delta) => {
  if (["complete", "interrupted"].includes(delta.state?.current))
    void settle(delta.id, delta.state.current, delta.error?.current);
});
async function exportDocument(msg, sender) {
  if (!sender.tab || !sender.url?.startsWith("https://chatgpt.com/"))
    throw new Error("Exports must originate from the ChatGPT page.");
  if (!["pdf", "docx"].includes(msg.format))
    throw new Error("Invalid file format.");
  if (JSON.stringify(msg.document).length > 20_000_000)
    throw new Error(
      "This conversation exceeds the 20 MB safety limit. Export smaller question–answer pairs.",
    );
  const settings = await getSettings(),
    name = filename(msg.document, msg.format),
    key = crypto.randomUUID();
  await status(sender.tab.id, "Generating your document locally…");
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({
    target: "offscreen",
    type: "GENERATE",
    key,
    format: msg.format,
    document: msg.document,
    settings,
  });
  if (!result?.ok)
    throw new Error(result?.error || "Document generation failed.");
  try {
    const id = await chrome.downloads.download({
      url: result.url,
      filename: name,
      saveAs: settings.saveAs,
      conflictAction: "uniquify",
    });
    await chrome.storage.session.set({
      [`download:${id}`]: { key, tabId: sender.tab.id, filename: name },
    });
    await status(
      sender.tab.id,
      "Download started. Waiting for Chrome to finish…",
    );
    // Catch completion that raced ahead of the session record.
    const [item] = await chrome.downloads.search({ id });
    if (item && item.state !== "in_progress")
      await settle(id, item.state, item.error);
    return { ok: true, downloadId: id };
  } catch (e) {
    await chrome.runtime
      .sendMessage({ target: "offscreen", type: "RELEASE", key })
      .catch(() => {});
    throw e;
  }
}
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.target === "offscreen") return;
  if (msg?.type === "CGE_PING") {
    reply({ ok: true });
    return;
  }
  if (msg?.type === "CGE_SETTINGS") {
    chrome.runtime.openOptionsPage();
    reply({ ok: true });
    return;
  }
  if (msg?.type !== "CGE_EXPORT") return;
  exportDocument(msg, sender)
    .then(reply)
    .catch(async (e) => {
      await status(sender.tab?.id, e.message || String(e), "error");
      reply({ ok: false, error: e.message || String(e) });
    });
  return true;
});
