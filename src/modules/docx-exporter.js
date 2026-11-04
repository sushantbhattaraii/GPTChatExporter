import { renderEquation } from "./equations.js";
import {
  Document,
  ImageRun,
  ImportedXmlComponent,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ExternalHyperlink,
  Footer,
  PageNumber,
  AlignmentType,
  LevelFormat,
  PageOrientation,
} from "docx";
import { prepareDocument, tableGrid } from "./document.js";
const FONTS = { sans: "Arial", serif: "Times New Roman", mono: "Courier New" };
function wordEquation(text, display = false, mathml = null) {
  const eq = renderEquation(text, display, mathml);
  if (eq.error || !eq.omml?.includes("<m:oMath"))
    return new TextRun({
      text: "[Unrendered equation] " + eq.source,
      italics: true,
    });
  // fromXmlString returns a document wrapper. Insert its OMML element directly.
  return ImportedXmlComponent.fromXmlString(eq.omml).root[0];
}
function runs(rs) {
  return rs.flatMap((r) => {
    if (r.math) return [wordEquation(r.text, r.display, r.mathml)];
    const children = r.text.split("\n").map(
      (text, i) =>
        new TextRun({
          text,
          break: i ? 1 : undefined,
          bold: r.bold,
          italics: r.italic,
          strike: r.strike,
          underline: r.underline ? { type: "single" } : undefined,
          font: r.code || r.math ? "Courier New" : undefined,
          superScript: r.sup,
          subScript: r.sub,
          color: r.link ? "175D9D" : undefined,
          style: r.link ? "Hyperlink" : undefined,
        }),
    );
    return r.link
      ? [new ExternalHyperlink({ link: r.link, children })]
      : children;
  });
}
export function wordDocument(input, s) {
  const doc = prepareDocument(input, s),
    numbering = [];
  let listId = 0;
  const p = (children, opts = {}) =>
    new Paragraph({ children, spacing: { after: 140 }, ...opts });
  const nonempty = (value) => (value.length ? value : [p([])]);
  function convert(bs, depth = 0, quoted = false) {
    return bs.flatMap((b) => {
      if (b.type === "diagram" || b.type === "slider")
        return p([new TextRun(b.source || b.text)]);
      if (b.type === "image") {
        const im = b.image;
        if (!im.data)
          return p([
            new TextRun({
              text: `[Image unavailable: ${im.alt}]`,
              italics: true,
            }),
          ]);
        const scale = Math.min(
          1,
          (((s.orientation === "landscape" ? 842 : 595) - 2 * s.margin) * 4) /
            3 /
            im.width,
          ((((s.orientation === "landscape" ? 595 : 842) - 2 * s.margin) * 4) /
            3 -
            30) /
            im.height,
        );
        const bytes = Uint8Array.from(atob(im.data.split(",")[1]), (c) =>
          c.charCodeAt(0),
        );
        return p([
          new ImageRun({
            type: im.data.startsWith("data:image/png") ? "png" : "jpg",
            data: bytes,
            transformation: {
              width: Math.round(im.width * scale),
              height: Math.round(im.height * scale),
            },
            altText: { name: im.alt, title: im.alt, description: im.alt },
          }),
        ]);
      }
      if (b.type === "gallery")
        return b.items.flatMap((item) => convert(item, depth, quoted));
      if (b.type === "figure") return convert(b.blocks, depth, quoted);
      if (b.type === "heading")
        return p(runs(b.runs), {
          heading: HeadingLevel[`HEADING_${Math.min(b.level, 6)}`],
          keepNext: true,
        });
      if (b.type === "paragraph")
        return p(
          runs(quoted ? b.runs.map((r) => ({ ...r, italic: true })) : b.runs),
          quoted ? { indent: { left: 240 } } : {},
        );
      if (b.type === "math") return p([wordEquation(b.text, true, b.mathml)]);
      if (b.type === "code")
        return [
          p(
            [
              new TextRun({
                text: b.language || "Code",
                size: 16,
                color: "526174",
              }),
            ],
            { keepNext: true },
          ),
          ...b.text.split("\n").map((line) =>
            p(
              [
                new TextRun({
                  text: line.replace(/\t/g, "    ") || " ",
                  font: "Courier New",
                  size: Math.max(16, (s.fontSize - 2) * 2),
                }),
              ],
              {
                spacing: { after: 0, before: 0 },
                shading: { fill: "F1F3F6" },
                indent: { left: 120 },
                keepNext: false,
              },
            ),
          ),
          p([], { spacing: { after: 80 } }),
        ];
      if (b.type === "list") {
        const ref = `list-${++listId}`;
        numbering.push({
          reference: ref,
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: b.ordered ? LevelFormat.DECIMAL : LevelFormat.BULLET,
            text: b.ordered ? `%${level + 1}.` : "•",
            start: b.start,
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 360 * (level + 1), hanging: 220 } },
            },
          })),
        });
        return b.items.flatMap((item) => {
          const first = item[0];
          const marker = {
            numbering: { reference: ref, level: Math.min(depth, 8) },
          };
          if (first && ["paragraph", "heading"].includes(first.type))
            return [
              p(runs(first.runs), marker),
              ...convert(item.slice(1), depth + 1),
            ];
          return [p([], marker), ...convert(item, depth + 1)];
        });
      }
      if (b.type === "table") {
        const grid = tableGrid(b.rows);
        if (!grid.length) return [];
        if (grid[0].length > 8)
          return grid.flatMap((row, i) => [
            p([new TextRun({ text: `Row ${i + 1}`, bold: true })], {
              keepNext: true,
            }),
            ...row.flatMap((cell, j) => [
              p([new TextRun(`Column ${j + 1}`)], { keepNext: true }),
              ...convert(cell.blocks),
            ]),
          ]);
        return [
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: grid.map(
              (row) =>
                new TableRow({
                  tableHeader: row.every((c) => c.header),
                  children: row.map(
                    (c) =>
                      new TableCell({
                        shading: c.header ? { fill: "E9EEF4" } : undefined,
                        children: nonempty(convert(c.blocks)),
                      }),
                  ),
                }),
            ),
          }),
          p([]),
        ];
      }
      if (b.type === "quote") return convert(b.blocks, depth, true);
      if (b.type === "rule")
        return p([], {
          border: { bottom: { color: "CBD5E1", style: "single", size: 4 } },
        });
      return [];
    });
  }
  const children = [];
  if (s.includeTitle)
    children.push(
      p([new TextRun(doc.title || "ChatGPT Conversation")], {
        heading: HeadingLevel.TITLE,
        keepNext: true,
      }),
    );
  if (s.includeTimestamps)
    children.push(
      p([
        new TextRun({
          text: `Exported ${new Date(doc.exportedAt).toLocaleString()} (export time)`,
          size: 16,
          color: "526174",
        }),
      ]),
    );
  if (doc.warnings.length)
    children.push(
      p([
        new TextRun({
          text: doc.warnings.join(" "),
          size: 16,
          color: "526174",
        }),
      ]),
    );
  for (const m of doc.messages) {
    children.push(
      p(
        [
          new TextRun({
            text: m.role === "user" ? "USER" : "CHATGPT",
            bold: true,
            color: "175D9D",
            size: 20,
          }),
        ],
        { keepNext: true, spacing: { before: 240, after: 120 } },
      ),
    );
    if (s.includeTimestamps && m.timestamp)
      children.push(p([new TextRun({ text: m.timestamp, size: 16 })]));
    children.push(...convert(m.blocks));
  }
  return new Document({
    creator: "ChatGPT Conversation Exporter",
    title: s.includeTitle ? doc.title : "ChatGPT export",
    styles: {
      default: {
        document: {
          run: { font: FONTS[s.font], size: s.fontSize * 2 },
          paragraph: { spacing: { after: 140, line: 276 } },
        },
      },
    },
    numbering: { config: numbering },
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation:
                s.orientation === "landscape"
                  ? PageOrientation.LANDSCAPE
                  : PageOrientation.PORTRAIT,
              width: 11906,
              height: 16838,
            },
            margin: {
              top: s.margin * 20,
              bottom: s.margin * 20,
              left: s.margin * 20,
              right: s.margin * 20,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              p(
                [
                  new TextRun({
                    children: [
                      PageNumber.CURRENT,
                      " / ",
                      PageNumber.TOTAL_PAGES,
                    ],
                    size: 16,
                  }),
                ],
                { alignment: AlignmentType.CENTER },
              ),
            ],
          }),
        },
        children,
      },
    ],
  });
}
export function generateDOCX(doc, s) {
  return Packer.toBlob(wordDocument(doc, s));
}
