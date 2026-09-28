"use client";

import { useEffect, useState } from "react";
import { getFirebase } from "../../../data/firebase";
import { bookSlot, loadSchedules, removeBooking } from "../../../data/schedules";
import { AGENDA_DAYS, AGENDA_HOURS, bookingsAt, bookingsOn, type Schedule } from "../../../domain/schedules";
import { useSession } from "../../SessionProvider";
import { useTrainerData } from "../useTrainerData";

// GOALS.md §23g: the phone's ScheduleScreen as one table — the week across, the hours down. Pick a
// student, then "Agendar" in a free slot. Only connected students can be booked, for the reason
// fichas can't go to a draft (WorkoutsSection): a booking for a draft stays on the draft's id.

export default function AgendaPage() {
  const { session } = useSession();
  if (session.status !== "signedIn") return null;
  return <Agenda trainerId={session.uid} />;
}

function Agenda({ trainerId }: { trainerId: string }) {
  const { data } = useTrainerData(trainerId);
  const [schedules, setSchedules] = useState<Schedule[] | "error" | null>(null);
  const [version, setVersion] = useState(0);
  const [studentId, setStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSchedules(getFirebase().db, trainerId).then(
      (loaded) => !cancelled && setSchedules(loaded),
      () => !cancelled && setSchedules("error"),
    );
    return () => {
      cancelled = true;
    };
  }, [trainerId, version]);

  if (data.status === "loading" || schedules === null) return <p>Carregando…</p>;
  if (data.status === "error") return <p role="alert">{data.message}</p>;
  if (schedules === "error") return <p role="alert">Não foi possível carregar a agenda.</p>;

  // Every student document, drafts included, so an older booking still shows a name.
  const names = new Map([...data.snapshot.drafts, ...data.snapshot.linked].map((s) => [s.id, s.name]));
  const bookable = data.snapshot.students.filter((s) => s.linked).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const picked = names.get(studentId);

  async function run(write: () => Promise<unknown>) {
    setError(null);
    try {
      await write();
      setVersion((v) => v + 1);
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    }
  }

  const db = () => getFirebase().db;
  return (
    <main>
      <h1>Agenda</h1>
      <p>Os horários fixos da semana. Escolha um aluno e clique em &quot;Agendar&quot; num horário livre.</p>
      <p>
        <label>
          Aluno{" "}
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">— escolha —</option>
            {bookable.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>{" "}
        (só alunos conectados)
      </p>
      {error && <p role="alert">{error}</p>}
      <table>
        <thead>
          <tr>
            <th scope="col">Hora</th>
            {AGENDA_DAYS.map((day) => (
              <th scope="col" key={day}>
                {day} ({bookingsOn(schedules, day)})
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {AGENDA_HOURS.map((hour) => (
            <tr key={hour}>
              <th scope="row">{hour}</th>
              {AGENDA_DAYS.map((day) => {
                const here = bookingsAt(schedules, day, hour);
                return (
                  <td key={day}>
                    {here.map((booking) => {
                      const name = names.get(booking.studentId) ?? "Aluno não encontrado";
                      return (
                        <p key={booking.id}>
                          {name}{" "}
                          <button
                            type="button"
                            aria-label={`Remover ${name} de ${day} às ${hour}`}
                            onClick={() => void run(() => removeBooking(db(), booking.id))}
                          >
                            Remover
                          </button>
                        </p>
                      );
                    })}
                    {here.length === 0 && (
                      <button
                        type="button"
                        disabled={picked === undefined}
                        aria-label={`Agendar ${picked ?? "aluno"} em ${day} às ${hour}`}
                        onClick={() => void run(() => bookSlot(db(), trainerId, studentId, day, hour))}
                      >
                        Agendar
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
