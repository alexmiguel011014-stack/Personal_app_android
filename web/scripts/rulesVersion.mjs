// The rules-versioning convention (CLAUDE.md, "Security rules"): the first line of firestore.rules is
// `// Rules version: N`, and firestore-rules/versions/vN.rules is the same file, byte for byte (line
// endings aside). This is the pure check; check-rules-version.mjs reads the files and calls it.

const HEADER = /^\/\/ Rules version: (\d+)\s*$/;

const unixLines = (text) => text.replace(/\r\n/g, "\n");

/** The N in the first line's `// Rules version: N`, or null. */
export function headerVersion(rules) {
  const match = HEADER.exec(unixLines(rules).split("\n", 1)[0]);
  return match ? Number(match[1]) : null;
}

/**
 * @param {{ rules: string, archives: Record<string, string> }} input archives maps a file name
 *   (`v4.rules`) to its text.
 * @returns {string[]} what is wrong; empty when the convention holds.
 */
export function checkRulesVersion({ rules, archives }) {
  const problems = [];
  const version = headerVersion(rules);
  if (version === null) {
    problems.push("firestore.rules must start with `// Rules version: N` on its first line.");
  }

  const archived = new Map();
  for (const name of Object.keys(archives)) {
    const match = /^v(\d+)\.rules$/.exec(name);
    if (match) archived.set(Number(match[1]), archives[name]);
    else problems.push(`firestore-rules/versions/${name} is not named vN.rules.`);
  }

  if (version !== null) {
    const archive = archived.get(version);
    if (archive === undefined) {
      problems.push(`firestore-rules/versions/v${version}.rules is missing — add it: cp firestore.rules firestore-rules/versions/v${version}.rules`);
    } else if (unixLines(archive) !== unixLines(rules)) {
      problems.push(
        `firestore-rules/versions/v${version}.rules differs from firestore.rules. Until version ${version} is published, edit both ` +
          `together (cp firestore.rules firestore-rules/versions/v${version}.rules); once it is published, the file is frozen and ` +
          `changes start version ${version + 1}.`,
      );
    }
    for (const archivedVersion of archived.keys()) {
      if (archivedVersion > version) {
        problems.push(`firestore-rules/versions/v${archivedVersion}.rules is newer than the header of firestore.rules (version ${version}).`);
      }
    }
  }
  return problems;
}
