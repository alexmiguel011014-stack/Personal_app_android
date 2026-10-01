// GOALS.md §23g: fetches the ficha prompt's template and volume table, which
// scripts/copy-prompt-assets.mjs puts under public/prompt/ from their single home in the Android
// assets. §25f/§25i: plus the web-only templates (web/prompt/) — multi-treino for copy-and-paste, and
// the Gemini system instruction — copied by the same script.

export interface PromptAssets {
  /** The phone's template — one ficha per answer. Used when editing an existing ficha. */
  template: string;
  /** The web's template — several treinos per answer, in one code block. Used for new fichas. */
  multiTemplate: string;
  /** The Gemini system instruction: rules + JSON answer, with the table placeholder. */
  geminiSystem: string;
  volumeReference: string;
}

async function fetchText(name: string): Promise<string> {
  // Next doesn't prefix fetch() with the basePath (GOALS.md §23l, GitHub Pages) — done by hand.
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/prompt/${name}`);
  if (!response.ok) throw new Error(`Couldn't load ${name}: ${response.status}`);
  return response.text();
}

export async function loadPromptAssets(): Promise<PromptAssets> {
  const [template, multiTemplate, geminiSystem, volumeReference] = await Promise.all([
    fetchText("ficha_prompt_template.md"),
    fetchText("ficha_prompt_multi.md"),
    fetchText("ficha_system_gemini.md"),
    fetchText("hypertrophy_volume_reference.md"),
  ]);
  return { template, multiTemplate, geminiSystem, volumeReference };
}
