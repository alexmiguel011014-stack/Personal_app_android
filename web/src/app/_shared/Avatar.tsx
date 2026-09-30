// The template's initials avatar. The tone is derived from the name, so the same person keeps the
// same colour on every screen without storing anything.

const TONES = ["sage", "sand", "rose", "mist"] as const;

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : (words[0][1] ?? "");
  return (first + last).toUpperCase();
}

function toneFor(name: string): (typeof TONES)[number] {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function Avatar({ name, tone }: { name: string; tone?: "dark" | (typeof TONES)[number] }) {
  return (
    <span className={`avatar avatar-${tone ?? toneFor(name)}`} aria-hidden="true">
      {initials(name)}
    </span>
  );
}
