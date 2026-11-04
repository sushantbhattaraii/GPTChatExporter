(() => {
  // src/popup.js
  var status = document.querySelector("#status");
  var pdf = document.querySelector("#pdf");
  var docx = document.querySelector("#docx");
  var tabId;
  var retryTimer;
  var pendingImages;
  var imageAccess = document.querySelector("#imageAccess");
  function show(text, error = false) {
    status.textContent = text;
    status.dataset.state = error ? "error" : "ready";
  }
  async function init() {
    clearTimeout(retryTimer);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith("https://chatgpt.com/")) {
      show("Open a conversation at chatgpt.com to begin.");
      return;
    }
    tabId = tab.id;
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "CGE_PROBE" });
      pendingImages = result?.imageAccess;
      imageAccess.hidden = !pendingImages;
      if (pendingImages) {
        pdf.disabled = docx.disabled = true;
        show("This export is waiting for image access.");
        document.querySelector("#imageSources").textContent = "Image sites: " + pendingImages.origins.map((o) => new URL(o).hostname).join(", ");
        return;
      }
      if (!result?.messages) {
        show(
          "Connected to ChatGPT. No readable messages detected yet. Open a conversation and wait for a reply."
        );
        pdf.disabled = docx.disabled = true;
        retryTimer = setTimeout(init, 1500);
        return;
      }
      pdf.disabled = docx.disabled = false;
      show(`Ready \xB7 ${result.messages} messages currently rendered.`);
      const { lastStatus } = await chrome.storage.session.get("lastStatus");
      if (lastStatus?.tabId === tabId && Date.now() - lastStatus.at < 12e4)
        show(lastStatus.text, lastStatus.state === "error");
    } catch {
      show(
        "Cannot reach the ChatGPT page script. In the extension\u2019s Details, allow site access on chatgpt.com, then refresh your chat.",
        true
      );
    }
  }
  async function start(format) {
    try {
      const r = await chrome.tabs.sendMessage(tabId, {
        type: "CGE_REQUEST",
        format
      });
      if (!r?.ok) throw new Error(r?.error || "Cannot start export.");
      window.close();
    } catch (e) {
      show(e.message, true);
    }
  }
  pdf.addEventListener("click", () => start("pdf"));
  docx.addEventListener("click", () => start("docx"));
  document.querySelector("#settings").addEventListener("click", () => chrome.runtime.openOptionsPage());
  init().catch((e) => show(e.message, true));
  document.querySelector("#grantImages").addEventListener("click", async (event) => {
    if (!pendingImages) return;
    event.target.disabled = true;
    try {
      const granted = await chrome.permissions.request({
        origins: pendingImages.origins.map((o) => o + "/*")
      });
      const result = await chrome.tabs.sendMessage(tabId, {
        type: "CGE_IMAGE_DECISION",
        token: pendingImages.token,
        granted
      });
      if (!result?.ok)
        throw new Error("The pending export has ended. Start it again.");
      window.close();
    } catch (error) {
      show(error.message, true);
      event.target.disabled = false;
    }
  });
})();
