import {
  DEFAULTS,
  normalizeSettings,
  getSettings,
} from "./modules/settings.js";
const form = document.querySelector("form"),
  status = document.querySelector("#status");
function display(settings) {
  for (const [key, value] of Object.entries(settings)) {
    const el = form.elements.namedItem(key);
    if (el.type === "checkbox") el.checked = value;
    else el.value = value;
  }
}
async function save(event) {
  event.preventDefault();
  const raw = {};
  for (const key of Object.keys(DEFAULTS)) {
    const el = form.elements.namedItem(key);
    raw[key] = el.type === "checkbox" ? el.checked : el.value;
  }
  try {
    await chrome.storage.local.set({ settings: normalizeSettings(raw) });
    status.textContent = "Settings saved.";
  } catch (e) {
    status.textContent = `Settings could not be saved: ${e.message}`;
  }
}
form.addEventListener("submit", save);
document.querySelector("#reset").addEventListener("click", () => {
  display(DEFAULTS);
  status.textContent =
    "Defaults restored in the form. Click Save settings to apply.";
});
getSettings()
  .then(display)
  .catch((e) => (status.textContent = e.message));
