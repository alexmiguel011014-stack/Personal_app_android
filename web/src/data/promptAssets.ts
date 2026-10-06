// GOALS.md §23g/§25f/§25i/§33: fetches the web-only prompt templates that scripts/copy-prompt-assets.mjs
// puts under public/prompt/ from web/prompt/ — the single-treino and multi-treino templates for
// copy-and-paste, and the Gemini system instruction. None of them carries the trainer's reference table
// (§33): the table is never a public file; the site reads it from the gated Firestore document
// (data/exerciseCatalog.ts) and fills the muscles in itself.

export interface PromptAssets {
  /** One treino per answer. Used when editing an existing ficha. */
  singleTemplate: string;
  /** Several treinos per answer, in one code block. Used for new fichas. */
  multiTemplate: string;
  /** The Gemini system instruction: the rules and the JSON answer. */
  geminiSystem: string;
}

async function fetchText(name: string): Promise<string> {
  // Next doesn't prefix fetch() with the basePath (GOALS.md §23l, GitHub Pages) — done by hand.
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/prompt/${name}`);
  if (!response.ok) throw new Error(`Couldn't load ${name}: ${response.status}`);
  return response.text();
}

export async function loadPromptAssets(): Promise<PromptAssets> {
  const [singleTemplate, multiTemplate, geminiSystem] = await Promise.all([
    fetchText("ficha_prompt_single.md"),
    fetchText("ficha_prompt_multi.md"),
    fetchText("ficha_system_gemini.md"),
  ]);
  return { singleTemplate, multiTemplate, geminiSystem };
}
