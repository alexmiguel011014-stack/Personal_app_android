import type { ReactNode } from "react";
import { anamnesisDiff, anamnesisFlags, reportBlocks, type FlagLevel } from "../../domain/anamnesis";
import { PAR_Q, type Assessment } from "../../domain/assessments";
import { formatDate, formatDateTime, localDate } from "../../domain/dates";

// GOALS.md §38g (D19): the anamnese as a report for reading — and for printing. The points that need the personal's
// attention come first, each with a word as well as a colour (a printout is black and white, and colour alone is no
// meaning); then what changed since the previous one, then the answers by section, then the consent. The same
// component serves the personal (with print / update-profile / new-ficha actions) and the aluno (read-only, with
// print). A plain PAR-Q+ — one the phone wrote, or sent before the anamnese existed — reads here too, as a simple
// self-assessment.

const LEVEL_WORD: Record<FlagLevel, string> = { alert: "Importante", warn: "Atenção", info: "Observação" };

export function AnamnesisReport({
  assessment,
  previous,
  studentName,
  number,
  timeZone,
  children,
}: {
  assessment: Assessment;
  /** The aluno's previous assessment, when there is one, for "Mudou desde a anterior". */
  previous: Assessment | null;
  studentName: string;
  /** "Anamnese nº N": the position among this aluno's assessments, oldest first. */
  number: number;
  timeZone: string;
  /** The buttons of the screen that hosts the report (they are left out of a printout). */
  children?: ReactNode;
}) {
  const record = assessment.anamnesis;
  const flags = anamnesisFlags(assessment.parQAnswers, record);
  const changes = previous
    ? anamnesisDiff({ parQ: previous.parQAnswers, record: previous.anamnesis }, { parQ: assessment.parQAnswers, record })
    : [];
  const blocks = record ? reportBlocks(record) : [];

  return (
    <article className="report">
      <header className="report-head">
        <p className="eyebrow">{record ? `Anamnese nº ${number}` : `Autoavaliação nº ${number}`}</p>
        <h1>{studentName}</h1>
        <p>
          {formatDateTime(assessment.submittedAt, timeZone)} ·{" "}
          {previous ? `anterior em ${formatDate(localDate(previous.submittedAt, timeZone))}` : "primeira do aluno"}
        </p>
        {!record && <p className="report-note">Autoavaliação simples: só o PAR-Q+, o objetivo, o nível e os dias de treino.</p>}
      </header>

      {children && <div className="report-actions no-print">{children}</div>}

      <section aria-labelledby="report-attention">
        <h2 id="report-attention">Atenção</h2>
        {flags.length === 0 ? (
          <p>Nenhum ponto de atenção relatado.</p>
        ) : (
          <ul className="flags">
            {flags.map((flag) => (
              <li key={flag.id} className={`flag flag-${flag.level}`}>
                <strong>
                  {LEVEL_WORD[flag.level]} · {flag.label}
                </strong>
                {flag.detail !== "" && <span>{flag.detail}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {previous && (
        <section aria-labelledby="report-changes">
          <h2 id="report-changes">Mudou desde a anterior</h2>
          {changes.length === 0 ? (
            <p>Nada mudou nas respostas.</p>
          ) : (
            <ul className="changes">
              {changes.map((change) => (
                <li key={change.key}>
                  <span>{change.label}</span>
                  <span>
                    {change.before} → <strong>{change.after}</strong>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section aria-labelledby="report-parq">
        <h2 id="report-parq">Prontidão (PAR-Q+)</h2>
        <dl className="answers">
          {PAR_Q.map((question) => (
            <div key={question.key}>
              <dt>{question.text}</dt>
              <dd>{assessment.parQAnswers[question.key] === true ? "Sim" : assessment.parQAnswers[question.key] === false ? "Não" : "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      {record ? (
        blocks.map((block) => (
          <section key={block.id} aria-labelledby={`report-${block.id}`}>
            <h2 id={`report-${block.id}`}>{block.title}</h2>
            <dl className={block.id === "palavras" ? "answers words" : "answers"}>
              {block.rows.map((row) => (
                <div key={row.key}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))
      ) : (
        <section aria-labelledby="report-simple">
          <h2 id="report-simple">Objetivo, nível e dias</h2>
          <dl className="answers">
            <div>
              <dt>Objetivo</dt>
              <dd>{assessment.goal || "—"}</dd>
            </div>
            <div>
              <dt>Nível</dt>
              <dd>{assessment.experienceLevel || "—"}</dd>
            </div>
            <div>
              <dt>Dias de treino</dt>
              <dd>{assessment.trainingDays.join(", ") || "—"}</dd>
            </div>
          </dl>
        </section>
      )}

      {record && assessment.consentVersion && (
        <p className="report-consent">
          Consentimento dado
          {assessment.consentAt !== null ? ` em ${formatDateTime(assessment.consentAt, timeZone)}` : ""} · texto {assessment.consentVersion}
        </p>
      )}
    </article>
  );
}
