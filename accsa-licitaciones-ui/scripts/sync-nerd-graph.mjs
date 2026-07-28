// Copies the generated graphify graph into the /nerd-graph React view,
// pointing vis-network at the local vendored bundle instead of the CDN
// (the app CSP only allows scripts from 'self').
//
// Usage: pnpm sync:graph [path/to/graph.html]
// Default source: ../graphify-out/graph.html (monorepo root).
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";

const src = resolve(
  process.cwd(),
  process.argv[2] ?? "../graphify-out/graph.html",
);
const dest = resolve(process.cwd(), "src/app/nerd-graph/graph.html");
const vendor = resolve(process.cwd(), "public/vendor/vis-network.min.js");

if (!existsSync(src)) {
  console.error(`error: source not found: ${src}`);
  console.error("Run `graphify export html --node-limit 8000` first.");
  process.exit(1);
}
if (!existsSync(vendor)) {
  console.error(`error: vendored vis-network missing: ${vendor}`);
  console.error(
    "Download it: curl -fsSL https://unpkg.com/vis-network@9.1.6/standalone/umd/vis-network.min.js -o public/vendor/vis-network.min.js",
  );
  process.exit(1);
}

const html = readFileSync(src, "utf-8");
const cdnTag = /<script\b[^>]*unpkg\.com\/vis-network[^>]*><\/script>/;
if (!cdnTag.test(html)) {
  console.error(
    "error: could not find the unpkg vis-network <script> tag in the source HTML.",
  );
  process.exit(1);
}

const out = html.replace(cdnTag, '<script src="/vendor/vis-network.min.js"></script>');
if (/unpkg\.com\/vis-network/.test(out)) {
  console.error("error: a unpkg vis-network reference still remains after replacement.");
  process.exit(1);
}

writeFileSync(dest, out, "utf-8");
console.log(`synced ${(out.length / 1024 / 1024).toFixed(1)}MB -> src/app/nerd-graph/graph.html`);
