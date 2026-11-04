// Each source has a 40 px intrinsic width. At print size its paths and labels
// must remain scalable, including when several files reuse the same fragment IDs.
export const blockedSVG = "https://example.org/must-not-load-from-svg";
export const remoteSVG =
  "https://cdn.oaiusercontent.com/vector-asset?id=routing";
export function svgDrawing(label, ink = "#1c668b") {
  const ticks = Array.from(
    { length: 24 },
    (_, i) => `M${44 + i * 5} 62v${i % 4 ? 4 : 7}`,
  ).join("");
  const inset =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 14"><path d="M1 13h38" stroke="#a65b40"/><text x="2" y="9" font-size="9">Nested</text></svg>';
  const badge =
    label === "Blob route"
      ? `<image x="147" y="8" width="50" height="18" href="data:image/svg+xml;base64,${Buffer.from(inset).toString("base64")}"/>`
      : "";
  const html =
    label === "Remote route"
      ? `<foreignObject x="160" y="54" width="42" height="18"><div xmlns="http://www.w3.org/1999/xhtml" style="font:8px sans-serif;color:#383838">Port 7</div></foreignObject>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="40" height="16" viewBox="8 4 200 80">
    <style>.wire {fill:none;stroke:${ink};stroke-width:1.35}.tick {fill:none;stroke:${ink};stroke-width:.45} .label {fill:#182f40;font:700 10px sans-serif}</style>
    <defs><linearGradient id="shade"><stop stop-color="#f4f8fa"/><stop offset="1" stop-color="#cfe2e7"/></linearGradient>
      <symbol id="node" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="white" stroke-width="1.5"/></symbol>
      <clipPath id="trim"><rect x="8" y="4" width="200" height="80" rx="5"/></clipPath></defs>
    <g clip-path="url(#trim)"><rect x="8" y="4" width="200" height="80" fill="url(#shade)"/>
    <path class="wire" d="M25 49 C52 49 61 20 90 24 S134 62 189 40"/>
    <path class="tick" d="${ticks}"/><use stroke="${ink}" xlink:href="#node" x="20" y="44" width="10" height="10"/>
    <use stroke="${ink}" href="#node" x="184" y="35" width="10" height="10"/>
    <text x="18" y="19" class="label">${label}</text>${badge}${html}</g></svg>`;
}
export async function installSVGFixture(page, context) {
  const blocked = [];
  await context.route(blockedSVG + "**", (r) => {
    blocked.push(r.request().url());
    return r.abort();
  });
  const remote = svgDrawing("Remote route", "#994923");
  await context.route(remoteSVG, (r) =>
    r.fulfill({ body: remote, contentType: "image/svg+xml" }),
  );
  await page.evaluate(
    ({ remoteURL, data, blob, css, card }) => {
      const q = document.querySelector(
          '[data-chatgpt-search-unit-key$=":user"]',
        ),
        a = document.querySelector(
          '[data-chatgpt-search-unit-key$=":assistant"]',
        );
      document.title = "Vector route illustrations";
      q.innerHTML = "<p>Show the route at full size and as small previews.</p>";
      const uri = (svg) =>
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
      const b64 = (svg) => "data:image/svg+xml;base64," + btoa(svg);
      const blobUrl = URL.createObjectURL(
        new Blob([blob], { type: "image/svg+xml" }),
      );
      const filter =
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="14" viewBox="0 0 80 35"><defs><filter id="soft"><feColorMatrix type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.46 0 0 0 0 0.51 0 0 0 1 0"/></filter></defs><rect x="6" y="6" width="66" height="21" rx="9" fill="#547c8a" filter="url(#soft)"/><path d="M10 18h60" stroke="#173245" stroke-width="1"/></svg>';
      a.innerHTML = `<h2>Vector route illustrations</h2>
      <p>The curve, end nodes and tick marks come from a 40-pixel-wide SVG source.</p>
      <p><a href="https://example.org/route"><img id="full-vector" alt="Full route" style="display:block;width:360px;height:144px"></a></p>
      <h3>Small previews</h3><div style="font:14px/1.4 Arial;width:520px;max-width:100%;border:1px solid #ddd;border-radius:8px;padding:10px">
      <p style="margin:0 0 8px"><b>Two independent route previews retain their individual colors and crops.</b></p>
      <div style="display:flex;align-items:center;gap:10px">
       <div id="css-vector" role="img" aria-label="CSS route preview" style="width:128px;height:55px;background-size:cover;background-position:center"></div>
       <img id="card-vector" alt="Embedded route preview" style="width:128px;height:55px;object-fit:contain">
       <a href="https://example.org/previews">Preview reference</a></div></div>
      <h3>Additional image sources</h3>
      <p><picture><source type="image/svg+xml" srcset="${remoteURL}"><img alt="Remote route" style="width:175px;height:70px"></picture></p>
      <p><img id="blob-vector" alt="Blob route" style="width:175px;height:70px"></p>
      <svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Inline sketch" width="160" height="44" viewBox="0 0 160 44">
       <path d="M2 34q23 -17 46 0t46 0t46 0" stroke="#4655a8" stroke-width="1.2" fill="none"/><text x="3" y="12" font-size="10">Inline route</text></svg>
      <p>Color filter at print resolution</p><p><img id="effect-vector" alt="Color-filtered route" style="width:96px;height:42px"></p>`;
      const stamp = document.createElement("canvas");
      stamp.width = 4;
      stamp.height = 4;
      const ctx = stamp.getContext("2d");
      ctx.fillStyle = "#c9823a";
      ctx.fillRect(0, 0, 4, 4);
      const pixel = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "image",
      );
      for (const [key, value] of Object.entries({
        x: 142,
        y: 7,
        width: 8,
        height: 8,
        href: stamp.toDataURL(),
      }))
        pixel.setAttribute(key, value);
      a.querySelector('svg[aria-label="Inline sketch"]')?.append(pixel);
      const nested = pixel.cloneNode(false);
      for (const [key, value] of Object.entries({
        x: 90,
        y: 4,
        width: 40,
        height: 14,
        href: uri(
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 14"><path d="M1 13h38" stroke="#7f614a"/><text x="1" y="9" font-size="9">Inset</text></svg>',
        ),
      }))
        nested.setAttribute(key, value);
      pixel.after(nested);
      a.querySelector("#full-vector").src = uri(data);
      a.querySelector("#css-vector").style.backgroundImage =
        `url("${uri(css)}")`;
      a.querySelector("#card-vector").src = b64(card);
      a.querySelector("#blob-vector").src = blobUrl;
      a.querySelector("#effect-vector").src = uri(filter);
    },
    {
      remoteURL: remoteSVG,
      data: svgDrawing("Primary route").replace(
        "</svg>",
        `<script>window.__cgeUnsafeSVG=true;</script><image href="${blockedSVG}" width="8" height="8"/><g onclick="window.__cgeUnsafeSVG=true;"></g></svg>`,
      ),
      blob: svgDrawing("Blob route", "#765287"),
      css: svgDrawing("CSS route", "#963c61"),
      card: svgDrawing("Card route", "#407644"),
    },
  );
  await page.waitForFunction(() =>
    [...document.querySelectorAll("main img")].every(
      (n) => n.complete && n.naturalWidth > 0,
    ),
  );
  return blocked;
}
