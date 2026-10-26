// Booroljuut web-ийн импортын хаалтыг (closure) тооцох: node closure.cjs <root> <entry...>
const fs = require("fs"), path = require("path");
const root = process.argv[2], entries = process.argv.slice(3), seen = new Set(), ext = new Set();
const norm = (p) => path.normalize(p).split(path.sep).join("/");
const tryF = (b) => {
  for (const e of ["", ".ts", ".tsx", "/index.ts"]) {
    const f = path.join(root, b + e);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return norm(b + e);
  }
  return null;
};
const res = (from, sp) => (sp.startsWith("@/") ? tryF(sp.slice(2)) : sp.startsWith(".") ? tryF(path.join(path.dirname(from), sp)) : null);
function walk(f) {
  if (seen.has(f)) return;
  seen.add(f);
  const s = fs.readFileSync(path.join(root, f), "utf8");
  const re = /(?:import|export)[^"']*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url|^\s*import\s+["']([^"']+)["']/gm;
  for (const m of s.matchAll(re)) {
    const sp = m[1] || m[2] || m[3] || m[4], r = res(f, sp);
    if (r) walk(r);
    else if (!sp.startsWith(".") && !sp.startsWith("@/")) ext.add(sp.split("/").slice(0, sp.startsWith("@") ? 2 : 1).join("/"));
  }
}
entries.forEach(walk);
console.log([...seen].sort().join("\n"));
console.error("EXT", [...ext].join(" "), "N", seen.size);
