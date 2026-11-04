(() => {
  // src/modules/image-origins.js
  function allowedAsset(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || u.port || u.username || u.password)
        return false;
      if (u.hostname === "chatgpt.com")
        return /^\/backend-api\/(?:estuary\/content(?:\/|$)|files\/)/.test(
          u.pathname
        );
      return u.hostname === "images.openai.com" || u.hostname === "oaiusercontent.com" || u.hostname.endsWith(".oaiusercontent.com");
    } catch {
      return false;
    }
  }
  function publicImageOrigin(value) {
    try {
      const u = new URL(value);
      if (u.protocol !== "https:" || u.port || u.username || u.password || !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname) || /(?:^|\.)(?:localhost|local|internal|intranet|home|test)$/.test(
        u.hostname
      ) || u.hostname === "chatgpt.com" || u.hostname.endsWith(".chatgpt.com"))
        return null;
      return u.origin;
    } catch {
      return null;
    }
  }

  // src/modules/media-fetch.js
  async function readDisplayedAsset(value, sender) {
    if (!sender.tab || !sender.url?.startsWith("https://chatgpt.com/") || !allowedAsset(value) && !publicImageOrigin(value))
      throw new Error("Image origin is unavailable");
    const firstParty = allowedAsset(value), origin = publicImageOrigin(value);
    let res;
    try {
      res = await fetch(value, {
        credentials: new URL(value).hostname === "chatgpt.com" ? "include" : "omit",
        referrerPolicy: "no-referrer",
        redirect: firstParty ? "follow" : "error",
        signal: AbortSignal.timeout(12e3)
      });
    } catch (error) {
      if (error.name === "TypeError" && !firstParty && !await chrome.permissions.contains({ origins: [origin + "/*"] }))
        return { ok: false, permissionOrigin: origin };
      throw error;
    }
    let type = res.headers.get("Content-Type")?.split(";")[0].toLowerCase();
    if (!res.ok || !(firstParty ? allowedAsset(res.url) : publicImageOrigin(res.url) === origin) || !(type === "application/octet-stream" || /^image\/(png|jpeg|webp|gif|avif)$/.test(type)))
      throw new Error("Image could not be read");
    const reader = res.body.getReader(), chunks = [];
    let size = 0;
    while (true) {
      const { done, value: bytes } = await reader.read();
      if (done) break;
      size += bytes.length;
      if (size > 12e6) {
        await reader.cancel();
        throw new Error("Image exceeds 12 MB");
      }
      chunks.push(bytes);
    }
    const joined = new Uint8Array(size);
    let pos = 0;
    for (const chunk of chunks) {
      joined.set(chunk, pos);
      pos += chunk.length;
    }
    if (type === "application/octet-stream") {
      const head = String.fromCharCode(...joined.subarray(0, 16));
      if (head.startsWith("\x89PNG\r\n\n")) type = "image/png";
      else if (joined[0] === 255 && joined[1] === 216 && joined[2] === 255)
        type = "image/jpeg";
      else if (head.startsWith("GIF87a") || head.startsWith("GIF89a"))
        type = "image/gif";
      else if (head.startsWith("RIFF") && head.slice(8, 12) === "WEBP")
        type = "image/webp";
      else throw new Error("Asset is not a supported image.");
    }
    let binary = "";
    for (let i = 0; i < size; i += 8192)
      binary += String.fromCharCode(...joined.subarray(i, i + 8192));
    return { ok: true, data: `data:${type};base64,${btoa(binary)}` };
  }

  // src/modules/settings.js
  var DEFAULTS = Object.freeze({
    font: "sans",
    fontSize: 11,
    orientation: "portrait",
    margin: 48,
    includeTitle: true,
    showPdfTitle: false,
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
      "showPdfTitle",
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
  function ownerOf(sender) {
    if (!sender.tab || !sender.url?.startsWith("https://chatgpt.com/") || sender.frameId && sender.frameId !== 0)
      throw new Error("Exports must originate from the ChatGPT page.");
    return sender.tab.id + "/" + (sender.documentId || sender.url);
  }
  async function stage(msg, sender) {
    const owner = ownerOf(sender);
    if (msg.type === "CGE_STAGE" && msg.offset === 0) await ensureOffscreen();
    return chrome.runtime.sendMessage({
      ...msg,
      target: "offscreen",
      owner,
      type: msg.type === "CGE_STAGE" ? "STAGE" : "DISCARD"
    });
  }
  async function exportDocument(msg, sender) {
    const owner = ownerOf(sender);
    if (!["pdf", "docx"].includes(msg.format))
      throw new Error("Invalid file format.");
    if (!msg.key && (!msg.document || JSON.stringify(msg.document).length > 2e7))
      throw new Error(
        "Invalid direct export. Large documents must be transferred in chunks."
      );
    const settings = await getSettings(), name = filename(msg.key ? msg.meta : msg.document, msg.format), key = crypto.randomUUID();
    await status(sender.tab.id, "Generating your document locally\u2026");
    await ensureOffscreen();
    const result = await chrome.runtime.sendMessage({
      target: "offscreen",
      type: "GENERATE",
      key,
      format: msg.format,
      document: msg.document,
      stagedKey: msg.key,
      owner,
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
    if (msg?.type === "CGE_STAGE" || msg?.type === "CGE_DISCARD") {
      stage(msg, sender).then(reply).catch((e) => reply({ ok: false, error: e.message }));
      return true;
    }
    if (msg?.type === "CGE_IMAGE_HAS_ACCESS") {
      try {
        ownerOf(sender);
        if (!Array.isArray(msg.origins) || !msg.origins.length || !msg.origins.every((o) => publicImageOrigin(o) === o))
          throw new Error("Invalid image sites.");
        chrome.permissions.contains({ origins: msg.origins.map((o) => o + "/*") }).then(
          (granted) => reply({ granted }),
          () => reply({ granted: false })
        );
        return true;
      } catch {
        reply({ granted: false });
        return;
      }
    }
    if (msg?.type === "CGE_IMAGE") {
      const task = readDisplayedAsset(msg.url, sender);
      task.then(reply).catch((e) => reply({ ok: false, error: e.message }));
      return true;
    }
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
