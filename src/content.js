import {
  messageNodes,
  messageRole,
  completed,
  extractPair,
  title,
  snapshot,
} from "./modules/extractor.js";
import { collectHistory } from "./modules/history.js";
import { mount, menu, button, review } from "./modules/ui.js";
import { plainText } from "./modules/normalize.js";
import { getSettings } from "./modules/settings.js";
let busy = false,
  route = location.href,
  scheduled,
  controller;
const pairs = new Map();
const panel = mount(document.body, "toolbar");
const toolbar = document.createElement("div");
toolbar.className = "toolbar";
panel.shadow.append(toolbar);
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
      const keys = new Map(
        messages.map((m) => [
          m.turnIndex !== null ? `${m.turnIndex}:${m.role}` : m.id,
          m,
        ]),
      );
      for (const current of snapshot()) {
        const prior = keys.get(
          current.turnIndex !== null
            ? `${current.turnIndex}:${current.role}`
            : current.id,
        );
        if (
          !prior ||
          prior.id !== current.id ||
          plainText(prior.blocks) !== plainText(current.blocks)
        )
          throw new Error(
            "The conversation changed during review. Please retry.",
          );
      }
    }
    if (location.href !== startRoute)
      throw new Error("The conversation changed. Please retry.");
    const response = await chrome.runtime.sendMessage({
      type: "CGE_EXPORT",
      format,
      document: {
        scope,
        title: title(),
        exportedAt: new Date().toISOString(),
        messages,
      },
    });
    if (!response?.ok)
      throw new Error(
        response?.error ||
          "The extension did not respond. Refresh ChatGPT and retry.",
      );
  } catch (e) {
    feedback(e.message || "Export failed.", "error");
  } finally {
    busy = false;
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
    const ui = mount(el, "pair");
    const cleanup = menu(ui.shadow, "↓ Export this Q&A", (format) =>
      run("pair", format, el),
    );
    pairs.set(el, { ...ui, cleanup });
  }
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
