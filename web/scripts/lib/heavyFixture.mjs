// GOALS.md §38b: the "heavy year" — one busy personal's data after a year, so the read budget is measured where
// it hurts (the Spark plan's 50,000 reads a day are shared by the whole project). Opt-in:
// `npm run seed:emulators -- --heavy`. A separate personal (pesado@teste.dev) with 20 linked alunos, each training
// Monday/Wednesday/Friday for 52 weeks — six exercises a session, one workoutLogs document per exercise as the
// apps write them — plus weekly measurements, two self-assessments, two fichas of three treinos, the weekly
// agenda and twelve paid charges. About 20,000 documents. Only pesado@teste.dev and pesado01@teste.dev sign in.

export const HEAVY_TRAINER_EMAIL = "pesado@teste.dev";
export const HEAVY_STUDENT_EMAIL = "pesado01@teste.dev";
export const HEAVY_STUDENTS = 20;
const WEEKS = 52;
const EXERCISES = ["Supino", "Remada", "Agachamento", "Desenvolvimento", "Rosca", "Leg press"];
const TRAINING_DAYS = ["Segunda", "Quarta", "Sexta"];
const NO_PAR_Q = { heart_condition: false, chest_pain_activity: false, chest_pain_rest: false, dizziness: false, bone_joint: false, medication: false, other_reason: false };

/** UTC weekday (0 = Sunday) of a São Paulo morning: 07:00 at -03:00 is 10:00 UTC, the same calendar day. */
const weekday = (ms) => new Date(ms).getUTCDay();

/**
 * Every document of the heavy year as [path, data], given the two account uids, the ADM's uid and the seed's own
 * `morningOf` (07:00 in São Paulo `daysAgo` days before today) and `localDate`.
 */
export function heavyDocuments({ trainerId, firstStudentId, adminId, morningOf, localDate }) {
  const docs = [];
  const students = Array.from({ length: HEAVY_STUDENTS }, (_, i) =>
    i === 0 ? firstStudentId : `heavy-aluno-${String(i + 1).padStart(2, "0")}`);
  docs.push([
    `users/${trainerId}`,
    { role: "TRAINER", name: "Personal com um ano de dados", email: HEAVY_TRAINER_EMAIL, createdAt: morningOf(400), createdBy: adminId, accessStatus: "active" },
  ]);
  students.forEach((studentId, index) => {
    const n = String(index + 1).padStart(2, "0");
    docs.push([`users/${studentId}`, {
      role: "STUDENT",
      trainerId,
      inviteCode: null,
      name: `Aluno ${n}`,
      email: `pesado${n}@teste.dev`,
      gender: index % 2 === 0 ? "Feminino" : "Masculino",
      phone: "11999990000",
      goal: "Hipertrofia",
      experienceLevel: "Intermediário",
      medicalNotes: "",
      trainingDays: TRAINING_DAYS,
      createdAt: morningOf(400),
      canSelfAssess: true,
      canLogBiometrics: true,
      pendingAssessmentRequest: false,
    }]);
    for (const [fichaIndex, daysAgo] of [[0, 120], [1, 30]]) {
      const fichaId = `heavy-${n}-ficha-${fichaIndex}`;
      const createdAt = morningOf(daysAgo);
      ["A", "B", "C"].forEach((letter, order) => {
        docs.push([`workouts/${fichaId}-${letter}`, {
          trainerId,
          studentId,
          name: `Treino ${letter}`,
          isActive: true,
          exercisesJson: JSON.stringify(EXERCISES.map((name) => ({ name, sets: 3, reps: "10" }))),
          createdAt,
          status: "assigned",
          assignedAt: createdAt,
          ficha: { id: fichaId, name: `Ficha ${fichaIndex + 1}`, createdAt, updatedAt: createdAt, order },
        }]);
      });
    }
    TRAINING_DAYS.forEach((dayOfWeek) => {
      docs.push([`schedules/${studentId}-${dayOfWeek}`, { trainerId, studentId, dayOfWeek, hour: `${String(6 + (index % 14)).padStart(2, "0")}h` }]);
    });
    // One session per Monday/Wednesday/Friday of the last 52 weeks; the load creeps up a kilo a month.
    for (let daysAgo = 1; daysAgo <= WEEKS * 7; daysAgo++) {
      const morning = morningOf(daysAgo);
      if (![1, 3, 5].includes(weekday(morning))) continue;
      EXERCISES.forEach((exerciseName, i) => {
        const load = 20 + i * 5 + Math.floor((WEEKS * 7 - daysAgo) / 30);
        docs.push([`workoutLogs/heavy-${n}-${daysAgo}-${i}`, {
          trainerId,
          studentId,
          workoutId: `heavy-${n}-ficha-1-A`,
          exerciseName,
          date: morning + i * 4,
          performedSetsJson: JSON.stringify([1, 2, 3].map((setNumber) => ({ setNumber, weight: String(load), reps: 10 }))),
          note: null,
        }]);
      });
    }
    for (let week = 0; week < WEEKS; week++) {
      docs.push([`biometrics/heavy-${n}-${week}`, { trainerId, studentId, weight: 80 - week * 0.1, height: 0, bodyFat: 0, date: morningOf(week * 7 + 2) }]);
    }
    for (const daysAgo of [300, 120]) {
      docs.push([`assessments/heavy-${n}-${daysAgo}`, {
        trainerId,
        studentId,
        submittedAt: morningOf(daysAgo),
        parQAnswersJson: JSON.stringify(NO_PAR_Q),
        goal: "Hipertrofia",
        experienceLevel: "Intermediário",
        trainingDays: TRAINING_DAYS,
      }]);
    }
    docs.push([`billingPlans/${studentId}`, { studentId, trainerId, amountCents: 15000, currency: "BRL", dueDay: 5, active: true, createdAt: morningOf(400) }]);
    for (let month = 1; month <= 12; month++) {
      const yearMonth = localDate(morningOf(month * 30)).slice(0, 7);
      const dueDate = `${yearMonth}-05`;
      docs.push([`payments/${studentId}_${yearMonth}`, {
        trainerId,
        studentId,
        amountCents: 15000,
        currency: "BRL",
        dueDate,
        paidAt: Date.parse(`${dueDate}T12:00:00-03:00`),
        method: "pix",
        source: "manual",
        externalId: null,
        note: null,
        createdAt: morningOf(month * 30),
      }]);
    }
  });
  return docs;
}

/** Writes the documents in batches (a batch takes at most 500 writes). */
export async function writeInBatches(db, docs, size = 400) {
  for (let start = 0; start < docs.length; start += size) {
    const batch = db.batch();
    for (const [path, data] of docs.slice(start, start + size)) batch.set(db.doc(path), data);
    await batch.commit();
  }
}
