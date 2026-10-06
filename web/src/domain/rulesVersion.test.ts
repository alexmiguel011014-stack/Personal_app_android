import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkRulesVersion, headerVersion } from "../../scripts/rulesVersion.mjs";

// The rules-versioning convention (CLAUDE.md, "Security rules"): firestore.rules starts with
// `// Rules version: N` and firestore-rules/versions/vN.rules is the same file.
const rules = "// Rules version: 4\nrules_version = '2';\nservice cloud.firestore {}\n";

describe("headerVersion", () => {
  it("reads N from the first line", () => {
    expect(headerVersion(rules)).toBe(4);
    expect(headerVersion(rules.replace(/\n/g, "\r\n"))).toBe(4);
  });

  it("is null when the first line is not the header", () => {
    expect(headerVersion("rules_version = '2';\n// Rules version: 4\n")).toBeNull();
    expect(headerVersion("// Rules version: four\n")).toBeNull();
    expect(headerVersion("")).toBeNull();
  });
});

describe("checkRulesVersion", () => {
  it("accepts an identical archive, whatever the line endings", () => {
    expect(checkRulesVersion({ rules, archives: { "v4.rules": rules } })).toEqual([]);
    expect(checkRulesVersion({ rules, archives: { "v3.rules": "// Rules version: 3\n", "v4.rules": rules.replace(/\n/g, "\r\n") } })).toEqual([]);
  });

  it("flags a missing header", () => {
    expect(checkRulesVersion({ rules: "rules_version = '2';\n", archives: {} })).toEqual([
      "firestore.rules must start with `// Rules version: N` on its first line.",
    ]);
  });

  it("flags a missing archive for the current version", () => {
    const problems = checkRulesVersion({ rules, archives: { "v3.rules": "// Rules version: 3\n" } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("v4.rules is missing");
  });

  it("flags an archive that differs from firestore.rules", () => {
    const problems = checkRulesVersion({ rules, archives: { "v4.rules": rules + "// edited\n" } });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("v4.rules differs from firestore.rules");
  });

  it("flags an archive newer than the header and a file that is not vN.rules", () => {
    const problems = checkRulesVersion({ rules, archives: { "v4.rules": rules, "v5.rules": "x", "notes.txt": "x" } });
    expect(problems.some((p) => p.includes("v5.rules is newer"))).toBe(true);
    expect(problems.some((p) => p.includes("notes.txt is not named vN.rules"))).toBe(true);
    expect(problems).toHaveLength(2);
  });
});

describe("the repository's own rules", () => {
  it("firestore.rules is identical to its archived copy", () => {
    const root = fileURLToPath(new URL("../../../", import.meta.url));
    const versionsDir = `${root}firestore-rules/versions`;
    const archives: Record<string, string> = {};
    for (const name of readdirSync(versionsDir)) archives[name] = readFileSync(`${versionsDir}/${name}`, "utf8");
    expect(checkRulesVersion({ rules: readFileSync(`${root}firestore.rules`, "utf8"), archives })).toEqual([]);
  });
});
