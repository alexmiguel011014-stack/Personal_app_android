// GOALS.md §27d — the address checks the sign-up form runs before an account is created. A COURTESY,
// never a security boundary: everything here runs in the page and can be skipped by calling the Auth
// API directly. What actually keeps an invented address out is firestore.rules' hasVerifiedEmail()
// (§27c) — an address nobody can open never receives the link, so its account can never claim an
// invite. These checks only catch the common mistakes early, before they cost a day.

export type EmailCheck =
  | { ok: true; email: string; suggestion?: string }
  | { ok: false; reason: "empty" | "syntax" | "disposable"; message: string };

const MAX_LENGTH = 254;
const MAX_LOCAL_LENGTH = 64;

// RFC 5322's dot-atom: no spaces, no leading/trailing/double dot. Quoted local parts and comments are
// left out on purpose — nobody types them, and they are a classic way past checks like these.
const LOCAL_PART = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const DOMAIN_LABEL = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
const TOP_LEVEL = /^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;

/**
 * Throwaway-inbox services. Never complete (new ones appear every week) and that is fine: a throwaway
 * inbox receives the verification link too, so this list is the only thing that turns them away at all,
 * and only in the page. Matched on the domain and its subdomains.
 */
export const DISPOSABLE_DOMAINS: readonly string[] = [
  "10minutemail.com", "10minutemail.net", "20minutemail.com", "anonbox.net", "binkmail.com",
  "burnermail.io", "discard.email", "dispostable.com", "emailfake.com", "emailondeck.com",
  "fakeinbox.com", "fakemail.net", "getairmail.com", "getnada.com", "grr.la", "guerrillamail.biz",
  "guerrillamail.com", "guerrillamail.de", "guerrillamail.net", "guerrillamail.org",
  "guerrillamailblock.com", "harakirimail.com", "inboxkitten.com", "mailcatch.com", "maildrop.cc",
  "mailinator.com", "mailnesia.com", "mailnull.com", "mintemail.com", "moakt.com", "mohmal.com",
  "mytemp.email", "nada.email", "sharklasers.com", "spam4.me", "spamgourmet.com", "tempail.com",
  "temp-mail.io", "temp-mail.org", "tempinbox.com", "tempmail.com", "tempmail.net", "tempmailo.com",
  "throwawaymail.com", "tmpmail.net", "tmpmail.org", "trash-mail.com", "trashmail.com",
  "trashmail.net", "yopmail.com", "yopmail.fr", "yopmail.net",
];

/**
 * Where this audience's mail lives. Only the longer names are compared for typos: a short one like
 * `uol.com.br` is one letter away from too many real domains to guess about.
 */
const COMMON_DOMAINS: readonly string[] = [
  "gmail.com", "hotmail.com", "hotmail.com.br", "outlook.com", "outlook.com.br", "yahoo.com",
  "yahoo.com.br", "icloud.com", "terra.com.br",
];
// Real providers that sit one letter from a common one (mail.com/email.com/ymail.com vs gmail.com, …):
// never "corrected".
const KNOWN_DOMAINS = new Set([
  ...COMMON_DOMAINS, "live.com", "uol.com.br", "bol.com.br", "msn.com", "me.com", "mail.com", "email.com",
  "ymail.com", "gmx.com", "aol.com", "cloud.com", "protonmail.com", "proton.me",
]);

/** Endings that are a slip of the finger on `.com` / `.com.br`, whatever the name before them. */
const ENDING_FIXES: readonly (readonly [string, string])[] = [
  [".con", ".com"], [".cmo", ".com"], [".ocm", ".com"], [".vom", ".com"], [".xom", ".com"],
  [".comm", ".com"], [".combr", ".com.br"], [".com.rb", ".com.br"], [".con.br", ".com.br"],
];

const INVALID = "E-mail inválido. Confira se está escrito como nome@provedor.com.";

export function validateEmail(input: string): EmailCheck {
  const trimmed = input.trim();
  if (trimmed === "") return { ok: false, reason: "empty", message: "Digite seu e-mail." };
  if (trimmed.length > MAX_LENGTH) return { ok: false, reason: "syntax", message: INVALID };

  const parts = trimmed.split("@");
  if (parts.length !== 2) return { ok: false, reason: "syntax", message: INVALID };
  const local = parts[0];
  // Firebase lower-cases the whole address anyway; the local part is kept as typed only so the
  // person sees back what they wrote.
  const domain = parts[1].toLowerCase();

  if (local.length === 0 || local.length > MAX_LOCAL_LENGTH || !LOCAL_PART.test(local)) {
    return { ok: false, reason: "syntax", message: INVALID };
  }
  const labels = domain.split(".");
  if (labels.length < 2 || !labels.every((label) => DOMAIN_LABEL.test(label)) || !TOP_LEVEL.test(labels[labels.length - 1])) {
    return { ok: false, reason: "syntax", message: INVALID };
  }

  if (DISPOSABLE_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) {
    return {
      ok: false,
      reason: "disposable",
      message: "Use um e-mail pessoal que você acessa — endereços temporários não funcionam.",
    };
  }

  const email = `${local}@${domain}`;
  const fixed = suggestDomain(domain);
  return fixed === null ? { ok: true, email } : { ok: true, email, suggestion: `${local}@${fixed}` };
}

/** "gmial.com" → "gmail.com"; a domain that is fine, or too far from any guess, → null. */
export function suggestDomain(domain: string): string | null {
  if (KNOWN_DOMAINS.has(domain)) return null;
  for (const [wrong, right] of ENDING_FIXES) {
    if (domain.endsWith(wrong)) {
      const fixed = domain.slice(0, -wrong.length) + right;
      return suggestDomain(fixed) ?? fixed;
    }
  }
  return COMMON_DOMAINS.find((known) => isOneEditAway(domain, known)) ?? null;
}

/** One insertion, deletion, substitution or swap of two neighbouring letters (Damerau, distance 1). */
export function isOneEditAway(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    if (a.slice(i + 1) === b.slice(i + 1)) return true; // substitution
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2); // swap
  }
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}
