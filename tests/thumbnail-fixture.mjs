// Executed in Chromium. The source art is deliberately larger than every thumbnail.
export function universityFixture() {
  const sources = [
    [
      "University of California, Irvine",
      "UCI Recruit",
      "Open Donald Bren Hall – Classroom Technologies",
      "Recruiting computer systems faculty for July 2027, explicitly including distributed systems, storage, and databases. Applications are due December 1, 2026.",
      "#80a6af",
      "#d8c2a4",
    ],
    [
      "Rutgers University",
      "Rutgers Job Opportunities",
      "Open Rutgers University – campus preview",
      "Recruiting tenure-track computer science faculty for September 2027. The advertisement requires a research statement, teaching statement, and academic references, with priority consideration by December 15, 2026.",
      "#b7c7cf",
      "#a26750",
    ],
    [
      "Reed College",
      "Reed College",
      "Open Academics – Reed College",
      "Recruiting a tenure-stream Assistant Professor in computer systems for Fall 2027, including distributed computing. The role emphasizes both undergraduate teaching and active research.",
      "#9ebcaf",
      "#ab876a",
    ],
  ];
  function illustration(sky, stone) {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 750;
    const p = c.getContext("2d");
    p.fillStyle = sky;
    p.fillRect(0, 0, 1200, 750);
    p.fillStyle = "#71836d";
    p.fillRect(0, 500, 1200, 250);
    p.fillStyle = stone;
    p.fillRect(190, 310, 800, 265);
    p.fillStyle = "#38494a";
    p.beginPath();
    p.moveTo(140, 320);
    p.lineTo(600, 160);
    p.lineTo(1040, 320);
    p.fill();
    for (let x = 235; x < 965; x += 105) {
      p.fillRect(x, 357, 45, 60);
      p.fillRect(x, 460, 45, 60);
    }
    p.fillStyle = "#e4d7bb";
    p.beginPath();
    p.moveTo(570, 570);
    p.lineTo(660, 570);
    p.lineTo(835, 750);
    p.lineTo(445, 750);
    p.fill();
    for (const [x, y, r] of [
      [115, 360, 115],
      [1040, 420, 88],
      [1135, 365, 120],
    ]) {
      p.fillStyle = "#56473c";
      p.fillRect(x - 10, y, 20, 205);
      p.fillStyle = "#48685a";
      p.beginPath();
      p.arc(x, y, r, 0, Math.PI * 2);
      p.fill();
    }
    return c.toDataURL();
  }
  const art = sources.map((row) => illustration(row[4], row[5]));
  const style = document.createElement("style");
  style.textContent = `
    .univ-result {display:grid;grid-template-columns:108px minmax(0,1fr);gap:12px;align-items:start;width:628px;max-width:100%;padding:8px 0;margin:0 0 5px;font:15px/1.5 Arial;color:#151515}
    .univ-result .pic {display:block;position:relative;overflow:hidden;width:108px;height:82px}
    .univ-result .pic img {width:100%;height:100%;display:block;object-fit:cover}
    .univ-result a {color:inherit} .univ-result .open {position:absolute;inset:0}
    .univ-result p {margin:4px 0}
    .univ-result .source {display:inline-flex;align-items:center;gap:3px;padding:1px 5px;border-radius:8px;background:#f2f2f2;font:10px/14px Arial;color:#444;vertical-align:middle;overflow:hidden}
    .source img {width:9px;height:9px} .univ-result .faculty {font-size:12px}
    .univ-sr {position:absolute;overflow:hidden;width:1px;height:1px;clip:rect(0,0,0,0);white-space:nowrap}
    .univ-gallery {width:490px;display:grid;grid-template-columns:repeat(2,1fr);gap:12px}
    .univ-gallery figure {margin:0} .univ-gallery figcaption {font:12px Arial;margin-top:4px}
  `;
  document.head.append(style);
  document.title = "University search";
  const q = document.querySelector('[data-chatgpt-search-unit-key$=":user"]');
  const a = document.querySelector(
    '[data-chatgpt-search-unit-key$=":assistant"]',
  );
  q.innerHTML =
    "<p>Show the university search results and their thumbnails.</p>";
  a.innerHTML = `<h2>Faculty search results</h2>
    ${sources
      .map(([name, site, label, desc], i) => {
        const image = `<img src="${art[i]}" alt="${name} campus" style="object-position:${i === 0 ? "100% 50%" : "50% 50%"}"/>`;
        const url = "https://example.org/preview/" + i;
        const pic =
          i === 0
            ? `<a class="pic" href="${url}" aria-label="${label}">${image}</a>`
            : `<div class="pic">${image}<a class="open" href="${url}" aria-label="${label}">${i === 1 ? "<span class='univ-sr'>Open screen-reader preview</span>" : ""}</a></div>`;
        return `<div class="univ-result">${pic}<div><strong><a href="https://example.org/university/${i}">${name}</a></strong>
        <p>${desc} <span class="source"><img alt="Image" src="data:image/png;base64,AQID"/><span style="clip-path:inset(50%);position:absolute">Image helper</span>${site}</span></p>
        <a class="faculty" href="https://example.org/search/${i}">Faculty search ↗</a></div></div>`;
      })
      .join("")}
    <h3>Thumbnail sizes</h3><p>One illustration appears at two different sizes in the chat.</p>
    <p><a href="https://example.org/standalone"><img alt="Small campus thumbnail" style="width:96px;height:60px" src="${art[0]}"/></a></p>
    <div class="univ-gallery">
      <figure><img alt="Gallery thumbnail" style="width:144px;height:90px" src="${art[0]}"/><figcaption>Gallery thumbnail</figcaption></figure>
      <figure><div style="width:88px;height:88px;overflow:hidden;position:relative"><img alt="Cropped gallery thumbnail" style="position:absolute;right:0;top:0;width:176px;height:110px" src="${art[1]}"/></div><figcaption>Square crop</figcaption></figure>
    </div>`;
}
