// Realistic shapes of an AI chat's answer when asked for several treinos in one go (GOALS.md §25d).
// They are written the way chat apps actually answer — with a code fence, with markdown the prompt
// asked not to use, with chatter around the plan — because that, not tidy text, is what the splitter
// meets. Kept as plain strings so a real answer pasted from a chat can be added here as-is.

/** The shape the §25f prompt asks for: ONE code block, a header per treino, optional annotations. */
export const ABC_ANNOTATED = `Aqui está a divisão ABC que você pediu:

\`\`\`
Treino A — Peito e tríceps
Supino reto 4x10 [Peitoral:1.0, Delt. ant.:0.5, Tríceps geral:0.5]
Supino inclinado 3x10 [Peitoral:1.0, Delt. ant.:0.75, Tríceps geral:0.5]
Tríceps pushdown 3x12 [Tríceps geral:1.0]

Treino B — Costas e bíceps
Puxada/barra fixa pronada 4x10 [Latíssimo/redondo maior:1.0, Bíceps:0.5]
Remada neutra cotovelo junto 3x10 [Latíssimo/redondo maior:1.0, Bíceps:0.5]
Rosca supinada 3x12 [Bíceps braquial:1.0]

Treino C — Pernas
Agachamento profundo 4x8 [Vastos/quadríceps:1.0, Glúteo máx.:1.0]
Stiff 3x10 [Isquios:1.0, Glúteo máx.:0.75]
Panturrilha em pé 4x15 [Gastrocnêmio:1.0]
\`\`\`

Se quiser, posso ajustar o volume.`;

/** Same plan, no annotations. */
export const ABC_PLAIN = `Ficha A
Supino reto 4x10
Supino inclinado 3x10
Tríceps pushdown 3x12

Ficha B
Puxada/barra fixa pronada 4x10
Remada neutra cotovelo junto 3x10
Rosca supinada 3x12

Ficha C
Agachamento profundo 4x8
Stiff 3x10
Panturrilha em pé 4x15`;

/** What chat apps do despite "no markdown": headings, bold, bullets, numbering. */
export const MARKDOWN_HEAVY = `Claro! Segue o plano:

## Treino A (Peito e Tríceps)
- **Supino reto** 4x10
- **Supino inclinado** 3x10
1. Tríceps pushdown 3x12

---

**Treino B — Costas e Bíceps**
* Puxada/barra fixa pronada 4 x 10-12
* Rosca martelo 3x12

### Treino C: Pernas
• Agachamento profundo 4x8
• Stiff 3x10

Bons treinos! 💪`;

/** A week laid out by day number. */
export const DIA_1_A_3 = `Dia 1
Supino reto 4x10
Remada baixa 3x12

Dia 2
Agachamento 4x8
Leg press 3x12

Dia 3
Desenvolvimento 4x10
Elevação lateral 3x15`;

/** Chatter before, between and after, and a header whose treino came out empty. */
export const CHATTER_AND_EMPTY = `Ótimo objetivo! Vou montar três treinos.

Treino A
Supino reto 4x10
(descanso de 90s entre as séries)

Treino B
Observação: hoje o foco é descanso ativo.

Treino C
Agachamento 4x8

Qualquer dúvida é só falar.`;

/** The same header letter twice. */
export const REPEATED_LETTER = `Treino A
Supino reto 4x10

Treino A
Remada baixa 3x12`;

/** Exercises that come before any header. */
export const EXERCISES_BEFORE_HEADER = `Supino reto 4x10

Treino B
Remada baixa 3x12`;

/** A paste from Excel / Google Sheets: treino ⇥ exercício ⇥ séries ⇥ reps. */
export const SPREADSHEET = [
  "Treino\tExercício\tSéries\tReps",
  "A\tSupino reto\t4\t10",
  "A\tSupino inclinado\t3\t10",
  "B\tPuxada pronada\t4\t10-12",
  "B\tRosca martelo\t3\t12",
  "C\tAgachamento\t4\t8",
].join("\n");

/** A single treino, as before this feature existed. */
export const SINGLE = `Ficha A
Supino 3x12
Agachamento 4x10`;
