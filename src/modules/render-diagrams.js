import { diagramSVG } from "./diagram.js";
let initialized = false;
async function fromSource(source) {
  // Source is user content. Permit ordinary Mermaid diagrams and exclude features
  // that request resources, bind actions, or override the renderer configuration.
  if (
    source.length > 50000 ||
    /^\s*---|%%\{|<\s*\/?[a-z]|\b(?:click|href|icon|img)\s*[:\s]|(?:https?:|data:|javascript:|url\s*\()/im.test(
      source,
    )
  )
    return null;
  const engine = globalThis.mermaid;
  if (!engine || typeof document === "undefined") return null;
  if (!initialized) {
    engine.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      suppressErrorRendering: true,
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      maxTextSize: 50000,
    });
    initialized = true;
  }
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:-100000px;top:0;width:900px;";
  document.body.append(host);
  try {
    const { svg } = await engine.render(
      "cge" + crypto.randomUUID().replaceAll("-", ""),
      source,
      host,
    );
    const xml = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (xml.documentElement.localName !== "svg") return null;
    host.replaceChildren(document.importNode(xml.documentElement, true));
    return diagramSVG(host.firstElementChild);
  } catch {
    return null;
  } finally {
    host.remove();
  }
}
export async function prepareDiagrams(doc) {
  async function visit(bs) {
    for (const b of bs) {
      if (b.type === "diagram" && b.source && !b.svg) {
        const diagram = await fromSource(b.source);
        if (diagram) Object.assign(b, diagram, { text: b.source });
      }
      if (b.blocks) await visit(b.blocks);
      for (const item of b.items || []) await visit(item);
      for (const row of b.rows || [])
        for (const cell of row) await visit(cell.blocks);
    }
  }
  if (!Array.isArray(doc?.messages)) return;
  for (const m of doc.messages) await visit(m.blocks);
}
