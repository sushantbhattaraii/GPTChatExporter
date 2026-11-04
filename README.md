# ChatGPT Conversation Exporter

Export the displayed ChatGPT question–answer pair or the active conversation to a real PDF or editable Microsoft Word document. Runs locally in Chrome with Manifest V3. Version 1.5.1.

**Updating an earlier version?** Extract the ZIP and copy the contents of the new `dist` folder into the `dist` folder Chrome already loads. Click **Reload** on the extension card at `chrome://extensions/`, refresh the conversation tab, and verify **v1.5.1** in the popup.

The new version requests site access for ChatGPT and OpenAI image delivery. Review the extension card if Chrome asks you to enable it after the update.

**Start here:** the `dist` folder is already built. You do **not** need Node.js to install it.

**Validation status:** extraction, document generation, browser-rendered UI, virtualized-history collection, and simulated download lifecycles have automated coverage. Real signed-in ChatGPT, Chrome's actual extension download integration, and Microsoft Word itself still need the live smoke test in `TESTING.md`. Do not interpret the included build as a guarantee of permanent ChatGPT compatibility.

## Features

- An **Export this Q&A** button below each assistant message whose completion can be verified.
- Exactly that assistant message and its preceding user prompt, using the active DOM order and turn identifiers. Missing identifiable turns cause an error instead of a guessed pairing.
- PDF and genuine OOXML `.docx` output; no renamed HTML files.
- Full-conversation export from the floating toolbar or Chrome popup.
- Safe visible scrolling to collect history, including indexed virtualized turns; a range review before export.
- Headings, emphasis, nested lists, tables, clickable links and monospaced code. Word documents also include role labels and page numbers.
- Typeset PDF formulas and editable Word equations for recognized TeX and MathML.
- Font family, size, A4 orientation, margins, timestamps, title, question visibility, code visibility and Save As settings.
- Generated images embedded in formatted PDF and Word when readable. Image-only replies get a Q&A control in a separate row outside the gallery. When an outer layout clips that row, the control appears at the visible image edge.
- Document generation runs locally. The exporter reads images referenced by the selected messages. An external site that blocks anonymous reads can be allowed individually in the extension popup.

## Install in Google Chrome — no build required

1. Download `ChatGPT_Conversation_Exporter.zip` and extract it completely. On Windows, right-click the ZIP and choose **Extract All**.
2. Keep the extracted folder somewhere permanent. Chrome loads the extension from that folder; do not delete or move it after installation.
3. Open desktop Google Chrome.
4. Enter `chrome://extensions/` in the address bar.
5. Enable **Developer mode** using the switch in the upper-right corner.
6. Click **Load unpacked**.
7. Select the **`dist` folder inside `chatgpt-conversation-exporter`**. It contains `manifest.json`. Do not select the ZIP or the outer project folder.
8. Confirm **ChatGPT Conversation Exporter 1.5.1** appears and its enable switch is on.
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

## PDF formatting

Both PDF buttons print the same A4 transcript. Prompts are right-aligned in a narrower column. Replies use the full text width and retain their paragraph alignment. Both appear directly on the page. At the default 11 pt body size, the three heading levels use 20, 16 and 13 pt navy type. Links are blue and underlined. The first page starts with the conversation unless you turn on the printed title or timestamps.

The exporter uses thin gray rules for tables and follows readable source column widths. Side-by-side rows of illustrated cards keep their captions and order when the page exposes their layout. Code, diagrams, text, and highlights retain their own formatting. Long code lines wrap within the available width. See `examples/transcript-layout.pdf` for typography, tables and figures, and `examples/formatted-chat.pdf` for syntax highlighting and inline styles.

The floating bubble uses a **download arrow** to open the export menu and a **gear** to open settings. Hover over a format icon for its tooltip. Keyboard users can tab to the buttons, which have accessible names. The individual **Export this Q&A** control retains its text label.

### Diagrams, checklists and live controls

A Mermaid code fence becomes a vector diagram in the PDF. The exporter can also read an already-rendered SVG, including its shapes, arrows and text labels. If local Mermaid rendering fails or the source requests external resources, the PDF includes the source. A diagram inside an inaccessible embedded frame requires its source or a readable preview in the chat.

PDF images use the dimensions at which they appear in the conversation. A 96-pixel thumbnail prints 72 points wide at normal scale, even if its file is 1,200 pixels wide. If the page or table column is narrower, the image scales down to fit. Search-result rows retain their thumbnail crops, visible text and clickable links. See `examples/thumbnail-layout.pdf`.

Bounded HTML flowcharts and job cards can export as vector drawings. The exporter measures the displayed boxes, text, SVG icons and image positions to keep branches, connectors, headers, badges and actions together. Company buttons retain their visible or accessible names. A link becomes clickable when the page exposes a safe destination. A popup control with no URL keeps its label. See `examples/career-components.pdf`.

Checklists show the current checked, unchecked or mixed state. Nested lists retain their hierarchy, and blockquotes have a vertical rule beside their contents. For interactive examples, the PDF records the selected options, slider position, readable frame contents, and displayed result at export time. The controls are static on paper. Adjust them in ChatGPT before exporting. See `examples/rich-content.pdf` for a sample.

## Export the active conversation

1. Click the **download arrow** near the upper-right corner of the chat, then choose the PDF or Word icon. Alternatively, open the Chrome extension popup and click **Export conversation as PDF** or **Export conversation as Word**.
2. If the popup buttons are disabled, open the conversation you want and wait for the popup to detect its messages.
3. Let the extension scroll through the conversation. Avoid navigating, editing, or scrolling while it collects. Press **Escape** to cancel.
4. Review the collected message count and first/last previews. Compare them with the range you expect.
5. Check the confirmation box and click **Download PDF** or **Download Word**.
6. The extension restores the original numerical scroll offset after collection where possible. Virtualized pages may re-anchor visually.

The collector uses ordinary page scrolling only. It attempts to expose older turns, then traverses downward, collecting stable identifiers and ordering by turn index. It rejects identifiable gaps, conflicting versions, streaming output and unorderable virtualization. The collector continues as long as it makes progress, reuses unchanged turns, and reports the number collected. It stops if scrolling and loading make no progress for 90 seconds. Escape cancels the scan.

**Completeness boundary:** the DOM cannot prove that ChatGPT has made all historical content available. No backend fetch is used to bypass this. The review dialog explains this boundary. In the PDF it is recorded in the document properties under Subject. Only the displayed branch is collected; hidden alternatives are excluded. An apparently stable top or bottom is not proof of server-side completeness.

## Find and open downloads

- Files use your normal Chrome Downloads location, unless **Ask where to save** is enabled.
- Open Chrome Downloads from its menu or `Ctrl+J` on Windows/Linux (`Command+Shift+J` on macOS).
- PDFs open in Chrome or a PDF reader. Word files open in Microsoft Word or a compatible editor.
- Pair names: `ChatGPT_QA_YYYY-MM-DD_HH-MM-SS.pdf` / `.docx` (local time).
- Conversation names: `ChatGPT_<sanitized title>_YYYY-MM-DD.pdf` / `.docx`.
- Chrome uniquifies duplicate names. Invalid filename characters are removed.

## Document settings

Click the **gear icon** in the floating toolbar, or **Document settings** in the popup. Change values and click **Save settings**.

| Setting | Available values / behavior |
|---|---|
| Font | Sans serif, serif or monospace |
| Body size | 8–18 pt |
| Paper | A4 portrait or landscape |
| Margins | 24–90 pt. PDF text also has a 3 pt horizontal inset and a 9 pt vertical inset. The default PDF text starts 51 pt from the left edge. |
| Title | Include the conversation title in Word and in PDF properties. A separate checkbox prints the title above the PDF transcript and defaults to off. |
| Timestamps | Export time, plus message times only when exposed as `time[datetime]` |
| User questions | Include/exclude user messages |
| Code | Include/exclude block code, recursively |
| Save As | Ask where to save, or use Chrome's normal download behavior |

PDF uses Liberation Sans by default, with DejaVu Serif and DejaVu Sans Mono available as alternatives. For missing glyphs it can use DejaVu Sans or the bundled Noto fonts. Word requests Arial, Times New Roman or Courier New and relies on the reader's installed fonts. Code uses monospace independently of the body font. Settings stay in local Chrome extension storage. Reset restores the form; click Save to apply it.

## Formatting and known limitations

- **Equations:** PDF uses vector graphics for display formulas, fractions and radicals. Simple expressions stay inline, and complex inline formulas receive their own line. Word uses editable Office Math equations. Explicit math delimiters and formula-only LaTeX fences are recognized. Unsupported expressions retain their source with an “Unrendered equation” label. Ordinary programming examples stay as code.
- **Images/media/files:** PDF and Word keep readable image pixels in message order, including responsive and lazy-loaded sources. If Chrome needs site access, open the extension icon, choose **Allow images and continue**, and approve the listed image origins. The same export resumes. The in-chat dialog also offers **Continue without these images** and **Cancel export**. The embedded raster is limited to 1,600 pixels on its longer side and each source fetch is limited to 12 MB. An unreadable standalone image gets a labelled placeholder. Within a visual card, an unavailable image gets a small marker inside its own box. Attachment file contents are not opened.
- **Fonts:** PDFs support the bundled fonts' glyph coverage, including much Latin/Greek/Cyrillic and many math symbols. The exporter selects bundled Noto fonts for Devanagari (including Nepali and Hindi), Chinese and Japanese characters, kana and Hangul when the body font lacks those glyphs. The fallback faces are regular weight. Color emoji, rare ideographs, and characters outside all bundled fonts can still be missing. The PDF Subject field records a warning for uncovered characters. Word preserves the Unicode text and may substitute installed fonts; script shaping/rendering is reader-dependent. Some code/math symbols may have narrower monospace coverage.
- **Tables:** standard tables remain tables. Merged cells are flattened with placeholders and a note in the PDF properties. Tables wider than eight columns are represented row-by-row to avoid horizontal clipping. Long rows may split across pages.
- **Code.** The PDF uses rendered token styles, expands tabs to the displayed tab stops and preserves blank lines. Long lines wrap at the available text width. Only code present in the page can be read.
- **Pagination:** PDF headings are kept with following content where feasible; Word headings use keep-next. Long paragraphs, rows and code may span pages. This is not a pixel-for-pixel screenshot.
- **Links/citations:** safe HTTP(S) and mailto hyperlinks are retained. Script/data links are discarded. Citation widgets without accessible anchors may degrade to visible text or be omitted if they are interface buttons.
- **Completion:** unknown final-message completion markers fail closed. The extension uses recognized role and turn markers, headings and generated-image cards to identify messages. An unfamiliar layout may prevent it from identifying the reply or its prompt. Work-mode Pages, embedded documents and multi-pane content outside the conversation DOM are not exported as separate artifacts.
- **History:** indexed virtualization is supported; virtualization lacking stable ordered identifiers is refused. Empty attachment-only messages without readable text cause a clear error. Page/frontend changes can require an extractor update.
- **Limits:** Large models transfer in acknowledged chunks. The in-memory budget is 96 MiB of serialized content, and one document generates at a time. This favors a recoverable error over freezing or silently truncating a large conversation. Blob URLs have a 30-minute maximum lifetime.
- **Timestamps/title:** the document/page title is a fallback and can be generic. Missing original message times are not invented.

## Privacy and permissions

| Permission / access | Why it is needed |
|---|---|
| `downloads` | Start local file downloads and report Chrome-confirmed completion/interruption |
| `offscreen` | Generate documents and hold Blob URLs in a separate local extension document |
| `storage` | Save formatting preferences and temporary download status/filename metadata |
| Content-script match: `https://chatgpt.com/*` | Read the displayed conversation and add export controls only on ChatGPT |

The content script runs on ChatGPT. The installed host permissions cover ChatGPT, its image delivery endpoints, `images.openai.com` and `*.oaiusercontent.com`. For a public HTTPS image displayed by another site, the worker can attempt an anonymous read. When the site blocks that read, the popup can request Chrome access to the specific image site. Chrome stores the grant until it is removed in the extension’s site-access settings. Only the allowed ChatGPT image endpoints use session credentials. External image requests omit credentials and the referrer. The exporter performs document generation locally.

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
      pdf-style.js          Read rendered alignment, inline styles and code token styles
      diagram.js              Preserve safe SVG shapes, styles and labels
      render-diagrams.js      Render supported Mermaid source in the offscreen document
      unicode.js              Select bundled fonts for multilingual PDF text
      equations.js          Convert supported TeX and MathML for PDF and Word
      image-box.js          Measure image footprints, fitting and crops
      visibility.js         Identify CSS-clipped, invisible content
      html-layout.js        Measure bounded HTML cards and diagrams for vector printing
      links.js              Read content labels and real link destinations
      transfer.js           Stage large models in acknowledged, document-bound chunks
      media.js              Resolve displayed images for embedding
      media-fetch.js        Validate and retrieve permitted image assets
      document.js           Settings filter, warnings and table normalization
      pdf-exporter.js       pdfmake layout and PDF stream generation
      docx-exporter.js      Native OOXML construction with docx
      filename.js           Portable local-time filenames
      settings.js           Defaults, validation and local preferences
      ui.js                 Isolated controls, menus and range review
  assets/fonts/             Liberation, DejaVu and Noto font files
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

This separate script exercises actual extension loading and downloads against a locally supplied synthetic ChatGPT-shaped page. It is not a signed-in ChatGPT test. After the automated checks generate the sample files, install the Python validation dependencies and run the artifact checks from the project root:

```bash
python -m pip install pypdf PyMuPDF Pillow numpy
python tests/validate_pdf_styles.py
python tests/validate_rich_pdf.py
python tests/validate_documents.py
python tests/validate_images.py
python tests/validate_career_pdf.py
python tests/validate_thumbnail_pdf.py
```

The PDF style check verifies actual font faces, drawn decorations, syntax colors, indentation, paragraph alignment and prompt and reply positions in both export modes. See `TESTING.md` for executed versus pending checks and live validation steps.

## Troubleshooting

**“Manifest file is missing or unreadable.”** In **Load unpacked**, select the extracted `chatgpt-conversation-exporter/dist` folder. You should see `manifest.json` directly inside it.

**Popup buttons stay disabled.** If the popup says it cannot reach the page script, allow site access for `chatgpt.com` in the extension’s Chrome **Details**, then refresh the chat. If it says no readable messages were detected, open a chat containing a finished answer and wait for the popup to show **Ready**.

**No buttons:** confirm the extension is enabled, open `https://chatgpt.com/`, refresh the tab, and wait for the response to finish. Make sure you selected `dist` during installation. If the final response still has no button, completion evidence may be unknown after a frontend change; do not force an uncertain export. Read `TESTING.md` before updating selectors.

**Wrong-looking range / missing earlier history:** cancel the review, manually scroll upward to reveal the intended beginning, then retry. A detected gap or unorderable virtualization is intentionally refused. For one response, reveal its actual question above it.

**History collection stopped progressing.** Keep the chat open and allow its remaining content to load, then retry. The progress indicator shows the discovered message count. The scan has no overall time limit.

**Word option does not open a file:** look in Chrome Downloads; Word generation produces a file rather than opening Word automatically. If Chrome reports interruption, inspect its explanation. Organizational policy, disk space, antivirus or cancellation can block a download.

**Downloads fail:** open Chrome Downloads, retry after other exports finish, and enable Ask where to save if helpful. Do not infer success from “generating” or “started.” Refresh ChatGPT if the extension was reloaded during an export.

**“Extension context invalidated” / no response:** refresh the ChatGPT tab after reloading or updating the extension.

**Settings don't appear to apply:** click Save settings and make a new export. Existing files are not modified.

**Bold or strikethrough is missing.** Check that the popup shows **v1.5.1**, refresh the conversation tab, and export a new PDF. Compare the styled words with the surrounding plain text. The sample in `examples/formatted-chat.pdf` shows the expected result.

**Equation looks like LaTeX:** check the popup shows v1.5.1 and export again. A formula marked “Unrendered equation” used syntax the local renderer could not convert.

**Boxes/missing glyphs in PDF:** export Word and use a font installed for that language. The font coverage limitation is explicit above.

**Unexpected page elements:** collect a minimal redacted DOM fixture and update the extraction tests. Do not send credentials, tokens or unredacted personal conversations in a bug report.

**Small viewport:** the export toolbar is near the upper-right corner. It uses the space above the composer. When space is too tight, the Chrome popup provides the same export actions.

## Update or uninstall

To update: keep a copy of your current version, replace the project with the new extracted version, visit `chrome://extensions/`, click the extension's reload icon, then refresh ChatGPT. If you change its folder, remove and re-add the unpacked extension; that may reset its local settings. Rebuilding source requires reloading `dist` and refreshing ChatGPT.

To disable: turn off its switch at `chrome://extensions/`. To uninstall: click **Remove**, confirm, then optionally delete the extracted folder. Previously downloaded documents are not deleted.

## Technology and references

JavaScript ES modules, Chrome Manifest V3, Shadow DOM, pdfmake 0.2.20, docx 9.15.2, MathJax 3.2.2, mathml2omml 0.5.0, esbuild, Node test runner, jsdom and Playwright. See `package.json` for exact build/test versions.

- [Chrome offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Chrome Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)
- [pdfmake document definitions](https://pdfmake.github.io/docs/0.1/document-definition-object/)
- [docx Packer](https://docx.js.org/api/classes/index.Packer.html)

This independent extension is not affiliated with or endorsed by OpenAI. ChatGPT is the target website's name, not an endorsement.
