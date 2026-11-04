import coverage from "../font-coverage.json" with { type: "json" };
import fallback from "../fallback-coverage.json" with { type: "json" };
const base = Object.fromEntries(
  Object.entries(coverage).map(([font, cps]) => [font, new Set(cps)]),
);
const cache = new Map();
function has(ranges, cp) {
  let low = 0,
    high = ranges.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1,
      [start, end] = ranges[mid];
    if (cp < start) high = mid - 1;
    else if (cp > end) low = mid + 1;
    else return true;
  }
  return false;
}
export function fontFor(char, preferred) {
  const cp = char.codePointAt(0);
  if (cp < 32 || base[preferred].has(cp)) return preferred;
  if (!cache.has(cp))
    cache.set(
      cp,
      ["deva", "hangul", "cjk"].find((key) => has(fallback[key], cp)) ||
        (base.sans.has(cp) ? "sans" : null),
    );
  return cache.get(cp);
}
export function selectFonts(run, preferred) {
  const out = [];
  for (const c of run.text) {
    const font =
      (/[\u200c\u200d\ufe0f]/.test(c) && out.at(-1)?.font) ||
      fontFor(c, preferred) ||
      preferred;
    if (font === out.at(-1)?.font) out.at(-1).text += c;
    else out.push({ ...run, text: c, font });
  }
  return out;
}
