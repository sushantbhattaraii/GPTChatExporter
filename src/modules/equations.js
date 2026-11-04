// Compile locally with a fixed package list. TeX cannot request remote extensions.
import { mathjax } from "mathjax-full/js/mathjax.js";
import { TeX } from "mathjax-full/js/input/tex.js";
import "mathjax-full/js/input/tex/ams/AmsConfiguration.js";
import "mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js";
import { MathML } from "mathjax-full/js/input/mathml.js";
import { SVG } from "mathjax-full/js/output/svg.js";
import { liteAdaptor } from "mathjax-full/js/adaptors/liteAdaptor.js";
import { RegisterHTMLHandler } from "mathjax-full/js/handlers/html.js";
import { SerializedMmlVisitor } from "mathjax-full/js/core/MmlTree/SerializedMmlVisitor.js";
import { mml2omml } from "mathml2omml";

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const visitor = new SerializedMmlVisitor();
function engine(isMathML) {
  return mathjax.document("", {
    InputJax: isMathML
      ? new MathML()
      : new TeX({
          packages: ["base", "ams", "newcommand"],
          maxBuffer: 32768,
          maxMacros: 1000,
        }),
    OutputJax: new SVG({ fontCache: "none" }),
  });
}
export function texBody(text) {
  const t = text.trim();
  for (const [open, close] of [
    ["\\[", "\\]"],
    ["\\(", "\\)"],
    ["$$", "$$"],
    ["$", "$"],
  ]) {
    if (
      t.startsWith(open) &&
      t.endsWith(close) &&
      t.length > open.length + close.length
    )
      return t.slice(open.length, -close.length).trim();
  }
  return t;
}
// Keep ordinary inline identifiers and numeric scripts in the line of prose.
function linearMath(node) {
  if (!node || node.attributes?.getExplicit("mathvariant")) return null;
  if (["mi", "mo", "mn", "mtext", "text"].includes(node.kind))
    return (
      node.getText?.() ?? node.childNodes.map((n) => linearMath(n)).join("")
    );
  if (
    ![
      "math",
      "mrow",
      "inferredMrow",
      "TeXAtom",
      "mstyle",
      "msup",
      "msub",
    ].includes(node.kind)
  )
    return null;
  const parts = node.childNodes.map(linearMath);
  if (parts.some((p) => p === null)) return null;
  if (["math", "mrow", "inferredMrow", "TeXAtom", "mstyle"].includes(node.kind))
    return parts.join("");
  if (
    ["msup", "msub"].includes(node.kind) &&
    Array.from(parts[0]).length === 1 &&
    /^[0-9+-]+$/.test(parts[1])
  ) {
    const alphabet = node.kind === "msup" ? "⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻" : "₀₁₂₃₄₅₆₇₈₉₊₋";
    return (
      parts[0] +
      Array.from(parts[1], (c) => alphabet["0123456789+-".indexOf(c)]).join("")
    );
  }
  return null;
}
export function renderEquation(raw, display = false, mathmlInput = null) {
  const source = texBody(raw);
  try {
    const input = mathmlInput || source;
    if (!input || input.length > 32768)
      throw new Error("Formula exceeds the supported size");
    // A fresh TeX state prevents macros/labels from changing another equation.
    const doc = engine(Boolean(mathmlInput));
    const item = new doc.options.MathItem(input, doc.inputJax[0], display);
    item.start.node = adaptor.body(doc.document);
    item.setMetrics(16, 8, 1280, 1000000, 1);
    item.convert(doc);
    const tree = item.root;
    const mathml = visitor.visitTree(tree);
    if (/<merror\b/.test(mathml)) throw new Error("Unsupported TeX");
    const svg = adaptor.firstChild(item.typesetRoot);
    const view = adaptor.getAttribute(svg, "viewBox").split(/\s+/).map(Number);
    if (!(view[2] > 0 && view[3] > 0)) throw new Error("Empty formula");
    let omml;
    try {
      omml = mml2omml(mathml);
    } catch {
      /* PDF can still render the vector formula. */
    }
    adaptor.setAttribute(svg, "width", String((view[2] / 1000) * 16));
    adaptor.setAttribute(svg, "height", String((view[3] / 1000) * 16));
    return {
      source,
      svg: adaptor.outerHTML(svg).replaceAll("currentColor", "#162030"),
      widthEm: view[2] / 1000,
      heightEm: view[3] / 1000,
      inline: linearMath(tree),
      omml,
    };
  } catch {
    return { source, error: true };
  }
}
