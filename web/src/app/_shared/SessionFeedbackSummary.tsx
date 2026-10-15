import { effortLabel, type SessionFeedback } from "../../domain/sessionFeedback";

// GOALS.md §38h: what an aluno said about a session, and the personal's answer, as text. Shared by the aluno's
// "Evolução" and the personal's Registros and aluno page. Every state has a word (pain is a chip with its text, never a colour alone).

export function SessionFeedbackSummary({
  feedback,
  audience,
  isNew = false,
}: {
  feedback: SessionFeedback;
  /** "aluno" reads it as their own ("Seu esforço"), "personal" as a report ("Esforço"). */
  audience: "aluno" | "personal";
  /** The aluno has not opened the personal's comment yet. */
  isNew?: boolean;
}) {
  const effort = effortLabel(feedback.effort);
  const said = feedback.studentAt !== null;
  const mine = audience === "aluno";
  return (
    <div className="feedback-summary">
      {said && (
        <p>
          {effort !== null ? (
            <>
              {mine ? "Seu esforço" : "Esforço"}: <strong>{effort}</strong> ({feedback.effort}/10)
            </>
          ) : mine ? (
            "Você não marcou o esforço."
          ) : (
            "Esforço não informado."
          )}
          {feedback.pain && <span className="status-pill is-pain"> Relatou dor ou desconforto</span>}
        </p>
      )}
      {feedback.studentComment !== "" && (
        <p className="feedback-comment">
          <span className="visually-hidden">{mine ? "Seu comentário: " : "Comentário do aluno: "}</span>“{feedback.studentComment}”
        </p>
      )}
      {said && feedback.trainerSeenAt !== null && <p>✓ Visto pelo personal</p>}
      {mine && said && feedback.trainerSeenAt === null && feedback.trainerComment === "" && <p>Ainda não visto pelo personal.</p>}
      {feedback.trainerComment !== "" && (
        <p className="feedback-comment">
          <strong>{mine ? "Seu personal comentou" : "Seu comentário"}:</strong> {feedback.trainerComment}
          {isNew && <span className="status-pill is-pending"> novo</span>}
        </p>
      )}
    </div>
  );
}
