// GOALS.md §25i — what the trainer is told when a Gemini call fails. The Firebase AI SDK throws an
// AIError with a `code` ("fetch-error", "api-not-enabled", …) and, for an HTTP failure, the status in
// `customErrorData.status`; the documented causes are 403 (App Check not valid / API not enabled), 404
// (a retired model), 429 (quota) and 503 (overloaded)
// (https://firebase.google.com/docs/ai-logic/error-codes). Every message ends by pointing at the
// other tab, so a failure is never a dead end. Reads the error structurally — no SDK import — so it
// stays a pure, testable function.

const OTHER_WAY = "Você pode usar a aba “Outra IA” (copiar e colar) enquanto isso.";

function statusOf(error: unknown): number | null {
  const data = (error as { customErrorData?: { status?: unknown } } | null)?.customErrorData;
  return typeof data?.status === "number" ? data.status : null;
}

export function describeAiError(error: unknown): string {
  const status = statusOf(error);
  const code =
    typeof (error as { code?: unknown } | null)?.code === "string" ? String((error as { code: string }).code) : "";
  const message = error instanceof Error ? error.message : String(error ?? "");

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(message)) {
    return `O limite gratuito do Gemini foi atingido por agora. Tente de novo em alguns minutos. ${OTHER_WAY}`;
  }
  if (status === 503 || /overloaded|UNAVAILABLE|high demand/i.test(message)) {
    return `O Gemini está sobrecarregado neste momento. Tente de novo em instantes. ${OTHER_WAY}`;
  }
  if (status === 403 || code.includes("api-not-enabled") || /PERMISSION_DENIED|App Check/i.test(message)) {
    return `O site não tem permissão para usar o Gemini (App Check ou API desativada no Firebase). ${OTHER_WAY}`;
  }
  if (status === 404 || /not found|NOT_FOUND/i.test(message)) {
    return `O modelo do Gemini configurado não está mais disponível. ${OTHER_WAY}`;
  }
  if (code.includes("fetch-error")) {
    return `Não consegui falar com o Gemini — confira a conexão com a internet. ${OTHER_WAY}`;
  }
  return `Não foi possível gerar com o Gemini agora. ${OTHER_WAY}`;
}
