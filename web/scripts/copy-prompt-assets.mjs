// GOALS.md §23g/§25f/§25i/§33: the web's prompt templates live in web/prompt/ and are copied into
// public/prompt/ so the browser can fetch them; runs before `dev` and `build`. The copies are generated
// and gitignored: edit the originals, never these.
//
// §33: the trainer's reference table is NOT among them and never goes under public/ — a file there is
// downloadable by anyone, without signing in. So this script copies only the three web-only templates and
// DELETES any stale copy an older build left behind (the Android table and template, the JSON catalog),
// so an old local build cannot ship them. The table reaches the editor through a Firestore document that
// only approved trainers can read (data/exerciseCatalog.ts, firestore.rules v6).

import { copyFileSync, mkdirSync, rmSync } from "node:fs";

const webPrompts = new URL("../prompt/", import.meta.url);
const to = new URL("../public/prompt/", import.meta.url);

export const WEB_TEMPLATES = ["ficha_prompt_single.md", "ficha_prompt_multi.md", "ficha_system_gemini.md"];
export const STALE_FILES = ["hypertrophy_volume_reference.md", "ficha_prompt_template.md", "exercise-catalog.json"];

mkdirSync(to, { recursive: true });
for (const name of STALE_FILES) rmSync(new URL(name, to), { force: true });
for (const name of WEB_TEMPLATES) copyFileSync(new URL(name, webPrompts), new URL(name, to));
