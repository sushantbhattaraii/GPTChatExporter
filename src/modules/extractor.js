import { blocks, visible, plainText } from "./normalize.js";
export const ROLE_SELECTOR =
  '[data-message-author-role="user"],[data-message-author-role="assistant"]';
const unitAttrs = [
  "data-content-search-unit-key",
  "data-chatgpt-search-unit-key",
];
const unitSelector = unitAttrs
  .flatMap((attr) =>
    ["user", "assistant"].map((role) => `[${attr}$=":${role}"]`),
  )
  .join(",");
const turnSelector =
  '[data-turn-key],[data-chatgpt-search-turn-key],[data-content-search-turn-key],[data-testid^="conversation-turn-"],article';
const modernBody = '[data-markdown-text-style="assistant-message"]';
const userBubble = '[data-user-message-bubble="true"]';
const roleContainer =
  '[data-conversation-role="assistant"],[data-conversation-role="user"]';
const roleHeading = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
const unitKey = (el) =>
  unitAttrs.map((attr) => el.getAttribute(attr)).find(Boolean);
export function messageRole(el) {
  if (el.hasAttribute("data-message-author-role"))
    return el.dataset.messageAuthorRole;
  const key = unitKey(el);
  if (key && /:(user|assistant)$/.test(key)) return key.split(":").at(-1);
  if (el.matches(userBubble)) return "user";
  if (el.matches(modernBody)) return "assistant";
  return el.dataset.conversationRole || el.dataset.turn;
}
export function messageNodes(root = document) {
  // Prefer authoritative message bodies, then explicitly role-labelled search units.
  // A combined turn can contain both roles. Never export the combined wrapper twice.
  const candidates = new Set(),
    ancestors = new Set();
  const groups = [
    ROLE_SELECTOR,
    unitSelector,
    roleContainer,
    userBubble,
    modernBody,
    '[data-turn="user"],[data-turn="assistant"]',
  ];
  for (const group of groups)
    for (const el of root.querySelectorAll(group)) {
      if (
        ancestors.has(el) ||
        el.matches(roleHeading) ||
        !visible(el) ||
        el.closest('nav,aside,dialog,form,[role="navigation"]')
      )
        continue;
      if (
        (group === modernBody || group === userBubble) &&
        !el.closest(turnSelector + "," + unitSelector)
      )
        continue;
      let nested = false;
      for (let p = el; p; p = p.parentElement)
        if (candidates.has(p)) {
          nested = true;
          break;
        }
      if (nested) continue;
      candidates.add(el);
      for (let p = el.parentElement; p; p = p.parentElement) ancestors.add(p);
    }
  return [...candidates].sort((a, b) =>
    a.compareDocumentPosition(b) & 4 ? -1 : 1,
  );
}
export function turnFor(el) {
  return el.closest(turnSelector) || el;
}
export function turnIndex(el) {
  const turn = turnFor(el);
  const legacy = turn
    .getAttribute("data-testid")
    ?.match(/^conversation-turn-(\d+)$/);
  const numbered =
    legacy ||
    (
      turn.dataset.turnKey ||
      turn.dataset.chatgptSearchTurnKey ||
      turn.dataset.contentSearchTurnKey ||
      unitKey(el) ||
      ""
    ).match(/^fallback-turn-(\d+)(?::|$)/);
  return numbered ? Number(numbered[1]) : null;
}
export function isStreaming(root = document) {
  return [
    ...root.querySelectorAll(
      '[data-testid="stop-button"],[data-testid="stop-generating-button"],button[aria-label="Stop generating" i],button[aria-label="Stop streaming" i],form[data-chatgpt-composer] button[aria-label="Stop" i],[data-is-streaming="true"],[aria-busy="true"][data-message-author-role]',
    ),
  ].some(visible);
}
export function completed(el, nodes = messageNodes(el.ownerDocument)) {
  if (messageRole(el) === "user") return true;
  if (
    el.closest('[data-is-streaming="true"],[aria-busy="true"]') ||
    el.querySelector('[data-is-streaming="true"]')
  )
    return false;
  const idx = nodes.indexOf(el);
  if (idx === nodes.length - 1 && isStreaming(el.ownerDocument)) return false;
  const turn = turnFor(el);
  const followsAnswer = (action) => {
    if (action.closest("pre,code,[data-code-block-controls]")) return false;
    if (
      action.matches('button[aria-label="Copy" i]') &&
      !action.dataset.testid &&
      !action.closest(".turn-action-controls")
    ) {
      // A bare Copy is valid only in the footer following a bounded rollout answer.
      if (
        !turn.matches(
          "[data-turn-key],[data-chatgpt-search-turn-key],[data-content-search-turn-key]",
        ) ||
        el.contains(action) ||
        action.closest(
          ".markdown,[data-markdown-text-style],[data-user-message-bubble]",
        )
      )
        return false;
    }
    if (el.contains(action)) return true;
    if (!(el.compareDocumentPosition(action) & 4)) return false;
    const next = nodes[idx + 1];
    return !next || Boolean(action.compareDocumentPosition(next) & 4);
  };
  if (
    [
      ...turn.querySelectorAll(
        '[data-testid="copy-turn-action-button"],[data-testid="good-response-turn-action-button"],[data-testid="bad-response-turn-action-button"],.turn-action-controls button,button[aria-label="Copy response" i],button[aria-label="Copy answer" i],button[aria-label="Copy" i]',
      ),
    ].some((action) => visible(action) && followsAnswer(action))
  )
    return true;
  if (
    el.dataset.isStreaming === "false" ||
    turn.dataset.isStreaming === "false"
  )
    return true;
  return nodes.slice(idx + 1).some((n) => messageRole(n) === "user");
}
export function extractMessage(el, order) {
  const role = messageRole(el);
  // Prefer the actual message body; user prompts often have no markdown wrapper.
  const body = role === "user" ? el.querySelector(userBubble) || el : el;
  const content = blocks(body);
  if (!content.length)
    throw new Error(
      `The ${role} message has no readable content. It may contain an unsupported rich element.`,
    );
  const media = body.querySelector("img,video,audio,canvas,iframe");
  const time = turnFor(el)
    .querySelector("time[datetime]")
    ?.getAttribute("datetime");
  const key = unitKey(el.closest(unitSelector) || el);
  const unit = key?.match(/^(.+):(\d+):(user|assistant)$/);
  const group =
    turnFor(el).dataset.turnKey ||
    turnFor(el).dataset.chatgptSearchTurnKey ||
    turnFor(el).dataset.contentSearchTurnKey ||
    unit?.[1] ||
    null;
  return {
    role,
    group,
    // An answer later in an explicitly grouped turn must use the prompt in that group.
    requiresSameGroup:
      role === "assistant" && Boolean(unit && Number(unit[2]) > 0),
    id:
      el.dataset.messageId ||
      unitKey(el) ||
      unitKey(el.closest(unitSelector) || el) ||
      (turnFor(el).dataset.turnKey || turnFor(el).dataset.turnId
        ? `${turnFor(el).dataset.turnKey || turnFor(el).dataset.turnId}:${role}`
        : null),
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
    if (m.requiresSameGroup && m.group !== user?.group)
      throw new Error(
        "The question from this response’s turn is not loaded. Scroll upward to reveal it and retry.",
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
  while (u >= 0 && messageRole(nodes[u]) !== "user") u--;
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
