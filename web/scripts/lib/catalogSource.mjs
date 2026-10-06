// GOALS.md §33 — where the trainer's exercise reference comes from, for the scripts that need it (seed,
// publish, leak guard). One place, so "which file is the source" is decided once:
//   - CATALOG_SOURCE=<path> wins (the owner can keep a private copy outside the repository — D1);
//   - otherwise the Android asset, the only copy that exists today.
// The source is read at run time and never copied under public/ (§33).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseExerciseCatalog } from "../build-exercise-catalog.mjs";

const ANDROID_ASSET = fileURLToPath(new URL("../../../app/src/main/assets/hypertrophy_volume_reference.md", import.meta.url));

export function catalogSourcePath() {
  return process.env.CATALOG_SOURCE ? resolve(process.env.CATALOG_SOURCE) : ANDROID_ASSET;
}

export function catalogSourceExists() {
  return existsSync(catalogSourcePath());
}

/** The source text; throws a clear error when it cannot be read (callers never get an empty string). */
export function readCatalogSource() {
  const path = catalogSourcePath();
  if (!existsSync(path)) {
    throw new Error(`The exercise-reference source was not found at ${path}. Set CATALOG_SOURCE to its path.`);
  }
  const markdown = readFileSync(path, "utf8");
  if (markdown.trim() === "") throw new Error(`The exercise-reference source at ${path} is empty.`);
  return { path, markdown };
}

/** The parsed catalog: `{ version, exercises }`. */
export function buildCatalog() {
  return parseExerciseCatalog(readCatalogSource().markdown);
}

// `node scripts/lib/catalogSource.mjs` prints the catalog JSON to stdout (a check, never written to a file).
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    process.stdout.write(`${JSON.stringify(buildCatalog(), null, 2)}
`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}
`);
    process.exitCode = 1;
  }
}
