import pdfMake from "pdfmake/build/pdfmake.js";
import fonts from "../font-data.json" with { type: "json" };
import coverage from "../font-coverage.json" with { type: "json" };
import { prepareDocument, tableGrid } from "./document.js";
import { renderEquation } from "./equations.js";
import { plainText } from "./normalize.js";
pdfMake.addVirtualFileSystem(fonts);
pdfMake.fonts = {};
for (const [name, base] of [
  ["sans", "DejaVuSans"],
  ["serif", "DejaVuSerif"],
  ["mono", "DejaVuSansMono"],
]) {
  const italic = name === "serif" ? "Italic" : "Oblique";
  pdfMake.fonts[name] = {
    normal: `${base}.ttf`,
    bold: `${base}-Bold.ttf`,
    italics: `${base}-${italic}.ttf`,
    bolditalics: `${base}-Bold${italic}.ttf`,
  };
}
const codeWrap = (s) =>
  s.replace(/[^\s]{24,}/gu, (word) =>
    Array.from(word)
      .map((x, i) => (i && i % 20 === 0 ? "\u200b" + x : x))
      .join(""),
  );
function runs(rs) {
  return rs.map((r) => ({
    text: r.code ? codeWrap(r.text) : r.text,
    bold: r.bold,
    italics: r.italic,
    decoration: r.strike ? "lineThrough" : undefined,
    link: r.link,
    font: r.code ? "mono" : undefined,
    color: r.link ? "#175d9d" : undefined,
    background: r.code ? "#f0f2f5" : undefined,
  }));
}
const nonempty = (value) => (value.length ? value : [{ text: " " }]);
function formulaBlock(eq, s) {
  if (eq.error)
    return {
      text: "[Unrendered equation] " + eq.source,
      italics: true,
      color: "#526174",
      margin: [0, 4, 0, 6],
    };
  const width =
    s.equationWidth ||
    (s.orientation === "landscape" ? 842 : 595) - 2 * s.margin;
  const scale = Math.min(
    s.fontSize,
    Math.max(8, width) / eq.widthEm,
    260 / eq.heightEm,
  );
  return {
    svg: eq.svg,
    width: eq.widthEm * scale,
    height: eq.heightEm * scale,
    margin: [0, 4, 0, 7],
  };
}
function paragraph(b, s) {
  const style =
    b.type === "heading"
      ? { style: `h${Math.min(b.level, 3)}`, headlineLevel: b.level }
      : { margin: [0, 0, 0, 7] };
  const out = [];
  let pending = [];
  const flush = () => {
    if (pending.length) out.push({ text: runs(pending), ...style });
    pending = [];
  };
  for (const r of b.runs) {
    if (!r.math) {
      pending.push(r);
      continue;
    }
    const eq = renderEquation(r.text, r.display, r.mathml);
    if (!r.display && eq.inline != null) {
      pending.push({ ...r, text: eq.inline, italic: true });
      continue;
    }
    flush();
    out.push(formulaBlock(eq, s));
  }
  flush();
  return out;
}
function convert(bs, s) {
  return bs.flatMap((b) => {
    if (b.type === "image") {
      const im = b.image;
      if (!im.data)
        return {
          text: `[Image unavailable: ${im.alt}]`,
          italics: true,
          color: "#526174",
          margin: [0, 3, 0, 6],
        };
      const maxWidth =
        s.equationWidth ||
        (s.orientation === "landscape" ? 842 : 595) - 2 * s.margin;
      const maxHeight =
        (s.orientation === "landscape" ? 595 : 842) - 2 * s.margin - 25;
      const scale = Math.min(0.75, maxWidth / im.width, maxHeight / im.height);
      return {
        image: im.data,
        width: im.width * scale,
        height: im.height * scale,
        margin: [0, 4, 0, 8],
      };
    }
    if (b.type === "heading" || b.type === "paragraph") return paragraph(b, s);
    if (b.type === "math")
      return formulaBlock(renderEquation(b.text, true, b.mathml), s);
    if (b.type === "code")
      return [
        {
          text: b.language || "Code",
          fontSize: 8,
          color: "#526174",
          margin: [0, 5, 0, 3],
        },
        ...b.text.split("\n").map((line) => ({
          text: codeWrap(line.replace(/\t/g, "    ")) || " ",
          font: "mono",
          fontSize: Math.max(8, s.fontSize - 2),
          preserveLeadingSpaces: true,
          background: "#f1f3f6",
          margin: [8, 0, 0, 1],
        })),
        { text: " ", fontSize: 3 },
      ];
    if (b.type === "list")
      return {
        [b.ordered ? "ol" : "ul"]: b.items.map((item) => ({
          stack: nonempty(convert(item, s)),
        })),
        start: b.start,
        margin: [0, 0, 0, 8],
      };
    if (b.type === "table") {
      const grid = tableGrid(b.rows),
        n = grid[0]?.length || 0;
      if (!n) return [];
      // Wide tables remain readable as labeled rows instead of overflowing the page.
      if (n > 8)
        return [
          { text: "Wide table (row-by-row)", bold: true },
          ...grid.map((row, i) => ({
            stack: [
              { text: `Row ${i + 1}`, bold: true },
              ...row.flatMap((cell, j) => [
                { text: `Column ${j + 1}`, italics: true },
                ...convert(cell.blocks, s),
              ]),
            ],
            margin: [0, 4, 0, 8],
          })),
        ];
      return {
        table: {
          headerRows: grid[0].every((c) => c.header) ? 1 : 0,
          widths: Array(n).fill("*"),
          body: grid.map((row) =>
            row.map((c) => ({
              stack: nonempty(
                convert(c.blocks, {
                  ...s,
                  equationWidth:
                    (s.equationWidth ||
                      (s.orientation === "landscape" ? 842 : 595) -
                        2 * s.margin) /
                      n -
                    12,
                }),
              ),
              fillColor: c.header ? "#e9eef4" : undefined,
              bold: c.header,
              margin: [3, 3, 3, 3],
            })),
          ),
        },
        layout: "lightHorizontalLines",
        fontSize: Math.max(8, s.fontSize - 1),
        margin: [0, 5, 0, 12],
      };
    }
    if (b.type === "quote")
      return {
        stack: convert(b.blocks, s),
        margin: [16, 4, 0, 10],
        color: "#526174",
        italics: true,
      };
    if (b.type === "rule")
      return {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: 150,
            y2: 0,
            lineWidth: 0.5,
            lineColor: "#cbd5e1",
          },
        ],
        margin: [0, 8, 0, 8],
      };
    return [];
  });
}
export function pdfDefinition(input, s) {
  if (input?.layout === "appearance") {
    if (!input.pages?.length)
      throw new Error("No visible pages were captured.");
    const pw = s.orientation === "landscape" ? 842 : 595,
      ph = s.orientation === "landscape" ? 595 : 842;
    return {
      pageSize: "A4",
      pageOrientation: s.orientation,
      pageMargins: s.margin,
      info: { title: s.includeTitle ? input.title : "ChatGPT export" },
      content: input.pages.map((image, i) => ({
        image,
        fit: [pw - 2 * s.margin - 1, ph - 2 * s.margin - 1],
        pageBreak: i ? "before" : undefined,
      })),
    };
  }
  const doc = prepareDocument(input, s),
    content = [];
  const chars = new Set([...coverage[s.font]]);
  const unsupported = new Set();
  for (const m of doc.messages)
    for (const c of plainText(m.blocks))
      if (c.codePointAt(0) > 32 && !chars.has(c.codePointAt(0)))
        unsupported.add(c);
  if (unsupported.size)
    doc.warnings.push(
      "Some characters are outside the bundled PDF font coverage. Use Word for scripts or emoji missing in this PDF.",
    );
  if (s.includeTitle)
    content.push({ text: doc.title || "ChatGPT Conversation", style: "title" });
  if (s.includeTimestamps)
    content.push({
      text: `Exported ${new Date(doc.exportedAt).toLocaleString()} (export time)`,
      style: "meta",
    });
  if (doc.warnings.length)
    content.push({ text: doc.warnings.join("\n"), style: "note" });
  for (const m of doc.messages) {
    content.push({
      text: m.role === "user" ? "USER" : "CHATGPT",
      style: "label",
      headlineLevel: 1,
    });
    if (s.includeTimestamps && m.timestamp)
      content.push({ text: m.timestamp, style: "meta" });
    content.push(...convert(m.blocks, s));
  }
  return {
    info: {
      title: s.includeTitle ? doc.title : "ChatGPT export",
      creator: "ChatGPT Conversation Exporter",
    },
    pageSize: "A4",
    pageOrientation: s.orientation,
    pageMargins: [s.margin, s.margin, s.margin, s.margin],
    defaultStyle: { font: s.font, fontSize: s.fontSize, lineHeight: 1.2 },
    content,
    styles: {
      title: { fontSize: 22, bold: true, margin: [0, 0, 0, 16] },
      meta: { fontSize: 8, color: "#526174", margin: [0, 0, 0, 8] },
      note: { fontSize: 8, color: "#526174", margin: [0, 0, 0, 14] },
      label: {
        fontSize: 10,
        bold: true,
        color: "#175d9d",
        margin: [0, 16, 0, 8],
      },
      h1: { fontSize: s.fontSize + 7, bold: true, margin: [0, 12, 0, 6] },
      h2: { fontSize: s.fontSize + 4, bold: true, margin: [0, 10, 0, 6] },
      h3: { fontSize: s.fontSize + 2, bold: true, margin: [0, 8, 0, 5] },
    },
    footer: (page, total) => ({
      text: `${page} / ${total}`,
      alignment: "center",
      fontSize: 8,
      color: "#526174",
      margin: [0, 12, 0, 0],
    }),
    pageBreakBefore: (node, following) =>
      Boolean(node.headlineLevel && following.length === 0),
  };
}
export function generatePDF(doc, s) {
  return new Promise((resolve, reject) => {
    try {
      const stream = pdfMake.createPdf(pdfDefinition(doc, s)).getStream();
      const chunks = [];
      stream.on("data", (chunk) => chunks.push(new Uint8Array(chunk)));
      stream.on("error", reject);
      stream.on("end", () =>
        resolve(new Blob(chunks, { type: "application/pdf" })),
      );
      stream.end();
    } catch (e) {
      reject(e);
    }
  });
}
