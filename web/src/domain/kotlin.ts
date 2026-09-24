// GOALS.md §23e: small stand-ins for Kotlin/JVM standard-library behaviour. The Android app is the
// reference for how pasted text is parsed and how the ficha prompt is built, and the phone runs
// these on the JVM — where they differ from the JavaScript built-ins in ways that change results
// without any error. Each helper documents the difference it exists for.

// Kotlin's Char.isWhitespace() on the JVM: Java's isWhitespace plus isSpaceChar. Unlike
// JavaScript's trim set it includes U+001C–U+001F and excludes U+FEFF (the byte-order mark).
const KOTLIN_WHITESPACE = "\\t\\n\\x0B\\f\\r\\x1C-\\x1F \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000";
const LEADING = new RegExp(`^[${KOTLIN_WHITESPACE}]+`);
const TRAILING = new RegExp(`[${KOTLIN_WHITESPACE}]+$`);
const BLANK = new RegExp(`^[${KOTLIN_WHITESPACE}]*$`);
const FIRST_NON_WHITESPACE = new RegExp(`[^${KOTLIN_WHITESPACE}]`);

/**
 * Java's `\s` inside a regex: ASCII whitespace only. JavaScript's `\s` also matches Unicode spaces
 * — including the no-break space WhatsApp puts into copied text — so a regex written with `\s`
 * here would accept lines the phone rejects.
 */
export const JAVA_REGEX_SPACE = "[ \\t\\n\\x0B\\f\\r]";

/** String.lines(): splits on \r\n, \n and \r. */
export function kotlinLines(text: string): string[] {
  return text.split(/\r\n|\n|\r/);
}

/** String.trim() with Kotlin's whitespace definition. */
export function kotlinTrim(text: string): string {
  return text.replace(LEADING, "").replace(TRAILING, "");
}

/** String.isBlank(). */
export function isKotlinBlank(text: string): boolean {
  return BLANK.test(text);
}

/** String.toIntOrNull(): optional sign, decimal digits, and null outside 32-bit Int range. */
export function toIntOrNull(text: string): number | null {
  if (!/^[+-]?\d+$/.test(text)) return null;
  const value = Number(text);
  return value >= -2_147_483_648 && value <= 2_147_483_647 ? value : null;
}

/**
 * String.toDoubleOrNull() for the decimal forms Kotlin accepts: optional sign, digits with an
 * optional fraction ("1", "1.", ".5"), an optional exponent, and Java's optional f/F/d/D suffix.
 *
 * One deliberate difference: Kotlin also accepts "NaN", "Infinity" and hex floats. Those are
 * rejected here, because a NaN or Infinity can't round-trip through the phone's own JSON (kotlinx
 * refuses to encode them by default) — accepting one would put an unsavable value into a ficha.
 */
export function toDoubleOrNull(text: string): number | null {
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[fFdD]?$/.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * String.trimIndent(): removes the smallest indentation shared by the non-blank lines, plus a blank
 * first and last line. It runs on the string *after* interpolation, so a multi-line value spliced
 * into an indented raw string changes the indentation of the whole block — which matters when
 * mirroring Kotlin code that builds text that way.
 */
export function kotlinTrimIndent(text: string): string {
  const lines = kotlinLines(text);
  const indents = lines.filter((line) => !isKotlinBlank(line)).map(indentWidth);
  const minIndent = indents.length > 0 ? Math.min(...indents) : 0;
  const last = lines.length - 1;
  return lines
    .filter((line, index) => !((index === 0 || index === last) && isKotlinBlank(line)))
    .map((line) => line.slice(minIndent))
    .join("\n");
}

function indentWidth(line: string): number {
  const index = line.search(FIRST_NON_WHITESPACE);
  return index === -1 ? line.length : index;
}
