const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "www");
const files = ["index.html"];

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of files) {
  const source = path.join(root, file);
  if (fs.existsSync(source)) {
    fs.copyFileSync(source, path.join(outDir, file));
  }
}

const capSrc = path.join(root, "capacitor.config.json");
const capDest = path.join(root, "ios", "App", "App", "capacitor.config.json");
if (fs.existsSync(capSrc)) {
  fs.mkdirSync(path.dirname(capDest), { recursive: true });
  fs.copyFileSync(capSrc, capDest);
}

const publicDir = path.join(root, "ios", "App", "App", "public");
if (fs.existsSync(publicDir)) {
  fs.copyFileSync(path.join(outDir, "index.html"), path.join(publicDir, "index.html"));
}

console.log(`Prepared ${files.length} web files in ${outDir}`);
