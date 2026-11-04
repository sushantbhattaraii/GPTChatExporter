import { blocks, visible, plainText } from "./normalize.js";
export const ROLE_SELECTOR =
  '[data-message-author-role="user"],[data-message-author-role="assistant"]';
export function messageNodes(root = document) {
  const main = root.querySelector("main") || root;
  return [...main.querySelectorAll(ROLE_SELECTOR)].filter(
    (el) => visible(el) && !el.parentElement?.closest(ROLE_SELECTOR),
  );
}
export function turnFor(el) {
  return el.closest('[data-testid^="conversation-turn-"],article') || el;
}
export function turnIndex(el) {
  const m = turnFor(el)
    .getAttribute("data-testid")
    ?.match(/^conversation-turn-(\d+)$/);
  return m ? Number(m[1]) : null;
}
export function isStreaming(root = document) {
  return [
    ...root.querySelectorAll(
      '[data-testid="stop-button"],[data-testid="stop-generating-button"],[data-is-streaming="true"],[aria-busy="true"][data-message-author-role]',
    ),
  ].some(visible);
}
export function completed(el, nodes = messageNodes(el.ownerDocument)) {
  if (el.dataset.messageAuthorRole === "user") return true;
  if (
    el.closest('[data-is-streaming="true"],[aria-busy="true"]') ||
    el.querySelector('[data-is-streaming="true"]')
  )
    return false;
  const idx = nodes.indexOf(el);
  if (idx === nodes.length - 1 && isStreaming(el.ownerDocument)) return false;
  const turn = turnFor(el);
  if (
    [
      ...turn.querySelectorAll(
        '[data-testid="copy-turn-action-button"],[data-testid="good-response-turn-action-button"],[data-testid="bad-response-turn-action-button"]',
      ),
    ].some(visible)
  )
    return true;
  if (
    el.dataset.isStreaming === "false" ||
    turn.dataset.isStreaming === "false"
  )
    return true;
  return nodes
    .slice(idx + 1)
    .some((n) => n.dataset.messageAuthorRole === "user");
}
export function extractMessage(el, order) {
  const role = el.dataset.messageAuthorRole;
  // Prefer the actual message body; user prompts often have no markdown wrapper.
  const body = el;
  const content = blocks(body);
  if (!content.length)
    throw new Error(
      `The ${role} message has no readable content. It may contain an unsupported rich element.`,
    );
  const media = body.querySelector("img,video,audio,canvas,iframe");
  const time = turnFor(el)
    .querySelector("time[datetime]")
    ?.getAttribute("datetime");
  return {
    role,
    id: el.getAttribute("data-message-id") || null,
    turnIndex: turnIndex(el),
    order,
    parentId: null,
    blocks: content,
    timestamp: time || null,
    hasMedia: Boolean(media),
  };
}
export function associate(messages) {
  let user = null;
  return messages.map((m) => {
    if (m.role === "user") user = m;
    if (m.role === "assistant" && !user)
      throw new Error(
        "The preceding question is not loaded. Scroll up until it appears, then retry.",
      );
    return {
      ...m,
      parentId:
        m.role === "assistant"
          ? user.id || `turn:${user.turnIndex ?? user.order}`
          : null,
    };
  });
}
export function extractPair(target, root = document) {
  const nodes = messageNodes(root),
    idx = nodes.indexOf(target);
  if (idx < 0 || !completed(target, nodes))
    throw new Error(
      "No completed response found. Wait for generation to finish.",
    );
  let u = idx - 1;
  while (u >= 0 && nodes[u].dataset.messageAuthorRole !== "user") u--;
  if (u < 0)
    throw new Error(
      "The corresponding question is not loaded. Scroll up to reveal it, then retry.",
    );
  // A virtualized gap must never pair a response with an unrelated earlier prompt.
  const a = turnIndex(nodes[u]),
    b = turnIndex(target);
  const between = nodes.slice(u, idx + 1).map(turnIndex);
  if (a !== null && b !== null && between.every((x) => x !== null)) {
    const unique = [...new Set(between)];
    for (let i = 1; i < unique.length; i++)
      if (unique[i] !== unique[i - 1] + 1)
        throw new Error(
          "There is a gap between this response and the visible question. Reveal the missing turns first.",
        );
  }
  return associate([extractMessage(nodes[u], 0), extractMessage(target, 1)]);
}
export function snapshot(root = document) {
  const nodes = messageNodes(root);
  if (!nodes.length)
    throw new Error(
      "No conversation detected. Open a ChatGPT conversation and refresh the page.",
    );
  if (nodes.some((n) => !completed(n, nodes)))
    throw new Error(
      "A response is incomplete or its completion cannot be verified. Wait for completion and retry.",
    );
  const result = nodes.map(extractMessage);
  const seen = new Map();
  return result.filter((m) => {
    if (!m.id) return true;
    const prior = seen.get(m.id);
    if (prior && plainText(prior.blocks) !== plainText(m.blocks))
      throw new Error(
        "Conflicting versions of a message are visible. Refresh the page and retry.",
      );
    if (prior) return false;
    seen.set(m.id, m);
    return true;
  });
}
export function title(root = document) {
  const selected = root.querySelector(
    'nav a[aria-current="page"],nav a[data-active="true"]',
  );
  return (
    (selected?.textContent || root.title || "ChatGPT Conversation")
      .replace(/\s*[-|–]\s*ChatGPT\s*$/, "")
      .trim() || "ChatGPT Conversation"
  );
}
