"use client";

import { useRouter } from "next/navigation";
import { getFirebase } from "../../../../data/firebase";
import { createDraftStudent } from "../../../../data/students";
import { trackActivity } from "../../../../data/activity";
import { emptyProfile } from "../../../../domain/studentProfile";
import { useSession } from "../../../SessionProvider";
import { StudentForm } from "../StudentForm";

// GOALS.md §23g: registering a student creates a draft (students/{id}), as on Android; the invite
// link that turns it into an account is generated from the student's page.
export default function NewStudentPage() {
  const { session } = useSession();
  const router = useRouter();
  if (session.status !== "signedIn") return null;
  const trainerId = session.uid;

  return (
    <main>
      <h1>Cadastrar aluno</h1>
      <StudentForm
        initial={emptyProfile()}
        submitLabel="Cadastrar"
        onSubmit={async (profile) => {
          const { db } = getFirebase();
          const now = Date.now();
          const id = await createDraftStudent(db, trainerId, profile, now);
          await trackActivity(db, trainerId, "studentCreated", now, Intl.DateTimeFormat().resolvedOptions().timeZone);
          router.push(`/app/alunos/detalhe?id=${encodeURIComponent(id)}`);
        }}
      />
    </main>
  );
}
