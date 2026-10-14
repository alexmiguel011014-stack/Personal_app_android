"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from "react";
import { submitAssessment } from "../../../data/assessments";
import { getFirebase } from "../../../data/firebase";
import { PAR_Q, completeAnswers } from "../../../domain/assessments";
import {
  CONSENT_HEALTH_TEXT,
  CONSENT_TRUTH_TEXT,
  CONSENT_VERSION,
  PAR_Q_GUIDANCE,
  REVIEW_STEP,
  SECTIONS,
  buildRecord,
  canSend,
  draftHasContent,
  emptyAnamnesisDraft,
  levelFromExperience,
  reportBlocks,
  sectionProblems,
  sectionRemaining,
  validateDraftSnapshot,
  visibleQuestions,
  type AnamnesisContext,
  type AnamnesisDraft,
  type AnswerValue,
  type Question,
  type SectionId,
} from "../../../domain/anamnesis";
import { formatDateTime } from "../../../domain/dates";
import { ANAMNESIS_DRAFT_MAX_AGE_MS, draftKey, readDraft, removeDraft, writeDraft } from "../../../domain/formDraft";
import type { LinkedStudentDoc } from "../../../domain/students";
import { browserStorage } from "../../_shared/browserStorage";
import { browserTimeZone } from "../../_shared/browserTimeZone";

// GOALS.md §38g (D17): the anamnese the aluno fills in, a few taps at a time. Six short screens — prontidão (the
// PAR-Q+), saúde, hábitos, rotina, objetivos, medidas — then a review with the consent. Follow-up questions appear only
// after the answer that needs them, "Continuar" says how many answers are missing, free text is optional, and
// everything is kept on the device as the person goes (a reload, a locked phone or a closed tab loses nothing) until it
// is sent. The rules of the questionnaire live in domain/anamnesis.ts; this only lays them out.

function Chip({ type, name, checked, onChange, children }: { type: "radio" | "checkbox"; name: string; checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="chip">
      <input type={type} name={name} checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

const plural = (n: number) => (n === 1 ? "Falta 1 resposta" : `Faltam ${n} respostas`);

export function AnamnesisForm({ uid, profile, onSent }: { uid: string; profile: LinkedStudentDoc; onSent: () => void }) {
  const context = useMemo<AnamnesisContext>(() => ({ gender: profile.gender, year: new Date().getFullYear() }), [profile.gender]);
  const key = draftKey("anamnese", uid);

  const [draft, setDraft] = useState<AnamnesisDraft>(emptyAnamnesisDraft);
  const [step, setStep] = useState(0);
  // A draft found on the device, waiting for the person to say whether to continue it. (This component only mounts
  // after the aluno's data is loaded in the browser, so reading storage while initialising state is safe.)
  const [saved, setSaved] = useState(() => {
    const found = readDraft(browserStorage(), key, Date.now(), ANAMNESIS_DRAFT_MAX_AGE_MS, validateDraftSnapshot);
    return found && draftHasContent(found.data.draft) ? { ...found.data, savedAt: found.savedAt } : null;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const arrived = useRef(false);

  // Keep the draft as the person goes — but not while the "continue?" question is open, or it would overwrite it.
  useEffect(() => {
    if (saved !== null || sent) return;
    const storage = browserStorage();
    if (draftHasContent(draft)) writeDraft(storage, key, { step, draft }, Date.now());
    else removeDraft(storage, key);
  }, [draft, step, saved, sent, key]);

  // A new screen starts at the top, with its heading read out.
  useEffect(() => {
    if (!arrived.current) {
      arrived.current = true;
      return;
    }
    window.scrollTo({ top: 0 });
    heading.current?.focus();
  }, [step]);

  function setParQ(questionKey: string, value: boolean) {
    setDraft((current) => ({ ...current, parQ: { ...current.parQ, [questionKey]: value } }));
  }

  function setAnswer(questionKey: string, value: AnswerValue | undefined) {
    setDraft((current) => {
      const answers = { ...current.answers };
      if (value === undefined || value === "") delete answers[questionKey];
      else answers[questionKey] = value;
      return { ...current, answers };
    });
  }

  function toggle(question: Extract<Question, { kind: "multi" }>, option: string) {
    const current = Array.isArray(draft.answers[question.key]) ? (draft.answers[question.key] as string[]) : [];
    let next: string[];
    if (option === question.none) next = current.includes(option) ? [] : [option];
    else next = current.includes(option) ? current.filter((item) => item !== option) : [...current.filter((item) => item !== question.none), option];
    setAnswer(question.key, next.length === 0 ? undefined : next);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (step !== REVIEW_STEP || busy || !canSend(draft, context)) return;
    const parQ = completeAnswers(draft.parQ);
    if (parQ === null) return;
    const record = buildRecord(draft, context);
    const experience = typeof record.answers.experience === "string" ? record.answers.experience : undefined;
    setBusy(true);
    setError(null);
    try {
      await submitAssessment(
        getFirebase().db,
        uid,
        profile.trainerId,
        parQ,
        {
          goal: typeof record.answers.goal === "string" ? record.answers.goal : profile.goal,
          experienceLevel: levelFromExperience(experience) ?? profile.experienceLevel,
          trainingDays: Array.isArray(record.answers.days) ? (record.answers.days as string[]) : profile.trainingDays,
        },
        Date.now(),
        { record, consentVersion: CONSENT_VERSION },
      );
      removeDraft(browserStorage(), key);
      setSent(true);
      onSent();
    } catch {
      setError("Não foi possível enviar. Verifique a conexão e tente de novo — o que você respondeu continua salvo.");
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <main>
        <h1>Anamnese</h1>
        <p role="status">Anamnese enviada. Seu personal já pode ver — obrigado!</p>
        <p>
          <Link href="/aluno">Voltar para as fichas</Link>
        </p>
      </main>
    );
  }

  if (saved !== null) {
    return (
      <main>
        <p className="eyebrow">
          <Link href="/aluno">← Fichas</Link>
        </p>
        <h1>Anamnese</h1>
        <div role="status" className="resume">
          <p>
            Você tem uma anamnese em andamento: etapa {Math.min(saved.step + 1, REVIEW_STEP)} de {REVIEW_STEP}, salva em {formatDateTime(saved.savedAt, browserTimeZone())}.
          </p>
          <div className="resume-actions">
            <button
              type="button"
              className="button-primary"
              onClick={() => {
                setDraft(saved.draft);
                setStep(saved.step);
                setSaved(null);
              }}
            >
              Continuar de onde parei
            </button>
            <button
              type="button"
              onClick={() => {
                removeDraft(browserStorage(), key);
                setSaved(null);
              }}
            >
              Começar de novo
            </button>
          </div>
        </div>
      </main>
    );
  }

  const section = step < REVIEW_STEP ? SECTIONS[step] : null;
  const remaining = section ? sectionRemaining(section.id, draft, context) : 0;
  const problems = section ? sectionProblems(section.id, draft, context) : null;

  return (
    <main>
      <p className="eyebrow">
        <Link href="/aluno">← Fichas</Link>
      </p>
      <h1>Anamnese</h1>
      <p>Seu personal pediu sua anamnese — leva uns 5 minutos. O que você responde fica guardado neste aparelho até você enviar.</p>

      <div className="step-progress">
        <p>{section ? `Etapa ${step + 1} de ${REVIEW_STEP}` : "Última etapa"}</p>
        <div className="step-bar" aria-hidden="true">
          <span style={{ width: `${Math.round((step / REVIEW_STEP) * 100)}%` }} />
        </div>
      </div>

      <form onSubmit={(event) => void send(event)} noValidate>
        {section === null ? (
          <Review draft={draft} context={context} heading={heading} onEdit={setStep} onConsent={(change) => setDraft((current) => ({ ...current, ...change }))} />
        ) : (
          <>
            <h2 ref={heading} tabIndex={-1}>
              {section.title}
            </h2>
            <p className="step-intro">{section.intro}</p>
            {section.id === "prontidao" ? (
              <ParQStep draft={draft} onChange={setParQ} />
            ) : (
              visibleQuestions(draft.answers, context, section.id).map((question) => (
                <Field key={question.key} question={question} value={draft.answers[question.key]} onChange={(value) => setAnswer(question.key, value)} onToggle={(option) => question.kind === "multi" && toggle(question, option)} />
              ))
            )}
            {problems && problems.invalid.length > 0 && (
              <ul role="alert">
                {problems.invalid.map((message) => (
                  <li key={message}>{message}</li>
                ))}
              </ul>
            )}
          </>
        )}

        {error && <p role="alert">{error}</p>}

        <div className="step-actions">
          {section !== null && remaining > 0 && (
            <p className="remaining" aria-live="polite">
              {plural(remaining)}
            </p>
          )}
          <div>
            {step > 0 && (
              <button type="button" onClick={() => setStep(step - 1)} disabled={busy}>
                Voltar
              </button>
            )}
            {section !== null ? (
              <button type="button" className="button-primary" disabled={remaining > 0} onClick={() => setStep(step + 1)}>
                {step === REVIEW_STEP - 1 ? "Revisar" : "Continuar"}
              </button>
            ) : (
              <button type="submit" disabled={busy || !canSend(draft, context)}>
                {busy ? "Enviando…" : "Enviar para o personal"}
              </button>
            )}
          </div>
        </div>
      </form>
    </main>
  );
}

function ParQStep({ draft, onChange }: { draft: AnamnesisDraft; onChange: (key: string, value: boolean) => void }) {
  const anyYes = PAR_Q.some((question) => draft.parQ[question.key] === true);
  return (
    <>
      {PAR_Q.map((question, index) => (
        <fieldset className="q" key={question.key}>
          <legend>
            {index + 1}. {question.text}
          </legend>
          <div className="chips">
            <Chip type="radio" name={`parq-${question.key}`} checked={draft.parQ[question.key] === false} onChange={() => onChange(question.key, false)}>
              Não
            </Chip>
            <Chip type="radio" name={`parq-${question.key}`} checked={draft.parQ[question.key] === true} onChange={() => onChange(question.key, true)}>
              Sim
            </Chip>
          </div>
        </fieldset>
      ))}
      {anyYes && <p role="status">{PAR_Q_GUIDANCE}</p>}
    </>
  );
}

function Field({ question, value, onChange, onToggle }: { question: Question; value: AnswerValue | undefined; onChange: (value: AnswerValue | undefined) => void; onToggle: (option: string) => void }) {
  const optional = !question.required;
  const legend = (
    <>
      {question.label}
      {optional && <span className="opt"> (opcional)</span>}
    </>
  );
  switch (question.kind) {
    case "yesno":
      return (
        <fieldset className="q">
          <legend>{legend}</legend>
          <div className="chips">
            <Chip type="radio" name={question.key} checked={value === false} onChange={() => onChange(false)}>
              Não
            </Chip>
            <Chip type="radio" name={question.key} checked={value === true} onChange={() => onChange(true)}>
              Sim
            </Chip>
          </div>
        </fieldset>
      );
    case "single":
      return (
        <fieldset className="q">
          <legend>{legend}</legend>
          <div className="chips">
            {question.options.map((option) => (
              <Chip key={option} type="radio" name={question.key} checked={value === option} onChange={() => onChange(option)}>
                {option}
              </Chip>
            ))}
          </div>
        </fieldset>
      );
    case "multi": {
      const picked = Array.isArray(value) ? value : [];
      return (
        <fieldset className="q">
          <legend>{legend}</legend>
          {question.hint && <p className="hint">{question.hint}</p>}
          <div className="chips">
            {question.options.map((option) => (
              <Chip key={option} type="checkbox" name={question.key} checked={picked.includes(option)} onChange={() => onToggle(option)}>
                {option}
              </Chip>
            ))}
          </div>
        </fieldset>
      );
    }
    case "text": {
      const text = typeof value === "string" ? value : "";
      return (
        <label className="q field">
          <span>{legend}</span>
          {question.multiline ? (
            <textarea rows={3} maxLength={question.maxLength} value={text} onChange={(event) => onChange(event.target.value)} />
          ) : (
            <input type="text" maxLength={question.maxLength} autoComplete="off" value={text} onChange={(event) => onChange(event.target.value)} />
          )}
        </label>
      );
    }
    case "number": {
      const text = value === undefined ? "" : String(value);
      return (
        <label className="q field">
          <span>
            {question.label}
            {question.unit ? ` (${question.unit})` : ""}
            {optional && <span className="opt"> (opcional)</span>}
          </span>
          <input inputMode="decimal" autoComplete="off" value={text} onChange={(event) => onChange(event.target.value)} />
        </label>
      );
    }
  }
}

function stepOf(section: SectionId): number {
  return SECTIONS.findIndex((candidate) => candidate.id === section);
}

function Review({
  draft,
  context,
  heading,
  onEdit,
  onConsent,
}: {
  draft: AnamnesisDraft;
  context: AnamnesisContext;
  heading: RefObject<HTMLHeadingElement | null>;
  onEdit: (step: number) => void;
  onConsent: (change: Partial<Pick<AnamnesisDraft, "consentHealth" | "consentTruth">>) => void;
}) {
  const record = buildRecord(draft, context);
  const yes = PAR_Q.filter((question) => draft.parQ[question.key] === true);
  return (
    <>
      <h2 ref={heading} tabIndex={-1}>
        Revisar e enviar
      </h2>
      <p className="step-intro">Confira suas respostas. Para mudar alguma, toque em “Editar”.</p>

      <section className="review-card">
        <div className="review-head">
          <h3>Prontidão (PAR-Q+)</h3>
          <button type="button" onClick={() => onEdit(0)}>
            Editar
          </button>
        </div>
        <p>{yes.length === 0 ? "Nenhuma resposta “sim”." : `${yes.length} resposta(s) “sim”:`}</p>
        {yes.length > 0 && (
          <ul>
            {yes.map((question) => (
              <li key={question.key}>{question.text}</li>
            ))}
          </ul>
        )}
      </section>

      {reportBlocks(record).map((block) => {
        const editStep = block.id === "palavras" ? null : stepOf(block.id);
        return (
        <section className="review-card" key={block.id}>
          <div className="review-head">
            <h3>{block.title}</h3>
            {editStep !== null && (
              <button type="button" onClick={() => onEdit(editStep)}>
                Editar
              </button>
            )}
          </div>
          <dl className="answers">
            {block.rows.map((row) => (
              <div key={row.key}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        );
      })}

      <fieldset className="consent">
        <legend>Consentimento</legend>
        <label className="check">
          <input type="checkbox" checked={draft.consentHealth} onChange={(event) => onConsent({ consentHealth: event.target.checked })} />
          <span>{CONSENT_HEALTH_TEXT}</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={draft.consentTruth} onChange={(event) => onConsent({ consentTruth: event.target.checked })} />
          <span>{CONSENT_TRUTH_TEXT}</span>
        </label>
      </fieldset>
    </>
  );
}
