// Inventory pinned production packages and retain their original license files.
import {
  readFile,
  readdir,
  mkdir,
  copyFile,
  writeFile,
} from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
await mkdir("THIRD_PARTY_LICENSES", { recursive: true });
const rows = [];
for (const [dir, entry] of Object.entries(lock.packages)) {
  if (!dir || entry.dev) continue;
  const pkg = JSON.parse(await readFile(dir + "/package.json", "utf8"));
  const slug = pkg.name.replaceAll("/", "__");
  const files = (await readdir(dir)).filter((name) =>
    /^(license|copying|copyright|notice)(\.|$)/i.test(name),
  );
  for (const file of files)
    await copyFile(
      dir + "/" + file,
      "THIRD_PARTY_LICENSES/" + slug + "-" + file,
    );
  rows.push(
    `| ${pkg.name} | ${pkg.version} | ${typeof pkg.license === "string" ? pkg.license : JSON.stringify(pkg.license || entry.license || "See package")} | ${files.join(", ") || "See bundled license comments"} |`,
  );
}
await writeFile(
  "THIRD_PARTY_NOTICES.md",
  `# Third-party notices\n\nProduction dependency inventory from the lockfile. Some dependencies are used by upstream Node variants rather than the browser bundle. Original available license files are retained in THIRD_PARTY_LICENSES. DejaVu fonts retain their license in assets/fonts/LICENSE.txt and dist/FONT_LICENSE.txt. The Noto Sans SC and Devanagari faces and the Hangul subset of Noto Sans KR use SIL OFL 1.1. Their original font notices are in THIRD_PARTY_LICENSES. The original project code uses the root MIT license.\n\n| Package | Version | License | Retained files |\n|---|---|---|---|\n${rows.sort().join("\n")}\n\npdfmake's browser bundle contains upstream components and retained legal comments in dist/offscreen.js.LEGAL.txt. During bundling, two legacy dynamic global-object fallbacks in pdfmake are replaced with globalThis for Manifest V3. No remote code is introduced.\n`,
);
console.log(`Collected notices for ${rows.length} production packages.`);
