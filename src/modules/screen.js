// User-invoked capture of this tab. Check tab identity both before and after capture.
let shooting = false,
  lastShot = 0;
export async function captureChatTab(sender) {
  if (
    sender.frameId !== 0 ||
    !sender.tab ||
    !sender.url?.startsWith("https://chatgpt.com/")
  )
    throw new Error("Page capture must start in the active ChatGPT tab.");
  if (shooting)
    throw new Error(
      "Another visual export is running. Retry when it finishes.",
    );
  shooting = true;
  const { windowId, id } = sender.tab;
  async function check() {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab?.id !== id || tab.url !== sender.url)
      throw new Error("Return to the original ChatGPT tab and retry.");
  }
  try {
    await new Promise((r) =>
      setTimeout(r, Math.max(0, lastShot + 650 - Date.now())),
    );
    await check();
    lastShot = Date.now();
    let data;
    try {
      data = await chrome.tabs.captureVisibleTab(windowId, { format: "png" });
    } catch (e) {
      if (!/permission|activeTab|all_urls/i.test(e.message || ""))
        throw new Error(
          "Chrome could not capture the page: " +
            (e.message || "Capture unavailable"),
        );
      throw new Error(
        "Click the extension icon in this ChatGPT tab to grant visual capture access, close the popup, then retry PDF as shown.",
      );
    }
    await check();
    return { ok: true, data };
  } finally {
    shooting = false;
  }
}
