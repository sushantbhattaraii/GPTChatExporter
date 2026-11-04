import { sendExport } from "./modules/transfer.js";
import { beginImages, endImages, embedImages } from "./modules/media.js";
import {
  messageNodes,
  messageRole,
  mountPairHost,
  removePairHost,
  updateImageControl,
  pairImage,
  visualRoots,
  historyKey,
  completed,
  extractPair,
  title,
  snapshot,
} from "./modules/extractor.js";
import { collectHistory } from "./modules/history.js";
import {
  mount,
  menu,
  button,
  iconButton,
  review,
  positionToolbar,
} from "./modules/ui.js";
import { plainText } from "./modules/normalize.js";
import { getSettings } from "./modules/settings.js";
let pendingImages;
let busy = false,
  route = location.href,
  scheduled,
  controller;
const pairs = new Map();
const panel = mount(document.body, "toolbar");
const toolbar = document.createElement("div");
toolbar.className = "toolbar";
panel.shadow.append(toolbar);
const updateToolbarPosition = positionToolbar(toolbar);
menu(toolbar, "Export conversation", (format) => run("conversation", format));
toolbar.append(
  iconButton(
    button("Settings", () =>
      chrome.runtime.sendMessage({ type: "CGE_SETTINGS" }),
    ),
    "settings",
    "Settings",
  ),
);
const status = document.createElement("div");
status.className = "status";
status.setAttribute("role", "status");
status.setAttribute("aria-live", "polite");
toolbar.append(status);
function feedback(text, state = "working") {
  status.textContent = text;
  status.dataset.state = state;
}
function askImageAccess(origins) {
  if (controller.signal.aborted) throw new Error("Export cancelled.");
  const dialog = document.createElement("dialog"),
    title = document.createElement("h2"),
    body = document.createElement("p");
  title.textContent = "Include images from these sites?";
  body.textContent =
    "Open the ChatGPT Conversation Exporter icon in Chrome and click “Allow images and continue”. Chrome will ask about " +
    origins.map((o) => new URL(o).hostname).join(", ") +
    ". This export will resume here.";
  const signal = controller.signal;
  return new Promise((resolve, reject) => {
    let settled = false,
      poll;
    const finish = (allow, cancel = false) => {
      if (settled) return;
      settled = true;
      clearInterval(poll);
      signal.removeEventListener("abort", abort);
      pendingImages = null;
      dialog.close();
      dialog.remove();
      if (cancel) reject(new Error("Export cancelled."));
      else resolve(allow);
    };
    const abort = () => finish(false, true);
    pendingImages = { token: crypto.randomUUID(), origins, finish };
    // A native prompt may close the popup. Resume after the grant even in that case.
    poll = setInterval(
      () =>
        chrome.runtime
          .sendMessage({ type: "CGE_IMAGE_HAS_ACCESS", origins })
          .then((r) => {
            if (r?.granted === true) finish(true);
          })
          .catch(() => {}),
      1500,
    );
    signal.addEventListener("abort", abort, { once: true });
    dialog.addEventListener("cancel", (e) => {
      e.preventDefault();
      abort();
    });
    dialog.append(
      title,
      body,
      button("Continue without these images", () => finish(false)),
      button("Cancel export", abort),
    );
    panel.shadow.append(dialog);
    dialog.showModal();
  });
}
async function run(scope, format, target) {
  if (busy) {
    feedback("An export is already in progress.");
    return;
  }
  busy = true;
  beginImages();
  controller = new AbortController();
  const startRoute = location.href;
  const stop = (e) => {
    if (e.key === "Escape") controller.abort();
  };
  document.addEventListener("keydown", stop);
  try {
    feedback(
      scope === "pair"
        ? "Extracting this question and answer…"
        : "Loading conversation history… (Escape cancels)",
    );
    let messages;
    if (scope === "pair") messages = extractPair(target);
    else {
      const data = await collectHistory({
        signal: controller.signal,
        onProgress: feedback,
      });
      document.removeEventListener("keydown", stop);
      if (!(await review(panel.shadow, data, format, await getSettings()))) {
        feedback("Export cancelled.");
        return;
      }
      messages = data.messages;
      const keys = new Map(messages.map((m) => [historyKey(m), m]));
      for (const current of snapshot()) {
        const prior = keys.get(historyKey(current));
        if (
          !prior ||
          prior.turnIndex !== current.turnIndex ||
          plainText(prior.blocks) !== plainText(current.blocks)
        )
          throw new Error(
            "The conversation changed during review. Please retry.",
          );
      }
    }
    if (location.href !== startRoute)
      throw new Error("The conversation changed. Please retry.");
    const model = {
      scope,
      title: title(),
      exportedAt: new Date().toISOString(),
      messages,
    };
    feedback("Reading images for this export…");
    await embedImages(messages, {
      requestAccess: askImageAccess,
      format,
      signal: controller.signal,
    });
    if (controller.signal.aborted || location.href !== startRoute)
      throw new Error("Export cancelled or conversation changed.");
    const response = await sendExport(
      model,
      format,
      controller.signal,
      feedback,
    );
    if (!response?.ok)
      throw new Error(
        response?.error ||
          "The extension did not respond. Refresh ChatGPT and retry.",
      );
  } catch (e) {
    feedback(e.message || "Export failed.", "error");
  } finally {
    endImages();
    busy = false;
    scan();
    document.removeEventListener("keydown", stop);
    controller = null;
  }
}
function scan() {
  if (route !== location.href) {
    route = location.href;
    controller?.abort();
    feedback("");
    for (const [el, entry] of pairs) {
      entry.cleanup();
      removePairHost(entry.host);
    }
    pairs.clear();
  }
  const nodes = messageNodes();
  for (const [el, entry] of pairs)
    if (
      !entry.host.isConnected ||
      !el.isConnected ||
      !nodes.includes(el) ||
      !completed(el, nodes)
    ) {
      entry.cleanup();
      removePairHost(entry.host);
      pairs.delete(el);
    }
  for (const el of nodes) {
    if (
      messageRole(el) !== "assistant" ||
      pairs.has(el) ||
      !completed(el, nodes)
    )
      continue;
    const ui = mount(null, "pair");
    const image = pairImage(el);
    mountPairHost(el, ui.host, image);
    const cleanup = menu(ui.shadow, "↓ Export this Q&A", (format) =>
      run("pair", format, el),
    );
    pairs.set(el, { ...ui, cleanup, image, anchor: visualRoots(el).at(-1) });
  }
  for (const [el, entry] of pairs) {
    const end = visualRoots(el).at(-1);
    const image = pairImage(el);
    if (entry.anchor !== end || entry.image !== image) {
      mountPairHost(el, entry.host, image);
      entry.image = image;
      entry.anchor = end;
    }
  }
  queueImagePositions();
  updateToolbarPosition();
  if (!panel.host.isConnected) document.body.append(panel.host);
  panel.host.style.display =
    nodes.length || /\/(?:c|share)\//.test(location.pathname)
      ? "block"
      : "none";
  if (!nodes.length && !busy)
    feedback(
      "No readable messages detected yet. Open a conversation with a finished reply.",
    );
  else if (status.textContent.startsWith("No readable messages detected"))
    feedback("");
}
let imageFrame = 0;
function queueImagePositions() {
  if (imageFrame) return;
  imageFrame = requestAnimationFrame(() => {
    imageFrame = 0;
    for (const entry of pairs.values())
      if (entry.image) updateImageControl(entry.image, entry.host);
  });
}
window.addEventListener("scroll", queueImagePositions, {
  capture: true,
  passive: true,
});
window.addEventListener("resize", queueImagePositions);
function queueScan() {
  if (!scheduled)
    scheduled = setTimeout(() => {
      scheduled = null;
      scan();
    }, 150);
}
const observer = new MutationObserver((records) => {
  if (
    records.some(
      (r) => r.target.nodeType !== 1 || !r.target.closest("[data-cge]"),
    )
  )
    queueScan();
});
const watch = {
  subtree: true,
  childList: true,
  attributes: true,
  attributeFilter: [
    "data-message-id",
    "data-message-author-role",
    "data-content-search-unit-key",
    "data-chatgpt-search-unit-key",
    "data-turn",
    "data-turn-key",
    "data-markdown-text-style",
    "data-conversation-role",
    "data-is-streaming",
    "aria-busy",
    "hidden",
    "aria-hidden",
    "src",
    "srcset",
    "style",
    "class",
    "data-testid",
    "aria-label",
    "data-generated-image",
  ],
};
observer.observe(document.body, watch);
document.addEventListener(
  "load",
  (e) => {
    if (e.target?.tagName === "IMG") queueScan();
  },
  true,
);
document.addEventListener(
  "transitionend",
  (e) => {
    if (e.propertyName === "opacity" && !e.target.closest("[data-cge]"))
      queueScan();
  },
  true,
);
scan();
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "CGE_STATUS") {
    feedback(msg.text, msg.state);
    return;
  }
  if (msg?.type === "CGE_IMAGE_DECISION") {
    if (!pendingImages || pendingImages.token !== msg.token) {
      reply({ ok: false });
      return;
    }
    pendingImages.finish(msg.granted === true);
    reply({ ok: true });
    return;
  }
  if (msg?.type === "CGE_PROBE") {
    reply({
      ok: true,
      messages: messageNodes().length,
      busy,
      imageAccess: pendingImages
        ? { token: pendingImages.token, origins: pendingImages.origins }
        : null,
    });
    return;
  }
  if (msg?.type === "CGE_REQUEST") {
    if (busy) {
      reply({ ok: false, error: "Another export is running." });
      return;
    }
    reply({ ok: true });
    void run("conversation", msg.format);
  }
});
window.addEventListener(
  "pagehide",
  () => {
    observer.disconnect();
    clearTimeout(scheduled);
    controller?.abort();
    for (const entry of pairs.values()) entry.cleanup();
  },
  { once: true },
);

window.addEventListener("pageshow", (event) => {
  if (event.persisted) {
    observer.observe(document.body, watch);
    scan();
  }
});
