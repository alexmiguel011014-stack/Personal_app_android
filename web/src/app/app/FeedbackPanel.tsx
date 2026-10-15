"use client";

import { useState } from "react";
import { getFirebase } from "../../data/firebase";
import { saveTrainerResponse } from "../../data/sessionFeedback";
import {
  TRAINER_COMMENT_MAX,
  blankFeedback,
  checkTrainerComment,
  isUnseenByTrainer,
  withTrainerResponse,
  type SessionFeedback,
} from "../../domain/sessionFeedback";
import { SessionFeedbackSummary } from "../_shared/SessionFeedbackSummary";

// GOALS.md §38h/§38i: under a session the personal sees what the aluno said and answers — "Marcar como visto" and an
// inline comment. Each write touches only the personal's fields (firestore.rules v8); the screen is updated at once
// from `onChange` and the snapshot is marked stale so "Hoje" reads the new state.

export function FeedbackPanel({
  trainerId,
  studentId,
  day,
  feedback,
  onChange,
}: {
  trainerId: string;
  studentId: string;
  /** The session's local day, `YYYY-MM-DD`. */
  day: string;
  feedback: SessionFeedback | undefined;
  /** The feedback as it is now, after a write — the parent keeps it, and tells the data store it is stale. */
  onChange: (next: SessionFeedback) => void;
}) {
  const [commenting, setCommenting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = feedback ?? blankFeedback(studentId, trainerId, day);
  const unseen = isUnseenByTrainer(current);

  async function send(response: { seen?: boolean; comment?: string }) {
    setBusy(true);
    setError(null);
    try {
      await saveTrainerResponse(getFirebase().db, trainerId, studentId, day, response);
      onChange(withTrainerResponse(current, response, Date.now()));
      setCommenting(false);
      setText("");
    } catch {
      setError("Não foi possível salvar agora. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  function submitComment() {
    const comment = checkTrainerComment(text);
    if (comment === null) {
      setError(`O comentário passou de ${TRAINER_COMMENT_MAX} caracteres ou tem caracteres que não podem ser enviados.`);
      return;
    }
    if (comment === "") {
      setError("Escreva o comentário antes de enviar.");
      return;
    }
    void send({ comment, seen: current.trainerSeenAt === null });
  }

  return (
    <div className={`feedback-panel${unseen ? " is-unseen" : ""}`}>
      {feedback !== undefined && <SessionFeedbackSummary feedback={feedback} audience="personal" />}
      {unseen && <p className="status-pill is-pending">Ainda não visto</p>}
      <div className="feedback-actions">
        {current.trainerSeenAt === null && (
          <button type="button" disabled={busy} onClick={() => void send({ seen: true })}>
            Marcar como visto
          </button>
        )}
        {!commenting && (
          <button type="button" disabled={busy} onClick={() => setCommenting(true)}>
            {current.trainerComment === "" ? "Comentar" : "Comentar de novo"}
          </button>
        )}
      </div>
      {commenting && (
        <div className="feedback-comment-form">
          <label>
            Seu comentário para o aluno
            <textarea rows={3} maxLength={TRAINER_COMMENT_MAX} value={text} onChange={(event) => setText(event.target.value)} />
          </label>
          <div className="resume-actions">
            <button type="button" className="button-primary" disabled={busy} onClick={submitComment}>
              {busy ? "Enviando…" : "Enviar comentário"}
            </button>
            <button type="button" disabled={busy} onClick={() => setCommenting(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
