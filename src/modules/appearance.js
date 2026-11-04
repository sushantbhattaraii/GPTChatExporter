import { decodeRaster } from "./media.js";
// Export only the requested message rectangles. Unrelated UI is masked during capture.
import {
  messageNodes,
  extractMessage,
  messageIdentity,
  historyKey,
  visualRoots,
} from "./extractor.js";
import { plainText } from "./normalize.js";
import { scrollContainer } from "./history.js";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const layOut = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)),
  );
function limits(el) {
  let top = 0,
    left = 0,
    bottom = innerHeight,
    right = innerWidth;
  for (
    let p = el.parentElement;
    p && p !== document.body;
    p = p.parentElement
  ) {
    const style = getComputedStyle(p),
      r = p.getBoundingClientRect();
    if (/auto|scroll|hidden|clip/.test(style.overflowY)) {
      top = Math.max(top, r.top + p.clientTop);
      bottom = Math.min(bottom, r.top + p.clientTop + p.clientHeight);
    }
    if (/auto|scroll|hidden|clip/.test(style.overflowX)) {
      left = Math.max(left, r.left + p.clientLeft);
      right = Math.min(right, r.left + p.clientLeft + p.clientWidth);
    }
  }
  return { top, left, bottom, right };
}
function visibleSurfaces(el) {
  const r = el.getBoundingClientRect();
  if (r.width >= 1 && r.height >= 1) return [el];
  if (getComputedStyle(el).display === "contents") {
    if (
      [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())
    )
      throw new Error(
        "This message has unbounded text. Use the formatted PDF.",
      );
    return [...el.children]
      .filter((n) => !n.hasAttribute("data-cge"))
      .flatMap(visibleSurfaces);
  }
  return [];
}
export function rememberPositions(positions, scroller) {
  for (const el of messageNodes()) {
    const key = historyKey(messageIdentity(el));
    const r = el.getBoundingClientRect();
    const offset =
      scroller === document.scrollingElement
        ? 0
        : scroller.getBoundingClientRect().top + scroller.clientTop;
    if (key) positions.set(key, scroller.scrollTop + r.top - offset);
  }
}
function pageComposer(settings) {
  const pw = settings.orientation === "landscape" ? 842 : 595,
    ph = settings.orientation === "landscape" ? 595 : 842;
  const w = Math.round((pw - settings.margin * 2) * 2),
    h = Math.round((ph - settings.margin * 2) * 2);
  const page = document.createElement("canvas");
  page.width = w;
  page.height = h;
  const ctx = page.getContext("2d");
  const pages = [];
  let y = 0,
    bytes = 0;
  function reset() {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, w, h);
    y = 0;
  }
  function flush() {
    if (!y) return;
    const data = page.toDataURL("image/jpeg", 0.96);
    bytes += data.length;
    if (bytes > 18_000_000)
      throw new Error(
        "This visual PDF exceeds the local size limit. Export a smaller range using the Q&A buttons.",
      );
    pages.push(data);
    reset();
  }
  reset();
  return {
    label(text) {
      if (y + 68 >= h) flush();
      ctx.fillStyle = "#334155";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(text, 0, y + 21, w);
      y += 32;
    },
    tile(screenshot, sx, sy, sw, sh, dx, dw, dh) {
      let consumed = 0;
      while (consumed < dh - 0.001) {
        if (h - y < 1) flush();
        const n = Math.min(dh - consumed, h - y);
        ctx.drawImage(
          screenshot,
          sx,
          sy + (sh * consumed) / dh,
          sw,
          (sh * n) / dh,
          dx,
          y,
          dw,
          n,
        );
        consumed += n;
        y += n;
      }
    },
    space() {
      y = Math.min(h, y + 15);
    },
    finish() {
      flush();
      return pages;
    },
    width: w,
  };
}
export async function captureAppearance(
  messages,
  { signal, settings, positions, title, onProgress },
) {
  const route = location.href,
    scroller = scrollContainer(),
    original = scroller.scrollTop;
  const oldBehavior = scroller.style.scrollBehavior;
  const pages = pageComposer(settings);
  const transcript = document.querySelector("main") || document.body;
  const viewportWidth = innerWidth,
    viewportHeight = innerHeight;
  const transcriptRect = transcript.getBoundingClientRect();
  const left = Math.max(0, transcriptRect.left),
    right = Math.min(innerWidth, transcriptRect.right);
  const scale = pages.width / Math.max(1, right - left);
  const token = crypto.randomUUID(),
    attr = "data-cge-visual-target";
  const shield = document.createElement("style");
  const selected = `[${attr}="${token}"]`;
  shield.textContent = `body *:not(${selected},${selected} *,:has(${selected})){visibility:hidden!important;opacity:0!important} [data-cge],.turn-action-controls{display:none!important}`;
  if (!settings.includeCode)
    shield.textContent += ` ${selected} pre{display:none!important}`;
  const probe = document.createElement("span");
  const marked = new Set();

  function guard() {
    if (signal?.aborted) throw new Error("Visual export cancelled.");
    if (
      location.href !== route ||
      !scroller.isConnected ||
      document.visibilityState === "hidden"
    )
      throw new Error(
        "The active chat changed during visual export. Return to the chat and retry.",
      );
    if (innerWidth !== viewportWidth || innerHeight !== viewportHeight)
      throw new Error("The viewport changed size. Retry the visual export.");
  }
  function locate(m) {
    const key = historyKey(m);
    if (!key)
      throw new Error(
        "A stable message identity is required for visual export.",
      );
    return messageNodes().find((n) => historyKey(messageIdentity(n)) === key);
  }
  function unmark() {
    for (const n of marked) n.removeAttribute(attr);
    marked.clear();
  }
  try {
    scroller.style.scrollBehavior = "auto";
    if (settings.includeTitle) pages.label(title || "ChatGPT");
    if (settings.includeTimestamps)
      pages.label("Exported " + new Date().toLocaleString());
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === "user" && !settings.includeUsers) continue;
      guard();
      unmark();
      shield.remove();
      let el = locate(m);
      if (!el) {
        const pos = positions.get(historyKey(m));
        if (pos == null)
          throw new Error(
            "A requested message is no longer loaded. Reveal it and retry.",
          );
        scroller.scrollTop = pos;
        for (let n = 0; n < 8 && !el; n++) {
          await sleep(125);
          guard();
          el = locate(m);
        }
      }
      if (
        !el ||
        plainText(extractMessage(el, 0).blocks) !== plainText(m.blocks)
      )
        throw new Error(
          "A message changed while preparing its visual export. Retry.",
        );
      onProgress(
        `Capturing message ${i + 1} of ${messages.length}… Escape cancels.`,
      );
      pages.label(
        (m.role === "user" ? "USER" : "CHATGPT") +
          (settings.includeTimestamps && m.timestamp
            ? " · " + m.timestamp
            : ""),
      );
      const roots = visualRoots(el).flatMap(visibleSurfaces);
      if (!roots.length)
        throw new Error(
          "A message has no visible capture surface. Reveal it and retry.",
        );
      for (const part of roots) {
        unmark();
        part.setAttribute(attr, token);
        marked.add(part);
        if (!shield.isConnected) document.head.append(shield);
        if (!probe.isConnected) document.body.append(probe);
        if (getComputedStyle(probe).opacity !== "0")
          throw new Error(
            "The page could not isolate the selected message for capture.",
          );
        const start = part.getBoundingClientRect();
        if (start.width < 1 || start.height < 1) continue;
        let captured = 0;
        while (captured < start.height - 0.75) {
          guard();
          if (!part.isConnected)
            throw new Error(
              "The page unloaded a message during visual capture. Try the formatted PDF.",
            );
          const before = part.getBoundingClientRect(),
            clip = limits(part);
          scroller.scrollTop += before.top + captured - clip.top;
          await layOut();
          guard();
          const r = part.getBoundingClientRect(),
            v = limits(part);
          if (Math.abs(r.height - start.height) > 2)
            throw new Error(
              "A message resized during visual capture. Let its images finish loading, then retry.",
            );
          const x = Math.max(r.left, v.left, left),
            x2 = Math.min(r.right, v.right, right),
            y = r.top + captured;
          const available = Math.min(v.bottom - y, start.height - captured);
          if (y < v.top - 2 || available < 0.75 || x2 - x < 1)
            throw new Error(
              "The message cannot be fully exposed in this viewport. Expand it or use formatted PDF.",
            );
          const shot = await chrome.runtime.sendMessage({ type: "CGE_SCREEN" });
          if (!shot?.ok)
            throw new Error(
              shot?.error || "Chrome could not capture this tab.",
            );
          guard();
          const after = part.getBoundingClientRect();
          if (
            !part.isConnected ||
            Math.abs(after.top - r.top) > 1 ||
            Math.abs(after.left - r.left) > 1 ||
            Math.abs(after.height - r.height) > 1
          )
            throw new Error(
              "The page moved during visual capture. Retry without scrolling.",
            );
          const img = await decodeRaster(shot.data),
            px = img.width / innerWidth,
            py = img.height / innerHeight;
          try {
            pages.tile(
              img,
              x * px,
              Math.max(0, y) * py,
              (x2 - x) * px,
              available * py,
              (x - left) * scale,
              (x2 - x) * scale,
              available * scale,
            );
          } finally {
            img.close();
          }
          captured += available;
        }
      }
      unmark();
      shield.remove();
      guard();
      const current = locate(m);
      if (
        !current ||
        plainText(extractMessage(current, 0).blocks) !== plainText(m.blocks)
      )
        throw new Error(
          "The message changed during visual capture. Please retry.",
        );
      pages.space();
    }
    return pages.finish();
  } finally {
    unmark();
    probe.remove();
    shield.remove();
    if (location.href === route) scroller.scrollTop = original;
    scroller.style.scrollBehavior = oldBehavior;
  }
}
