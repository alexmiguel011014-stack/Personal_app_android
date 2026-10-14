// GOALS.md §38c / D2: WhatsApp is the chat between a personal and an aluno for now, so a phone number becomes a link.
// Pure: no browser, no Firebase. The text of a message is always built by the caller from non-sensitive words (a
// first name, a site address) — never from health answers.

/** The digits of a phone number as people type it: "(11) 99999-0000", "+55 11 99999 0000", "011 3333-4444". */
export function phoneDigits(text: string): string {
  return text.replace(/\D/g, "");
}

/**
 * A Brazilian number as WhatsApp and `tel:` want it, "55" + DDD + number, or null when it does not look like one.
 * Accepts it with or without the country code and with the "0" trunk prefix; a DDD below 11 does not exist, and a
 * nine-digit number is a mobile, so it starts with 9.
 */
export function brazilianNumber(text: string): string | null {
  let digits = phoneDigits(text);
  if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0") && (digits.length === 11 || digits.length === 12)) digits = digits.slice(1);

  let national: string;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) national = digits.slice(2);
  else if (digits.length === 10 || digits.length === 11) national = digits;
  else return null;

  const ddd = Number(national.slice(0, 2));
  const subscriber = national.slice(2);
  if (ddd < 11) return null;
  if (subscriber.length !== 8 && subscriber.length !== 9) return null;
  if (subscriber.length === 9 && !subscriber.startsWith("9")) return null;
  return `55${national}`;
}

/** `https://wa.me/55…`, with an optional ready-made message; null for a number that is not a Brazilian one. */
export function whatsappLink(phone: string, text?: string): string | null {
  const number = brazilianNumber(phone);
  if (number === null) return null;
  return text === undefined || text === "" ? `https://wa.me/${number}` : `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/** `tel:+55…`, or null. */
export function telLink(phone: string): string | null {
  const number = brazilianNumber(phone);
  return number === null ? null : `tel:+${number}`;
}
