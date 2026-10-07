// GOALS.md section 33 - the only files that may live under public/prompt/ (and so under out/prompt/ in the built site).
// One list for the copy script and the build scan, so they cannot disagree.
export const WEB_TEMPLATES = ["ficha_prompt_single.md", "ficha_prompt_multi.md", "ficha_system_gemini.md"];
// What an older build may have left in public/prompt/: the reference itself, the phone's template. Deleted on every build.
export const STALE_FILES = ["hypertrophy_volume_reference.md", "ficha_prompt_template.md", "exercise-catalog.json"];
