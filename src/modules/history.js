import { snapshot, associate, messageNodes, isStreaming } from "./extractor.js";
import { plainText } from "./normalize.js";
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
  return root.scrollingElement;
}
// Only normal page scrolling. No private endpoints or application-state access.
export async function collectHistory({
  signal,
  onProgress = () => {},
  timeout = 45000,
} = {}) {
  const route = location.href,
    scroller = scrollContainer(),
    original = scroller.scrollTop;
  const start = Date.now(),
    seen = new Map();
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
    if (Date.now() - start > timeout)
      throw new Error(
        "History collection exceeded 45 seconds. Scroll to load older messages and retry, or export individual pairs.",
      );
    if (isStreaming())
      throw new Error(
        "A response started streaming during collection. Wait for it to finish.",
      );
  }
  function read() {
    guard();
    const current = snapshot();
    const indexed = current.every((m) => m.turnIndex !== null);
    if (!indexed) uncertain = true;
    const keys = new Set();
    for (const m of current) {
      const key = m.turnIndex !== null ? `${m.turnIndex}:${m.role}` : m.id;
      if (!key)
        throw new Error(
          "Stable message identifiers are unavailable. Full-history collection is unsafe; use individual export.",
        );
      keys.add(key);
      const prior = seen.get(key);
      if (
        prior &&
        (prior.id !== m.id || plainText(prior.blocks) !== plainText(m.blocks))
      )
        throw new Error(
          "A prompt or response changed while collecting. Wait for the page to settle and retry.",
        );
      if (!prior) seen.set(key, m);
    }
    if ([...seen.keys()].some((k) => !keys.has(k))) everUnmounted = true;
    if (!indexed && everUnmounted)
      throw new Error(
        "This page virtualizes messages without ordered turn identifiers. A reliable complete export is unavailable.",
      );
    onProgress(`Collecting history… ${seen.size} messages (Escape cancels)`);
    return current;
  }
  try {
    read();
    // Repeat top visits because loading older messages may shift the scroll offset.
    let topStable = 0,
      last = "";
    while (topStable < 3) {
      guard();
      scroller.scrollTop = 0;
      await sleep(550);
      const ms = read();
      const state = `${ms[0].id}:${ms.length}:${scroller.scrollHeight}`;
      topStable = state === last && scroller.scrollTop < 5 ? topStable + 1 : 0;
      last = state;
    }
    let bottomStable = 0;
    while (bottomStable < 3) {
      guard();
      const before = scroller.scrollTop;
      scroller.scrollTop = Math.min(
        scroller.scrollHeight,
        before + Math.max(200, scroller.clientHeight * 0.7),
      );
      await sleep(350);
      read();
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
      bottomStable = atBottom ? bottomStable + 1 : 0;
    }
    const result = [...seen.values()];
    if (result.every((m) => m.turnIndex !== null)) {
      result.sort(
        (a, b) => a.turnIndex - b.turnIndex || (a.role === "user" ? -1 : 1),
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
  } finally {
    if (location.href === route) scroller.scrollTop = original;
    scroller.style.scrollBehavior = oldBehavior;
  }
}
