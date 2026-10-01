/** Returns the suggestion only until the person explicitly accepts their typed address. */
export function emailSuggestionToConfirm(
  address: string,
  suggestion: string | undefined,
  acceptedAddress: string | null,
): string | null {
  return suggestion && acceptedAddress !== address ? suggestion : null;
}
