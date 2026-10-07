// GOALS.md section 33f - the guard that makes a re-leak of the trainer's reference table fail the build.
//
// The sentinels are DERIVED, at run time, from the reference's own source (scripts/lib/catalogSource.mjs: the
// CATALOG_SOURCE path or the Android asset): its title, its section headings, the opening words of every prose line
// (the ruler, the notes, the adjustments) and every exercise name. Nothing from the table is copied into a file of
// this repository. If there is no source to derive them from the guard FAILS - it never passes vacuously.
//
// Two more inputs, for what a script cannot know:
//   LEAK_SENTINELS_FILE=<path>  a JSON file { "phrases": [...], "names": [...] } used INSTEAD of the source (when the
//                               source has moved out of this checkout, e.g. a private copy kept elsewhere);
//   LEAK_EXTRA_PHRASES=a|b|c    extra phrases to look for, "|"-separated - the owner puts the reference's original file
//                               name here; it is deliberately not written in any tracked file.

import { readFileSync } from "node:fs";
import { buildCatalog, readCatalogSource } from "./catalogSource.mjs";

/** Lower case, no accents, every run of non-letters/digits one space, padded with a space at each end. */
export function normalizeForScan(text) {
  const flat = text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return ` ${flat} `;
}

// Words that name the reference by its file, whatever the source says. Matching these anywhere in the built site
// (including a file NAME, see check-no-reference-leak.mjs) means the reference or its pointer is being served.
const FILE_NAME_PHRASES = ["hypertrophy volume reference", "exercise catalog json"];

function phrasesFrom(markdown) {
  const phrases = new Set();
  for (const raw of markdown.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("|")) continue;
    const heading = /^#{1,6}\s+(.+)$/.exec(line);
    const text = (heading ? heading[1] : line.replace(/^[-*]\s+/, "")).trim();
    const words = normalizeForScan(text).trim().split(" ");
    if (heading) {
      // The title and any heading of three words or more; a one- or two-word heading ("Puxar") is plain vocabulary.
      if (words.length >= 3) phrases.add(normalizeForScan(text));
    } else if (words.length >= 5) {
      // Prose: the first five words of each line are enough to recognise a pasted copy, wrapped or not.
      phrases.add(` ${words.slice(0, 5).join(" ")} `);
    }
  }
  return [...phrases];
}

/** `{ phrases, names }`, both already normalised by normalizeForScan. Throws when there is nothing to guard. */
export function loadSentinels() {
  let phrases;
  let names;
  if (process.env.LEAK_SENTINELS_FILE) {
    const given = JSON.parse(readFileSync(process.env.LEAK_SENTINELS_FILE, "utf8"));
    phrases = (given.phrases ?? []).map(normalizeForScan);
    names = (given.names ?? []).map(normalizeForScan);
  } else {
    const { markdown } = readCatalogSource(); // throws when the source is missing or empty
    phrases = phrasesFrom(markdown);
    names = buildCatalog().exercises.map((entry) => normalizeForScan(entry.name));
  }
  const extra = (process.env.LEAK_EXTRA_PHRASES ?? "")
    .split("|")
    .map((phrase) => phrase.trim())
    .filter((phrase) => phrase !== "")
    .map(normalizeForScan);
  const result = { phrases: [...new Set([...phrases, ...FILE_NAME_PHRASES.map(normalizeForScan), ...extra])], names: [...new Set(names)] };
  if (result.names.length === 0 || phrases.length === 0) {
    throw new Error("The leak guard has nothing to guard: no phrases or exercise names could be derived. Refusing to pass vacuously.");
  }
  return result;
}

/**
 * What of the reference is in `text`: how many phrase sentinels (any one is a leak) and how many DISTINCT exercise
 * names (one generic word in an example is not a leak; a pasted list is). Never returns the matched text.
 */
export function findLeaks(text, sentinels) {
  const haystack = normalizeForScan(text);
  const phraseHits = sentinels.phrases.filter((phrase) => haystack.includes(phrase)).length;
  const nameHits = sentinels.names.filter((name) => haystack.includes(name)).length;
  return { phraseHits, nameHits };
}

/** The most distinct exercise names tolerated outside the templates; the templates tolerate none. */
export const MAX_NAMES_ELSEWHERE = 2;

export function isLeak(found, { allowNames = MAX_NAMES_ELSEWHERE } = {}) {
  return found.phraseHits > 0 || found.nameHits > allowNames;
}
