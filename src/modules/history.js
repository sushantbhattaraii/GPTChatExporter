import {
  snapshot,
  associate,
  messageNodes,
  isStreaming,
  historyKey,
  extractMessage,
  turnFor,
  visualRoots,
} from "./extractor.js";
import { plainText } from "./normalize.js";
import { withCompleteCode } from "./code-source.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export function scrollContainer(root = document) {
  let node = messageNodes(root)[0]?.parentElement;
  while (node && node !== root.body) {
    const style = root.defaultView.getComputedStyle(node);
    if (
      /auto|scroll/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 10
    )
      return node;
    node = node.parentElement;
  }
  return root.scrollingElement || root.documentElement;
}
// Cache normalized DOM only for the current scan. Virtualized nodes, edits, lazy
// image loads and live control changes invalidate their owning turn.
function scanReader(scroller) {
  const cache = new WeakMap(),
    stamps = new WeakMap();
  let revision = 0;
  function changed(node) {
    if (node?.nodeType !== 1) node = node?.parentElement;
    if (!node || node.closest("[data-cge]")) return;
    revision++;
    for (let p = node; p; p = p.parentElement) stamps.set(p, revision);
  }
  const observer = new MutationObserver((records) =>
    records.forEach((r) => changed(r.target)),
  );
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true,
  });
  const event = (e) => changed(e.target);
  for (const name of ["load", "input", "change"])
    document.addEventListener(name, event, true);
  return {
    read() {
      observer.takeRecords().forEach((r) => changed(r.target));
      const viewport =
        scroller === document.scrollingElement
          ? { top: 0, bottom: innerHeight }
          : scroller.getBoundingClientRect();
      return snapshot(document, (el, index, nodes) => {
        const rect = el.getBoundingClientRect(),
          inView = rect.bottom > viewport.top && rect.top < viewport.bottom;
        const turn = turnFor(el),
          roots = visualRoots(el),
          version = Math.max(
            stamps.get(turn) || 0,
            ...roots.map((n) => stamps.get(n) || 0),
          );
        const prior = cache.get(el);
        if (
          prior?.turn === turn &&
          (!inView || prior.top === rect.top) &&
          prior.version === version &&
          prior.roots.length === roots.length &&
          roots.every((n, i) => n === prior.roots[i])
        )
          return { ...prior.message, order: index };
        const message = extractMessage(el, index, nodes);
        cache.set(el, {
          turn,
          roots,
          version,
          message,
          top: inView ? rect.top : null,
        });
        return message;
      });
    },
    close() {
      observer.disconnect();
      for (const name of ["load", "input", "change"])
        document.removeEventListener(name, event, true);
    },
  };
}
// Only normal page scrolling. No private endpoints or application-state access.
export async function collectHistory({
  signal,
  includeCode = true,
  onProgress = () => {},
  stallTimeout = 90000,
} = {}) {
  const route = location.href,
    scroller = scrollContainer(),
    original = scroller.scrollTop;
  const seen = new Map(),
    reader = scanReader(scroller);
  let lastProgress = Date.now(),
    bestTop = scroller.scrollTop,
    descending = false,
    lastHeight = scroller.scrollHeight;
  let previous = [];
  class ChangedDuringScan extends Error {}
  let uncertain = false,
    everUnmounted = false;
  const oldBehavior = scroller.style.scrollBehavior;
  scroller.style.scrollBehavior = "auto";
  function guard() {
    if (signal?.aborted) throw new Error("Export cancelled.");
    if (location.href !== route)
      throw new Error(
        "The conversation changed during collection. Retry on the intended conversation.",
      );

    if (isStreaming())
      throw new Error(
        "A response started streaming during collection. Wait for it to finish.",
      );
  }
  async function read() {
    guard();
    const beforeCount = seen.size;
    const current = await withCompleteCode(() => reader.read(), {
      signal,
      includeCode,
    });
    guard();
    const indexed = current.every((m) => m.turnIndex !== null);
    if (!indexed) uncertain = true;
    const keys = new Set();
    for (const m of current) {
      const key = historyKey(m);
      if (!key)
        throw new Error(
          "Stable message identifiers are unavailable. Full-history collection is unsafe; use individual export.",
        );
      keys.add(key);
      const prior = seen.get(key);
      if (
        prior &&
        (prior.turnIndex !== m.turnIndex ||
          (prior.blocks !== m.blocks &&
            plainText(prior.blocks) !== plainText(m.blocks)))
      )
        throw new ChangedDuringScan(
          "The conversation kept changing during both history scans. Finish editing or generating the reply and retry.",
        );
      // Keep the latest rendered styles when the text and identity still match.
      seen.set(key, m);
    }
    // A replacement at an occupied slot may be a branch switch. Retry from an empty
    // snapshot instead of mixing the former answer with the replacement.
    for (const old of previous) {
      if (old.turnIndex === null || keys.has(historyKey(old))) continue;
      if (
        current.some(
          (m) =>
            m.turnIndex === old.turnIndex &&
            m.role === old.role &&
            (old.unitOrder == null || m.unitOrder === old.unitOrder) &&
            !previous.some((p) => historyKey(p) === historyKey(m)),
        )
      )
        throw new ChangedDuringScan(
          "The active branch kept changing during history collection. Finish switching answers and retry.",
        );
    }
    previous = current;
    if (seen.size > keys.size) everUnmounted = true;
    if (!indexed && everUnmounted)
      throw new Error(
        "This page virtualizes messages without ordered turn identifiers. A reliable complete export is unavailable.",
      );
    const top = scroller.scrollTop,
      height = scroller.scrollHeight;
    if (
      (descending ? top > bestTop + 1 : top < bestTop - 1) ||
      height > lastHeight ||
      seen.size > beforeCount
    )
      lastProgress = Date.now();
    else if (Date.now() - lastProgress > stallTimeout)
      throw new Error(
        `The chat stopped scrolling or loading after ${seen.size} messages. Wait for it to load and retry.`,
      );
    bestTop = descending ? Math.max(bestTop, top) : Math.min(bestTop, top);
    lastHeight = Math.max(lastHeight, height);
    onProgress(
      `Collecting history… ${seen.size} messages · ${Math.min(100, Math.round((100 * (top + scroller.clientHeight)) / Math.max(1, height)))}% of current scroll range (Escape cancels)`,
    );
    return current;
  }
  async function scan() {
    descending = false;
    bestTop = scroller.scrollTop;
    lastHeight = scroller.scrollHeight;
    await read();
    // Repeat top visits because loading older messages may shift the scroll offset.
    let topStable = 0,
      last = "";
    while (topStable < 3) {
      guard();
      scroller.scrollTop = 0;
      await sleep(550);
      const ms = await read();
      const state = `${ms[0].id}:${ms.length}:${scroller.scrollHeight}`;
      topStable = state === last && scroller.scrollTop < 5 ? topStable + 1 : 0;
      last = state;
    }
    descending = true;
    bestTop = scroller.scrollTop;
    lastProgress = Date.now();
    let bottomStable = 0;
    while (bottomStable < 3) {
      guard();
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.min(
        scroller.scrollHeight,
        before + Math.max(200, scroller.clientHeight * 0.7),
      );
      await sleep(220);
      await read();
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      const edge = `${seen.size}:${scroller.scrollHeight}:${previous.at(-1)?.id}`;
      bottomStable = atBottom && edge === last ? bottomStable + 1 : 0;
      last = edge;
    }
    const result = everUnmounted ? [...seen.values()] : await read();
    if (result.every((m) => m.turnIndex !== null)) {
      result.sort(
        (a, b) =>
          a.turnIndex - b.turnIndex ||
          (a.role === b.role
            ? (a.unitOrder ?? 0) - (b.unitOrder ?? 0)
            : a.role === "user"
              ? -1
              : 1),
      );
      const ids = [...new Set(result.map((m) => m.turnIndex))];
      if (ids[0] > 1) uncertain = true;
      for (let i = 1; i < ids.length; i++)
        if (ids[i] !== ids[i - 1] + 1)
          throw new Error(
            "Missing conversation turns were detected. Scroll through the missing history and retry.",
          );
    }
    return {
      messages: associate(result.map((m, i) => ({ ...m, order: i }))),
      uncertain,
      everUnmounted,
    };
  }
  try {
    try {
      return await scan();
    } catch (error) {
      if (!(error instanceof ChangedDuringScan)) throw error;
      seen.clear();
      lastProgress = Date.now();
      previous = [];
      uncertain = false;
      everUnmounted = false;
      onProgress("The page updated. Checking the settled conversation again…");
      await sleep(350);
      return await scan();
    }
  } finally {
    reader.close();
    if (location.href === route) scroller.scrollTop = original;
    scroller.style.scrollBehavior = oldBehavior;
  }
}
