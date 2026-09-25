// GOALS.md §23g: the ficha prompt's template and volume table have one home — the Android assets,
// app/src/main/assets/ (the same bytes the phone ships). This copies them into public/prompt/ so the
// browser can fetch them; runs before `dev` and `build`. The copies are generated and gitignored:
// edit the originals, never these.

import { copyFileSync, mkdirSync } from "node:fs";

const from = new URL("../../app/src/main/assets/", import.meta.url);
const to = new URL("../public/prompt/", import.meta.url);

mkdirSync(to, { recursive: true });
for (const name of ["ficha_prompt_template.md", "hypertrophy_volume_reference.md"]) {
  copyFileSync(new URL(name, from), new URL(name, to));
}
