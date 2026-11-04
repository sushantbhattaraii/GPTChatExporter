# Third-party notices

Production dependency inventory from the lockfile. Some dependencies are used by upstream Node variants rather than the browser bundle. Original available license files are retained in THIRD_PARTY_LICENSES. DejaVu fonts retain their license in assets/fonts/LICENSE.txt and dist/FONT_LICENSE.txt. The original project code uses the root MIT license.

| Package | Version | License | Retained files |
|---|---|---|---|
| @foliojs-fork/fontkit | 1.9.2 | MIT | See bundled license comments |
| @foliojs-fork/linebreak | 1.1.2 | MIT | LICENSE |
| @foliojs-fork/pdfkit | 0.15.3 | MIT | LICENSE |
| @foliojs-fork/restructure | 2.0.2 | MIT | LICENSE |
| @types/node | 26.6.6 | MIT | LICENSE |
| @xmldom/xmldom | 0.9.12 | MIT | LICENSE |
| base64-js | 1.3.1 | MIT | LICENSE |
| brotli | 1.3.3 | MIT | See bundled license comments |
| browserify-zlib | 0.2.0 | MIT | LICENSE |
| call-bind | 1.0.9 | MIT | LICENSE |
| call-bind-apply-helpers | 1.0.2 | MIT | LICENSE |
| call-bound | 1.0.4 | MIT | LICENSE |
| clone | 1.0.4 | MIT | LICENSE |
| commander | 13.1.0 | MIT | LICENSE |
| crypto-js | 4.2.0 | MIT | LICENSE |
| deep-equal | 1.1.2 | MIT | LICENSE |
| define-data-property | 1.1.4 | MIT | LICENSE |
| define-properties | 1.2.1 | MIT | LICENSE |
| dfa | 1.2.0 | MIT | See bundled license comments |
| docx | 9.15.2 | MIT | LICENSE |
| dunder-proto | 1.0.1 | MIT | LICENSE |
| es-define-property | 1.0.1 | MIT | LICENSE |
| es-errors | 1.3.0 | MIT | LICENSE |
| es-object-atoms | 1.1.2 | MIT | LICENSE |
| esm | 3.2.25 | MIT | LICENSE |
| fflate | 0.8.3 | MIT | LICENSE |
| function-bind | 1.1.2 | MIT | LICENSE |
| functions-have-names | 1.2.3 | MIT | LICENSE |
| get-intrinsic | 1.3.0 | MIT | LICENSE |
| get-proto | 1.0.1 | MIT | LICENSE |
| gopd | 1.2.0 | MIT | LICENSE |
| has-property-descriptors | 1.0.2 | MIT | LICENSE |
| has-symbols | 1.1.0 | MIT | LICENSE |
| has-tostringtag | 1.0.2 | MIT | LICENSE |
| hasown | 2.0.4 | MIT | LICENSE |
| iconv-lite | 0.6.3 | MIT | LICENSE |
| is-arguments | 1.2.0 | MIT | LICENSE |
| is-date-object | 1.1.0 | MIT | LICENSE |
| is-regex | 1.2.1 | MIT | LICENSE |
| jpeg-exif | 1.1.4 | MIT | LICENSE.txt |
| math-intrinsics | 1.1.0 | MIT | LICENSE |
| mathjax-full | 3.2.2 | Apache-2.0 | LICENSE |
| mathml2omml | 0.5.0 | LGPL-3.0-or-later | LICENSE |
| mhchemparser | 4.2.1 | Apache-2.0 | LICENSE.txt |
| mj-context-menu | 0.6.1 | Apache-2.0 | See bundled license comments |
| nanoid | 6.0.2 | MIT | LICENSE |
| object-is | 1.1.6 | MIT | LICENSE |
| object-keys | 1.1.1 | MIT | LICENSE |
| pako | 0.2.9 | MIT | LICENSE |
| pako | 1.0.11 | (MIT AND Zlib) | LICENSE |
| pdfmake | 0.2.20 | MIT | LICENSE |
| png-js | 1.1.0 | "See package" | LICENSE |
| regexp.prototype.flags | 1.5.4 | MIT | LICENSE |
| safer-buffer | 2.1.2 | MIT | LICENSE |
| sax | 1.6.1 | BlueOak-1.0.0 | LICENSE.md |
| set-function-length | 1.2.2 | MIT | LICENSE |
| set-function-name | 2.0.2 | MIT | LICENSE |
| speech-rule-engine | 4.1.5 | Apache-2.0 | LICENSE |
| tiny-inflate | 1.0.3 | MIT | LICENSE |
| undici-types | 8.9.0 | MIT | LICENSE |
| unicode-properties | 1.4.1 | MIT | LICENSE |
| unicode-trie | 2.0.0 | MIT | LICENSE |
| wicked-good-xpath | 1.3.0 | MIT | LICENSE |
| xmldoc | 2.0.3 | MIT | LICENSE |

pdfmake's browser bundle contains upstream components and retained legal comments in dist/offscreen.js.LEGAL.txt. During bundling, two legacy dynamic global-object fallbacks in pdfmake are replaced with globalThis for Manifest V3. No remote code is introduced.

The bundled mathml2omml 0.5.0 converter is LGPL-3.0-or-later. Its original source is included in THIRD_PARTY_LICENSES/mathml2omml-source-map.json under sourcesContent. To relink it, replace the package in node_modules and run npm run build. Upstream: https://github.com/fiduswriter/mathml2omml.
