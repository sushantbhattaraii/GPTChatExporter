// Only images actually displayed in an exported message enter this export-scoped cache.
let session;
export function beginImages() {
  session = new Map();
}
export function endImages() {
  session = null;
}
export function meaningfulImage(img) {
  if (
    img.closest(
      'nav,aside,form,[data-cge],[hidden],template,[data-testid*="avatar" i]',
    )
  )
    return false;
  const rect = img.getBoundingClientRect();
  return !(
    rect.width > 0 &&
    rect.height > 0 &&
    rect.width <= 24 &&
    rect.height <= 24
  );
}
const canvasIds = new WeakMap();
export function imageSource(el) {
  if (el.tagName === "IMG")
    return el.currentSrc || el.getAttribute("src") || "";
  if (el.tagName === "CANVAS") return "";
  const css =
    el.ownerDocument.defaultView.getComputedStyle(el).backgroundImage || "";
  const match = css.match(/^url\((["']?)(.*?)\1\)$/);
  return match?.[2] || "";
}
export function imageRef(el) {
  const source = imageSource(el),
    alt = el.alt || el.getAttribute("aria-label") || "Image";
  if (!source && !canvasIds.has(el))
    canvasIds.set(el, "surface-" + crypto.randomUUID());
  const key = source || canvasIds.get(el);
  if (session && (source || el.tagName === "CANVAS"))
    session.set(key, { el, source });
  return { text: `[Image: ${alt}]`, image: { key, alt } };
}
function raster(el) {
  const width = el.naturalWidth || el.width,
    height = el.naturalHeight || el.height;
  if (!width || !height) throw new Error("Image has not loaded");
  const scale = Math.min(1, 1600 / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  ctx.drawImage(el, 0, 0, canvas.width, canvas.height);
  let data = canvas.toDataURL("image/png");
  if (data.length > 400000) {
    const alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = true;
    for (let i = 3; i < alpha.length; i += 4)
      if (alpha[i] !== 255) {
        opaque = false;
        break;
      }
    if (opaque) data = canvas.toDataURL("image/jpeg", 0.9);
  }
  return { data, width: canvas.width, height: canvas.height };
}
export function decodeRaster(data) {
  const match = /^data:(image\/(?:png|jpeg|gif|webp|avif));base64,(.+)$/i.exec(
    data,
  );
  if (!match) throw new Error("Invalid raster data");
  return createImageBitmap(
    new Blob([Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0))], {
      type: match[1],
    }),
  );
}
async function resolve(ref) {
  const item = session?.get(ref.key);
  if (!item) return null;
  try {
    if (item.el.tagName === "CANVAS") return raster(item.el);
    if (
      item.el.complete &&
      (item.el.currentSrc || item.el.getAttribute("src")) === item.source
    )
      return raster(item.el);
  } catch {
    /* A visible cross-origin image may taint a canvas. */
  }
  try {
    let source = item.source;
    if (!/^data:image\/(png|jpeg|webp|gif);base64,/i.test(source)) {
      const url = new URL(source, location.href);
      if (url.protocol === "blob:" && url.origin === location.origin) {
        const response = await fetch(url.href);
        const blob = await response.blob();
        if (!response.ok || blob.size > 12_000_000) return null;
        const bitmap = await createImageBitmap(blob);
        try {
          return raster(bitmap);
        } finally {
          bitmap.close();
        }
      }
      const result = await chrome.runtime.sendMessage({
        type: "CGE_IMAGE",
        url: url.href,
      });
      if (!result?.ok) return null;
      source = result.data;
    }
    const bitmap = await decodeRaster(source);
    try {
      return raster(bitmap);
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}
export async function embedImages(messages) {
  const cache = new Map();
  async function visit(bs) {
    for (const b of bs) {
      if (b.type === "image") {
        const ref = b.image;
        if (!cache.has(ref.key)) cache.set(ref.key, await resolve(ref));
        b.image = { alt: ref.alt, ...cache.get(ref.key) };
      }
      if (b.blocks) await visit(b.blocks);
      if (b.items) for (const item of b.items) await visit(item);
      if (b.rows)
        for (const row of b.rows)
          for (const cell of row) await visit(cell.blocks);
    }
  }
  for (const m of messages) await visit(m.blocks);
}
// Move images out of inline runs so both document engines preserve their original order.
export function liftImages(bs) {
  return bs.flatMap((b) => {
    if (b.runs?.some((r) => r.image || r.diagram || r.widget)) {
      const out = [];
      let runs = [];
      const flush = () => {
        if (runs.length) out.push({ ...b, runs });
        runs = [];
      };
      for (const run of b.runs) {
        if (run.diagram || run.widget) {
          flush();
          out.push(run.diagram || run.widget);
        } else if (run.image) {
          flush();
          out.push({ type: "image", image: run.image, text: run.text });
        } else runs.push(run);
      }
      flush();
      return out;
    }
    if (b.items) b.items = b.items.map(liftImages);
    if (b.blocks) b.blocks = liftImages(b.blocks);
    if (b.rows)
      for (const row of b.rows)
        for (const c of row) c.blocks = liftImages(c.blocks);
    return [b];
  });
}
