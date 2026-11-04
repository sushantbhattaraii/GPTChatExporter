(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __esm = (fn, res) => function __init() {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // src/modules/normalize.js
  var normalize_exports = {};
  __export(normalize_exports, {
    blocks: () => blocks,
    inline: () => inline,
    plainText: () => plainText,
    safeLink: () => safeLink,
    visible: () => visible
  });
  function safeLink(value, base = "https://chatgpt.com/") {
    try {
      const u = new URL(value, base);
      return ["https:", "http:", "mailto:"].includes(u.protocol) ? u.href : void 0;
    } catch {
      return void 0;
    }
  }
  function visible(el) {
    if (el.nodeType !== 1) return true;
    if (el.closest('[hidden],[aria-hidden="true"],template,[data-cge]'))
      return false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (!("style" in n)) continue;
      const s = n.ownerDocument.defaultView.getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || s.contentVisibility === "hidden")
        return false;
    }
    return true;
  }
  function equation(el) {
    const tex = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent || el.getAttribute("data-math") || el.getAttribute("data-latex");
    if (tex) return { text: tex };
    const math = el.matches("math") ? el : el.querySelector("math");
    if (!math) return { text: el.textContent };
    const safe = math.cloneNode(true);
    safe.querySelectorAll("annotation,annotation-xml,mglyph,script,style,maction").forEach((n) => n.remove());
    for (const n of [safe, ...safe.querySelectorAll("*")]) {
      for (const a of [...n.attributes])
        if (![
          "display",
          "mathvariant",
          "stretchy",
          "fence",
          "accent",
          "accentunder",
          "columnalign",
          "rowalign",
          "linethickness",
          "movablelimits"
        ].includes(a.name))
          n.removeAttribute(a.name);
    }
    return { text: safe.textContent, mathml: safe.outerHTML };
  }
  function textRuns(text, style) {
    if (style.code) return [{ text, ...style }];
    const pattern = /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|(?<![\\\w$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\d$])/g;
    const runs = [];
    let pos = 0;
    for (const match of text.matchAll(pattern)) {
      if (match[4] && (!/[A-Za-z\\^_=+<>]/.test(match[4]) || /^\d[\s\S]*\b(and|or|to)\b/.test(match[4])))
        continue;
      if (match.index > pos)
        runs.push({ text: text.slice(pos, match.index), ...style });
      runs.push({
        text: match[0],
        ...style,
        math: true,
        display: !!(match[1] || match[3])
      });
      pos = match.index + match[0].length;
    }
    if (pos < text.length) runs.push({ text: text.slice(pos), ...style });
    return runs;
  }
  function inline(node, style = {}) {
    if (node.nodeType === 3) {
      const parent = node.parentElement;
      const preserve = parent && (/pre|break-spaces/.test(
        parent.ownerDocument.defaultView.getComputedStyle(parent).whiteSpace
      ) || parent.closest(
        '[data-message-author-role="user"],[data-user-message-bubble="true"],[data-turn="user"]'
      ));
      return textRuns(
        preserve ? node.textContent : node.textContent.replace(/\s+/g, " "),
        style
      );
    }
    if (node.nodeType !== 1 || !visible(node) || node.matches(OMIT)) return [];
    if (node.matches(".katex-display"))
      return [{ ...equation(node), ...style, math: true, display: true }];
    if (node.matches(equationSelector)) {
      const eq = equation(node);
      return [{ ...eq, text: `\\(${eq.text}\\)`, ...style, math: true }];
    }
    if (node.tagName === "BR") return [{ text: "\n", ...style }];
    if (node.tagName === "IMG")
      return [
        {
          text: `[Image: ${node.alt || "no text description"}]`,
          ...style,
          italic: true
        }
      ];
    const next = { ...style };
    if (["STRONG", "B"].includes(node.tagName)) next.bold = true;
    if (["EM", "I"].includes(node.tagName)) next.italic = true;
    if (["S", "DEL"].includes(node.tagName)) next.strike = true;
    if (node.tagName === "CODE") next.code = true;
    if (node.tagName === "SUP") next.sup = true;
    if (node.tagName === "SUB") next.sub = true;
    if (node.tagName === "A")
      next.link = safeLink(node.getAttribute("href"), node.ownerDocument.URL);
    return [...node.childNodes].flatMap((n) => inline(n, next));
  }
  function trimmed(runs) {
    const r = runs.filter((x) => x.text !== "");
    if (r.length) {
      r[0] = { ...r[0], text: r[0].text.replace(/^\s+/, "") };
      r[r.length - 1] = {
        ...r[r.length - 1],
        text: r[r.length - 1].text.replace(/\s+$/, "")
      };
    }
    return r.filter((x) => x.text !== "");
  }
  function blocks(root) {
    const out = [];
    let pending = [];
    const flush = () => {
      const runs = trimmed(pending);
      if (runs.length) out.push({ type: "paragraph", runs });
      pending = [];
    };
    for (const el of root.childNodes) {
      if (el.nodeType !== 1) {
        pending.push(...inline(el));
        continue;
      }
      if (!visible(el) || el.matches(OMIT)) continue;
      if (el.matches(
        ".katex-display,math[display=block],mjx-container[display=true]"
      ) || el.matches(equationSelector) && BLOCK.split(",").includes(el.tagName)) {
        flush();
        out.push({ type: "math", ...equation(el) });
        continue;
      }
      if (!BLOCK.split(",").includes(el.tagName)) {
        pending.push(...inline(el));
        continue;
      }
      flush();
      const tag = el.tagName;
      if (/^H[1-6]$/.test(tag))
        out.push({
          type: "heading",
          level: Number(tag[1]),
          runs: trimmed(inline(el))
        });
      else if (tag === "PRE") {
        const code = el.querySelector("code") || el;
        const clone = code.cloneNode(true);
        clone.querySelectorAll(OMIT).forEach((n) => n.remove());
        const text = clone.textContent.replace(/\n$/, "");
        const language = code.className.match(/language-([\w+-]+)/)?.[1] || code.closest("[data-language]")?.dataset.language || "";
        if ((/^(math|latex|tex)$/i.test(language) || !language && /^\s*(?:\\\[[\s\S]*\\\]|\$\$[\s\S]*\$\$)\s*$/.test(text)) && !/\\(?:documentclass|usepackage|begin\{document\}|section|newcommand|textbf)/.test(
          text
        ) && /^(?:\s*\\[([]|\s*\$\$)|[=^_]|\\(?:frac|sqrt|sum|int|begin\{(?:align|equation|matrix))/.test(
          text
        ))
          out.push({ type: "math", text, fromCode: true });
        else out.push({ type: "code", text, language });
      } else if (tag === "UL" || tag === "OL") {
        out.push({
          type: "list",
          ordered: tag === "OL",
          start: Number(el.getAttribute("start")) || 1,
          items: [...el.children].filter((n) => n.tagName === "LI" && visible(n)).map((n) => blocks(n))
        });
      } else if (tag === "TABLE") {
        const rows = [...el.rows].filter(visible).map(
          (row) => [...row.cells].map((cell) => ({
            blocks: blocks(cell),
            header: cell.tagName === "TH",
            colSpan: cell.colSpan,
            rowSpan: cell.rowSpan
          }))
        );
        if (rows.length) out.push({ type: "table", rows });
      } else if (tag === "BLOCKQUOTE")
        out.push({ type: "quote", blocks: blocks(el) });
      else if (tag === "HR") out.push({ type: "rule" });
      else if (tag === "P") {
        const runs = trimmed(inline(el));
        if (runs.length) out.push({ type: "paragraph", runs });
      } else out.push(...blocks(el));
    }
    flush();
    return out;
  }
  function plainText(bs) {
    return bs.map(
      (b) => b.text ?? (b.runs ? b.runs.map((r) => r.text).join("") : b.items ? b.items.map(plainText).join("\n") : b.rows ? b.rows.map((row) => row.map((c) => plainText(c.blocks)).join(" | ")).join("\n") : b.blocks ? plainText(b.blocks) : "")
    ).join("\n");
  }
  var OMIT, BLOCK, equationSelector;
  var init_normalize = __esm({
    "src/modules/normalize.js"() {
      OMIT = 'button,nav,[data-conversation-role]:is(h1,h2,h3,h4,h5,h6),.turn-action-controls,script,style,textarea,input,select,svg,[role="button"],[data-cge],[data-testid="thought-process"],[data-testid="reasoning"],.katex-html';
      BLOCK = "P,H1,H2,H3,H4,H5,H6,PRE,UL,OL,TABLE,BLOCKQUOTE,HR,DIV,SECTION,ARTICLE,FIGURE";
      equationSelector = ".katex,math,[data-math],[data-latex],mjx-container";
    }
  });

  // src/modules/extractor.js
  init_normalize();
  var ROLE_SELECTOR = '[data-message-author-role="user"],[data-message-author-role="assistant"]';
  var unitAttrs = [
    "data-content-search-unit-key",
    "data-chatgpt-search-unit-key"
  ];
  var unitSelector = unitAttrs.flatMap(
    (attr) => ["user", "assistant"].map((role) => `[${attr}$=":${role}"]`)
  ).join(",");
  var turnSelector = '[data-turn-key],[data-chatgpt-search-turn-key],[data-content-search-turn-key],[data-testid^="conversation-turn-"],article';
  var modernBody = '[data-markdown-text-style="assistant-message"]';
  var userBubble = '[data-user-message-bubble="true"]';
  var roleContainer = '[data-conversation-role="assistant"],[data-conversation-role="user"]';
  var roleHeading = 'h1,h2,h3,h4,h5,h6,[role="heading"]';
  var unitKey = (el) => unitAttrs.map((attr) => el.getAttribute(attr)).find(Boolean);
  function messageRole(el) {
    if (el.hasAttribute("data-message-author-role"))
      return el.dataset.messageAuthorRole;
    const key = unitKey(el);
    if (key && /:(user|assistant)$/.test(key)) return key.split(":").at(-1);
    if (el.matches(userBubble)) return "user";
    if (el.matches(modernBody)) return "assistant";
    return el.dataset.conversationRole || el.dataset.turn;
  }
  function messageNodes(root = document) {
    const candidates = /* @__PURE__ */ new Set(), ancestors = /* @__PURE__ */ new Set();
    const groups = [
      ROLE_SELECTOR,
      unitSelector,
      roleContainer,
      userBubble,
      modernBody,
      '[data-turn="user"],[data-turn="assistant"]'
    ];
    for (const group of groups)
      for (const el of root.querySelectorAll(group)) {
        if (ancestors.has(el) || el.matches(roleHeading) || !visible(el) || el.closest('nav,aside,dialog,form,[role="navigation"]'))
          continue;
        if ((group === modernBody || group === userBubble) && !el.closest(turnSelector + "," + unitSelector))
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
    return [...candidates].sort(
      (a, b) => a.compareDocumentPosition(b) & 4 ? -1 : 1
    );
  }
  function turnFor(el) {
    return el.closest(turnSelector) || el;
  }
  function turnIndex(el) {
    const turn = turnFor(el);
    const legacy = turn.getAttribute("data-testid")?.match(/^conversation-turn-(\d+)$/);
    const numbered = legacy || (turn.dataset.turnKey || turn.dataset.chatgptSearchTurnKey || turn.dataset.contentSearchTurnKey || unitKey(el) || "").match(/^fallback-turn-(\d+)(?::|$)/);
    return numbered ? Number(numbered[1]) : null;
  }
  function isStreaming(root = document) {
    return [
      ...root.querySelectorAll(
        '[data-testid="stop-button"],[data-testid="stop-generating-button"],button[aria-label="Stop generating" i],button[aria-label="Stop streaming" i],form[data-chatgpt-composer] button[aria-label="Stop" i],[data-is-streaming="true"],[aria-busy="true"][data-message-author-role]'
      )
    ].some(visible);
  }
  function completed(el, nodes = messageNodes(el.ownerDocument)) {
    if (messageRole(el) === "user") return true;
    if (el.closest('[data-is-streaming="true"],[aria-busy="true"]') || el.querySelector('[data-is-streaming="true"]'))
      return false;
    const idx = nodes.indexOf(el);
    if (idx === nodes.length - 1 && isStreaming(el.ownerDocument)) return false;
    const turn = turnFor(el);
    let last = idx;
    while (last >= 0 && last + 1 < nodes.length && messageRole(nodes[last + 1]) === "assistant" && turnFor(nodes[last + 1]) === turn)
      last++;
    if (last > idx) return completed(nodes[last], nodes);
    const followsAnswer = (action) => {
      if (action.closest("pre,code,[data-code-block-controls]")) return false;
      if (action.matches('button[aria-label="Copy" i]') && !action.dataset.testid && !action.closest(".turn-action-controls")) {
        if (!turn.matches(
          "[data-turn-key],[data-chatgpt-search-turn-key],[data-content-search-turn-key]"
        ) || el.contains(action) || action.closest(
          ".markdown,[data-markdown-text-style],[data-user-message-bubble]"
        ))
          return false;
      }
      if (el.contains(action)) return true;
      if (!(el.compareDocumentPosition(action) & 4)) return false;
      const next = nodes[idx + 1];
      return !next || Boolean(action.compareDocumentPosition(next) & 4);
    };
    if ([
      ...turn.querySelectorAll(
        '[data-testid="copy-turn-action-button"],[data-testid="good-response-turn-action-button"],[data-testid="bad-response-turn-action-button"],.turn-action-controls button,button[aria-label="Copy response" i],button[aria-label="Copy answer" i],button[aria-label="Copy" i]'
      )
    ].some((action) => visible(action) && followsAnswer(action)))
      return true;
    if (el.dataset.isStreaming === "false" || turn.dataset.isStreaming === "false")
      return true;
    return nodes.slice(idx + 1).some((n) => messageRole(n) === "user");
  }
  function extractMessage(el, order) {
    const role = messageRole(el);
    const body = role === "user" ? el.querySelector(userBubble) || el : el;
    const content = blocks(body);
    if (!content.length)
      throw new Error(
        `The ${role} message has no readable content. It may contain an unsupported rich element.`
      );
    const media = body.querySelector("img,video,audio,canvas,iframe");
    const time = turnFor(el).querySelector("time[datetime]")?.getAttribute("datetime");
    const key = unitKey(el.closest(unitSelector) || el);
    const unit = key?.match(/^(.+):(\d+):(user|assistant)$/);
    const group = turnFor(el).dataset.turnKey || turnFor(el).dataset.chatgptSearchTurnKey || turnFor(el).dataset.contentSearchTurnKey || unit?.[1] || null;
    return {
      role,
      group,
      unitKey: key || null,
      unitOrder: unit ? Number(unit[2]) : null,
      // An answer later in an explicitly grouped turn must use the prompt in that group.
      requiresSameGroup: role === "assistant" && Boolean(unit && Number(unit[2]) > 0),
      id: el.dataset.messageId || unitKey(el) || unitKey(el.closest(unitSelector) || el) || (turnFor(el).dataset.turnKey || turnFor(el).dataset.turnId ? `${turnFor(el).dataset.turnKey || turnFor(el).dataset.turnId}:${role}` : null),
      turnIndex: turnIndex(el),
      order,
      parentId: null,
      blocks: content,
      timestamp: time || null,
      hasMedia: Boolean(media)
    };
  }
  function associate(messages) {
    let user = null;
    return messages.map((m) => {
      if (m.role === "user") user = m;
      if (m.role === "assistant" && !user)
        throw new Error(
          "The preceding question is not loaded. Scroll up until it appears, then retry."
        );
      if (m.requiresSameGroup && m.group !== user?.group)
        throw new Error(
          "The question from this response\u2019s turn is not loaded. Scroll upward to reveal it and retry."
        );
      return {
        ...m,
        parentId: m.role === "assistant" ? user.id || `turn:${user.turnIndex ?? user.order}` : null
      };
    });
  }
  function extractPair(target, root = document) {
    const nodes = messageNodes(root), idx = nodes.indexOf(target);
    if (idx < 0 || !completed(target, nodes))
      throw new Error(
        "No completed response found. Wait for generation to finish."
      );
    let u = idx - 1;
    while (u >= 0 && messageRole(nodes[u]) !== "user") u--;
    if (u < 0)
      throw new Error(
        "The corresponding question is not loaded. Scroll up to reveal it, then retry."
      );
    const a = turnIndex(nodes[u]), b = turnIndex(target);
    const between = nodes.slice(u, idx + 1).map(turnIndex);
    if (a !== null && b !== null && between.every((x) => x !== null)) {
      const unique = [...new Set(between)];
      for (let i = 1; i < unique.length; i++)
        if (unique[i] !== unique[i - 1] + 1)
          throw new Error(
            "There is a gap between this response and the visible question. Reveal the missing turns first."
          );
    }
    return associate([extractMessage(nodes[u], 0), extractMessage(target, 1)]);
  }
  function historyKey(message) {
    if (message.unitKey)
      return JSON.stringify([message.role, "unit", message.unitKey]);
    if (message.id) return JSON.stringify([message.role, "id", message.id]);
    if (message.turnIndex !== null)
      return JSON.stringify([message.role, "turn", message.turnIndex]);
    return null;
  }
  function snapshot(root = document) {
    const nodes = messageNodes(root);
    if (!nodes.length)
      throw new Error(
        "No conversation detected. Open a ChatGPT conversation and refresh the page."
      );
    if (nodes.some((n) => !completed(n, nodes)))
      throw new Error(
        "A response is incomplete or its completion cannot be verified. Wait for completion and retry."
      );
    const result = nodes.map(extractMessage);
    const seen = /* @__PURE__ */ new Map();
    return result.filter((m) => {
      const key = historyKey(m);
      if (!key) return true;
      const prior = seen.get(key);
      if (prior && plainText(prior.blocks) !== plainText(m.blocks))
        throw new Error(
          "Conflicting versions of a message are visible. Refresh the page and retry."
        );
      if (prior) return false;
      seen.set(key, m);
      return true;
    });
  }
  function title(root = document) {
    const selected = root.querySelector(
      'nav a[aria-current="page"],nav a[data-active="true"]'
    );
    return (selected?.textContent || root.title || "ChatGPT Conversation").replace(/\s*[-|–]\s*ChatGPT\s*$/, "").trim() || "ChatGPT Conversation";
  }

  // src/modules/history.js
  init_normalize();
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function scrollContainer(root = document) {
    let node = messageNodes(root)[0]?.parentElement;
    while (node && node !== root.body) {
      const style = root.defaultView.getComputedStyle(node);
      if (/auto|scroll/.test(style.overflowY) && node.scrollHeight > node.clientHeight + 10)
        return node;
      node = node.parentElement;
    }
    return root.scrollingElement;
  }
  async function collectHistory({
    signal,
    onProgress = () => {
    },
    timeout = 45e3
  } = {}) {
    const route2 = location.href, scroller = scrollContainer(), original = scroller.scrollTop;
    const start = Date.now(), seen = /* @__PURE__ */ new Map();
    let previous = [];
    class ChangedDuringScan extends Error {
    }
    let uncertain = false, everUnmounted = false;
    const oldBehavior = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = "auto";
    function guard() {
      if (signal?.aborted) throw new Error("Export cancelled.");
      if (location.href !== route2)
        throw new Error(
          "The conversation changed during collection. Retry on the intended conversation."
        );
      if (Date.now() - start > timeout)
        throw new Error(
          "History collection exceeded 45 seconds. Scroll to load older messages and retry, or export individual pairs."
        );
      if (isStreaming())
        throw new Error(
          "A response started streaming during collection. Wait for it to finish."
        );
    }
    function read() {
      guard();
      const current = snapshot();
      const indexed = current.every((m) => m.turnIndex !== null);
      if (!indexed) uncertain = true;
      const keys = /* @__PURE__ */ new Set();
      for (const m of current) {
        const key = historyKey(m);
        if (!key)
          throw new Error(
            "Stable message identifiers are unavailable. Full-history collection is unsafe; use individual export."
          );
        keys.add(key);
        const prior = seen.get(key);
        if (prior && (prior.turnIndex !== m.turnIndex || plainText(prior.blocks) !== plainText(m.blocks)))
          throw new ChangedDuringScan(
            "The conversation kept changing during both history scans. Finish editing or generating the reply and retry."
          );
        if (!prior) seen.set(key, m);
      }
      for (const old of previous) {
        if (old.turnIndex === null || keys.has(historyKey(old))) continue;
        if (current.some(
          (m) => m.turnIndex === old.turnIndex && m.role === old.role && (old.unitOrder == null || m.unitOrder === old.unitOrder) && !previous.some((p) => historyKey(p) === historyKey(m))
        ))
          throw new ChangedDuringScan(
            "The active branch kept changing during history collection. Finish switching answers and retry."
          );
      }
      previous = current;
      if ([...seen.keys()].some((k) => !keys.has(k))) everUnmounted = true;
      if (!indexed && everUnmounted)
        throw new Error(
          "This page virtualizes messages without ordered turn identifiers. A reliable complete export is unavailable."
        );
      onProgress(`Collecting history\u2026 ${seen.size} messages (Escape cancels)`);
      return current;
    }
    async function scan2() {
      read();
      let topStable = 0, last = "";
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
          before + Math.max(200, scroller.clientHeight * 0.7)
        );
        await sleep(350);
        read();
        const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
        bottomStable = atBottom ? bottomStable + 1 : 0;
      }
      const result = everUnmounted ? [...seen.values()] : read();
      if (result.every((m) => m.turnIndex !== null)) {
        result.sort(
          (a, b) => a.turnIndex - b.turnIndex || (a.role === b.role ? (a.unitOrder ?? 0) - (b.unitOrder ?? 0) : a.role === "user" ? -1 : 1)
        );
        const ids = [...new Set(result.map((m) => m.turnIndex))];
        if (ids[0] > 1) uncertain = true;
        for (let i = 1; i < ids.length; i++)
          if (ids[i] !== ids[i - 1] + 1)
            throw new Error(
              "Missing conversation turns were detected. Scroll through the missing history and retry."
            );
      }
      return {
        messages: associate(result.map((m, i) => ({ ...m, order: i }))),
        uncertain,
        everUnmounted
      };
    }
    try {
      try {
        return await scan2();
      } catch (error) {
        if (!(error instanceof ChangedDuringScan)) throw error;
        seen.clear();
        previous = [];
        uncertain = false;
        everUnmounted = false;
        onProgress("The page updated. Checking the settled conversation again\u2026");
        await sleep(350);
        return await scan2();
      }
    } finally {
      if (location.href === route2) scroller.scrollTop = original;
      scroller.style.scrollBehavior = oldBehavior;
    }
  }

  // src/modules/ui.js
  var CSS = `
:host{all:initial;font:13px/1.45 system-ui,-apple-system,sans-serif;color:#172335;color-scheme:light;--ink:#172335;--accent:#146d62}
*{box-sizing:border-box}button,select,input{font:inherit}button{cursor:pointer;border:1px solid #cfd8df;background:#fff;color:var(--ink);border-radius:8px;padding:7px 11px}button:hover{background:#edf6f4}button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #3aa694;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}.primary{background:var(--accent);color:#fff;border-color:var(--accent)}.primary:hover{background:#0c594f}.pair{display:inline-block;margin:8px 0}.menu[hidden]{display:none}.menu{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.toolbar{position:fixed;right:12px;top:min(62px,9vh);max-width:calc(100vw - 24px);max-height:var(--cge-room,80vh);overflow:auto;z-index:2147483645;box-shadow:0 5px 24px #0002;border:1px solid #d8e3e0;background:#fff;border-radius:12px;padding:9px}.toolbar>div{display:flex;gap:6px}.status{max-width:320px;white-space:pre-wrap;font-size:12px;margin-top:7px}.status:empty{display:none}.status[data-state=error]{color:#a51c30}.status[data-state=success]{color:#08644d}dialog{color:var(--ink);background:#fff;border:1px solid #d8e3e0;border-radius:16px;padding:24px;width:min(520px,90vw);box-shadow:0 20px 90px #0004}dialog::backdrop{background:#14202a77}h2{font-size:20px;margin:0 0 12px}p{margin:10px 0}.preview{background:#f2f5f7;border-radius:8px;padding:12px;max-height:160px;overflow:auto;white-space:pre-wrap}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}.small{font-size:12px;color:#536472}.check{display:flex;align-items:start;gap:8px}a{color:#146d62}
`;
  function positionToolbar(toolbar2) {
    let composer, frame;
    const refresh = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const input = document.querySelector(
          'form[data-chatgpt-composer],#prompt-textarea,[contenteditable="true"][role="textbox"]'
        );
        const next = input?.closest("form,[data-chatgpt-composer]") || input;
        if (next !== composer) {
          observer2.disconnect();
          composer = next;
          if (composer) observer2.observe(composer);
        }
        const box = composer?.getBoundingClientRect();
        const top = Math.min(62, innerHeight * 0.09);
        const edge = box && box.height && box.right > innerWidth - 360 ? Math.min(innerHeight, box.top) : innerHeight;
        const room = Math.floor(edge - top - 12);
        toolbar2.style.setProperty("--cge-room", Math.max(0, room) + "px");
        toolbar2.hidden = room < 46;
      });
    };
    const observer2 = new ResizeObserver(refresh);
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, { capture: true, passive: true });
    refresh();
    return refresh;
  }
  function mount(parent, className) {
    const host = document.createElement("div");
    host.dataset.cge = className;
    const shadow = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.append(style);
    parent.append(host);
    return { host, shadow };
  }
  function button(text, fn, primary = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = text;
    if (primary) b.className = "primary";
    b.addEventListener("click", fn);
    return b;
  }
  function menu(shadow, label, onExport) {
    const wrap = document.createElement("div");
    wrap.className = "pair";
    const trigger = button(label, () => {
      options.hidden = !options.hidden;
      trigger.setAttribute("aria-expanded", String(!options.hidden));
      if (!options.hidden) pdf.focus();
    });
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-label", label);
    const options = document.createElement("div");
    options.className = "menu";
    options.hidden = true;
    const run2 = (format) => {
      options.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      onExport(format);
    };
    const pdf = button("PDF", () => run2("pdf")), word = button("Word (.docx)", () => run2("docx"));
    options.append(pdf, word);
    wrap.append(trigger, options);
    shadow.append(wrap);
    wrap.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        options.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
        trigger.focus();
      }
    });
    wrap.addEventListener("focusout", (event) => {
      if (!wrap.contains(event.relatedTarget)) {
        options.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      }
    });
    return () => {
    };
  }
  async function review(shadow, data, format, settings) {
    const dialog = document.createElement("dialog");
    const h = document.createElement("h2");
    h.textContent = "Review conversation export";
    const p = document.createElement("p");
    p.textContent = `Collected ${data.messages.length} messages from the displayed branch. Check the beginning and end before downloading.`;
    const preview = document.createElement("div");
    preview.className = "preview";
    const { plainText: plainText2 } = await Promise.resolve().then(() => (init_normalize(), normalize_exports));
    preview.textContent = `FIRST: ${plainText2(data.messages[0].blocks).slice(0, 220)}

LAST: ${plainText2(data.messages.at(-1).blocks).slice(0, 220)}`;
    const note = document.createElement("p");
    note.className = "small";
    note.textContent = "ChatGPT does not expose a DOM-only guarantee of complete history. Hidden branches are excluded. Equations are typeset where supported. Images use descriptions. " + (!settings.includeUsers ? "Your settings exclude user messages. " : "") + (!settings.includeCode ? "Your settings exclude code blocks. " : "");
    const label = document.createElement("label");
    label.className = "check";
    const check = document.createElement("input");
    check.type = "checkbox";
    label.append(
      check,
      document.createTextNode(
        "I have checked that the collected range is the one I want to export."
      )
    );
    const actions = document.createElement("div");
    actions.className = "actions";
    return new Promise((resolve) => {
      let done = false;
      const finish = (value) => {
        if (done) return;
        done = true;
        dialog.close();
        dialog.remove();
        resolve(value);
      };
      const cancel = button("Cancel", () => finish(false));
      const go = button(
        `Download ${format === "pdf" ? "PDF" : "Word"}`,
        () => finish(true),
        true
      );
      go.disabled = true;
      check.addEventListener("change", () => go.disabled = !check.checked);
      actions.append(cancel, go);
      dialog.append(h, p, preview, note, label, actions);
      dialog.addEventListener("cancel", (e) => {
        e.preventDefault();
        finish(false);
      });
      shadow.append(dialog);
      dialog.showModal();
    });
  }

  // src/content.js
  init_normalize();

  // src/modules/settings.js
  var DEFAULTS = Object.freeze({
    font: "sans",
    fontSize: 11,
    orientation: "portrait",
    margin: 48,
    includeTitle: true,
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

  // src/content.js
  var busy = false;
  var route = location.href;
  var scheduled;
  var controller;
  var pairs = /* @__PURE__ */ new Map();
  var panel = mount(document.body, "toolbar");
  var toolbar = document.createElement("div");
  toolbar.className = "toolbar";
  panel.shadow.append(toolbar);
  var updateToolbarPosition = positionToolbar(toolbar);
  menu(toolbar, "Export conversation", (format) => run("conversation", format));
  toolbar.append(
    button(
      "Settings",
      () => chrome.runtime.sendMessage({ type: "CGE_SETTINGS" })
    )
  );
  var status = document.createElement("div");
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
        scope === "pair" ? "Extracting this question and answer\u2026" : "Loading conversation history\u2026 (Escape cancels)"
      );
      let messages;
      if (scope === "pair") messages = extractPair(target);
      else {
        const data = await collectHistory({
          signal: controller.signal,
          onProgress: feedback
        });
        document.removeEventListener("keydown", stop);
        if (!await review(panel.shadow, data, format, await getSettings())) {
          feedback("Export cancelled.");
          return;
        }
        messages = data.messages;
        const keys = new Map(messages.map((m) => [historyKey(m), m]));
        for (const current of snapshot()) {
          const prior = keys.get(historyKey(current));
          if (!prior || prior.turnIndex !== current.turnIndex || plainText(prior.blocks) !== plainText(current.blocks))
            throw new Error(
              "The conversation changed during review. Please retry."
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
          exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
          messages
        }
      });
      if (!response?.ok)
        throw new Error(
          response?.error || "The extension did not respond. Refresh ChatGPT and retry."
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
      if (!entry.host.isConnected || !el.isConnected || !nodes.includes(el) || !completed(el, nodes)) {
        entry.cleanup();
        entry.host.remove();
        pairs.delete(el);
      }
    for (const el of nodes) {
      if (messageRole(el) !== "assistant" || pairs.has(el) || !completed(el, nodes))
        continue;
      const ui = mount(el, "pair");
      const cleanup = menu(
        ui.shadow,
        "\u2193 Export this Q&A",
        (format) => run("pair", format, el)
      );
      pairs.set(el, { ...ui, cleanup });
    }
    updateToolbarPosition();
    if (!panel.host.isConnected) document.body.append(panel.host);
    panel.host.style.display = nodes.length || /\/(?:c|share)\//.test(location.pathname) ? "block" : "none";
    if (!nodes.length && !busy)
      feedback(
        "No readable messages detected yet. Open a conversation with a finished reply."
      );
    else if (status.textContent.startsWith("No readable messages detected"))
      feedback("");
  }
  var observer = new MutationObserver((records) => {
    if (records.every(
      (r) => r.target.nodeType === 1 && r.target.closest("[data-cge]")
    ))
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
      "aria-hidden"
    ]
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
    { once: true }
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
          "aria-hidden"
        ]
      });
      scan();
    }
  });
})();
