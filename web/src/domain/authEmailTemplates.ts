// GOALS.md §32d — the rules the Firebase e-mail templates in web/email/ must follow. Firebase sends those
// mails itself and the console has no versioning, so the repo keeps the exact text pasted there; this file
// is what keeps that text safe to paste: mail clients (and the console's own sanitiser) are unforgiving, and
// an image, a <style> block or a colour outside the site's palette is the kind of thing that only shows up
// after the mail went out. Pure: no file access (the test reads the files), no clock.

/** The placeholders Firebase fills in. `%DISPLAY_NAME%` is deliberately absent — see `lintAuthEmailTemplate`. */
export const ALLOWED_PLACEHOLDERS: readonly string[] = ["LINK", "APP_NAME", "EMAIL", "NEW_EMAIL"];

/** A small ceiling, well under what any client clips; the console's own limit is not documented. */
export const MAX_TEMPLATE_BYTES = 6 * 1024;

/** `#FFF` and `#ffffff` are the same colour. */
export function normalizeHex(hex: string): string {
  const h = hex.toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
}

/** The `#rrggbb` values declared as custom properties in the stylesheet's first `:root { … }` block. */
export function colorTokensFromCss(css: string): Set<string> {
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  const colors = new Set<string>();
  for (const match of root.matchAll(/--[\w-]+\s*:\s*(#[0-9a-fA-F]{3,6})\s*;/g)) colors.add(normalizeHex(match[1]));
  return colors;
}

/** Problems found in one template body; an empty list means it is safe to paste. */
export function lintAuthEmailTemplate(
  html: string,
  allowedColors: ReadonlySet<string>,
  options: { allowNewEmail?: boolean } = {},
): string[] {
  const problems: string[] = [];

  if ((html.match(/href="%LINK%"/g) ?? []).length < 2) {
    problems.push('needs `href="%LINK%"` on the button and on the fallback line');
  }
  if (!/<a\b[^>]*href="%LINK%"[^>]*>\s*%LINK%\s*<\/a>/.test(html)) {
    problems.push("needs %LINK% as visible text (the fallback when the button does not open)");
  }
  if (!html.includes("%APP_NAME%")) problems.push("needs %APP_NAME% (the project's public-facing name)");

  for (const match of html.matchAll(/%([A-Z_]+)%/g)) {
    if (match[1] === "DISPLAY_NAME") problems.push("%DISPLAY_NAME% renders empty here — these accounts have no Auth display name");
    else if (match[1] === "NEW_EMAIL" && options.allowNewEmail) continue;
    else if (!ALLOWED_PLACEHOLDERS.includes(match[1]) || match[1] === "NEW_EMAIL") {
      problems.push(`placeholder %${match[1]}% is not allowed here`);
    }
  }

  for (const tag of ["script", "style", "link", "img", "iframe", "form"]) {
    if (new RegExp(`<${tag}\\b`, "i").test(html)) problems.push(`<${tag}> is not allowed (inline styles and text only)`);
  }
  if (/javascript:/i.test(html)) problems.push("javascript: is not allowed");
  if (/https?:\/\//i.test(html)) problems.push("a literal http(s):// address is not allowed — only Firebase placeholders");

  for (const match of html.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    if (!allowedColors.has(normalizeHex(match[0]))) problems.push(`colour ${match[0]} is not a token in the site's :root`);
  }

  if (/\b\d+\s*(minutos?|horas?|dias?)\b/i.test(html)) {
    problems.push("no link-expiry number in the copy until it was read from the docs or the console");
  }

  const bytes = new TextEncoder().encode(html).length;
  if (bytes > MAX_TEMPLATE_BYTES) problems.push(`${bytes} bytes is over the ${MAX_TEMPLATE_BYTES}-byte ceiling`);

  return [...new Set(problems)];
}
