// GOALS.md §36a/§36h — how big the billing code is, so "one item, less space" is measured instead of claimed.
//
//   npm run build && node scripts/billing-size-report.mjs
//
// Prints: lines of billing source and test code (the two scopes' legacy files + everything under the shared
// billing folders) and, per route, the JavaScript a first visit downloads (raw and gzip bytes of the chunks the
// exported HTML references) plus the total of all chunks.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = (path) => join(web, "src", path);

// The two sides as they were at the baseline (2026-10-10). Files that no longer exist are simply skipped.
const PLATFORM = [
  "domain/mensalidades.ts", "domain/platformBilling.ts", "data/platformPlans.ts", "data/platformSubscriptions.ts",
  "data/mensalidades.ts", "app/admin/mensalidades/page.tsx", "app/admin/mensalidades/layout.tsx",
  "app/admin/mensalidades/MarkPaidDialog.tsx", "app/admin/mensalidades/AssignPlanDialog.tsx", "app/admin/planos/page.tsx",
  "app/admin/personais/detalhe/PlatformSubscriptionPanel.tsx", "app/_shared/TrainerPlatformBilling.tsx",
];
const STUDENT = [
  "domain/payments.ts", "domain/billing.ts", "data/billing.ts", "app/app/ChargesTable.tsx",
  "app/app/alunos/detalhe/BillingSection.tsx", "app/app/mensalidades/page.tsx",
];
const SHARED_DIRS = ["domain/billing", "data/billing", "app/_shared/billing"];
const TESTS = ["domain/payments.test.ts", "domain/billing.test.ts", "domain/mensalidades.test.ts", "domain/platformBilling.test.ts"];

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const lines = (path) => readFileSync(path, "utf8").split("\n").length - (readFileSync(path, "utf8").endsWith("\n") ? 1 : 0);
const exists = (list) => list.map(src).filter(existsSync);
const sharedAll = SHARED_DIRS.flatMap((dir) => walk(src(dir)));
const sharedSource = sharedAll.filter((path) => !/\.test\.tsx?$/.test(path));
const sharedTests = sharedAll.filter((path) => /\.test\.tsx?$/.test(path));
const sum = (paths) => paths.reduce((total, path) => total + lines(path), 0);

const platformFiles = exists(PLATFORM);
const studentFiles = exists(STUDENT);
const testFiles = [...exists(TESTS), ...sharedTests];
const report = {
  platformLines: sum(platformFiles),
  studentLines: sum(studentFiles),
  sharedLines: sum(sharedSource),
  testLines: sum(testFiles),
};
report.sourceLines = report.platformLines + report.studentLines + report.sharedLines;

console.log("## Billing code size");
console.log(`- platform-side files (${platformFiles.length}): ${report.platformLines} lines`);
console.log(`- student-side files (${studentFiles.length}): ${report.studentLines} lines`);
console.log(`- shared billing folders (${sharedSource.length} files): ${report.sharedLines} lines`);
console.log(`- **billing source in total: ${report.sourceLines} lines**; billing tests: ${report.testLines} lines (${testFiles.length} files)`);

const out = join(web, "out");
if (!existsSync(out)) {
  console.log("\n(no `out/` folder — run `npm run build` first for the bundle sizes)");
  process.exit(0);
}
function chunkBytes(urls) {
  let raw = 0;
  let gz = 0;
  for (const url of urls) {
    const path = join(out, url.replace(/^.*?\/_next\//, "_next/"));
    if (!existsSync(path)) continue;
    const buffer = readFileSync(path);
    raw += buffer.length;
    gz += gzipSync(buffer).length;
  }
  return { raw, gz };
}
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
console.log("\n## First-visit JavaScript per route (chunks the HTML references)");
for (const route of ["/admin/mensalidades", "/admin/planos", "/admin/personais/detalhe", "/app/mensalidades", "/app/alunos/detalhe", "/app"]) {
  const file = join(out, route, "index.html");
  if (!existsSync(file)) continue;
  const urls = [...new Set([...readFileSync(file, "utf8").matchAll(/\/_next\/static\/[^"' )]+\.js/g)].map((m) => m[0]))];
  const { raw, gz } = chunkBytes(urls);
  console.log(`- ${route}: ${urls.length} chunks, ${kb(raw)} raw, ${kb(gz)} gzip`);
  report[route] = { raw, gz };
}
const all = walk(join(out, "_next/static/chunks")).filter((path) => path.endsWith(".js"));
const totalRaw = all.reduce((total, path) => total + statSync(path).size, 0);
console.log(`- every chunk together: ${all.length} files, ${kb(totalRaw)} raw`);
if (process.argv.includes("--json")) console.log(JSON.stringify(report, null, 2));
