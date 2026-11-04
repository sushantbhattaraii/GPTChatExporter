// Assistive text can have a DOM Range even when CSS clips all of its ink.
export function visuallyClipped(s) {
  const legacy = s.clip?.match(/^rect\(([^)]+)\)$/i);
  if (legacy && /^(absolute|fixed)$/.test(s.position)) {
    const [top, right, bottom, left] = legacy[1]
      .split(/[,\s]+/)
      .map(parseFloat);
    if (right <= left || bottom <= top) return true;
  }
  const inset = s.clipPath?.match(/^inset\(([^)]*)\)$/);
  if (inset) {
    const [top, right = top, bottom = top, left = right] =
      inset[1].split(/\s+/);
    const pct = (v) => (v.endsWith("%") ? parseFloat(v) : 0);
    if (pct(top) + pct(bottom) >= 100 || pct(left) + pct(right) >= 100)
      return true;
  }
  return (
    /hidden|clip/.test(s.overflow + s.overflowX + s.overflowY) &&
    parseFloat(s.width) <= 1 &&
    parseFloat(s.height) <= 1
  );
}
