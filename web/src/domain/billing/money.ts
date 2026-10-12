// GOALS.md §36b: money, the one place. Integer cents everywhere; nothing here ever holds a float.

export function isValidAmountCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Integer cents as "R$ 150,10". The amount goes to Intl as an exact decimal string, never as
 * cents / 100 — keeping "money is never a float" true even on the way to the screen.
 */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const exact = `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
  return BRL.format(exact as `${number}`);
}

/**
 * What the trainer types ("150", "150,5", "1.234,56", "R$ 90,00") as integer cents, without ever
 * touching a float — "150,10" parsed as 150.1 and multiplied by 100 is 15009.999…, which is exactly
 * the bug this exists to prevent. pt-BR only: "," separates decimals and "." only groups thousands,
 * so an ambiguous "150.50" is rejected rather than guessed. Null when unparseable; zero parses
 * (validity is isValidAmountCents' job, not the parser's).
 */
export function parseAmountCents(input: string): number | null {
  const text = input.trim().replace(/^R\$\s*/, "");
  const match = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/.exec(text);
  if (!match) return null;
  const reais = Number(match[1].replace(/\./g, ""));
  const cents = Number((match[2] ?? "").padEnd(2, "0"));
  const total = reais * 100 + cents;
  return Number.isSafeInteger(total) ? total : null;
}
