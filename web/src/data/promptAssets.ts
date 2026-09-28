// GOALS.md §23g: fetches the ficha prompt's template and volume table, which
// scripts/copy-prompt-assets.mjs puts under public/prompt/ from their single home in the Android
// assets.

export interface PromptAssets {
  template: string;
  volumeReference: string;
}

async function fetchText(name: string): Promise<string> {
  // Next doesn't prefix fetch() with the basePath (GOALS.md §23l, GitHub Pages) — done by hand.
  const response = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/prompt/${name}`);
  if (!response.ok) throw new Error(`Couldn't load ${name}: ${response.status}`);
  return response.text();
}

export async function loadPromptAssets(): Promise<PromptAssets> {
  const [template, volumeReference] = await Promise.all([
    fetchText("ficha_prompt_template.md"),
    fetchText("hypertrophy_volume_reference.md"),
  ]);
  return { template, volumeReference };
}
