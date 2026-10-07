// GOALS.md §23g/§25f/§33/§34: fetches the web-only "Prompt de formatação de ficha" that scripts/copy-prompt-assets.mjs
// puts under public/prompt/ from web/prompt/. It carries no student data and none of the trainer's reference table
// (§33): the table is never a public file; the site reads it from the gated Firestore document
// (data/exerciseCatalog.ts) and fills the muscles in itself.

async function fetchText(name: string): Promise<string> {
  // Next doesn't prefix fetch() with the basePath (GOALS.md §23l, GitHub Pages) — done by hand.
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/prompt/${name}`);
  if (!response.ok) throw new Error(`Couldn't load ${name}: ${response.status}`);
  return response.text();
}

/**
 * The "Prompt de formatação de ficha": formatting rules only. The editor copies it as it is; the trainer types their own
 * request after it in their AI app.
 */
export async function loadFormatPrompt(): Promise<string> {
  return fetchText("ficha_prompt_format.md");
}
