// GOALS.md §23f/§23g and §26j: puts the local emulators into a known state for exercising the web app by hand
// or from a browser — fake accounts and data under the demo project, never the real one.
//
//   1. start the emulators:  npx firebase emulators:start --config ../firebase.json
//                              --project demo-personal-tracker --only auth,firestore
//   2. seed them:            npm run seed:emulators
//   3. run the app on them:  NEXT_PUBLIC_FIREBASE_EMULATORS=true npm run dev
//
// Re-running it wipes both emulators first, so it always ends in the same state. Every date is
// relative to "now", so the dashboard reads the same whichever day it runs. Each student is there to
// make one of the dashboard's numbers checkable by eye:
//
//   Ana    claimed an invite (her draft must NOT be counted again); trains Seg/Qua/Sex, three
//          sessions this week, each written as three per-exercise log documents (the dashboard must
//          say 3 sessions, not 9); her charge for this month exists and is paid (the plan must not
//          duplicate it). On her page: two measurements, and loads that go up session by session.
//          In the agenda: 07h on each of her training days. Logged in (ana@teste.dev): one assigned
//          ficha — and one inactive she must not see — and she may record her own measurements.
//   Bruno  hasn't trained in 12 days (gone quiet); last month's charge is unpaid (overdue); his
//          active plan has no charge this month yet — opening the dashboard creates it. On his page:
//          a PAR-Q+ with one "sim" (bone/joint), which must show flagged. In the agenda: 18h on his
//          training days.
//   Carla  joined two days ago and hasn't trained — must NOT show as gone quiet.
//   Diego  has a pending assessment request and no training plan; logged in, he may answer it.
//   Maria  a draft with an open invite (the /convite flow).
//   Pedro  a draft with no invite.
//   Admin  admin@teste.dev can inspect the ADM area. The original trainer has recent activity and an
//          overdue charge; quiet@teste.dev has three linked students and a fresh but quiet summary;
//          away@teste.dev has a stale summary and overdue balance; never@teste.dev has never signed in
//          (no stats document); suspended@teste.dev has recent usage but suspended access.

import { initializeTestEnvironment } from "@firebase/rules-unit-testing";

const PROJECT_ID = "demo-personal-tracker";
const AUTH = "http://127.0.0.1:9099";
const FIRESTORE = { host: "127.0.0.1", port: 8081 };
const TIME_ZONE = "America/Sao_Paulo"; // UTC-3 all year since 2019
const PASSWORD = "senha123";

const TRAINER_EMAIL = "treinador@teste.dev";
const ADMIN_EMAIL = "admin@teste.dev";
const QUIET_TRAINER_EMAIL = "quiet@teste.dev";
const AWAY_TRAINER_EMAIL = "away@teste.dev";
const NEVER_TRAINER_EMAIL = "never@teste.dev";
const SUSPENDED_TRAINER_EMAIL = "suspended@teste.dev";
const OPEN_INVITE = "AB12CD34";

// Small copies of src/domain/dates.ts, kept inline so this script runs on plain Node.
function localDate(ms) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(ms);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
/** 07:00 in São Paulo, `days` days before today. */
function morningOf(daysAgo) {
  return Date.parse(`${addDays(localDate(Date.now()), -daysAgo)}T07:00:00-03:00`);
}

function trainerStats(trainerId, daysAgo, values) {
  return {
    trainerId,
    updatedAt: morningOf(daysAgo),
    lastSeenAt: morningOf(values.lastSeenDaysAgo),
    students: values.students,
    sessions7d: values.sessions7d,
    adherence28d: values.adherence28d,
    quiet: values.quiet,
    pendingAssessments: values.pendingAssessments,
    billing: { month: localDate(Date.now()).slice(0, 7), ...values.billing },
  };
}

function trainerActivity(trainerId, daysAgo, actions) {
  const day = localDate(morningOf(daysAgo));
  const month = day.slice(0, 7);
  return [`trainerActivity/${trainerId}_${month}`, {
    trainerId,
    month,
    updatedAt: morningOf(daysAgo),
    actions,
    activeDays: [day],
  }];
}

async function resetAuth() {
  const response = await fetch(`${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Auth emulator reset failed: ${response.status} — is it running?`);
}

async function createAccount(email) {
  const response = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Couldn't create ${email}: ${JSON.stringify(body)}`);
  return body.localId;
}

function profile(name, overrides = {}) {
  return {
    name,
    gender: "Feminino",
    phone: "11999990000",
    goal: "Hipertrofia",
    experienceLevel: "Iniciante",
    medicalNotes: "",
    trainingDays: [],
    ...overrides,
  };
}

const env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: FIRESTORE });
try {
  await resetAuth();
  await env.clearFirestore();

  const now = Date.now();
  const today = localDate(now);
  const thisMonth = today.slice(0, 7);
  const lastMonth = addDays(`${thisMonth}-01`, -1).slice(0, 7);

  const trainerId = await createAccount(TRAINER_EMAIL);
  const adminId = await createAccount(ADMIN_EMAIL);
  const quietTrainerId = await createAccount(QUIET_TRAINER_EMAIL);
  const awayTrainerId = await createAccount(AWAY_TRAINER_EMAIL);
  const neverTrainerId = await createAccount(NEVER_TRAINER_EMAIL);
  const suspendedTrainerId = await createAccount(SUSPENDED_TRAINER_EMAIL);
  const ana = await createAccount("ana@teste.dev");
  const bruno = await createAccount("bruno@teste.dev");
  const carla = await createAccount("carla@teste.dev");
  const diego = await createAccount("diego@teste.dev");
  const lucia = await createAccount("lucia@teste.dev");
  const marco = await createAccount("marco@teste.dev");
  const nina = await createAccount("nina@teste.dev");

  const trainerUser = (name, email, createdDaysAgo, overrides = {}) => ({
    role: "TRAINER",
    name,
    email,
    createdAt: morningOf(createdDaysAgo),
    createdBy: adminId,
    accessStatus: "active",
    ...overrides,
  });

  const linked = (name, uid, inviteCode, createdAt, overrides = {}) => [
    `users/${uid}`,
    {
      role: "STUDENT",
      trainerId,
      inviteCode,
      ...profile(name, overrides),
      createdAt,
      canSelfAssess: false,
      canLogBiometrics: false,
      pendingAssessmentRequest: false,
      ...overrides,
    },
  ];

  const documents = Object.fromEntries([
    [`users/${adminId}`, { role: "ADM", name: "Admin de teste", email: ADMIN_EMAIL, createdAt: morningOf(60) }],
    [`users/${trainerId}`, trainerUser("Treinador de teste", TRAINER_EMAIL, 60)],
    [`users/${quietTrainerId}`, trainerUser("Personal Quieto", QUIET_TRAINER_EMAIL, 45)],
    [`users/${awayTrainerId}`, trainerUser("Personal Sumido", AWAY_TRAINER_EMAIL, 90)],
    [`users/${neverTrainerId}`, trainerUser("Personal Novo", NEVER_TRAINER_EMAIL, 5)],
    [`users/${suspendedTrainerId}`, trainerUser("Personal Suspenso", SUSPENDED_TRAINER_EMAIL, 50, {
      accessStatus: "suspended",
      suspendedAt: morningOf(2),
      suspendedReason: "Conta suspensa para teste",
    })],

    // §26j: the second trainer has three linked students; the other profiles exercise ADM usage states.
    [`users/${lucia}`, { role: "STUDENT", trainerId: quietTrainerId, ...profile("Lúcia Martins"), createdAt: morningOf(40) }],
    [`users/${marco}`, { role: "STUDENT", trainerId: quietTrainerId, ...profile("Marco Silva", { gender: "Masculino" }), createdAt: morningOf(35) }],
    [`users/${nina}`, { role: "STUDENT", trainerId: quietTrainerId, ...profile("Nina Costa"), createdAt: morningOf(20) }],

    [`trainerStats/${trainerId}`, trainerStats(trainerId, 0, {
      lastSeenDaysAgo: 0,
      students: { total: 6, linked: 4, pending: 2 },
      sessions7d: 4,
      adherence28d: 0.72,
      quiet: 1,
      pendingAssessments: 1,
      billing: { activePlans: 2, planCents: 27000, expectedCents: 27000, receivedCents: 15000, overdueCents: 12000 },
    })],
    [`trainerStats/${quietTrainerId}`, trainerStats(quietTrainerId, 14, {
      lastSeenDaysAgo: 14,
      students: { total: 3, linked: 3, pending: 0 },
      sessions7d: 0,
      adherence28d: 0.4,
      quiet: 2,
      pendingAssessments: 0,
      billing: { activePlans: 3, planCents: 45000, expectedCents: 45000, receivedCents: 45000, overdueCents: 0 },
    })],
    [`trainerStats/${awayTrainerId}`, trainerStats(awayTrainerId, 35, {
      lastSeenDaysAgo: 40,
      students: { total: 2, linked: 2, pending: 0 },
      sessions7d: 0,
      adherence28d: 0,
      quiet: 2,
      pendingAssessments: 0,
      billing: { activePlans: 2, planCents: 30000, expectedCents: 30000, receivedCents: 15000, overdueCents: 15000 },
    })],
    [`trainerStats/${suspendedTrainerId}`, trainerStats(suspendedTrainerId, 2, {
      lastSeenDaysAgo: 3,
      students: { total: 1, linked: 1, pending: 0 },
      sessions7d: 1,
      adherence28d: 0.5,
      quiet: 0,
      pendingAssessments: 0,
      billing: { activePlans: 1, planCents: 15000, expectedCents: 15000, receivedCents: 15000, overdueCents: 0 },
    })],
    // never@teste.dev intentionally has no trainerStats/lastSeenAt document: "Nunca entrou".
    trainerActivity(trainerId, 0, { login: 2, studentCreated: 1, geminiGenerated: 1, chargePaid: 1, fichaSaved: 2 }),
    trainerActivity(quietTrainerId, 14, { login: 1, fichaSaved: 1, measurementAdded: 1 }),
    trainerActivity(awayTrainerId, 35, { login: 1, studentCreated: 1 }),
    trainerActivity(suspendedTrainerId, 3, { login: 1, bookingAdded: 1 }),

    // Ana: claimed invite ANA00001, which was minted from draft-ana.
    ["students/draft-ana", { trainerId, role: "student", ...profile("Ana Costa"), createdAt: morningOf(60) }],
    ["invites/ANA00001", { trainerId, used: true, createdAt: morningOf(60), draftId: "draft-ana", ...profile("Ana Costa") }],
    linked("Ana Costa", ana, "ANA00001", morningOf(59), { trainingDays: ["Segunda", "Quarta", "Sexta"], canLogBiometrics: true }),
    linked("Bruno Alves", bruno, "BRU00001", morningOf(59), {
      gender: "Masculino",
      trainingDays: ["Terça", "Quinta"],
      medicalNotes: "Hérnia de disco L4-L5 — evitar carga axial",
    }),
    linked("Carla Dias", carla, "CAR00001", morningOf(2), { trainingDays: ["Segunda"] }),
    linked("Diego Rocha", diego, "DIE00001", morningOf(59), {
      gender: "Masculino",
      pendingAssessmentRequest: true,
      canSelfAssess: true,
    }),

    // Maria: a draft with an open invite; Pedro: a draft without one.
    ["students/draft-maria", { trainerId, role: "student", ...profile("Maria Souza"), createdAt: now }],
    [`invites/${OPEN_INVITE}`, { trainerId, used: false, createdAt: now, draftId: "draft-maria", ...profile("Maria Souza") }],
    ["students/draft-pedro", { trainerId, role: "student", ...profile("Pedro Lima", { gender: "Masculino" }), createdAt: now }],

    // Billing: Ana's charge for this month exists and is paid; Bruno owes last month and has no
    // charge yet this month (the dashboard's first load creates it from his plan).
    [`billingPlans/${ana}`, { studentId: ana, trainerId, amountCents: 15000, currency: "BRL", dueDay: 1, active: true, createdAt: morningOf(59) }],
    [`billingPlans/${bruno}`, { studentId: bruno, trainerId, amountCents: 12000, currency: "BRL", dueDay: 28, active: true, createdAt: morningOf(59) }],
    [`payments/${ana}_${thisMonth}`, charge(ana, `${thisMonth}-01`, 15000, now)],
    [`payments/${bruno}_${lastMonth}`, charge(bruno, `${lastMonth}-05`, 12000, null)],

    // Ana's fichas: the one her logs belong to, assigned; and an inactive one she must not see.
    ["workouts/ficha-a", ficha(ana, "Ficha A", true)],
    ["workouts/ficha-b", ficha(ana, "Ficha B — em revisão", false)],

    // The agenda: one document per weekly slot, as TrainerViewModel.bookSlot writes it.
    ...[["Segunda", ana, "07h"], ["Quarta", ana, "07h"], ["Sexta", ana, "07h"], ["Terça", bruno, "18h"], ["Quinta", bruno, "18h"]]
      .map(([dayOfWeek, studentId, hour]) => [`schedules/${studentId}-${dayOfWeek}`, { trainerId, studentId, dayOfWeek, hour }]),

    // The student page: Ana's measurements — the first as the Android add-student form writes it,
    // with a height — and Bruno's self-assessment.
    ["biometrics/ana-1", { trainerId, studentId: ana, weight: 74.2, height: 1.65, bodyFat: 24.5, date: morningOf(59) }],
    ["biometrics/ana-2", { trainerId, studentId: ana, weight: 73.1, height: 0, bodyFat: 0, date: morningOf(20) }],
    [
      "assessments/bruno-1",
      {
        trainerId,
        studentId: bruno,
        submittedAt: morningOf(30),
        parQAnswersJson: JSON.stringify({
          heart_condition: false,
          chest_pain_activity: false,
          chest_pain_rest: false,
          dizziness: false,
          bone_joint: true,
          medication: false,
          other_reason: false,
        }),
        goal: "Hipertrofia",
        experienceLevel: "Iniciante",
        trainingDays: ["Terça", "Quinta"],
      },
    ],
  ]);

  // As SqlDelightTrainerRepository saves a ficha: status and assignedAt follow isActive.
  function ficha(studentId, name, isActive) {
    return {
      trainerId,
      studentId,
      name,
      isActive,
      exercisesJson: JSON.stringify([
        { name: "Supino", sets: 3, reps: "12" },
        { name: "Remada", sets: 3, reps: "12" },
        { name: "Agachamento", sets: 4, reps: "10", weight: "40kg" },
      ]),
      createdAt: morningOf(30),
      status: isActive ? "assigned" : "draft",
      assignedAt: isActive ? morningOf(30) : null,
    };
  }

  function charge(studentId, dueDate, amountCents, paidAt) {
    return {
      trainerId,
      studentId,
      amountCents,
      currency: "BRL",
      dueDate,
      paidAt,
      method: paidAt === null ? null : "pix",
      source: "manual",
      externalId: null,
      note: null,
      createdAt: morningOf(40),
    };
  }

  // Workout logs: one document per exercise, as the Kotlin app writes them. The load goes up 1 kg a
  // day, and each session's second set is typed with a comma ("22,5") — a weight the phone's chart
  // can't read, so it counts neither there nor in the web's progression table.
  const session = (studentId, daysAgo) =>
    ["Supino", "Remada", "Agachamento"].map((exerciseName, i) => {
      const load = 20 + (12 - daysAgo);
      return [
        `workoutLogs/${studentId}-${daysAgo}-${i}`,
        {
          trainerId,
          studentId,
          workoutId: "ficha-a",
          exerciseName,
          date: morningOf(daysAgo) + i * 4, // milliseconds apart, like currentTimeMillis() in the loop
          performedSetsJson: JSON.stringify([
            { setNumber: 1, weight: String(load), reps: 12 },
            { setNumber: 2, weight: `${load + 2},5`, reps: 10 },
          ]),
          note: null,
        },
      ];
    });
  const logs = Object.fromEntries([
    ...[1, 3, 5, 8, 10, 12].flatMap((daysAgo) => session(ana, daysAgo)),
    ...session(bruno, 12),
    ...session(diego, 2),
  ]);

  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(Object.entries({ ...documents, ...logs }).map(([path, data]) => db.doc(path).set(data)));
  });

  console.log("Emulators seeded.");
  console.log(`  trainer:  ${TRAINER_EMAIL} / ${PASSWORD}`);
  console.log(`  students: ana@teste.dev, bruno@teste.dev, carla@teste.dev, diego@teste.dev / ${PASSWORD}`);
  console.log(`  invite:   http://localhost:3000/convite?c=${OPEN_INVITE}  (for "Maria Souza")`);
} finally {
  await env.cleanup();
}
