import { diagramSVG } from "./diagram.js";
import { proseReader, readCode, textAlignment } from "./pdf-style.js";
import { imageRef, meaningfulImage } from "./media.js";
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
    if (!("style" in n)) continue;
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
  "P,H1,H2,H3,H4,H5,H6,PRE,UL,OL,TABLE,BLOCKQUOTE,HR,DIV,SECTION,ARTICLE,FIGURE,DETAILS,SUMMARY,FORM,FIELDSET";
const equationSelector = ".katex,math,[data-math],[data-latex],mjx-container";
function equation(el) {
  const tex =
    el.querySelector('annotation[encoding="application/x-tex"]')?.textContent ||
    el.getAttribute("data-math") ||
    el.getAttribute("data-latex");
  if (tex) return { text: tex };
  const math = el.matches("math") ? el : el.querySelector("math");
  if (!math) return { text: el.textContent };
  // Preserve structural fractions, radicals and scripts even without a TeX annotation.
  const safe = math.cloneNode(true);
  safe
    .querySelectorAll("annotation,annotation-xml,mglyph,script,style,maction")
    .forEach((n) => n.remove());
  for (const n of [safe, ...safe.querySelectorAll("*")]) {
    for (const a of [...n.attributes])
      if (
        ![
          "display",
          "mathvariant",
          "stretchy",
          "fence",
          "accent",
          "accentunder",
          "columnalign",
          "rowalign",
          "linethickness",
          "movablelimits",
        ].includes(a.name)
      )
        n.removeAttribute(a.name);
  }
  return { text: safe.textContent, mathml: safe.outerHTML };
}
// Recognize explicit math delimiters in prose while keeping code and dollar prices literal.
function textRuns(text, style) {
  if (style.code) return [{ text, ...style }];
  const pattern =
    /\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$\$([\s\S]+?)\$\$|(?<![\\\w$])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\d$])/g;
  const runs = [];
  let pos = 0;
  for (const match of text.matchAll(pattern)) {
    if (
      match[4] &&
      (!/[A-Za-z\\^_=+<>]/.test(match[4]) ||
        /^\d[\s\S]*\b(and|or|to)\b/.test(match[4]))
    )
      continue;
    if (match.index > pos)
      runs.push({ text: text.slice(pos, match.index), ...style });
    runs.push({
      text: match[0],
      ...style,
      math: true,
      display: !!(match[1] || match[3]),
    });
    pos = match.index + match[0].length;
  }
  if (pos < text.length) runs.push({ text: text.slice(pos), ...style });
  return runs;
}
// Read the current control state, including custom controls with ARIA semantics.
function controlRun(el) {
  const label = el.getAttribute("aria-label");
  if (
    el.matches(
      "input[type=checkbox], [role=checkbox],input[type=radio],[role=radio],[data-checked],svg.lucide-square-check,svg.lucide-square-check-big,svg.lucide-square",
    )
  ) {
    const val = el.matches("input")
      ? el.indeterminate
        ? "mixed"
        : String(el.checked)
      : (el.getAttribute("aria-checked") ??
        el.getAttribute("data-checked") ??
        String(
          el.matches("svg.lucide-square-check,svg.lucide-square-check-big"),
        ));
    const radio = el.matches("input[type=radio],[role=radio]");
    const mark = radio
      ? val === "true"
        ? "◉"
        : "○"
      : val === "true"
        ? "☑"
        : val === "mixed"
          ? "⊟"
          : "☐";
    const children = el.matches("[data-checked],[role=checkbox],[role=radio]")
      ? el.textContent.trim()
      : "";
    return {
      text:
        mark + " " + (children || label || "") + (children || label ? " " : ""),
      control: "check",
      checked: val,
    };
  }
  if (el.matches("input[type=range],[role=slider],progress,meter")) {
    const val = el.value ?? el.getAttribute("aria-valuenow");
    const min = el.min || el.getAttribute("aria-valuemin") || 0;
    const max =
      el.max ||
      el.getAttribute("aria-valuemax") ||
      (el.matches("progress,meter") ? 1 : 100);
    const text =
      (label || (el.matches("progress,meter") ? "Progress" : "Slider")) +
      ": " +
      (el.getAttribute("aria-valuetext") || val || "0") +
      " (" +
      min +
      "–" +
      max +
      ")";
    const fraction = (Number(val) - Number(min)) / (Number(max) - Number(min));
    return {
      text,
      widget: {
        type: "slider",
        text,
        fraction: Number.isFinite(fraction)
          ? Math.min(1, Math.max(0, fraction))
          : 0,
      },
    };
  }
  if (el.matches("select,input[type=number]")) {
    return {
      text:
        (label ? label + ": " : "") +
        (el.matches("select")
          ? [...el.selectedOptions].map((o) => o.label).join(", ")
          : el.value),
    };
  }
  return null;
}
function semanticRun(el) {
  const control = controlRun(el);
  if (control) return control;
  if (el.matches("canvas")) return imageRef(el);
  if (
    el.matches("svg") &&
    !el.closest(".katex,mjx-container") &&
    (el.matches("[aria-roledescription], [id*=mermaid i], [role=img]") ||
      (el.getBoundingClientRect().width >= 48 &&
        el.getBoundingClientRect().height >= 32))
  ) {
    const diagram = diagramSVG(el);
    if (diagram) return { text: diagram.text, diagram };
  }
  return null;
}
export function inline(
  node,
  style = {},
  read = proseReader(node.parentElement || node),
) {
  if (node.nodeType === 3) {
    const parent = node.parentElement || node.getRootNode().host;
    const preserve =
      parent &&
      (/pre|break-spaces/.test(
        parent.ownerDocument.defaultView.getComputedStyle(parent).whiteSpace,
      ) ||
        parent.closest(
          '[data-message-author-role="user"],[data-user-message-bubble="true"],[data-turn="user"]',
        ));
    return textRuns(
      preserve ? node.textContent : node.textContent.replace(/\s+/g, " "),
      { ...style, ...read(parent) },
    );
  }
  if (node.nodeType !== 1 || !visible(node)) return [];
  const semantic = semanticRun(node);
  if (semantic) return [semantic];
  if (node.matches('button,[role="button"]'))
    return [...node.querySelectorAll("img,canvas,svg")].flatMap((el) => {
      if (
        !visible(el) &&
        !(
          el.matches("svg[aria-hidden=true]") &&
          visible(node) &&
          el.getBoundingClientRect().width >= 48
        )
      )
        return [];
      if (el.matches("img")) return meaningfulImage(el) ? [imageRef(el)] : [];
      if (el.matches("svg") && el.getBoundingClientRect().width < 48) return [];
      const run = semanticRun(el);
      return run ? [run] : [];
    });
  if (node.matches(OMIT)) return [];
  if (node.matches(".katex-display"))
    return [{ ...equation(node), ...style, math: true, display: true }];
  if (node.matches(equationSelector)) {
    const eq = equation(node);
    return [{ ...eq, text: `\\(${eq.text}\\)`, ...style, math: true }];
  }
  if (node.tagName === "BR") return [{ text: "\n", ...style }];
  if (node.tagName === "IMG")
    return meaningfulImage(node) ? [imageRef(node)] : [];
  const next = { ...style };
  if (node.tagName === "CODE") {
    const snippet = readCode(node);
    const prose = read(node);
    return snippet.tokens.map(
      ({ text, color, background, bold, italics, decoration, fontSize }) => ({
        ...next,
        text,
        code: true,
        bold,
        italic: italics,
        strike: prose.strike,
        underline: prose.underline,
        pdfStyle: {
          color,
          background: background || snippet.background,
          decoration,
          fontSize: fontSize || snippet.fontSize,
        },
      }),
    );
  }
  if (node.tagName === "SUP") next.sup = true;
  if (node.tagName === "SUB") next.sub = true;
  if (node.tagName === "A")
    next.link = safeLink(node.getAttribute("href"), node.ownerDocument.URL);
  return [...node.childNodes].flatMap((n) => inline(n, next, read));
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
function listItem(el, read) {
  const item = blocks(el, read);
  const first = item[0]?.runs?.[0];
  if (!first || first.control === "check") return item;
  const literal = /^\[([ xX-])\]\s*/.exec(first.text);
  const state = el.hasAttribute("data-checked")
    ? el.getAttribute("data-checked")
    : literal?.[1];
  if (state != null) {
    if (literal) first.text = first.text.slice(literal[0].length);
    const mark = /^(true|x|checked)$/i.test(state)
      ? "☑"
      : /^(mixed|-)$/.test(state)
        ? "⊟"
        : "☐";
    item[0].runs.unshift({ text: mark + " ", control: "check" });
  }
  return item;
}
export function blocks(root, read = proseReader(root)) {
  const out = [];
  let pending = [];
  const flush = () => {
    const runs = trimmed(pending);
    if (runs.length)
      out.push({
        type: "paragraph",
        runs,
        alignment: textAlignment(root.host || root),
      });
    pending = [];
  };
  for (const el of root.childNodes) {
    if (el.nodeType !== 1) {
      pending.push(...inline(el, {}, read));
      continue;
    }
    if (!visible(el)) continue;
    if (
      el.shadowRoot &&
      !el.matches("[data-cge]") &&
      !el.shadowRoot.querySelector("slot")
    ) {
      flush();
      out.push(...blocks(el.shadowRoot, read));
      continue;
    }
    const semantic = semanticRun(el);
    if (semantic) {
      pending.push(semantic);
      continue;
    }
    if (el.matches("iframe")) {
      flush();
      const body = el.contentDocument?.body;
      const inner = body ? blocks(body) : [];
      out.push(
        ...(inner.length
          ? inner
          : [
              {
                type: "paragraph",
                runs: [
                  {
                    text:
                      "[" +
                      (el.title || "Embedded widget") +
                      ": frame contents unavailable to this page.]",
                  },
                ],
              },
            ]),
      );
      continue;
    }
    if (el.matches('button,[role="button"]')) {
      pending.push(...inline(el, {}, read));
      continue;
    }
    if (el.matches(OMIT)) continue;
    if (
      el.matches(
        ".mermaid,[data-mermaid],code.language-mermaid,[data-mermaid-source]",
      ) &&
      !el.querySelector("svg,pre")
    ) {
      const source =
        el.getAttribute("data-mermaid-source") ||
        el.getAttribute("data-mermaid") ||
        el.textContent;
      if (source.trim()) {
        flush();
        out.push({ type: "diagram", source, text: source });
        continue;
      }
    }
    if (
      el.matches(
        ".katex-display,math[display=block],mjx-container[display=true]",
      ) ||
      (el.matches(equationSelector) && BLOCK.split(",").includes(el.tagName))
    ) {
      flush();
      out.push({ type: "math", ...equation(el), alignment: textAlignment(el) });
      continue;
    }
    if (!BLOCK.split(",").includes(el.tagName) && !el.matches(".cm-content")) {
      pending.push(...inline(el, {}, read));
      continue;
    }
    flush();
    const tag = el.tagName;
    if (/^H[1-6]$/.test(tag))
      out.push({
        type: "heading",
        level: Number(tag[1]),
        alignment: textAlignment(el),
        runs: trimmed(inline(el, {}, read)),
      });
    else if (tag === "PRE" || el.matches(".cm-content")) {
      const snippet = readCode(el),
        { text, language } = snippet;
      // An explicitly mathematical fence can contain a formula, or an entire LaTeX program.
      // Keep program source intact when it contains document/preamble commands.
      if (
        /^mermaid$/i.test(language) ||
        (!language &&
          /^\s*(?:flowchart|graph)\s+(?:TD|TB|BT|RL|LR)\b/.test(text))
      )
        out.push({ type: "diagram", source: text, text });
      else if (
        (/^(math|latex|tex)$/i.test(language) ||
          (!language &&
            /^\s*(?:\\\[[\s\S]*\\\]|\$\$[\s\S]*\$\$)\s*$/.test(text))) &&
        !/\\(?:documentclass|usepackage|begin\{document\}|section|newcommand|textbf)/.test(
          text,
        ) &&
        /^(?:\s*\\[([]|\s*\$\$)|[=^_]|\\(?:frac|sqrt|sum|int|begin\{(?:align|equation|matrix))/.test(
          text,
        )
      )
        out.push({ type: "math", text, fromCode: true });
      else out.push({ type: "code", ...snippet });
    } else if (tag === "UL" || tag === "OL") {
      out.push({
        type: "list",
        ordered: tag === "OL",
        start:
          tag === "OL"
            ? el.hasAttribute("start")
              ? el.start
              : el.reversed
                ? el.children.length
                : 1
            : 1,
        reversed: !!el.reversed,
        listType:
          el.ownerDocument.defaultView.getComputedStyle(el).listStyleType,
        counters: [...el.children]
          .filter((n) => n.tagName === "LI" && visible(n))
          .map((n) => (n.hasAttribute("value") ? n.value : null)),
        items: [...el.children]
          .filter((n) => n.tagName === "LI" && visible(n))
          .map((n) => listItem(n, read)),
      });
    } else if (tag === "TABLE") {
      const rows = [...el.rows].filter(visible).map((row) =>
        [...row.cells].map((cell) => ({
          blocks: blocks(cell, read),
          header: cell.tagName === "TH",
          colSpan: cell.colSpan,
          rowSpan: cell.rowSpan,
        })),
      );
      if (rows.length) out.push({ type: "table", rows });
    } else if (tag === "BLOCKQUOTE")
      out.push({ type: "quote", blocks: blocks(el, read) });
    else if (tag === "HR") out.push({ type: "rule" });
    else if (tag === "P") {
      const runs = trimmed(inline(el, {}, read));
      if (runs.length)
        out.push({ type: "paragraph", runs, alignment: textAlignment(el) });
    } else out.push(...blocks(el, read));
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
