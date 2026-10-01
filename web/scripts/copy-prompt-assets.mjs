// GOALS.md §23g: the ficha prompt's template and volume table have one home — the Android assets,
// app/src/main/assets/ (the same bytes the phone ships). This copies them into public/prompt/ so the
// browser can fetch them; runs before `dev` and `build`. The copies are generated and gitignored:
// edit the originals, never these.
//
// GOALS.md §25f/§25i: the multi-treino template and the Gemini system instruction are WEB-ONLY (the
// phone's paste reads one ficha at a time), so their home is web/prompt/ and they are copied the same way.

import { copyFileSync, mkdirSync } from "node:fs";

const androidAssets = new URL("../../app/src/main/assets/", import.meta.url);
const webPrompts = new URL("../prompt/", import.meta.url);
const to = new URL("../public/prompt/", import.meta.url);

mkdirSync(to, { recursive: true });
for (const name of ["ficha_prompt_template.md", "hypertrophy_volume_reference.md"]) {
  copyFileSync(new URL(name, androidAssets), new URL(name, to));
}
for (const name of ["ficha_prompt_multi.md", "ficha_system_gemini.md"]) {
  copyFileSync(new URL(name, webPrompts), new URL(name, to));
}
