// Fails when firestore.rules and its archived copy disagree — see rulesVersion.mjs.
//   npm run check:rules-version     (CI runs it on every push and pull request)

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checkRulesVersion, headerVersion } from "./rulesVersion.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const rules = readFileSync(`${root}firestore.rules`, "utf8");
const versionsDir = `${root}firestore-rules/versions`;
const archives = {};
for (const name of readdirSync(versionsDir)) archives[name] = readFileSync(`${versionsDir}/${name}`, "utf8");

const problems = checkRulesVersion({ rules, archives });
if (problems.length > 0) {
  for (const problem of problems) console.error(`rules version: ${problem}`);
  process.exit(1);
}
console.log(`rules version: firestore.rules is version ${headerVersion(rules)}, identical to its archived copy.`);
