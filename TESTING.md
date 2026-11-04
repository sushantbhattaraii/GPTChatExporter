# Validation report and release checklist

## Version 1.5.1

The Chromium renderer test exercises the PDF menu for both a single response and the conversation, using styled tokens, tabs, blank lines, four paragraph alignments and numbered inline formatting examples. The PDF validator checks the exported text spans and colored page regions. To smoke-test in your signed-in chat, export the same highlighted answer using each menu, compare token colors to the chat, and select the code in the resulting PDF.

The rich-content fixture exports the same response through both PDF menus. It includes a branching Mermaid flowchart, a rendered SVG with an HTML label, a two-paragraph quote, nested lists, three checkbox states, multilingual prose and a Fibonacci control changed to eight terms. A readable frame exports its text while a sandboxed frame gets a labeled fallback. Run `python tests/validate_rich_pdf.py` on the generated PDFs. A separate layout fixture exports three graph illustrations, captions, weighted table columns and a safe hyperlink through both PDF menus.

For visual comparison, the two PDF menus were also exercised on a reconstruction of the supplied reference’s opening page. Check the question’s four lines, the first heading and the last paragraph. The preview is an excerpt. Actual chat markup, assets and pagination may differ in a live conversation.

The career fixture tests company entity buttons, linked headings, a previously blocked external image, the two-branch faculty path, a bordered job card and its CTA. Both PDF menus are exercised. Run `python tests/validate_career_pdf.py` to inspect embedded pixels, text coordinates, vector connectors and link annotations. Long-history coverage traverses 620 virtualized messages for longer than 45 seconds and checks every index. The large-model tests cover normal image-heavy export, a serialized model over 20 MiB, order checking, and cross-tab isolation.

The university fixture reconstructs three search results with thumbnail overlays, wrapped descriptions, missing citation icons and source badges. Both PDF menus export the same 1,200-pixel illustration at multiple sizes. Run `python tests/validate_thumbnail_pdf.py` to check the physical dimensions and cropped pixels, each link’s rectangle, and that no visible text spans intersect. The campus illustrations are test assets.

## Reproduce the automated checks

Run `npm ci` and `npm run check`. The suite builds the extension and exercises extraction, document generation, simulated downloads, and both export menus in standalone Chromium. The renderer uses synthetic chat pages and mock Chrome transport. See `test-results/final-1.5.1.log` and `test-results/render-results.json`.

Afterward, run `python tests/validate_pdf_styles.py`, `python tests/validate_documents.py` and `python tests/validate_images.py`. These checks use PyMuPDF, pypdf, Pillow and NumPy. They inspect the final files for token RGB values and font emphasis, tab widths and blank lines, paragraph positions, the absence of message fills, table rules and figure-row alignment, long code pagination, document bounds and embedded image pixels.

## Local installation test

This environment blocked the Chromium persistent-profile socket used by `npm run test:browser`. A locally installed Chrome download and a signed-in ChatGPT conversation still need a local check. Microsoft Word was also outside the scope of this release's test run.

## Live smoke test (target Chrome installation)

1. Load `dist`, refresh ChatGPT, open Chrome's extension errors panel and clear previous errors.
2. Create Q1/A1, Q2/A2, Q3/A3 with distinguishable unique text. Wait for each answer.
3. Export A2 in both formats. Verify exactly Q2 and A2 appear, and Q1/Q3 do not. In the PDF confirm that the prompt sits on the right, the answer starts at the left margin, and both have an unfilled background.
4. Export the entire conversation in each format. Check range preview, chronology, labels and no duplicates.
5. Repeat with a Python code block, long line, heading, nested numbered/bulleted list, hyperlink, table and KaTeX formula. Confirm the documented LaTeX fallback.
6. Edit Q2, regenerate A2, switch available alternatives, then repeat pair export on the visible branch. Confirm no hidden branch appears.
7. Start a long generation. Verify the streaming response has no export control. After completion, verify exactly one appears.
8. Open an old long conversation, begin from its middle, export and check the very first and last messages against the real chat. Cancel if the range is incomplete; reveal history and retry.
9. Test an image/attachment response. Verify the generated image is embedded in both pair and conversation exports. An unreadable asset should produce a labelled placeholder.
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
