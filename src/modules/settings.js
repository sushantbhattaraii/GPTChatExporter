export const DEFAULTS = Object.freeze({
  font: "sans",
  fontSize: 11,
  orientation: "portrait",
  margin: 48,
  includeTitle: true,
  includeTimestamps: false,
  includeUsers: true,
  includeCode: true,
  saveAs: false,
});
export function normalizeSettings(input = {}) {
  const s = { ...DEFAULTS };
  if (["sans", "serif", "mono"].includes(input.font)) s.font = input.font;
  if (["portrait", "landscape"].includes(input.orientation))
    s.orientation = input.orientation;
  for (const [key, min, max] of [
    ["fontSize", 8, 18],
    ["margin", 24, 90],
  ]) {
    const v = Number(input[key]);
    if (Number.isFinite(v)) s[key] = Math.min(max, Math.max(min, v));
  }
  for (const key of [
    "includeTitle",
    "includeTimestamps",
    "includeUsers",
    "includeCode",
    "saveAs",
  ])
    if (typeof input[key] === "boolean") s[key] = input[key];
  return s;
}
export async function getSettings() {
  return normalizeSettings(
    (await chrome.storage.local.get("settings")).settings,
  );
}
