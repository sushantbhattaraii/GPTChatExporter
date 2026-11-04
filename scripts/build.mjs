import { build } from "esbuild";
import { cp, mkdir, rm, readFile, writeFile, readdir } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });
await cp("node_modules/mermaid/dist/mermaid.min.js", "dist/mermaid.min.js");
const fontData = {};
for (const file of await readdir("assets/fonts"))
  if (file.endsWith(".ttf"))
    fontData[file] = (await readFile("assets/fonts/" + file)).toString(
      "base64",
    );
await writeFile("src/font-data.json", JSON.stringify(fontData));
await build({
  entryPoints: [
    "src/content.js",
    "src/background.js",
    "src/offscreen.js",
    "src/popup.js",
    "src/options.js",
  ],
  outdir: "dist",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "chrome116",
  sourcemap: false,
  minify: false,
  legalComments: "linked",
  plugins: [
    {
      name: "mv3-global",
      setup(b) {
        b.onLoad(
          { filter: /pdfmake[\\/]build[\\/]pdfmake\.js$/ },
          async (args) => ({
            contents: (await readFile(args.path, "utf8")).replace(
              /new Function\((["'])return this\1\)\(\)/g,
              "globalThis",
            ),
            loader: "js",
          }),
        );
      },
    },
  ],
});
await cp("assets/fonts/LICENSE.txt", "dist/FONT_LICENSE.txt");
await cp("LICENSE", "dist/LICENSE.txt");
await cp("THIRD_PARTY_NOTICES.md", "dist/THIRD_PARTY_NOTICES.md");
await cp("THIRD_PARTY_LICENSES", "dist/THIRD_PARTY_LICENSES", {
  recursive: true,
});
const pkg = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(
  "dist/BUILD.txt",
  `ChatGPT Conversation Exporter ${pkg.version}\nBuilt from included source. See ../README.md and ../THIRD_PARTY_NOTICES.md.\n`,
);
console.log("Built ready-to-load extension in dist/");

for (const file of await readdir("dist")) {
  if (
    file.endsWith(".js") &&
    /\beval\s*\(|new\s+Function\s*\(/.test(
      await readFile("dist/" + file, "utf8"),
    )
  )
    throw new Error("Unsafe dynamic code in " + file);
}
