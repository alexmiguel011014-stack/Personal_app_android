"use client";

import { useState, type FormEvent } from "react";
import { getFirebase } from "../../../data/firebase";
import { saveMyFeedback } from "../../../data/sessionFeedback";
import {
  EFFORT_CHOICES,
  STUDENT_COMMENT_MAX,
  checkStudentInput,
  isEmptyStudentSide,
} from "../../../domain/sessionFeedback";

// GOALS.md §38h (D4): right after "Salvar sessão", how the session went — effort in five words, a pain/discomfort flag
// and an optional comment. Always skippable; the personal sees it in Registros and, if there was pain, on "Hoje".

type Phase = "asking" | "sent" | "skipped";

export function SessionFeedbackForm({
  uid,
  trainerId,
  day,
  onSent,
}: {
  uid: string;
  trainerId: string;
  /** The session's local day, `YYYY-MM-DD`. */
  day: string;
  /** The aluno's data in memory no longer has this feedback; the next page reads it again. */
  onSent: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("asking");
  const [effort, setEffort] = useState<number | null>(null);
  const [pain, setPain] = useState(false);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: FormEvent) {
    event.preventDefault();
    const checked = checkStudentInput({ effort, comment });
    if (!checked.ok) {
      setError(checked.problem === "comment" ? "O comentário passou do limite ou tem caracteres que não podem ser enviados." : "Escolha um esforço da lista.");
      return;
    }
    if (isEmptyStudentSide(checked.effort, pain, checked.comment)) {
      setPhase("skipped");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveMyFeedback(getFirebase().db, uid, trainerId, day, { effort: checked.effort, pain, comment: checked.comment });
      onSent();
      setPhase("sent");
    } catch {
      setError("Não foi possível enviar agora. Você pode tentar de novo ou pular.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "sent") return <p role="status">Obrigado! Seu personal vai ver como foi o treino.</p>;
  if (phase === "skipped") return null;

  return (
    <form className="feedback-form" onSubmit={(event) => void send(event)} aria-labelledby="feedback-title">
      <h2 id="feedback-title">Como foi o treino?</h2>
      <fieldset>
        <legend>Esforço</legend>
        <div className="chips">
          {EFFORT_CHOICES.map((choice) => (
            <label className="chip" key={choice.value}>
              <input type="radio" name="effort" checked={effort === choice.value} onChange={() => setEffort(choice.value)} />
              {choice.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="chips">
        <label className="chip">
          <input type="checkbox" checked={pain} onChange={(event) => setPain(event.target.checked)} />
          Senti dor ou desconforto
        </label>
      </div>
      <label>
        Quer contar mais? (opcional)
        <textarea rows={3} maxLength={STUDENT_COMMENT_MAX} value={comment} onChange={(event) => setComment(event.target.value)} />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="resume-actions">
        <button type="submit" className="button-primary" disabled={busy}>
          {busy ? "Enviando…" : "Enviar"}
        </button>
        <button type="button" disabled={busy} onClick={() => setPhase("skipped")}>
          Pular
        </button>
      </div>
    </form>
  );
}
