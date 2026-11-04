(() => {
  // src/modules/settings.js
  var DEFAULTS = Object.freeze({
    font: "sans",
    fontSize: 11,
    orientation: "portrait",
    margin: 48,
    includeTitle: true,
    showPdfTitle: false,
    includeTimestamps: false,
    includeUsers: true,
    includeCode: true,
    saveAs: false
  });
  function normalizeSettings(input = {}) {
    const s = { ...DEFAULTS };
    if (["sans", "serif", "mono"].includes(input.font)) s.font = input.font;
    if (["portrait", "landscape"].includes(input.orientation))
      s.orientation = input.orientation;
    for (const [key, min, max] of [
      ["fontSize", 8, 18],
      ["margin", 24, 90]
    ]) {
      const v = Number(input[key]);
      if (Number.isFinite(v)) s[key] = Math.min(max, Math.max(min, v));
    }
    for (const key of [
      "includeTitle",
      "showPdfTitle",
      "includeTimestamps",
      "includeUsers",
      "includeCode",
      "saveAs"
    ])
      if (typeof input[key] === "boolean") s[key] = input[key];
    return s;
  }
  async function getSettings() {
    return normalizeSettings(
      (await chrome.storage.local.get("settings")).settings
    );
  }

  // src/options.js
  var form = document.querySelector("form");
  var status = document.querySelector("#status");
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
    status.textContent = "Defaults restored in the form. Click Save settings to apply.";
  });
  getSettings().then(display).catch((e) => status.textContent = e.message);
})();
