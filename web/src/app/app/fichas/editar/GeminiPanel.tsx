"use client";

import { useRef, useState } from "react";
import { startFichaChat, type FichaChat } from "../../../../data/gemini";
import type { PromptAssets } from "../../../../data/promptAssets";
import { describeAiError } from "../../../../domain/aiErrors";
import { buildAdjustMessage, buildAiUserMessage } from "../../../../domain/aiRequest";
import { treinosFromAi } from "../../../../domain/aiResponse";
import { recordUse, usesToday } from "../../../../domain/aiUsage";
import { TABLE_PLACEHOLDER, type PromptStudent } from "../../../../domain/fichaPrompt";
import type { ParsedWorkout } from "../../../../domain/workoutParser";

// GOALS.md §25i: the "Gemini" tab — generate the treinos here instead of copying a prompt to another
// AI app. It asks Gemini (data/gemini.ts, Firebase AI Logic) with the rules and the reference table as
// the system instruction, and hands the answer to the same review screen a pasted answer reaches. A
// follow-up box ("Ajustar") continues the same conversation. Failures say what happened and point at
// the other tab. Nothing is saved from here: saving is the review screen's job.

const PRIVACY_NOTE =
  "No plano gratuito do Gemini, o Google pode usar o conteúdo enviado para melhorar os produtos dele. " +
  "Por isso o nome e as restrições médicas do aluno não são enviados, a menos que você marque abaixo.";

export function GeminiPanel({
  student,
  request,
  assets,
  onResult,
}: {
  student: PromptStudent;
  request: string;
  assets: PromptAssets | "error" | null;
  onResult: (workouts: ParsedWorkout[], warnings: string[]) => void;
}) {
  const chat = useRef<FichaChat | null>(null);
  const [includePersonal, setIncludePersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState("");
  const [generated, setGenerated] = useState(false);
  const [usedToday, setUsedToday] = useState(() => usesToday(window.localStorage, new Date()));

  const ready = assets !== null && assets !== "error";

  async function run(send: (chat: FichaChat) => Promise<string>, fresh: boolean) {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (fresh || chat.current === null) {
        // The reference table, spliced in once, is the context that stays for the whole conversation.
        const system = assets.geminiSystem.split(TABLE_PLACEHOLDER).join(assets.volumeReference);
        chat.current = await startFichaChat(system);
      }
      const reply = await send(chat.current);
      setUsedToday(recordUse(window.localStorage, new Date()));
      const parsed = treinosFromAi(reply);
      if (parsed.workouts.length === 0) {
        setError(
          `${parsed.warnings.join(" ") || "O Gemini não devolveu treinos."} Tente de novo ou use a aba “Outra IA”.`,
        );
        return;
      }
      setGenerated(true);
      onResult(parsed.workouts, parsed.warnings);
    } catch (caught) {
      setError(describeAiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="gemini-panel">
      <p>
        O Gemini monta os treinos aqui mesmo, já conhecendo a tabela de exercícios e ativações musculares. O resultado
        cai na mesma tela de revisão — você confere antes de salvar.
      </p>
      <p className="section-footnote">{PRIVACY_NOTE}</p>
      <p>
        <label>
          <input type="checkbox" checked={includePersonal} onChange={(e) => setIncludePersonal(e.target.checked)} />
          Enviar também o nome e as restrições médicas do aluno
        </label>
      </p>
      <div className="gemini-actions">
        <button
          type="button"
          className="button-primary"
          disabled={!ready || busy}
          onClick={() => void run((c) => c.send(buildAiUserMessage(student, request, includePersonal)), true)}
        >
          {busy ? "Gerando…" : generated ? "Gerar de novo" : "Gerar com Gemini"}
        </button>
        <span className="section-footnote">
          {usedToday === 0
            ? "Nenhuma geração hoje"
            : `${usedToday} ${usedToday === 1 ? "geração" : "gerações"} hoje neste navegador`}
        </span>
      </div>
      {assets === "error" && <p role="alert">Não foi possível carregar a tabela de referência. Recarregue a página.</p>}
      {error && <p role="alert">{error}</p>}

      {generated && (
        <p>
          <label>
            Ajustar o resultado{" "}
            <input
              value={followUp}
              placeholder="Ex: troque o supino reto por inclinado, tire o abdominal"
              onChange={(e) => setFollowUp(e.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={busy || followUp.trim() === ""}
            onClick={() => {
              const instruction = followUp;
              setFollowUp("");
              void run((c) => c.send(buildAdjustMessage(instruction)), false);
            }}
          >
            Ajustar
          </button>
        </p>
      )}
    </div>
  );
}
