// Read computed CSS from the live DOM before the message is serialized.
const view = (el) => el.ownerDocument.defaultView.getComputedStyle(el);
export function textAlignment(el) {
  let value = "",
    direction = "";
  for (
    let node = el;
    node && (!value || !direction);
    node = node.parentElement
  ) {
    const css = view(node);
    value ||= css.textAlign || node.getAttribute("align") || "";
    direction ||= css.direction || node.getAttribute("dir") || "";
  }
  if (value === "start" || !value)
    return direction === "rtl" ? "right" : "left";
  if (value === "end") return direction === "rtl" ? "left" : "right";
  const physical = value.replace(/^-webkit-/, "");
  return ["left", "right", "center", "justify"].includes(physical)
    ? physical
    : "left";
}
function rgba(value, doc) {
  const match = value?.match(
    /^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i,
  );
  if (match)
    return [
      +match[1],
      +match[2],
      +match[3],
      match[4] === undefined ? 1 : +match[4],
    ];
  if (!value || value === "transparent") return [0, 0, 0, 0];
  if (!doc.defaultView.CSS?.supports("color", value)) return null;
  // Resolve CSS Color 4 values to sRGB using one solid color swatch.
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r, g, b, a / 255];
}
function blend(fg, bg) {
  return bg.map((v, i) =>
    fg ? Math.round(fg[i] * fg[3] + v * (1 - fg[3])) : v,
  );
}
const hex = (rgb) =>
  "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("");
export function readCode(pre) {
  const code =
    pre.tagName === "PRE" && pre.querySelectorAll("code").length === 1
      ? pre.querySelector("code")
      : pre;
  const doc = pre.ownerDocument,
    colors = new Map(),
    styles = new WeakMap(),
    backgrounds = new WeakMap();
  function parse(value) {
    if (!colors.has(value)) colors.set(value, rgba(value, doc));
    return colors.get(value);
  }
  function bg(el) {
    if (!el) return [255, 255, 255];
    if (!backgrounds.has(el))
      backgrounds.set(
        el,
        blend(parse(view(el).backgroundColor), bg(el.parentElement)),
      );
    return backgrounds.get(el);
  }
  const base = hex(bg(code)),
    css = view(code);
  const size = parseFloat(css.fontSize) || 14;
  function tokenStyle(el) {
    if (styles.has(el)) return styles.get(el);
    const cs = view(el),
      back = bg(el);
    const foreground = parse(cs.color) || [32, 33, 36, 1];
    const style = {
      color: hex(blend(foreground, back)),
      bold: cs.fontWeight === "bold" || Number(cs.fontWeight) >= 600,
      italics: /italic|oblique/.test(cs.fontStyle),
    };
    if (hex(back) !== base) style.background = hex(back);
    if (cs.textDecorationLine?.includes("underline"))
      style.decoration = "underline";
    else if (cs.textDecorationLine?.includes("line-through"))
      style.decoration = "lineThrough";
    const tokenSize = parseFloat(cs.fontSize);
    if (tokenSize && tokenSize !== size) style.fontSize = tokenSize * 0.75;
    styles.set(el, style);
    return style;
  }
  const tokens = [];
  function emit(text, el) {
    if (!text) return;
    const style = tokenStyle(el),
      last = tokens.at(-1);
    if (last?.style === style) last.text += text;
    else tokens.push({ text, style });
  }
  function walk(parent) {
    let afterLine = false;
    for (const n of parent.childNodes) {
      if (n.nodeType === 3) {
        if (afterLine && !n.textContent.startsWith("\n")) emit("\n", parent);
        emit(n.textContent, parent);
        afterLine = false;
        continue;
      }
      if (
        n.nodeType !== 1 ||
        n.matches(
          'button,[role="button"],[hidden],script,style,.sr-only,[data-cge],.cm-gutters,[data-line-number],[data-code-block-controls]',
        )
      )
        continue;
      const cs = view(n);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const line =
        n.matches(".cm-line") || cs.display === "block" || n.tagName === "DIV";
      if (
        (afterLine || line) &&
        tokens.length &&
        !tokens.at(-1).text.endsWith("\n")
      )
        emit("\n", parent);
      else if (afterLine && line) emit("\n", parent);
      afterLine = false;
      if (n.tagName === "BR") {
        if (!(parent.matches(".cm-line") && parent.childNodes.length === 1))
          emit("\n", parent);
      } else {
        walk(n);
        afterLine = line;
      }
    }
  }
  walk(code);
  const tab = css.tabSize || "8";
  const tabSize = tab.endsWith("px")
    ? parseFloat(tab) / (size * 0.602)
    : Number(tab);
  return {
    text: tokens.map((t) => t.text).join(""),
    tokens: tokens.map((t) => ({ text: t.text, ...t.style })),
    background: base,
    fontSize: size * 0.75,
    lineHeight: parseFloat(css.lineHeight)
      ? parseFloat(css.lineHeight) / (size * 1.164)
      : 1,
    tabSize: Number.isFinite(tabSize) ? Math.max(0, Math.round(tabSize)) : 8,
    alignment: textAlignment(code),
    language:
      code.className?.match?.(/(?:language|lang)-([\w+-]+)/)?.[1] ||
      code.closest("[data-language]")?.dataset.language ||
      "",
  };
}
