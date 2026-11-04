# Validation report and release checklist

## Version 1.0.2

The v1.0.1 collector reproduced the reported error when a successful pair extraction was followed by a full-history scan containing two assistant units in one turn. The patched renderer fixture exports a pair and then the whole conversation, preserves both units in order, and discards and retries the scan after a simulated content update. A separate viewport check verifies that the toolbar stays above an expanded composer. The equation tests cover rendered math, literal delimiters, formula fences, native MathML, ordinary code and unsupported syntax. Independent DOCX inspection found Office Math fractions and superscripts. The PDF and a LibreOffice rendering of the DOCX were inspected visually. Live signed-in ChatGPT and desktop Microsoft Word were not exercised here. 31 automated tests and 11 Chromium renderer scenarios passed. See `test-results/release-tests-1.0.2.log` and `test-results/render-results.json`.


## Version 1.0.1

27 automated tests and nine Chromium renderer scenarios passed. See `test-results/check-1.0.1.log`. New regression cases exercise both variants of keyed user and assistant units, section-only role markers, grouped turns with a missing question, and the popup retry while messages hydrate. The renderer test bridges the popup probe to the actual bundled content script on a synthetic conversation, requests individual PDF and Word files and a whole-conversation Word file. The signed-in user’s conversation and native download completion remain unverified in this environment.

## Version 1.0.0 baseline

Date: November 3, 2026. All conversations used for testing were synthetic. No personal ChatGPT content was used.

## Executed successfully

### Automated tests — 24 passed

`npm run check` completed successfully. The Node test runner ran 24 tests, with zero failures or skips:

- 14 extraction/normalization tests: one pair, exact middle pair, hidden alternate branch, edited prompt, streaming with stale action controls, unknown completion, orphan/gap rejection, ordering/parent IDs, duplicate IDs/conflicts, rich content, unsafe links/UI exclusion, settings filtering, filenames, merged table grid, and large text. Several scenarios share a single test.
- 5 document-generation tests: real PDF bytes, real DOCX ZIP package, full conversation in both formats, long content/settings variants, and clean invalid-input failures.
- 5 download-coordination tests with **mock Chrome APIs**: no premature success, interruption, user cancellation/Blob cleanup, fast-completion race, and non-ChatGPT origin rejection.

The exact executed log is `test-results/check.log`.

### Chromium renderer integration — seven scenarios passed

Playwright's standalone Chromium 141.0.7390.37 rendered the UI and executed the built content, offscreen, popup and settings scripts. Browser runtime/storage/tab APIs were test doubles. The generator ran under the shipped extension-page Content Security Policy.

1. Clicking the middle pair's PDF and Word menu items invoked the real bundled generators with only Q2/A2.
2. Full-conversation scrolling, review confirmation and both formats preserved six messages in order.
3. Edited prompt and regenerated answer stayed paired with no duplicate buttons.
4. Adding/removing a streaming stop control suppressed/restored the last export button.
5. A virtualized 40-turn fixture mounted only nearby turns; ordinary scrolling recovered all 40 in order without duplicates.
6. Settings form saved selected values under the CSP with mock storage.
7. Popup detected the ChatGPT tab, dispatched an export request and disabled exports on another site with mock tab APIs.

There were zero collected browser page errors. See `test-results/render-results.json`. This is **not** proof that the extension's actual Chrome API integration or today's signed-in ChatGPT DOM has passed.

### Generated file validation

`python tests/validate_documents.py` passed on generated Node and renderer outputs. It independently checked:

- PDF parsing, nonempty extracted text and page count.
- Q2-only pair content; Q1/Q2/Q3 order in the full PDF.
- Code, math source, table content and PDF link annotations.
- A ten-page long-response PDF, including 900-character unbroken code, 45 lengthy paragraphs and an oversized table cell.
- PDF landscape dimensions and user/code exclusions.
- DOCX ZIP integrity and well-formed XML for every XML/rels member.
- Native tables, numbering, hyperlinks, footer page fields, code indentation and math text.
- Word landscape orientation/dimensions and exclusions.
- PDF text bounding boxes inside the page for pair, full, long and settings fixtures (PyMuPDF).

See `test-results/document-validation.json`. Selected synthetic examples are in `examples/`.

### Application opening and visual inspection

The pair, long and landscape DOCX files opened and converted successfully using **LibreOfficeDev 26.8.0.0.alpha0**. Their PDF renderings were available for inspection. The pair PDF and Word rendering were visually inspected for labels, typography, tables, code, links, math text and footer. Settings and injected controls were also visually inspected in Chromium. This is compatible-reader validation, **not Microsoft Word testing**.

### Build/security checks

- Manifest and referenced entry points/icons were checked.
- Source imports built successfully through esbuild.
- Distributed JavaScript contains no `eval(` or `new Function` calls.
- Runtime dependency audit reported **0 known vulnerabilities** at execution time (`npm audit --omit=dev`, `test-results/npm-audit.json`). This is an advisory-database result, not a security certification.
- All runtime code and fonts are local; no remote script or document service is used.

## Attempted but blocked

`npm run test:browser` attempted to launch real Chromium with the unpacked extension. This environment prevented Chromium's persistent-profile process-singleton Unix socket (`Operation not permitted`). The installed-extension suite could not proceed. Its script is included for a normal desktop environment. No real Chrome download success is claimed from this attempt.

## Not executed — must verify locally

- A signed-in **current ChatGPT** conversation, including account-specific UI experiments.
- Actual Chrome popup invocation/activeTab permission handling and offscreen API behavior with this extension installed.
- Real Chrome Downloads API completion, Save As cancellation, policy restrictions and worker restart/reload while downloading.
- Opening and editing generated documents in **Microsoft Word**.
- All supported Chrome versions, Windows/macOS/Linux combinations, every language, CJK/Devanagari/emoji, and accessibility screen-reader testing.
- Extremely large real conversations, every branch UI, Work-mode embedded artifacts, voice-only responses, or rich components without accessible text.

## Live smoke test (target Chrome installation)

1. Load `dist`, refresh ChatGPT, open Chrome's extension errors panel and clear previous errors.
2. Create Q1/A1, Q2/A2, Q3/A3 with distinguishable unique text. Wait for each answer.
3. Export A2 in both formats. Verify exactly Q2 and A2 appear, and Q1/Q3 do not.
4. Export the entire conversation in each format. Check range preview, chronology, labels and no duplicates.
5. Repeat with a Python code block, long line, heading, nested numbered/bulleted list, hyperlink, table and KaTeX formula. Confirm the documented LaTeX fallback.
6. Edit Q2, regenerate A2, switch available alternatives, then repeat pair export on the visible branch. Confirm no hidden branch appears.
7. Start a long generation. Verify the streaming response has no export control. After completion, verify exactly one appears.
8. Open an old long conversation, begin from its middle, export and check the very first and last messages against the real chat. Cancel if the range is incomplete; reveal history and retry.
9. Test an image/attachment response. Verify textual placeholders and the warning; no pixels/attachments should be promised.
10. Try accented/Greek/Cyrillic text and the specific languages you need. Compare PDF font output with Word. Test unsupported glyph fallback explicitly.
11. Change every formatting setting; save; create a fresh export; inspect the result. Confirm code/user/title exclusions do what you selected.
12. Enable Save As, cancel a download, then retry. Confirm cancellation/interruption is not reported as completion.
13. Navigate to another chat while collection runs. Expect cancellation, not a mixed-conversation document.
14. Refresh/reload the extension, then refresh ChatGPT. Verify controls are not duplicated and normal ChatGPT copying/editing still works.
15. Open PDF in Chrome/another reader and DOCX in Microsoft Word. Check a long code block/table across pages, links, headers/styles, footer numbering and editing.
16. Check `chrome://extensions/` for errors and record Chrome version, date and outcome.

## Maintaining compatibility

Keep failures reproducible with minimal, redacted synthetic DOM fixtures. Update `src/modules/extractor.js` when role/completion/turn markers change; add a failing regression before changing association behavior. Do not replace ordered pairing with “last user on page,” query hidden application state or fetch undocumented account APIs. Unknown structures should return an actionable error.

The actual-browser suite (`tests/browser.mjs`) uses routed synthetic pages, not live credentials. Run the manual checklist separately on the signed-in site. Before distribution, review dependencies and repeat the live tests on a maintained Chrome release.
