(() => {
  // src/popup.js
  var status = document.querySelector("#status");
  var pdf = document.querySelector("#pdf");
  var docx = document.querySelector("#docx");
  var tabId;
  function show(text, error = false) {
    status.textContent = text;
    status.dataset.state = error ? "error" : "ready";
  }
  async function init() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url?.startsWith("https://chatgpt.com/")) {
      show("Open a conversation at chatgpt.com to begin.");
      return;
    }
    tabId = tab.id;
    try {
      const result = await chrome.tabs.sendMessage(tabId, { type: "CGE_PROBE" });
      if (!result?.messages) {
        show(
          "No conversation found. Open a chat containing a completed response."
        );
        return;
      }
      pdf.disabled = docx.disabled = false;
      show(`Ready \xB7 ${result.messages} messages currently rendered.`);
      const { lastStatus } = await chrome.storage.session.get("lastStatus");
      if (lastStatus?.tabId === tabId && Date.now() - lastStatus.at < 12e4)
        show(lastStatus.text, lastStatus.state === "error");
    } catch {
      show(
        "Refresh the ChatGPT tab after installing or updating this extension.",
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
})();
