// GOALS.md §33 — every user-visible sentence in the ficha editor about the exercise data, in one place, so the
// leak test (referenceLeak.test.ts) can prove none of them names the trainer's reference table, a "catalog" of it,
// or the source it came from. The screens import these instead of writing the words inline.

export const EDITOR_COPY = {
  /** Loading the exercise data: the editor's button label and the review's. */
  loading: "Carregando dados dos exercícios…",
  /** Pressing save before the data arrived. */
  waitToSave: "Aguarde o carregamento dos dados dos exercícios antes de salvar.",
  /** The data could not be read (offline, no access, not published): saving still works, without muscles. */
  unavailable: "Não foi possível carregar os dados dos exercícios. Os músculos não serão calculados automaticamente.",
  unavailableRow: "Dados dos exercícios indisponíveis; revise a ativação manualmente.",
  recognized: "Músculos reconhecidos",
  recognizedReplacing: "Músculos reconhecidos (no lugar dos recebidos)",
  noMatch: "Sem ativação calculada — o volume não conta este exercício.",
  noMatchKept: "Sem ativação calculada — mantive a ativação recebida.",
  closeMatch: (name: string) => `Correspondência aproximada com “${name}” — confira.`,
  suggestions: "Quis dizer:",
  /** The editor's per-exercise "Músculos" cell: a state, never the coefficients. */
  musclesCalculated: "calculados",
  musclesNone: "—",
  /** The volume helper. */
  volumeHelperHint: "O volume de alguns músculos está fora da faixa ideal.",
  copyVolumeRequest: "Copiar pedido de ajuste de volume",
  volumeRequestCopied: "Pedido copiado! Cole na mesma conversa com a sua IA.",
  volumeRequestNotCopied: "Não foi possível copiar — selecione o texto abaixo e copie à mão.",
  volumeAllGood: "Volume dentro da faixa ideal — nada a ajustar.",
} as const;
