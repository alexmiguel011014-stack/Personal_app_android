import { describe, expect, it } from "vitest";
import { PAR_Q } from "./assessments";
import {
  ANAMNESIS_VERSION,
  QUESTIONS,
  SECTIONS,
  anamnesisDiff,
  anamnesisFlags,
  buildRecord,
  canSend,
  cleanText,
  describeAnswer,
  draftHasContent,
  emptyAnamnesisDraft,
  levelFromExperience,
  parseAnamnesis,
  parseNumber,
  profilePatchChanges,
  profilePatchFrom,
  questionOf,
  reportBlocks,
  validateDraftSnapshot,
  REVIEW_STEP,
  restrictionsText,
  sectionProblems,
  sectionRemaining,
  visibleQuestions,
  type AnamnesisContext,
  type AnamnesisDraft,
  type AnamnesisRecord,
  type Answers,
} from "./anamnesis";

const WOMAN: AnamnesisContext = { gender: "Feminino", year: 2026 };
const MAN: AnamnesisContext = { gender: "Masculino", year: 2026 };

/** Every PAR-Q+ answered "Não" and every required question answered with its first option — the shortest valid path. */
function filledDraft(answers: Answers = {}, parQ: Record<string, boolean> = {}, context: AnamnesisContext = WOMAN): AnamnesisDraft {
  const draft = emptyAnamnesisDraft();
  for (const question of PAR_Q) draft.parQ[question.key] = parQ[question.key] ?? false;
  const base: Answers = {
    conditions: ["Nenhuma"],
    medication: false,
    surgery: false,
    pain: false,
    pregnancy: false,
    smoking: "Não",
    alcohol: "Nunca",
    sleep_hours: "7 a 8 h",
    sleep_quality: "Boa",
    stress: "Baixo",
    work: "Sentado",
    experience: "Menos de 6 meses",
    activities: ["Nenhuma no momento"],
    days: ["Segunda", "Quarta"],
    session_minutes: "60 min",
    place: "Academia",
    goal: "Hipertrofia",
    horizon: "6 meses",
  };
  if (context.gender === "Masculino") delete base.pregnancy;
  draft.answers = { ...base, ...answers };
  draft.consentHealth = true;
  draft.consentTruth = true;
  return draft;
}

describe("the questionnaire", () => {
  it("has unique keys, every one in a real section, and options for every choice", () => {
    const keys = QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
    const sections = new Set(SECTIONS.map((s) => s.id));
    for (const q of QUESTIONS) {
      expect(sections.has(q.section)).toBe(true);
      if (q.kind === "single" || q.kind === "multi") expect(q.options.length).toBeGreaterThan(1);
    }
  });

  it("keeps the PAR-Q+ in the section of its own, with the seven standard questions", () => {
    expect(SECTIONS[0].id).toBe("prontidao");
    expect(QUESTIONS.some((q) => (q.section as string) === "prontidao")).toBe(false);
    expect(PAR_Q).toHaveLength(7);
  });
});

describe("visibleQuestions — follow-ups appear only after the answer that needs them", () => {
  const keys = (answers: Answers, context = WOMAN) => visibleQuestions(answers, context, "saude").map((q) => q.key);

  it("hides the follow-ups at first", () => {
    expect(keys({})).toEqual(["conditions", "medication", "surgery", "pain", "pregnancy"]);
  });

  it("shows each one after its trigger", () => {
    expect(keys({ conditions: ["Diabetes", "Outra"] })).toContain("conditions_other");
    expect(keys({ medication: true })).toContain("medication_which");
    expect(keys({ medication: false })).not.toContain("medication_which");
    expect(keys({ surgery: true })).toContain("surgery_which");
    expect(keys({ pain: true })).toEqual(expect.arrayContaining(["pain_regions", "pain_worse"]));
  });

  it("asks about pregnancy unless the profile's sexo is Masculino", () => {
    expect(keys({}, MAN)).not.toContain("pregnancy");
    expect(keys({}, { gender: "Feminino", year: 2026 })).toContain("pregnancy");
    expect(keys({}, { gender: "", year: 2026 })).toContain("pregnancy");
  });

  it("filters by section", () => {
    expect(visibleQuestions({}, WOMAN, "habitos").map((q) => q.key)).toEqual(["smoking", "alcohol", "sleep_hours", "sleep_quality", "stress", "work"]);
  });
});

describe("sectionProblems / sectionRemaining — the 'Faltam N respostas' of each screen", () => {
  it("counts the seven PAR-Q+ questions until each is tapped", () => {
    const draft = emptyAnamnesisDraft();
    expect(sectionRemaining("prontidao", draft, WOMAN)).toBe(7);
    draft.parQ.heart_condition = false;
    draft.parQ.medication = true;
    expect(sectionRemaining("prontidao", draft, WOMAN)).toBe(5);
  });

  it("counts a required follow-up only once it is shown", () => {
    const draft = filledDraft({ pain: true });
    expect(sectionProblems("saude", draft, WOMAN).missing).toEqual(["Onde?", "A dor piora quando você se movimenta?"]);
    draft.answers.pain_regions = ["Joelho"];
    draft.answers.pain_worse = false;
    expect(sectionRemaining("saude", draft, WOMAN)).toBe(0);
  });

  it("never blocks on an optional question", () => {
    expect(sectionRemaining("medidas", emptyAnamnesisDraft(), WOMAN)).toBe(0);
    expect(sectionRemaining("objetivos", filledDraft(), WOMAN)).toBe(0);
  });

  it("flags a text that is too long or has control characters", () => {
    const tooLong = filledDraft({ dislikes: "x".repeat(201) });
    expect(sectionProblems("objetivos", tooLong, WOMAN).invalid[0]).toContain("200 caracteres");
    const control = filledDraft({ notes: "oi\u0007" });
    expect(sectionProblems("objetivos", control, WOMAN).invalid[0]).toContain("caracteres que não podem");
    expect(sectionRemaining("objetivos", filledDraft({ notes: "linha 1\nlinha 2" }), WOMAN)).toBe(0);
  });

  it("checks numbers: comma decimals are fine, ranges follow the context's year", () => {
    expect(sectionRemaining("medidas", filledDraft({ weight_kg: "72,5", height_cm: "170", birth_year: "1990" }), WOMAN)).toBe(0);
    expect(sectionProblems("medidas", filledDraft({ weight_kg: "abc" }), WOMAN).invalid).toHaveLength(1);
    expect(sectionProblems("medidas", filledDraft({ height_cm: "170,5" }), WOMAN).invalid).toHaveLength(1); // not a whole number
    expect(sectionProblems("medidas", filledDraft({ weight_kg: "10" }), WOMAN).invalid[0]).toContain("entre 20 e 400");
    expect(sectionProblems("medidas", filledDraft({ birth_year: "2025" }), WOMAN).invalid).toHaveLength(1);
    expect(sectionRemaining("medidas", filledDraft({ birth_year: "2021" }), WOMAN)).toBe(0);
    expect(sectionProblems("medidas", filledDraft({ birth_year: "2021" }), { gender: "", year: 2024 }).invalid).toHaveLength(1);
  });
});

describe("canSend", () => {
  it("is true for the shortest valid path, and needs both consent boxes", () => {
    expect(canSend(filledDraft(), WOMAN)).toBe(true);
    expect(canSend({ ...filledDraft(), consentHealth: false }, WOMAN)).toBe(false);
    expect(canSend({ ...filledDraft(), consentTruth: false }, WOMAN)).toBe(false);
  });

  it("is false while any PAR-Q+ question or required answer is missing", () => {
    const noParQ = filledDraft();
    delete noParQ.parQ.dizziness;
    expect(canSend(noParQ, WOMAN)).toBe(false);
    const noGoal = filledDraft();
    delete noGoal.answers.goal;
    expect(canSend(noGoal, WOMAN)).toBe(false);
    expect(canSend(emptyAnamnesisDraft(), WOMAN)).toBe(false);
  });

  it("does not ask a man about pregnancy", () => {
    expect(canSend(filledDraft({}, {}, MAN), MAN)).toBe(true);
  });
});

describe("buildRecord", () => {
  it("stores the version and only the answers that apply, cleaned", () => {
    const record = buildRecord(
      filledDraft({ medication: false, medication_which: "ficou de uma resposta anterior", notes: "  oi\r\ntudo bem  ", weight_kg: "72,5", height_cm: "170", birth_year: "" }),
      WOMAN,
    );
    expect(record.version).toBe(ANAMNESIS_VERSION);
    expect(record.answers.medication_which).toBeUndefined();
    expect(record.answers.notes).toBe("oi\ntudo bem");
    expect(record.answers.weight_kg).toBe(72.5);
    expect(record.answers.height_cm).toBe(170);
    expect("birth_year" in record.answers).toBe(false);
  });

  it("keeps options in the questionnaire's order, drops unknown ones, and lets 'Nenhuma' stand alone", () => {
    expect(buildRecord(filledDraft({ days: ["Quarta", "Segunda", "Feriado"] }), WOMAN).answers.days).toEqual(["Segunda", "Quarta"]);
    expect(buildRecord(filledDraft({ conditions: ["Nenhuma", "Diabetes"] }), WOMAN).answers.conditions).toEqual(["Diabetes"]);
    expect(buildRecord(filledDraft({ conditions: ["Nenhuma"] }), WOMAN).answers.conditions).toEqual(["Nenhuma"]);
    expect(buildRecord(filledDraft({ smoking: "talvez" }), WOMAN).answers.smoking).toBeUndefined();
  });

  it("drops the pregnancy answer for a man", () => {
    expect(buildRecord(filledDraft({ pregnancy: true }, {}, MAN), MAN).answers.pregnancy).toBeUndefined();
  });
});

describe("parseAnamnesis — a stored record read leniently", () => {
  it("round-trips what buildRecord wrote", () => {
    const record = buildRecord(filledDraft({ pain: true, pain_regions: ["Joelho"], pain_worse: true, weight_kg: "80" }), WOMAN);
    expect(parseAnamnesis(JSON.parse(JSON.stringify(record)))).toEqual(record);
  });

  it("is null when it is not a record at all", () => {
    for (const bad of [null, undefined, 3, "x", [], {}, { version: "1", answers: {} }, { version: 1 }, { version: 1, answers: [] }]) {
      expect(parseAnamnesis(bad)).toBeNull();
    }
  });

  it("drops unknown keys and wrong shapes, keeps the rest, and accepts a future version", () => {
    const parsed = parseAnamnesis({
      version: 7,
      answers: { goal: "Força", smoking: 3, days: ["Segunda", 5, "Feriado"], medication: "sim", weight_kg: "72", stray: "x", notes: "y".repeat(900), height_cm: 1000 },
    });
    expect(parsed?.version).toBe(7);
    expect(parsed?.answers).toEqual({ goal: "Força", days: ["Segunda"], notes: "y".repeat(500) });
  });
});

describe("a fully filled anamnese stays small", () => {
  it("is well under 10 KB with every option picked and every text at its cap", () => {
    const everything: Answers = {};
    for (const question of QUESTIONS) {
      if (question.kind === "multi") everything[question.key] = [...question.options];
      else if (question.kind === "single") everything[question.key] = question.options[0];
      else if (question.kind === "yesno") everything[question.key] = true;
      else if (question.kind === "text") everything[question.key] = "ç".repeat(question.maxLength);
      else everything[question.key] = String(question.range(WOMAN)[1]);
    }
    const draft = { ...filledDraft(), answers: everything };
    const record = buildRecord(draft, WOMAN);
    expect(Object.keys(record.answers).length).toBeGreaterThan(20);
    expect(new TextEncoder().encode(JSON.stringify(record)).length).toBeLessThan(5_000);
  });
});

describe("anamnesisFlags — what the personal must look at, most serious first", () => {
  const record = (answers: AnamnesisRecord["answers"]): AnamnesisRecord => ({ version: 1, answers });
  const noParQ = {};

  it("says nothing for a clean record", () => {
    expect(anamnesisFlags(noParQ, buildRecord(filledDraft(), WOMAN))).toEqual([]);
    expect(anamnesisFlags({ heart_condition: false }, null)).toEqual([]);
  });

  it("lists PAR-Q+ 'sim' answers first, in the questionnaire's order, as alerts", () => {
    const flags = anamnesisFlags({ medication: true, heart_condition: true }, record({ pain: true, pain_regions: ["Joelho"], pain_worse: false }));
    expect(flags.map((f) => f.id)).toEqual(["parq:heart_condition", "parq:medication", "pain"]);
    expect(flags[0].level).toBe("alert");
    expect(flags[0].detail).toContain("problema cardíaco");
  });

  it("orders everything else: conditions, medication, pain, surgery, pregnancy, smoking, short sleep, stress", () => {
    const flags = anamnesisFlags(
      noParQ,
      record({
        stress: "Alto",
        sleep_hours: "Menos de 5 h",
        smoking: "Sim",
        pregnancy: true,
        surgery: true,
        surgery_which: "Joelho, 2019",
        pain: true,
        pain_regions: ["Lombar", "Joelho"],
        pain_worse: true,
        medication: true,
        medication_which: "Losartana",
        conditions: ["Hipertensão", "Outra"],
        conditions_other: "Enxaqueca",
      }),
    );
    expect(flags.map((f) => f.id)).toEqual(["conditions", "medication", "pain", "surgery", "pregnancy", "smoking", "sleep", "stress"]);
    expect(flags.find((f) => f.id === "conditions")?.detail).toBe("Hipertensão, Outra: Enxaqueca");
    expect(flags.find((f) => f.id === "medication")?.detail).toBe("Losartana");
    expect(flags.find((f) => f.id === "pain")?.detail).toBe("Lombar, Joelho · piora com movimento");
    expect(flags.find((f) => f.id === "pain")?.level).toBe("alert");
    expect(flags.find((f) => f.id === "smoking")?.level).toBe("info");
  });

  it("does not flag 'Nenhuma' as a condition, and says when a follow-up was left blank", () => {
    expect(anamnesisFlags(noParQ, record({ conditions: ["Nenhuma"] }))).toEqual([]);
    expect(anamnesisFlags(noParQ, record({ medication: true }))[0].detail).toBe("Não informou qual.");
    expect(anamnesisFlags(noParQ, record({ pain: true }))[0].detail).toBe("Região não informada");
  });
});

describe("anamnesisDiff", () => {
  const snap = (draft: AnamnesisDraft) => ({ parQ: draft.parQ as Record<string, boolean>, record: buildRecord(draft, WOMAN) });

  it("lists the answers that changed, with before and after", () => {
    const before = snap(filledDraft({ stress: "Baixo", weight_kg: "70", days: ["Segunda"] }));
    const after = snap(filledDraft({ stress: "Alto", weight_kg: "68,5", days: ["Segunda"] }, { medication: true }));
    const changes = anamnesisDiff(before, after);
    expect(changes.map((c) => [c.key, c.before, c.after])).toEqual([
      ["medication", "Não", "Sim"],
      ["stress", "Baixo", "Alto"],
      ["weight_kg", "70 kg", "68,5 kg"],
    ]);
  });

  it("is empty when nothing changed", () => {
    expect(anamnesisDiff(snap(filledDraft()), snap(filledDraft()))).toEqual([]);
  });

  it("compares only the PAR-Q+ against a plain self-assessment, instead of listing every question as new", () => {
    const plain = { parQ: Object.fromEntries(PAR_Q.map((q) => [q.key, false])), record: null };
    const full = snap(filledDraft({ stress: "Alto" }, { medication: true }));
    expect(anamnesisDiff(plain, full).map((c) => c.key)).toEqual(["medication"]);
  });
});

describe("the profile patch", () => {
  const profile = { name: "Ana", gender: "Feminino", phone: "", goal: "Emagrecimento", experienceLevel: "Iniciante", medicalNotes: "", trainingDays: ["Terça"] };

  it("maps training time to the phone's own level spelling", () => {
    expect(levelFromExperience("Nunca treinei")).toBe("Iniciante");
    expect(levelFromExperience("Menos de 6 meses")).toBe("Iniciante");
    expect(levelFromExperience("6 meses a 2 anos")).toBe("Interm.");
    expect(levelFromExperience("Mais de 2 anos")).toBe("Avançado");
    expect(levelFromExperience(undefined)).toBeUndefined();
  });

  it("brings objetivo, nível, dias (in week order) and the restrictions in words", () => {
    const record = buildRecord(
      filledDraft({ goal: "Força", experience: "Mais de 2 anos", days: ["Sexta", "Segunda"], conditions: ["Hipertensão"], pain: true, pain_regions: ["Joelho"], pain_worse: true, smoking: "Sim" }),
      WOMAN,
    );
    const patch = profilePatchFrom({ medication: true }, record);
    expect(patch).toEqual({
      goal: "Força",
      experienceLevel: "Avançado",
      trainingDays: ["Segunda", "Sexta"],
      medicalNotes: "Condições de saúde: Hipertensão; Dor ou lesão hoje: Joelho · piora com movimento; PAR-Q+: 1 resposta(s) “sim”",
    });
    expect(restrictionsText(anamnesisFlags({}, record))).not.toContain("Fumante");
  });

  it("leaves medicalNotes out when there is nothing to say", () => {
    expect(profilePatchFrom({}, buildRecord(filledDraft(), WOMAN)).medicalNotes).toBeUndefined();
  });

  it("lists exactly what would change, and nothing that would stay the same", () => {
    const patch = { goal: "Emagrecimento", experienceLevel: "Interm.", trainingDays: ["Terça", "Quinta"], medicalNotes: "Hipertensão" };
    expect(profilePatchChanges(profile, patch).map((c) => [c.field, c.before, c.after])).toEqual([
      ["experienceLevel", "Iniciante", "Interm."],
      ["trainingDays", "Terça", "Terça, Quinta"],
      ["medicalNotes", "—", "Hipertensão"],
    ]);
    expect(profilePatchChanges(profile, {})).toEqual([]);
  });
});

describe("reportBlocks / describeAnswer", () => {
  it("groups the answers by section and gathers the free text under 'Nas palavras do aluno'", () => {
    const record = buildRecord(filledDraft({ medication: true, medication_which: "Losartana", notes: "Medo de agachar", weight_kg: "72,5" }), WOMAN);
    const blocks = reportBlocks(record);
    expect(blocks.map((b) => b.id)).toEqual(["saude", "habitos", "rotina", "objetivos", "medidas", "palavras"]);
    expect(blocks.find((b) => b.id === "medidas")?.rows).toEqual([{ key: "weight_kg", label: "Peso", value: "72,5 kg" }]);
    expect(blocks.find((b) => b.id === "palavras")?.rows.map((r) => r.value)).toEqual(["Losartana", "Medo de agachar"]);
  });

  it("leaves out sections nobody answered", () => {
    expect(reportBlocks({ version: 1, answers: { goal: "Força" } }).map((b) => b.id)).toEqual(["objetivos"]);
  });

  it("writes an answer as words", () => {
    const weight = questionOf("weight_kg")!;
    expect(describeAnswer(weight, 72)).toBe("72 kg");
    expect(describeAnswer(questionOf("birth_year")!, 1990)).toBe("1990");
    expect(describeAnswer(questionOf("pain")!, false)).toBe("Não");
    expect(describeAnswer(questionOf("days")!, ["Segunda", "Quarta"])).toBe("Segunda, Quarta");
    expect(describeAnswer(weight, undefined)).toBe("—");
  });
});

describe("the draft kept on the device (GOALS.md §38c, D7)", () => {
  it("is worth keeping only once something was answered", () => {
    expect(draftHasContent(emptyAnamnesisDraft())).toBe(false);
    expect(draftHasContent({ ...emptyAnamnesisDraft(), parQ: { dizziness: false } })).toBe(true);
    expect(draftHasContent({ ...emptyAnamnesisDraft(), answers: { goal: "Força" } })).toBe(true);
    expect(draftHasContent({ ...emptyAnamnesisDraft(), consentTruth: true })).toBe(true);
  });

  it("round-trips through JSON as a snapshot of the step and the answers", () => {
    const draft = filledDraft({ pain: true, pain_regions: ["Joelho"], notes: "oi", weight_kg: "72,5" });
    const snapshot = validateDraftSnapshot(JSON.parse(JSON.stringify({ step: 3, draft })));
    expect(snapshot?.step).toBe(3);
    expect(snapshot?.draft.answers).toEqual(draft.answers);
    expect(snapshot?.draft.parQ).toEqual(draft.parQ);
    expect(snapshot?.draft.consentHealth).toBe(true);
    expect(REVIEW_STEP).toBe(6);
    expect(validateDraftSnapshot({ step: REVIEW_STEP, draft })?.step).toBe(6);
  });

  it("drops what is not a known question or not the right shape, and refuses anything that is not a snapshot", () => {
    const snapshot = validateDraftSnapshot({
      step: 1,
      draft: { parQ: { dizziness: "sim", medication: true, stray: true }, answers: { goal: "Força", stray: "x", pain: 3, days: ["Segunda", 4], notes: "x".repeat(601) }, consentHealth: "yes" },
    });
    expect(snapshot?.draft.parQ).toEqual({ medication: true });
    expect(snapshot?.draft.answers).toEqual({ goal: "Força" });
    expect(snapshot?.draft.consentHealth).toBe(false);
    for (const bad of [null, 5, "x", [], {}, { step: 1 }, { step: 9, draft: {} }, { step: -1, draft: {} }, { step: 1.5, draft: {} }, { step: 1, draft: [] }]) {
      expect(validateDraftSnapshot(bad)).toBeNull();
    }
  });
});

describe("small helpers", () => {
  it("cleans text and reads Brazilian numbers", () => {
    expect(cleanText("  a\r\nb\rc  ")).toBe("a\nb\nc");
    expect(parseNumber("72,5")).toBe(72.5);
    expect(parseNumber(" 80 ")).toBe(80);
    for (const bad of ["", "abc", "1,2,3", "-5", "7e2", "5."]) expect(parseNumber(bad)).toBeNull();
  });
});
