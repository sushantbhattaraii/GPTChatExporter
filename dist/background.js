(() => {
  // src/modules/settings.js
  var DEFAULTS = Object.freeze({
    font: "sans",
    fontSize: 11,
    orientation: "portrait",
    margin: 48,
    includeTitle: true,
    includeTimestamps: false,
    includeUsers: true,
    includeCode: true,
    saveAs: false
  });
  function normalizeSettings(input = {}) {
    const s = { ...DEFAULTS };
    if (["sans", "serif", "mono"].includes(input.font)) s.font = input.font;
    if (["portrait", "landscape"].includes(input.orientation))
      s.orientation = input.orientation;
    for (const [key, min, max] of [
      ["fontSize", 8, 18],
      ["margin", 24, 90]
    ]) {
      const v = Number(input[key]);
      if (Number.isFinite(v)) s[key] = Math.min(max, Math.max(min, v));
    }
    for (const key of [
      "includeTitle",
      "includeTimestamps",
      "includeUsers",
      "includeCode",
      "saveAs"
    ])
      if (typeof input[key] === "boolean") s[key] = input[key];
    return s;
  }
  async function getSettings() {
    return normalizeSettings(
      (await chrome.storage.local.get("settings")).settings
    );
  }

  // src/modules/filename.js
  var pad = (n) => String(n).padStart(2, "0");
  function filename(doc, format, date = /* @__PURE__ */ new Date()) {
    if (!["pdf", "docx"].includes(format))
      throw new Error("Unsupported document format.");
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    if (doc.scope === "pair")
      return `ChatGPT_QA_${day}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.${format}`;
    const title = (doc.title || "Conversation").normalize("NFC").replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "").slice(0, 90).trim() || "Conversation";
    return `ChatGPT_${title}_${day}.${format}`;
  }

  // src/background.js
  var creating;
  async function ensureOffscreen() {
    if (creating) return creating;
    creating = (async () => {
      const contexts = await chrome.runtime.getContexts({
        contextTypes: ["OFFSCREEN_DOCUMENT"],
        documentUrls: [chrome.runtime.getURL("offscreen.html")]
      });
      if (!contexts.length)
        await chrome.offscreen.createDocument({
          url: "offscreen.html",
          reasons: ["BLOBS"],
          justification: "Generate local PDF and Word documents and retain their download Blob URLs."
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
      await chrome.tabs.sendMessage(tabId, { type: "CGE_STATUS", ...value }).catch(() => {
      });
  }
  async function settle(id, state, error) {
    const key = `download:${id}`, stored = await chrome.storage.session.get(key), job = stored[key];
    if (!job) return;
    await chrome.storage.session.remove(key);
    await chrome.runtime.sendMessage({ target: "offscreen", type: "RELEASE", key: job.key }).catch(() => {
    });
    await status(
      job.tabId,
      state === "complete" ? `Download completed: ${job.filename}` : `Download interrupted${error ? `: ${error}` : ""}. Check Chrome Downloads (Ctrl+J).`,
      state === "complete" ? "success" : "error"
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
    if (JSON.stringify(msg.document).length > 2e7)
      throw new Error(
        "This conversation exceeds the 20 MB safety limit. Export smaller question\u2013answer pairs."
      );
    const settings = await getSettings(), name = filename(msg.document, msg.format), key = crypto.randomUUID();
    await status(sender.tab.id, "Generating your document locally\u2026");
    await ensureOffscreen();
    const result = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "GENERATE",
      key,
      format: msg.format,
      document: msg.document,
      settings
    });
    if (!result?.ok)
      throw new Error(result?.error || "Document generation failed.");
    try {
      const id = await chrome.downloads.download({
        url: result.url,
        filename: name,
        saveAs: settings.saveAs,
        conflictAction: "uniquify"
      });
      await chrome.storage.session.set({
        [`download:${id}`]: { key, tabId: sender.tab.id, filename: name }
      });
      await status(
        sender.tab.id,
        "Download started. Waiting for Chrome to finish\u2026"
      );
      const [item] = await chrome.downloads.search({ id });
      if (item && item.state !== "in_progress")
        await settle(id, item.state, item.error);
      return { ok: true, downloadId: id };
    } catch (e) {
      await chrome.runtime.sendMessage({ target: "offscreen", type: "RELEASE", key }).catch(() => {
      });
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
    exportDocument(msg, sender).then(reply).catch(async (e) => {
      await status(sender.tab?.id, e.message || String(e), "error");
      reply({ ok: false, error: e.message || String(e) });
    });
    return true;
  });
})();
