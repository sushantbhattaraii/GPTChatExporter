import pdfMake from "pdfmake/build/pdfmake.js";
import fonts from "../font-data.json" with { type: "json" };
import { fontFor, selectFonts } from "./unicode.js";
import { printableLayoutSVG } from "./html-layout.js";
import { imagePlacement, rasterViewport } from "./image-box.js";
import { prepareDiagrams } from "./render-diagrams.js";
import { prepareDocument, tableGrid } from "./document.js";
import { renderEquation } from "./equations.js";
import { plainText } from "./normalize.js";
pdfMake.addVirtualFileSystem(fonts);
pdfMake.fonts = {};
for (const [name, base] of [
  ["symbols", "DejaVuSans"],
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
pdfMake.fonts.sans = {
  normal: "LiberationSans-Regular.ttf",
  bold: "LiberationSans-Bold.ttf",
  italics: "LiberationSans-Italic.ttf",
  bolditalics: "LiberationSans-BoldItalic.ttf",
};
for (const [key, file] of Object.entries({
  deva: "NotoSansDevanagari_400Regular.ttf",
  cjk: "NotoSansSC_400Regular.ttf",
  hangul: "HangulFallback.ttf",
})) {
  pdfMake.fonts[key] = {
    normal: file,
    bold: file,
    italics: file,
    bolditalics: file,
  };
}
const codeWrap = (s) =>
  s.replace(/[^\s]{24,}/gu, (word) =>
    Array.from(word)
      .map((x, i) => (i && i % 20 === 0 ? "\u200b" + x : x))
      .join(""),
  );
const INK = "#111111",
  NAVY = "#1F3864",
  LINK = "#0000EE";
function printColor(run, heading) {
  if (run.link) return LINK;
  if (!run.color || run.code || run.background) return run.color;
  const rgb = run.color
    .slice(1)
    .match(/../g)
    ?.map((x) => parseInt(x, 16));
  if (rgb?.length === 3 && Math.max(...rgb) - Math.min(...rgb) < 16) {
    if (heading) return NAVY;
    // Near-white theme ink needs a printable foreground on an unfilled page.
    if (Math.min(...rgb) > 200 || Math.max(...rgb) < 34) return INK;
  }
  return run.color;
}
function runs(rs, s, heading) {
  return rs.flatMap((r) => {
    const lines = new Set([r.pdfStyle?.decoration].flat().filter(Boolean));
    if (r.strike) lines.add("lineThrough");
    if (r.underline || r.link) lines.add("underline");
    return selectFonts(
      {
        text: r.code ? codeWrap(r.text) : r.text,
        bold: r.bold,
        italics: r.italic,
        link: r.link,
        font: r.code ? "mono" : undefined,
        color: printColor(r, heading),
        background: r.background || (r.code ? "#f0f2f5" : undefined),
        ...r.pdfStyle,
        decoration: lines.size ? [...lines] : undefined,
      },
      r.code ? "mono" : s.font,
    );
  });
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
      : { margin: [0, 0, 0, s.paragraphGap ?? s.fontSize] };
  const out = [];
  let pending = [];
  const flush = () => {
    if (pending.length)
      out.push({
        text: runs(pending, s, b.type === "heading"),
        ...style,
        alignment: b.alignment,
      });
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
    out.push({ ...formulaBlock(eq, s), alignment: b.alignment });
  }
  flush();
  return out;
}
// Wrap on glyph boundaries while retaining the original token and logical tab column.
function codeBlock(block, s) {
  const size = block.fontSize || Math.max(8, s.fontSize - 2);
  const width = Math.max(1, s.equationWidth - 14);
  const rows = [[]];
  let column = 0,
    used = 0;
  const nextRow = () => {
    rows.push([]);
    used = 0;
  };
  for (const source of block.tokens || [{ text: block.text }]) {
    const { text, ...style } = source;
    let chunk = "";
    function flush() {
      if (chunk) rows.at(-1).push({ ...style, text: chunk });
      chunk = "";
    }
    const advance = (style.fontSize || size) * 0.603;
    for (const char of text) {
      if (char === "\n") {
        flush();
        nextRow();
        column = 0;
        continue;
      }
      const tab = block.tabSize ?? 4;
      const value =
        char === "\t" ? " ".repeat(tab ? tab - (column % tab) : 0) : char;
      for (const glyph of value) {
        if (used && used + advance > width) {
          flush();
          nextRow();
        }
        chunk += glyph;
        used += advance;
        column++;
      }
    }
    flush();
  }
  const fillColor = block.background || "#f1f3f6";
  return [
    {
      text: block.language || "Code",
      fontSize: 8,
      color: "#526174",
      margin: [0, 5, 0, 3],
    },
    {
      table: {
        widths: ["*"],
        body: [
          [
            {
              fillColor,
              stack: rows.map((line) => ({
                text: line.length
                  ? line.flatMap((run) => selectFonts(run, "mono"))
                  : " ",
                font: "mono",
                fontSize: size,
                preserveLeadingSpaces: true,
                preserveTrailingSpaces: true,
                noWrap: true,
                alignment: block.alignment,
                lineHeight: block.lineHeight || 1,
              })),
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: () => 0,
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 5,
        paddingBottom: () => 5,
      },
      margin: [0, 0, 0, 7],
    },
  ];
}
function convert(bs, s) {
  return bs.flatMap((b) => {
    if (b.type === "layout") {
      const maxHeight =
        (s.orientation === "landscape" ? 595.28 : 841.89) -
        2 * (s.margin + 9) -
        16;
      const scale = Math.min(
        0.75,
        s.equationWidth / b.width,
        maxHeight / b.height,
      );
      return {
        svg: printableLayoutSVG(b),
        font: "sans",
        width: b.width * scale,
        height: b.height * scale,
        margin: [0, 4, 0, 9],
      };
    }
    if (b.type === "figure" || b.type === "gallery") {
      const items = b.items || [b.blocks],
        gap = 6,
        pad = 8;
      const columns = Math.max(
        1,
        Math.min(b.columns || 1, Math.floor(s.equationWidth / 75)),
      );
      const width = (s.equationWidth - (columns - 1) * gap) / columns;
      const rows = [];
      for (let i = 0; i < items.length; i += columns) {
        rows.push({
          columnGap: gap,
          columns: items.slice(i, i + columns).map((item) => ({
            width,
            table: {
              widths: ["*"],
              body: [
                [
                  {
                    stack: nonempty(
                      convert(item, {
                        ...s,
                        equationWidth: width - 2 * pad - 1,
                        paragraphGap: 3,
                      }),
                    ),
                  },
                ],
              ],
            },
            layout: {
              hLineWidth: () => 0.5,
              vLineWidth: () => 0.5,
              hLineColor: () => "#DDDDDD",
              vLineColor: () => "#DDDDDD",
              paddingLeft: () => pad,
              paddingRight: () => pad,
              paddingTop: () => pad,
              paddingBottom: () => pad,
            },
          })),
          margin: [0, 0, 0, s.fontSize],
        });
      }
      return rows;
    }
    if (b.type === "image") {
      const im = b.image;
      if (im.display?.hidden) return [];
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
      const box = im.display || {
        width: im.width,
        height: im.height,
        fit: "fill",
      };
      const scale = Math.min(
        0.75,
        maxWidth / box.width,
        maxHeight / box.height,
      );
      const paint = imagePlacement(box, im.width, im.height);
      const fillsBox =
        Math.abs(paint.width - box.width) < 0.01 &&
        Math.abs(paint.height - box.height) < 0.01 &&
        Math.abs(paint.x) < 0.01 &&
        Math.abs(paint.y) < 0.01;
      return {
        ...(fillsBox
          ? { image: im.data }
          : {
              svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box.width} ${box.height}">${rasterViewport(0, 0, box, paint, im.data)}</svg>`,
            }),
        width: box.width * scale,
        height: box.height * scale,
        link: im.link,
        margin: [0, 4, 0, 8],
      };
    }
    if (b.type === "slider") {
      const width = Math.min(160, Math.max(8, s.equationWidth - 8)),
        x = 4 + b.fraction * width;
      return [
        { text: selectFonts({ text: b.text }, s.font), margin: [0, 3, 0, 1] },
        {
          canvas: [
            {
              type: "line",
              x1: 4,
              y1: 5,
              x2: width + 4,
              y2: 5,
              lineWidth: 2,
              lineColor: "#b0bbb7",
            },
            {
              type: "line",
              x1: 4,
              y1: 5,
              x2: x,
              y2: 5,
              lineWidth: 2,
              lineColor: "#31634c",
            },
            { type: "ellipse", x, y: 5, r1: 4, r2: 4, color: "#31634c" },
          ],
          margin: [0, 0, 0, 6],
        },
      ];
    }
    if (b.type === "diagram") {
      if (!b.svg)
        return [
          { text: "Diagram source (preview unavailable)", italics: true },
          ...codeBlock({ text: b.text, language: "Mermaid" }, s),
        ];
      const scale = Math.min(
        s.equationWidth / b.width,
        ((s.orientation === "landscape" ? 595 : 842) - 2 * s.margin - 40) /
          b.height,
        1,
      );
      return {
        svg: b.svg,
        width: b.width * scale,
        height: b.height * scale,
        margin: [0, 4, 0, 8],
      };
    }
    if (b.type === "heading" || b.type === "paragraph") return paragraph(b, s);
    if (b.type === "math")
      return {
        ...formulaBlock(renderEquation(b.text, true, b.mathml), s),
        alignment: b.alignment,
      };
    if (b.type === "code") return codeBlock(b, s);
    if (b.type === "list") {
      let counter = b.start;
      return {
        [b.ordered ? "ol" : "ul"]: b.items.map((item, i) => {
          const current = b.counters?.[i] ?? counter;
          counter = current + (b.reversed ? -1 : 1);
          return {
            ...(item[0]?.runs?.[0]?.control === "check"
              ? { listType: "none" }
              : {}),
            ...(b.ordered ? { counter: current } : {}),
            stack: nonempty(
              convert(item, {
                ...s,
                paragraphGap: 0,
                equationWidth: s.equationWidth - 30,
              }),
            ),
          };
        }),
        start: b.start,
        reversed: b.reversed,
        type: b.listType || (b.ordered ? "decimal" : "disc"),
        margin: [s.fontSize * 1.62, 0, 0, s.paragraphGap ?? s.fontSize],
      };
    }
    if (b.type === "table") {
      const grid = tableGrid(b.rows),
        n = grid[0]?.length || 0;
      if (!n) return [];
      // Wide tables remain readable as labeled rows instead of overflowing the page.
      if (n > 8 || s.equationWidth < n * 18)
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
      const inner = s.equationWidth - n * 9 - (n + 1) * 0.5;
      const weights =
        b.widthShares?.length === n &&
        b.widthShares.every((w) => inner * w >= 16)
          ? b.widthShares
          : Array(n).fill(1 / n);
      const widths = weights.map((weight) => inner * weight);
      const cellSize = Math.max(8, (s.fontSize * 10) / 11);
      return {
        table: {
          headerRows: grid[0].every((c) => c.header) ? 1 : 0,
          widths,
          body: grid.map((row) =>
            row.map((c, i) => ({
              stack: nonempty(
                convert(
                  c.blocks.map((block) =>
                    c.header && block.type === "paragraph"
                      ? { ...block, alignment: "center" }
                      : block,
                  ),
                  {
                    ...s,
                    fontSize: cellSize,
                    equationWidth: widths[i],
                    paragraphGap: 0,
                  },
                ),
              ),
              bold: c.header,
            })),
          ),
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0.5,
          hLineColor: () => "#999999",
          vLineColor: () => "#999999",
          paddingLeft: () => 4.5,
          paddingRight: () => 4.5,
          paddingTop: () => 3,
          paddingBottom: () => 3,
        },
        fontSize: cellSize,
        margin: [0, 0, 0, s.fontSize],
      };
    }
    if (b.type === "quote")
      return {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: nonempty(
                  convert(b.blocks, {
                    ...s,
                    equationWidth: s.equationWidth - 16,
                  }),
                ),
                border: [true, false, false, false],
              },
            ],
          ],
        },
        layout: {
          vLineWidth: () => 2,
          vLineColor: () => "#71867d",
          hLineWidth: () => 0,
          paddingLeft: () => 9,
          paddingRight: () => 2,
        },
        margin: [2, 4, 0, 8],
      };
    if (b.type === "rule")
      return {
        canvas: [
          {
            type: "line",
            x1: 0,
            y1: 0,
            x2: s.equationWidth,
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
  const doc = prepareDocument(input, s),
    content = [];

  const unsupported = new Set();
  for (const m of doc.messages)
    for (const c of plainText(m.blocks))
      if (c.codePointAt(0) > 32 && !fontFor(c, s.font)) unsupported.add(c);
  if (unsupported.size)
    doc.warnings.push(
      "Some characters are outside the bundled PDF font coverage. Some glyphs may need a different font in Word.",
    );
  if (s.showPdfTitle)
    content.push({ text: doc.title || "ChatGPT Conversation", style: "title" });
  if (s.includeTimestamps)
    content.push({
      text: `Exported ${new Date(doc.exportedAt).toLocaleString()} (export time)`,
      style: "meta",
    });

  // The print reference has a 3 pt horizontal and 9 pt vertical inset within
  // its page margins. Only the prompt uses a narrower measure and inner padding.
  const horizontal = s.margin + 3,
    vertical = s.margin + 9;
  const usable =
    (s.orientation === "landscape" ? 841.89 : 595.28) - 2 * horizontal;
  for (const m of doc.messages) {
    const user = m.role === "user";
    const indent = user ? usable * 0.15 + 8 : 0,
      right = user ? 9 : 0;
    const blocks = user
      ? m.blocks.map((b) =>
          b.type === "paragraph" ? { ...b, alignment: "right" } : b,
        )
      : m.blocks;
    const stack = convert(blocks, {
      ...s,
      equationWidth: usable - indent - right,
    });
    if (s.includeTimestamps && m.timestamp)
      stack.unshift({
        text: m.timestamp,
        style: "meta",
        alignment: user ? "right" : "left",
      });
    if (stack.length)
      content.push({
        stack,
        margin: [indent, user ? 16 : 0, right, user ? 6 : 0],
      });
  }
  const size = s.fontSize;
  return {
    info: {
      title: s.includeTitle ? doc.title : "ChatGPT export",
      creator: "ChatGPT Conversation Exporter",
      subject: doc.warnings.join(" "),
    },
    pageSize: "A4",
    pageOrientation: s.orientation,
    pageMargins: [horizontal, vertical, horizontal, vertical],
    defaultStyle: { font: s.font, fontSize: size, color: INK, lineHeight: 1.3 },
    content,
    styles: {
      title: {
        fontSize: (size * 20) / 11,
        bold: true,
        color: NAVY,
        margin: [0, 0, 0, size],
      },
      meta: { fontSize: 8, color: "#526174", margin: [0, 0, 0, 6] },
      h1: {
        fontSize: (size * 20) / 11,
        bold: true,
        color: NAVY,
        lineHeight: 1.14,
        margin: [0, 1.5, 0, size + 2.5],
      },
      h2: {
        fontSize: (size * 16) / 11,
        bold: true,
        color: NAVY,
        lineHeight: 1.17,
        margin: [0, 1, 0, size + 2],
      },
      h3: {
        fontSize: (size * 13) / 11,
        bold: true,
        color: NAVY,
        lineHeight: 1.18,
        margin: [0, 2, 0, size],
      },
    },
    pageBreakBefore: (node, following) =>
      Boolean(node.headlineLevel && following.length === 0),
  };
}
export async function generatePDF(doc, s) {
  await prepareDiagrams(doc);
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
