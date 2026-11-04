# ChatGPT Conversation Exporter

Export the displayed ChatGPT question–answer pair or the active conversation to a real PDF or editable Microsoft Word document. Runs locally in Chrome with Manifest V3. Version 1.0.1.

**Updating from 1.0.0?** The previous version could show “No conversation found” on ChatGPT conversation layouts that use role-labelled search units. Extract this update, copy the contents of its `dist` folder into the `dist` folder Chrome already loads, click **Reload** on the extension card at `chrome://extensions/`, and refresh the conversation tab. The popup should show **v1.0.1**. It retries automatically while messages render.

**Start here:** the `dist` folder is already built. You do **not** need Node.js to install it.

**Validation status:** extraction, document generation, browser-rendered UI, virtualized-history collection, and simulated download lifecycles have automated coverage. Real signed-in ChatGPT, Chrome's actual extension download integration, and Microsoft Word itself still need the live smoke test in `TESTING.md`. Do not interpret the included build as a guarantee of permanent ChatGPT compatibility.

## Features

- An **Export this Q&A** button below each assistant message whose completion can be verified.
- Exactly that assistant message and its preceding user prompt, using the active DOM order and turn identifiers. Missing identifiable turns cause an error instead of a guessed pairing.
- PDF and genuine OOXML `.docx` output; no renamed HTML files.
- Full-conversation export from the floating toolbar or Chrome popup.
- Safe visible scrolling to collect history, including indexed virtualized turns; a range review before export.
- Headings, emphasis, nested lists, tables, clickable links, monospaced code, role labels and page numbers.
- LaTeX equation source preserved without duplicating KaTeX's visual and accessibility layers.
- Font family, size, A4 orientation, margins, timestamps, title, question visibility, code visibility and Save As settings.
- Locally bundled fonts/libraries, no analytics, no external document service, no private ChatGPT endpoints.

## Install in Google Chrome — no build required

1. Download `ChatGPT_Conversation_Exporter.zip` and extract it completely. On Windows, right-click the ZIP and choose **Extract All**.
2. Keep the extracted folder somewhere permanent. Chrome loads the extension from that folder; do not delete or move it after installation.
3. Open desktop Google Chrome.
4. Enter `chrome://extensions/` in the address bar.
5. Enable **Developer mode** using the switch in the upper-right corner.
6. Click **Load unpacked**.
7. Select the **`dist` folder inside `chatgpt-conversation-exporter`**. It contains `manifest.json`. Do not select the ZIP or the outer project folder.
8. Confirm **ChatGPT Conversation Exporter 1.0.1** appears and its enable switch is on.
9. Optionally click Chrome's puzzle-piece icon, then the pin beside this extension.
10. Open [ChatGPT](https://chatgpt.com/) and open a conversation. **Refresh any ChatGPT tab that was already open.**

This is an unpacked extension, not a Chrome Web Store listing. Organizational policies may prevent unpacked installations. Minimum API target: Chrome 116; use a currently maintained desktop Chrome release. Chrome on Android and iOS is not supported. Edge/Brave are not validated.

## Export one question and answer

1. Wait for the assistant to finish.
2. Find **↓ Export this Q&A** at the end of the response you want.
3. Select **PDF** or **Word (.docx)**.
4. The extension extracts that response and the nearest preceding user message in the displayed branch, checking ordered turn gaps where available.
5. The download starts automatically. The floating status says **completed** only after Chrome reports completion.

For Q1/A1, Q2/A2, Q3/A3, clicking under A2 exports only Q2 and A2. Switching a regenerated answer or editing a prompt uses the currently displayed branch. If its question is not mounted, scroll upward until it appears and retry.

By default questions and code are included. If you disable them in settings, the export intentionally follows that choice.

## Export the active conversation

1. Click **Export conversation** in the floating toolbar, or open the Chrome extension popup.
2. Select PDF or Word.
3. Let the extension scroll through the conversation. Avoid navigating, editing, or scrolling while it collects. Press **Escape** to cancel.
4. Review the collected message count and first/last previews. Compare them with the range you expect.
5. Check the confirmation box and click **Download PDF** or **Download Word**.
6. The extension restores the original numerical scroll offset after collection where possible. Virtualized pages may re-anchor visually.

The collector uses ordinary page scrolling only. It attempts to expose older turns, then traverses downward, collecting stable identifiers and ordering by turn index. It rejects identifiable gaps, conflicting versions, streaming output and unorderable virtualization. Collection times out after 45 seconds.

**Completeness boundary:** the DOM cannot prove that ChatGPT has made all historical content available. No backend fetch is used to bypass this. The review dialog and an export note disclose this boundary. Only the displayed branch is collected; hidden alternatives are excluded. An apparently stable top or bottom is not proof of server-side completeness.

## Find and open downloads

- Files use your normal Chrome Downloads location, unless **Ask where to save** is enabled.
- Open Chrome Downloads from its menu or `Ctrl+J` on Windows/Linux (`Command+Shift+J` on macOS).
- PDFs open in Chrome or a PDF reader. Word files open in Microsoft Word or a compatible editor.
- Pair names: `ChatGPT_QA_YYYY-MM-DD_HH-MM-SS.pdf` / `.docx` (local time).
- Conversation names: `ChatGPT_<sanitized title>_YYYY-MM-DD.pdf` / `.docx`.
- Chrome uniquifies duplicate names. Invalid filename characters are removed.

## Document settings

Click **Settings** in the floating toolbar, or **Document settings** in the popup. Change values and click **Save settings**.

| Setting | Available values / behavior |
|---|---|
| Font | Sans serif, serif or monospace |
| Body size | 8–18 pt |
| Paper | A4 portrait or landscape |
| Margins | 24–90 pt; 72 pt equals one inch |
| Title | Include/exclude the page-derived conversation title |
| Timestamps | Export time, plus message times only when exposed as `time[datetime]` |
| User questions | Include/exclude user messages |
| Code | Include/exclude block code, recursively |
| Save As | Ask where to save, or use Chrome's normal download behavior |

PDF embeds DejaVu Sans, Serif and Mono; Word requests Arial, Times New Roman or Courier New and relies on the reader's installed fonts. Code uses monospace independently of the body font. Settings stay in local Chrome extension storage. Reset restores the form; click Save to apply it.

## Formatting and known limitations

- **Equations:** exported as LaTeX text (`\(...\)` or `\[...\]`), not rendered formula graphics or native Word equations. This preserves source accurately when ChatGPT exposes it. If it does not, only available rendered text can be recovered.
- **Images/media/files:** text descriptions or alt text only. No image pixels, attachment contents, videos, canvases, embedded apps, voice recordings or interactive artifacts are downloaded. Adjacent links/text remain when accessible.
- **Fonts:** PDFs support the bundled fonts' glyph coverage, including much Latin/Greek/Cyrillic and many math symbols. CJK, Devanagari, color emoji and other uncovered glyphs may be missing. A warning is added when the chosen PDF body font lacks characters. Word preserves the Unicode text and may substitute installed fonts; script shaping/rendering is reader-dependent. Some code/math symbols may have narrower monospace coverage.
- **Tables:** standard tables remain tables. Merged cells are flattened with placeholders and an export note. Tables wider than eight columns are represented row-by-row to avoid horizontal clipping. Long rows may split across pages.
- **Code:** indentation and line breaks are retained; tabs become four spaces. Syntax colors are not retained. Very long PDF tokens get zero-width wrapping opportunities; use Word when exact code copy/paste is important. Code can span pages to avoid clipping.
- **Pagination:** PDF headings are kept with following content where feasible; Word headings use keep-next. Long paragraphs, rows and code may span pages. This is not a pixel-for-pixel screenshot.
- **Links/citations:** safe HTTP(S) and mailto hyperlinks are retained. Script/data links are discarded. Citation widgets without accessible anchors may degrade to visible text or be omitted if they are interface buttons.
- **Completion:** unknown final-message completion markers fail closed. Responses without recognized role attributes are unsupported. Work-mode Pages, embedded documents and multi-pane content outside the conversation DOM are not exported as separate artifacts.
- **History:** indexed virtualization is supported; virtualization lacking stable ordered identifiers is refused. Empty attachment-only messages without readable text cause a clear error. Page/frontend changes can require an extractor update.
- **Limits:** 20 MB serialized document model; 45-second history scan; one document generator at a time. This favors a recoverable error over freezing or silently truncating a large conversation. Blob URLs have a 30-minute maximum lifetime.
- **Timestamps/title:** the document/page title is a fallback and can be generic. Missing original message times are not invented.

## Privacy and permissions

| Permission / access | Why it is needed |
|---|---|
| `activeTab` | Identify the selected ChatGPT tab when the toolbar popup is invoked |
| `downloads` | Start local file downloads and report Chrome-confirmed completion/interruption |
| `offscreen` | Generate documents and hold Blob URLs in a separate local extension document |
| `storage` | Save formatting preferences and temporary download status/filename metadata |
| Content-script match: `https://chatgpt.com/*` | Read the displayed conversation and add export controls only on ChatGPT |

No `cookies`, `webRequest`, all-sites host permission, token access or private application storage access is requested. Conversation content is processed in memory, passed only between extension components, and written to the requested local file. It is not logged or persisted in extension storage. Download filenames and statuses are stored temporarily in session storage. Settings persist until reset/uninstall. No telemetry or external document network requests. Fonts and code are bundled; the extension-page CSP prohibits network connections and remote scripts. Downloaded documents remain on your device after uninstalling.

Links inside exported documents can contact their destinations if you click them. Normal ChatGPT page activity and its requests when you scroll remain ChatGPT's own behavior.

## Architecture and source tree

```text
chatgpt-conversation-exporter/
  dist/                     Ready-to-load MV3 extension with bundled libraries/fonts
  public/
    manifest.json           MV3 permissions and entry points
    popup.html, app.css      Toolbar popup and shared settings styles
    options.html            Formatting settings
    offscreen.html          Local generation host
    icons/                  16, 32, 48 and 128 px icons
  src/
    content.js              Response controls, export orchestration, page lifecycle
    background.js           Offscreen lifecycle, download requests and status events
    offscreen.js            Document generation and Blob URL lifecycle
    popup.js, options.js    Popup and settings controllers
    font-data.json          Generated embedded font data
    font-coverage.json      Bundled font glyph coverage used for warnings
    modules/
      extractor.js          Semantic role/turn discovery, pairing and completion checks
      normalize.js          Safe DOM-to-document model parser
      history.js            Bounded visible history scrolling and ordered collection
      document.js           Settings filter, warnings and table normalization
      pdf-exporter.js       pdfmake layout and PDF stream generation
      docx-exporter.js      Native OOXML construction with docx
      filename.js           Portable local-time filenames
      settings.js           Defaults, validation and local preferences
      ui.js                 Isolated controls, menus and range review
  assets/fonts/             Licensed, bundled DejaVu font files
  scripts/build.mjs         Deterministic source bundling (esbuild)
  tests/                    Unit, renderer, real-extension and artifact validators
  examples/                 Sample outputs from synthetic conversations
  test-results/             Executed test reports; no personal chat data
  THIRD_PARTY_LICENSES/      Runtime dependency license texts
  README.md, TESTING.md, ARCHITECTURE.md, LICENSE
  THIRD_PARTY_NOTICES.md
  package.json, package-lock.json
```

Data flow: content script → normalized message model → service worker → offscreen generator → local Blob URL → Chrome Downloads API. Only status and filenames go into session storage. The worker releases URLs on completion/interruption; the offscreen page also has an expiry safeguard. Shadow DOM keeps extension controls separate from page styling. One debounced page observer manages the message buttons; per-menu focus handling adds no DOM observers.

The design does not inspect or depend on model names or Light/Medium/High/Extra High/Max/Ultra settings. It works from rendered message roles, ordering and completion evidence.

## Rebuild from source (developers only)

Prerequisites: Node.js 20.19+ or a newer supported LTS, npm, and internet access for the initial dependency installation. End users installing `dist` do not need these.

1. Obtain the source by extracting this ZIP. There is no assumed GitHub repository.
2. Install an LTS release from [nodejs.org](https://nodejs.org/), using the installer for your operating system. Accept the npm installation option and reopen your terminal.
3. Check `node --version` and `npm --version`.
4. Open a terminal in `chatgpt-conversation-exporter`.
5. Run:

```bash
npm ci
npm run build
```

6. Load `dist` using the installation steps above.

`package-lock.json` pins the dependency graph. `docx` and `pdfmake` are bundled with esbuild; no runtime npm or CDN connection is needed. The build replaces pdfmake's two legacy dynamic global-object fallbacks with `globalThis`, which is available on the minimum Chrome target; no eval or Function constructor remains in the distributed JavaScript. Font bytes are embedded during build. Original license texts are included.

## Run tests

```bash
npm run build
npm test
npx playwright install chromium
npm run test:render
```

`npm run check` builds, runs unit/document/download-state tests, then runs the standalone Chromium renderer suite. That suite uses a synthetic conversation and mock Chrome APIs. It does **not** validate real Chrome downloads.

For a desktop environment that allows unpacked extensions:

```bash
npm run test:browser
```

This separate script exercises actual extension loading and downloads against a locally supplied synthetic ChatGPT-shaped page. It is not a signed-in ChatGPT test. Independent artifact validation is available through `python tests/validate_documents.py` with `pypdf` installed; PyMuPDF adds text-bound checks. See `TESTING.md` for executed versus pending checks and live validation steps.

## Troubleshooting

**No buttons:** confirm the extension is enabled, open `https://chatgpt.com/`, refresh the tab, and wait for the response to finish. Make sure you selected `dist` during installation. If the final response still has no button, completion evidence may be unknown after a frontend change; do not force an uncertain export. Read `TESTING.md` before updating selectors.

**Wrong-looking range / missing earlier history:** cancel the review, manually scroll upward to reveal the intended beginning, then retry. A detected gap or unorderable virtualization is intentionally refused. For one response, reveal its actual question above it.

**Collection timed out:** press Escape/cancel, let the page finish loading, and retry. Very large histories may need individual-pair exports. Nothing is silently truncated at the timeout.

**Word option does not open a file:** look in Chrome Downloads; Word generation produces a file rather than opening Word automatically. If Chrome reports interruption, inspect its explanation. Organizational policy, disk space, antivirus or cancellation can block a download.

**Downloads fail:** open Chrome Downloads, retry after other exports finish, and enable Ask where to save if helpful. Do not infer success from “generating” or “started.” Refresh ChatGPT if the extension was reloaded during an export.

**“Extension context invalidated” / no response:** refresh the ChatGPT tab after reloading or updating the extension.

**Settings don't appear to apply:** click Save settings and make a new export. Existing files are not modified.

**Equation looks like LaTeX:** this is the intentional source-preserving fallback. Native equation rendering is not implemented.

**Boxes/missing glyphs in PDF:** export Word and use a font installed for that language. The font coverage limitation is explicit above.

**Unexpected page elements:** collect a minimal redacted DOM fixture and update the extraction tests. Do not send credentials, tokens or unredacted personal conversations in a bug report.

**Floating toolbar covers something:** the Chrome toolbar popup provides the same export actions. The floating toolbar sits above the bottom input area but the website layout can vary.

## Update or uninstall

To update: keep a copy of your current version, replace the project with the new extracted version, visit `chrome://extensions/`, click the extension's reload icon, then refresh ChatGPT. If you change its folder, remove and re-add the unpacked extension; that may reset its local settings. Rebuilding source requires reloading `dist` and refreshing ChatGPT.

To disable: turn off its switch at `chrome://extensions/`. To uninstall: click **Remove**, confirm, then optionally delete the extracted folder. Previously downloaded documents are not deleted.

## Technology and references

JavaScript ES modules, Chrome Manifest V3, Shadow DOM, pdfmake 0.2.20, docx 9.15.2, esbuild, Node test runner, jsdom and Playwright. See `package.json` for exact build/test versions.

- [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [pdfmake document definitions](https://pdfmake.github.io/docs/0.1/document-definition-object/)
- [docx Packer](https://docx.js.org/api/classes/index.Packer.html)

This independent extension is not affiliated with or endorsed by OpenAI. ChatGPT is the target website's name, not an endorsement.
