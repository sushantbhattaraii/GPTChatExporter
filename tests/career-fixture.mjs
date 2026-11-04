export const photoURL =
  "https://www.microsoft.com/en-us/research/wp-content/uploads/2022/07/99_3.21.18-24-1.jpg";
export const companyURL = "https://www.microsoft.com/en-us/research/";
export const labsURL = "https://www.cockroachlabs.com/careers/";
export const jobURL = "https://www.ziprecruiter.com/";
const arrow =
  '<div style="display:flex;justify-content:center;height:22px"><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path d="M12 3v15m-6-6 6 6 6-6" stroke="#737373" stroke-width="2" fill="none"/></svg></div>';
function stage(name, desc, color = "#f2f2f2") {
  return `<div style="background:${color};border-radius:8px; border:1px solid #dedede;text-align:center;padding:10px 8px;flex:1">
    <b>${name}</b>${desc ? `<div style="margin-top:6px;font-size:13px">${desc}</div>` : ""}</div>`;
}
export function careerFixture() {
  return `<h2>Company links and image</h2>
   <table><tr><th>Company</th><th>Research area</th></tr>
   <tr><td><button aria-haspopup="dialog" data-href="${companyURL}"><span>Microsoft</span></button></td><td>Distributed databases</td></tr>
   <tr><td><button aria-haspopup="dialog">Databricks</button></td><td>Data systems</td></tr></table>
   <h3><a href="${labsURL}" role="button"><span>Cockroach Labs</span></a></h3>
   <p><img src="${photoURL}" alt="Northwest Database Society (NWDS) Annual Meeting 2023 - Microsoft Research" width="300" height="160"/></p>
   <h2>What about academia?</h2><div style="border:1px solid #dddddd;border-radius:14px;padding:12px;font:15px/1.35 Arial;color:#171717;background:white">
     ${stage("PhD in Computer Science", "")}${arrow}
     <div style="display:flex;gap:6px">${stage("Postdoctoral Researcher", "Often 1–3 years; optional, not mandatory")}${stage("Direct faculty entry", "Possible with a strong record")}</div>${arrow}
     ${stage("Tenure-track Assistant Professor", "Research, teaching, student supervision, grant writing", "#ffffff")}${arrow}
     ${stage("Tenured Associate Professor", "Subject to successful tenure review")}${arrow}
     ${stage("Professor", "Promotion following sustained contributions")}</div>
   <h2>Example position</h2>
   <div style="border:1px solid #dddddd;border-radius:18px;padding:20px 24px;background:white;color:#151515;font:16px/1.5 Arial">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div><b style="font-size:14px">Aalyria</b><div style="font-size:18px;font-weight:600">Research Scientist, Optimization Systems</div></div>
      <a role="button" href="${jobURL}" style="border-radius:24px;background:#111;color:white;font-size:13px;font-weight:bold;padding:9px 14px;text-decoration:none">Apply on ZipRecruiter</a></div>
    <hr style="margin:14px 0;border:0;border-top:1px solid #ddd"/>
    <div style="display:flex;gap:16px;color:#555;font-size:13px"><span><svg width="15" height="12" viewBox="0 0 18 13"><rect x="1" y="1" width="16" height="10" fill="none" stroke="#555"/></svg> $120K - $145K/yr</span><span><svg width="14" height="14" viewBox="0 0 14 14"><path d="M1 4h12v8H1zM4 4V2h6v2" fill="none" stroke="#555"/></svg> Full-time</span></div>
    <p style="margin:12px 0 0">Research and development position at an aerospace networking company developing software-defined networking platforms. Its focus on network optimization is adjacent to distributed graph algorithms.</p>
   </div>`;
}
