import { beginImages, endImages, embedImages } from "./modules/media.js";
import { captureAppearance, rememberPositions } from "./modules/appearance.js";
import {
  messageNodes,
  messageRole,
  mountPairHost,
  visualRoots,
  historyKey,
  completed,
  extractPair,
  title,
  snapshot,
} from "./modules/extractor.js";
import { collectHistory } from "./modules/history.js";
import { mount, menu, button, review, positionToolbar } from "./modules/ui.js";
import { plainText } from "./modules/normalize.js";
import { getSettings } from "./modules/settings.js";
let visualCapturing = false;
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
  button("Settings", () =>
    chrome.runtime.sendMessage({ type: "CGE_SETTINGS" }),
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
async function run(scope, format, target) {
  if (busy) {
    feedback("An export is already in progress.");
    return;
  }
  busy = true;
  beginImages();
  const visual = format === "appearance",
    positions = new Map();
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
        onViewport: visual
          ? (scroller) => rememberPositions(positions, scroller)
          : undefined,
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
    if (visual) {
      document.addEventListener("keydown", stop);
      visualCapturing = true;
      model.pages = await captureAppearance(messages, {
        signal: controller.signal,
        settings: await getSettings(),
        positions,
        title: model.title,
        onProgress: feedback,
      });
      model.layout = "appearance";
      model.messages = [];
    } else {
      await embedImages(messages);
    }
    if (controller.signal.aborted || location.href !== startRoute)
      throw new Error("Export cancelled or conversation changed.");
    if (JSON.stringify(model).length > 20_000_000)
      throw new Error(
        "This export exceeds the 20 MB local limit. Export smaller question–answer pairs.",
      );
    const response = await chrome.runtime.sendMessage({
      type: "CGE_EXPORT",
      format: visual ? "pdf" : format,
      document: model,
    });
    if (!response?.ok)
      throw new Error(
        response?.error ||
          "The extension did not respond. Refresh ChatGPT and retry.",
      );
  } catch (e) {
    feedback(e.message || "Export failed.", "error");
  } finally {
    endImages();
    visualCapturing = false;
    busy = false;
    scan();
    document.removeEventListener("keydown", stop);
    controller = null;
  }
}
function scan() {
  if (visualCapturing) return;
  if (route !== location.href) {
    route = location.href;
    controller?.abort();
    feedback("");
    for (const [el, entry] of pairs) {
      entry.cleanup();
      entry.host.remove();
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
      entry.host.remove();
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
    mountPairHost(el, ui.host);
    const cleanup = menu(ui.shadow, "↓ Export this Q&A", (format) =>
      run("pair", format, el),
    );
    pairs.set(el, { ...ui, cleanup, anchor: visualRoots(el).at(-1) });
  }
  for (const [el, entry] of pairs) {
    const end = visualRoots(el).at(-1);
    if (entry.anchor !== end) {
      mountPairHost(el, entry.host);
      entry.anchor = end;
    }
  }
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
const observer = new MutationObserver((records) => {
  if (
    records.every(
      (r) => r.target.nodeType === 1 && r.target.closest("[data-cge]"),
    )
  )
    return;
  if (!scheduled)
    scheduled = setTimeout(() => {
      scheduled = null;
      scan();
    }, 200);
});
observer.observe(document.body, {
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
  ],
});
document.addEventListener(
  "load",
  (e) => {
    if (e.target?.tagName === "IMG" && !scheduled)
      scheduled = setTimeout(() => {
        scheduled = null;
        scan();
      }, 150);
  },
  true,
);
scan();
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg?.type === "CGE_STATUS") {
    feedback(msg.text, msg.state);
    return;
  }
  if (msg?.type === "CGE_PROBE") {
    reply({ ok: true, messages: messageNodes().length, busy });
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
    observer.observe(document.body, {
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
      ],
    });
    scan();
  }
});
