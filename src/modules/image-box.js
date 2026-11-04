// CSS pixels describe the footprint of this occurrence. The source bitmap can
// have a different size or be reused elsewhere on the page at another size.
export function displayedImageBox(el, style, rect) {
  const px = (name) => parseFloat(style[name]) || 0;
  const left = px("borderLeftWidth") + px("paddingLeft");
  const top = px("borderTopWidth") + px("paddingTop");
  const width = rect.width - left - px("borderRightWidth") - px("paddingRight");
  const height =
    rect.height - top - px("borderBottomWidth") - px("paddingBottom");
  if (!(width > 0 && height > 0)) return;
  const bitmap = el.matches("img,canvas");
  const fit = bitmap
    ? style.objectFit || "fill"
    : style.backgroundSize === "cover"
      ? "cover"
      : "contain";
  const box = {
    width,
    height,
    left,
    top,
    fit,
    position: bitmap ? style.objectPosition : style.backgroundPosition,
    naturalWidth:
      el.naturalWidth || (el.tagName === "CANVAS" ? el.width : undefined),
    naturalHeight:
      el.naturalHeight || (el.tagName === "CANVAS" ? el.height : undefined),
  };
  // Some thumbnail frames crop an oversized child with overflow:hidden.
  // Only use local frame clips, never the viewport of the scrolling chat.
  const x = rect.left + left,
    y = rect.top + top;
  let x0 = x,
    y0 = y,
    x1 = x + width,
    y1 = y + height;
  for (
    let n = el.parentElement;
    n &&
    !n.matches(
      "main,article,body,.markdown,.prose,[data-message-author-role],[data-turn-key],[data-markdown-text-style]",
    );
    n = n.parentElement
  ) {
    const css = el.ownerDocument.defaultView.getComputedStyle(n);
    const clipX = /^(hidden|clip)$/.test(css.overflowX),
      clipY = /^(hidden|clip)$/.test(css.overflowY);
    if (!clipX && !clipY) continue;
    const frame = n.getBoundingClientRect();
    if (!frame.width || !frame.height) continue;
    if (clipX) {
      x0 = Math.max(x0, frame.left + parseFloat(css.borderLeftWidth));
      x1 = Math.min(x1, frame.right - parseFloat(css.borderRightWidth));
    }
    if (clipY) {
      y0 = Math.max(y0, frame.top + parseFloat(css.borderTopWidth));
      y1 = Math.min(y1, frame.bottom - parseFloat(css.borderBottomWidth));
    }
  }
  if (x1 <= x0 || y1 <= y0) return { ...box, hidden: true };
  if (x0 > x || y0 > y || x1 < x + width || y1 < y + height) {
    box.crop = { x: x0 - x, y: y0 - y, width, height };
    box.left += box.crop.x;
    box.top += box.crop.y;
    box.width = x1 - x0;
    box.height = y1 - y0;
  }
  return box;
}

// Computed positions are normally percentages, pixels or calc(percent + px)
// (including edge-offset positions such as "right 8px").
function offset(position, free) {
  if (!position) return free / 2;
  if (position === "center") return free / 2;
  if (/^(left|top)$/.test(position)) return 0;
  if (/^(right|bottom)$/.test(position)) return free;
  const terms = position
    .replace(/\s+/g, "")
    .match(/[+-]?(?:\d*\.)?\d+(?:%|px)/g);
  return terms
    ? terms.reduce(
        (n, term) =>
          n + parseFloat(term) * (term.endsWith("%") ? free / 100 : 1),
        0,
      )
    : free / 2;
}

export function imagePlacement(box, rasterWidth, rasterHeight) {
  const { width, height } = box.crop || box,
    dx = box.crop?.x || 0,
    dy = box.crop?.y || 0;
  const { fit } = box;
  if (fit === "fill") return { x: -dx, y: -dy, width, height };
  const w = box.naturalWidth || rasterWidth,
    h = box.naturalHeight || rasterHeight;
  const ratio =
    fit === "cover"
      ? Math.max(width / w, height / h)
      : fit === "none"
        ? 1
        : Math.min(width / w, height / h, fit === "scale-down" ? 1 : Infinity);
  const drawnWidth = w * ratio,
    drawnHeight = h * ratio;
  const [x, y] = (box.position || "").match(/calc\([^)]*\)|[^\s]+/g) || [];
  return {
    x: offset(x, width - drawnWidth) - dx,
    y: offset(y, height - drawnHeight) - dy,
    width: drawnWidth,
    height: drawnHeight,
  };
}

// An explicit viewport clips cover crops and reserves the empty space of contain.
// The PDF still embeds the source bitmap at its original export resolution.
export function rasterViewport(x, y, box, placement, data) {
  return `<svg x="${x}" y="${y}" width="${box.width}" height="${box.height}" overflow="hidden"><image x="${placement.x}" y="${placement.y}" width="${placement.width}" height="${placement.height}" preserveAspectRatio="none" href="${data}"/></svg>`;
}
