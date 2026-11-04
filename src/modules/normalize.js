// Convert the rendered DOM to a small, non-executable document model.
export function safeLink(value, base = "https://chatgpt.com/") {
  try {
    const u = new URL(value, base);
    return ["https:", "http:", "mailto:"].includes(u.protocol)
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function visible(el) {
  if (el.nodeType !== 1) return true;
  if (el.closest('[hidden],[aria-hidden="true"],template,[data-cge]'))
    return false;
  for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
    const s = n.ownerDocument.defaultView.getComputedStyle(n);
    if (
      s.display === "none" ||
      s.visibility === "hidden" ||
      s.contentVisibility === "hidden"
    )
      return false;
  }
  return true;
}
const OMIT =
  'button,nav,[data-conversation-role]:is(h1,h2,h3,h4,h5,h6),.turn-action-controls,script,style,textarea,input,select,svg,[role="button"],[data-cge],[data-testid="thought-process"],[data-testid="reasoning"],.katex-html';
const BLOCK =
  "P,H1,H2,H3,H4,H5,H6,PRE,UL,OL,TABLE,BLOCKQUOTE,HR,DIV,SECTION,ARTICLE,FIGURE";
function mathSource(el) {
  return (
    el.querySelector('annotation[encoding="application/x-tex"]')?.textContent ||
    el.getAttribute("data-math") ||
    el.textContent
  );
}
export function inline(node, style = {}) {
  if (node.nodeType === 3) {
    const parent = node.parentElement;
    const preserve =
      parent &&
      (/pre|break-spaces/.test(
        parent.ownerDocument.defaultView.getComputedStyle(parent).whiteSpace,
      ) ||
        parent.closest(
          '[data-message-author-role="user"],[data-user-message-bubble="true"],[data-turn="user"]',
        ));
    return [
      {
        text: preserve
          ? node.textContent
          : node.textContent.replace(/\s+/g, " "),
        ...style,
      },
    ];
  }
  if (node.nodeType !== 1 || !visible(node) || node.matches(OMIT)) return [];
  if (node.matches(".katex,math,[data-math]"))
    return [{ text: `\\(${mathSource(node)}\\)`, ...style, math: true }];
  if (node.tagName === "BR") return [{ text: "\n", ...style }];
  if (node.tagName === "IMG")
    return [
      {
        text: `[Image: ${node.alt || "no text description"}]`,
        ...style,
        italic: true,
      },
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
      text: r[r.length - 1].text.replace(/\s+$/, ""),
    };
  }
  return r.filter((x) => x.text !== "");
}
export function blocks(root) {
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
    if (el.matches(".katex-display")) {
      flush();
      out.push({ type: "math", text: mathSource(el) });
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
        runs: trimmed(inline(el)),
      });
    else if (tag === "PRE") {
      const code = el.querySelector("code") || el;
      const clone = code.cloneNode(true);
      clone.querySelectorAll(OMIT).forEach((n) => n.remove());
      out.push({
        type: "code",
        text: clone.textContent.replace(/\n$/, ""),
        language: code.className.match(/language-([\w+-]+)/)?.[1] || "",
      });
    } else if (tag === "UL" || tag === "OL") {
      out.push({
        type: "list",
        ordered: tag === "OL",
        start: Number(el.getAttribute("start")) || 1,
        items: [...el.children]
          .filter((n) => n.tagName === "LI" && visible(n))
          .map((n) => blocks(n)),
      });
    } else if (tag === "TABLE") {
      const rows = [...el.rows].filter(visible).map((row) =>
        [...row.cells].map((cell) => ({
          blocks: blocks(cell),
          header: cell.tagName === "TH",
          colSpan: cell.colSpan,
          rowSpan: cell.rowSpan,
        })),
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
export function plainText(bs) {
  return bs
    .map(
      (b) =>
        b.text ??
        (b.runs
          ? b.runs.map((r) => r.text).join("")
          : b.items
            ? b.items.map(plainText).join("\n")
            : b.rows
              ? b.rows
                  .map((row) => row.map((c) => plainText(c.blocks)).join(" | "))
                  .join("\n")
              : b.blocks
                ? plainText(b.blocks)
                : ""),
    )
    .join("\n");
}
