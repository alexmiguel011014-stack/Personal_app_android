// GOALS.md section 33f - run after `npm run build` (npm run check:leak): fails when the built static site, web/out/,
// carries the trainer's exercise-reference table or anything that points at it. The deploy workflow runs it before
// uploading the Pages artifact, so a leaking site is never published.
//
// It fails when:
//   - out/prompt/ holds anything but the three web-only templates (no reference, no catalog file, no stray copy);
//   - any file NAME in out/ is one of the reference's file names;
//   - any text file (html, js, json, css, txt, md, xml, svg, map) contains a phrase sentinel, or 3+ distinct exercise
//     names (a lone generic word is not a leak; the templates tolerate none);
//   - any source map exists (a map would ship the original sources, comments included).
// It prints the file and the KIND of hit, never the matched text. Sentinels: scripts/lib/referenceSentinels.mjs.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { findLeaks, isLeak, loadSentinels, normalizeForScan } from "./lib/referenceSentinels.mjs";
import { WEB_TEMPLATES } from "./lib/webTemplates.mjs";

const OUT = process.argv[2] ? process.argv[2] : fileURLToPath(new URL("../out/", import.meta.url));
const TEXT_EXTENSIONS = new Set([".html", ".js", ".mjs", ".json", ".css", ".txt", ".md", ".xml", ".svg", ".map", ".webmanifest", ".rsc"]);
const FILE_NAME_WORDS = ["hypertrophy volume reference", "exercise catalog"];

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else yield path;
  }
}

function main() {
  if (!existsSync(OUT)) {
    console.error(`No build output at ${OUT} - run \`npm run build\` first.`);
    return 1;
  }
  const sentinels = loadSentinels(); // throws (non-zero exit) when there is nothing to guard
  const problems = [];
  let scanned = 0;

  const promptDir = join(OUT, "prompt");
  if (existsSync(promptDir)) {
    const present = readdirSync(promptDir).sort();
    const allowed = [...WEB_TEMPLATES].sort();
    if (present.join("|") !== allowed.join("|")) {
      problems.push(`out/prompt/ must hold exactly the web-only templates; it holds ${present.length} file(s) that differ from the allowed list`);
    }
  }

  for (const file of walk(OUT)) {
    const shown = relative(OUT, file).split(sep).join("/");
    if (extname(file) === ".map") problems.push(`${shown}: a source map is published`);
    const nameForm = normalizeForScan(shown.replace(/\.[^.]+$/, ""));
    if (FILE_NAME_WORDS.some((word) => nameForm.includes(` ${word}`) || nameForm.includes(`${word} `))) {
      problems.push(`${shown}: the file name points at the reference`);
    }
    if (!TEXT_EXTENSIONS.has(extname(file)) || statSync(file).size > 20_000_000) continue;
    scanned += 1;
    const isTemplate = shown.startsWith("prompt/");
    const found = findLeaks(readFileSync(file, "utf8"), sentinels);
    if (isLeak(found, { allowNames: isTemplate ? 0 : undefined })) {
      problems.push(`${shown}: ${found.phraseHits} phrase hit(s), ${found.nameHits} exercise name(s) of the reference`);
    }
  }

  if (problems.length > 0) {
    console.error(`The built site carries the exercise reference (${problems.length} problem(s)):`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }
  console.log(`No reference table in the build: ${scanned} text file(s) scanned against ${sentinels.phrases.length} phrases and ${sentinels.names.length} names.`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
