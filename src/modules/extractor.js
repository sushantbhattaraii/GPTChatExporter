import { liftImages, meaningfulImage, imageRef, imageSource } from "./media.js";
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
const generatedCard =
  '[data-testid*="imagegen" i],[data-testid*="image-gen" i],[data-testid*="generated-image" i],[data-generated-image],[data-content-search-unit-key$=":tool"],[data-chatgpt-search-unit-key$=":tool"],[class*="imagegen" i],[data-testid*="image-generation" i],[data-testid*="image-output" i],[data-message-author-role="tool"],[data-turn="tool"],[data-testid*="image_generation" i]';
const generatedImgs =
  'img[alt^="generated image" i],img[alt^="image generated" i],' +
  generatedCard
    .split(",")
    .map((k) => k + " img")
    .join(",");
let adoptedTurns = new WeakMap();
let extraImages = new WeakMap(),
  imageRoots = new WeakSet();
export function visualRoots(el) {
  return [el, ...(extraImages.get(el) || [])].sort((a, b) =>
    a.compareDocumentPosition(b) & 4 ? -1 : 1,
  );
}
function imageVisible(img) {
  if (!meaningfulImage(img)) return false;
  const turn = img.closest(turnSelector);
  if (turn && !visible(turn)) return false;
  const scope = img.closest(ROLE_SELECTOR + "," + unitSelector);
  if (scope && !visible(scope)) return false;
  for (let n = img; n; n = n.parentElement) {
    const css = getComputedStyleFor(n);
    if (
      css.display === "none" ||
      css.visibility === "hidden" ||
      css.contentVisibility === "hidden" ||
      Number.parseFloat(css.opacity) === 0
    )
      return false;
    if (
      n !== img &&
      n.getAttribute("aria-hidden") === "true" &&
      !n.closest(generatedCard) &&
      (!turn ||
        !turn.contains(n) ||
        n === turn ||
        n.querySelector(ROLE_SELECTOR + "," + unitSelector))
    )
      return false;
  }
  return true;
}
function getComputedStyleFor(el) {
  return el.ownerDocument.defaultView.getComputedStyle(el);
}
const surfaces = "img,canvas,[role=img],[style*=background]," + generatedCard;
function rasterSurface(el) {
  return el.tagName === "IMG" || el.tagName === "CANVAS" || !!imageSource(el);
}
function mediaIn(el) {
  return visualRoots(el)
    .flatMap((n) => [n, ...n.querySelectorAll(surfaces)])
    .filter((n) => n.matches(surfaces) && rasterSurface(n) && imageVisible(n));
}
function large(el) {
  const r = el.getBoundingClientRect();
  return (
    Math.min(r.width, r.height) >= 48 ||
    Math.min(el.naturalWidth || 0, el.naturalHeight || 0) >= 96
  );
}
function ready(el) {
  return el.tagName === "IMG" ? el.complete && el.naturalWidth > 0 : large(el);
}
export function pairImage(el) {
  return mediaIn(el).at(-1) || null;
}
const slots = new WeakMap();
export function removePairHost(host) {
  slots.get(host)?.remove();
  slots.delete(host);
  host.remove();
}
export function mountPairHost(el, host, image) {
  const end = visualRoots(el).at(-1),
    turn = turnFor(el);
  if (image) {
    let anchor = turn.contains(end) ? turn : end;
    if (!turn.contains(end))
      while (
        anchor.parentElement &&
        !anchor.parentElement.contains(turn) &&
        !anchor.parentElement.matches("main,body,[role=main]")
      )
        anchor = anchor.parentElement;
    let slot = slots.get(host);
    if (!slot) {
      slot = document.createElement("div");
      slot.dataset.cge = "image-action-row";
      slot.style.cssText = "display:block;min-height:36px;";
      slots.set(host, slot);
    }
    anchor.after(slot);
    slot.append(host);
    host.style.cssText = "display:block";
    return;
  }
  slots.get(host)?.remove();
  slots.delete(host);
  host.style.cssText = "";
  if (el.closest('button,[role="button"],picture'))
    el.closest('button,[role="button"],picture').after(host);
  else el.append(host);
}
// When an outer fixed-height layout clips the flow row, pin the same control to the visible image.
function exposed(el) {
  const r = el.getBoundingClientRect();
  let top = Math.max(r.top, 0),
    bottom = Math.min(r.bottom, innerHeight),
    left = Math.max(r.left, 0),
    right = Math.min(r.right, innerWidth);
  for (
    let p = el.parentElement;
    p && p !== document.body;
    p = p.parentElement
  ) {
    const style = getComputedStyleFor(p);
    if (style.display === "contents") continue;
    const b = p.getBoundingClientRect();
    if (/hidden|clip|auto|scroll/.test(style.overflowY)) {
      top = Math.max(top, b.top + p.clientTop);
      bottom = Math.min(bottom, b.top + p.clientTop + p.clientHeight);
    }
    if (/hidden|clip|auto|scroll/.test(style.overflowX)) {
      left = Math.max(left, b.left + p.clientLeft);
      right = Math.min(right, b.left + p.clientLeft + p.clientWidth);
    }
  }
  return { top, bottom, left, right };
}
export function updateImageControl(image, host) {
  const slot = slots.get(host);
  if (!slot?.isConnected || !image?.isConnected) return;
  const row = exposed(slot),
    pic = exposed(image);
  if (
    (row.bottom - row.top >= 32 && row.right - row.left >= 115) ||
    pic.bottom - pic.top < 12 ||
    pic.right - pic.left < 30
  ) {
    if (host.parentElement !== slot) {
      slot.append(host);
      host.style.cssText = "display:block";
    }
    return;
  }
  if (host.parentElement !== document.body) document.body.append(host);
  host.style.cssText = `position:fixed;display:block;z-index:2147483645;left:${Math.max(4, Math.min(pic.left, innerWidth - 160))}px;top:${Math.max(4, Math.min(pic.bottom - 4, innerHeight - host.offsetHeight - 8))}px`;
}
function adjacentTurn(img, nodes) {
  // Walk out through wrappers and look through empty spacers, not through a different reply.
  const main =
    img.closest("main,[role=main],#thread") || img.ownerDocument.body;
  for (let card = img; card && card !== main; card = card.parentElement) {
    for (
      let prev = card.previousElementSibling;
      prev;
      prev = prev.previousElementSibling
    ) {
      if (prev.matches("[data-cge],script,style,[hidden]")) continue;
      const last = nodes.filter((n) => prev === n || prev.contains(n)).at(-1);
      if (last) return turnFor(last);
      if (prev.matches(turnSelector)) return null;
      if (
        /^(?:image created|generated image|image generated|chatgpt said)[:.!\s]*$/i.test(
          prev.textContent.trim(),
        )
      )
        continue;
      if (
        !prev.textContent.trim() &&
        !prev.querySelector("img,iframe,canvas,video")
      )
        continue;
      return null;
    }
  }
  return null;
}
export function messageRole(el) {
  if (imageRoots.has(el)) return "assistant";
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
  adoptedTurns = new WeakMap();
  extraImages = new WeakMap();
  imageRoots = new WeakSet();
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

  // Image generation may render a tool card beside an empty assistant text root.
  // Associate it only within its own chat turn. Never adopt an image from a prompt.
  for (const img of root.querySelectorAll(surfaces)) {
    if (!rasterSurface(img)) continue;
    if (
      !imageVisible(img) ||
      img.closest(
        userBubble +
          ',[data-turn="user"],[data-message-author-role="user"],[data-conversation-role="user"],[data-testid*="attachment" i]',
      )
    )
      continue;
    const list = [...candidates];
    if (list.some((el) => el.contains(img))) continue;
    const marked =
      img.matches(generatedImgs) ||
      img.closest(
        '[data-message-author-role="tool"],[data-role="assistant"],[data-turn="assistant"]',
      );
    if (!marked && !large(img)) continue;
    const ownTurn = img.closest(turnSelector);
    const turn = ownTurn || adjacentTurn(img, list);
    if (!turn) continue;
    // For unlabelled media, require a transcript boundary and an actual earlier message.
    if (
      !marked &&
      !list.some(
        (el) => turnFor(el) === turn && el.compareDocumentPosition(img) & 4,
      )
    ) {
      const previous = adjacentTurn(img, list);
      if (
        !ownTurn ||
        !previous ||
        !list.some(
          (el) => turnFor(el) === previous && messageRole(el) === "user",
        )
      )
        continue;
    }
    const peers = [...candidates].filter((el) => turnFor(el) === turn);
    const before = peers
      .filter((el) => el.compareDocumentPosition(img) & 4)
      .at(-1);
    const next = peers.find((el) => img.compareDocumentPosition(el) & 4);
    const owner =
      before && messageRole(before) === "assistant"
        ? before
        : next && messageRole(next) === "assistant"
          ? next
          : null;
    if (owner) {
      extraImages.set(owner, [...(extraImages.get(owner) || []), img]);
      continue;
    }
    const root =
      img.closest(
        unitAttrs.map((attr) => "[" + attr + "]").join(",") +
          "," +
          generatedCard,
      ) ||
      img.closest("button") ||
      img;
    let candidate = root;
    if (candidate.contains(turn) || peers.some((n) => candidate.contains(n)))
      candidate = img.closest("picture,button") || img;
    if (candidate.contains(turn) || peers.some((n) => candidate.contains(n)))
      continue;
    adoptedTurns.set(candidate, turn);
    extraImages.delete(candidate);
    imageRoots.add(candidate);
    candidates.add(candidate);
  }
  return [...candidates].sort((a, b) =>
    a.compareDocumentPosition(b) & 4 ? -1 : 1,
  );
}
export function turnFor(el) {
  return el.closest(turnSelector) || adoptedTurns.get(el) || el;
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
  // A grouped answer can have multiple assistant units followed by one shared footer.
  // Only the final sibling can establish completion for the group.
  let last = idx;
  while (
    last >= 0 &&
    last + 1 < nodes.length &&
    messageRole(nodes[last + 1]) === "assistant" &&
    turnFor(nodes[last + 1]) === turn
  )
    last++;
  if (last > idx) return completed(nodes[last], nodes);
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
  const images = mediaIn(el);
  if (
    images.length &&
    images.every(ready) &&
    (imageRoots.has(el) ||
      images.some((img) => img.matches(generatedImgs) || large(img)) ||
      !el.textContent.trim()) &&
    !isStreaming(el.ownerDocument) &&
    ![
      ...turn.querySelectorAll(
        '[aria-busy="true"],[data-is-streaming="true"],[role="progressbar"]',
      ),
    ].some(visible)
  )
    return true;
  if (
    el.dataset.isStreaming === "false" ||
    turn.dataset.isStreaming === "false"
  )
    return true;
  return nodes.slice(idx + 1).some((n) => messageRole(n) === "user");
}
export function messageIdentity(el) {
  const role = messageRole(el);
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
    unitKey: key || null,
    unitOrder: unit ? Number(unit[2]) : null,
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
  };
}
export function extractMessage(el, order) {
  const role = messageRole(el);
  // Prefer the actual message body; user prompts often have no markdown wrapper.
  const body = role === "user" ? el.querySelector(userBubble) || el : el;
  const roots = role === "assistant" ? visualRoots(el) : [body];
  const content = liftImages(
    roots.flatMap((node) => {
      if (node.matches("img"))
        return [{ type: "paragraph", runs: [imageRef(node)] }];
      return blocks(node);
    }),
  );
  // aria-hidden on the bitmap itself is common when a parent button supplies its label.
  // Recover visually painted images that the ordinary accessibility filter skipped.
  const present = new Set();
  function known(bs) {
    for (const b of bs) {
      if (b.image) present.add(b.image.key);
      if (b.blocks) known(b.blocks);
      if (b.items) b.items.forEach(known);
      if (b.rows) b.rows.forEach((row) => row.forEach((c) => known(c.blocks)));
    }
  }
  known(content);
  for (const img of role === "assistant" ? mediaIn(el) : []) {
    const ref = imageRef(img);
    if (!present.has(ref.image.key)) {
      content.push({ type: "image", ...ref });
      present.add(ref.image.key);
    }
  }
  const rich = roots.some(
    (n) =>
      n.matches("img,canvas,iframe,video,audio,svg") ||
      n.querySelector("img,canvas,iframe,video,audio,svg"),
  );
  if (!content.length && rich)
    content.push({
      type: "paragraph",
      runs: [
        {
          text: "[Visual content – use PDF as shown for its displayed appearance.]",
        },
      ],
    });
  if (!content.length)
    throw new Error(
      `The ${role} message has no readable content. It may contain an unsupported rich element.`,
    );

  const time = turnFor(el)
    .querySelector("time[datetime]")
    ?.getAttribute("datetime");
  return {
    ...messageIdentity(el),
    order,
    parentId: null,
    blocks: content,
    timestamp: time || null,
    hasMedia: rich,
    hasInteractive: roots.some(
      (n) =>
        n.querySelector("canvas,iframe,video,audio") ||
        n.matches("canvas,iframe,video,audio"),
    ),
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
// Several assistant units can occupy one turn. A turn/role pair is only a last resort.
export function historyKey(message) {
  if (message.unitKey)
    return JSON.stringify([message.role, "unit", message.unitKey]);
  if (message.id) return JSON.stringify([message.role, "id", message.id]);
  if (message.turnIndex !== null)
    return JSON.stringify([message.role, "turn", message.turnIndex]);
  return null;
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
    const key = historyKey(m);
    if (!key) return true;
    const prior = seen.get(key);
    if (prior && plainText(prior.blocks) !== plainText(m.blocks))
      throw new Error(
        "Conflicting versions of a message are visible. Refresh the page and retry.",
      );
    if (prior) return false;
    seen.set(key, m);
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
