"use client";

import { useEffect, useState } from "react";
import { getFirebase } from "../../../data/firebase";
import { trackActivity } from "../../../data/activity";
import { bookSlot, loadSchedules, removeBooking } from "../../../data/schedules";
import { addDays, weekdayOf } from "../../../domain/dates";
import { AGENDA_DAYS, AGENDA_HOURS, bookingsAt, bookingsOn, type Schedule } from "../../../domain/schedules";
import { dayMonthLong } from "../../_shared/dateLabels";
import { useSession } from "../../SessionProvider";
import { useTrainerData } from "../useTrainerData";

// GOALS.md §23g/§23k: the phone's ScheduleScreen. The template's agenda shows one day at a time;
// the week strip picks the day and the hours of that day are listed below it — which is also what
// fits a phone, where a seven-column table cannot. Pick a student, then "Agendar" in a free slot.
// Only connected students can be booked, for the reason fichas can't go to a draft
// (WorkoutsSection): a booking for a draft stays on the draft's id.

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
  const [pickedDay, setPickedDay] = useState<string | null>(null);
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

  if (data.status === "loading" || schedules === null) return <p className="loading">Carregando…</p>;
  if (data.status === "error") return <p role="alert">{data.message}</p>;
  if (schedules === "error") return <p role="alert">Não foi possível carregar a agenda.</p>;
  const timeZone = data.timeZone;

  // Every student document, drafts included, so an older booking still shows a name.
  const names = new Map([...data.snapshot.drafts, ...data.snapshot.linked].map((s) => [s.id, s.name]));
  const bookable = data.snapshot.students.filter((s) => s.linked).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const picked = names.get(studentId);

  const todayName = weekdayOf(data.today);
  const selectedDay = pickedDay ?? todayName;
  const monday = addDays(data.today, -AGENDA_DAYS.indexOf(todayName));
  const selectedDate = addDays(monday, AGENDA_DAYS.indexOf(selectedDay));

  async function run(write: () => Promise<unknown>, tracksBooking = false, activityAt?: number) {
    setError(null);
    try {
      await write();
      if (tracksBooking && activityAt !== undefined) await trackActivity(getFirebase().db, trainerId, "bookingAdded", activityAt, timeZone);
      setVersion((v) => v + 1);
    } catch {
      setError("Não foi possível salvar. Tente de novo.");
    }
  }

  const db = () => getFirebase().db;
  const bookedToday = bookingsOn(schedules, selectedDay);
  return (
    <main>
      <header className="page-header">
        <div>
          <h1>Agenda</h1>
          <p className="header-subtitle">
            Os horários fixos da semana. Escolha um aluno e toque em &quot;Agendar&quot; num horário livre.
          </p>
        </div>
      </header>

      <div className="student-picker">
        <label>
          Aluno
          <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">— escolha —</option>
            {bookable.map((student) => (
              <option key={student.id} value={student.id}>
                {student.name}
              </option>
            ))}
          </select>
        </label>
        <p className="section-footnote">
          {picked === undefined ? "Só alunos conectados podem ser agendados. Escolha um para liberar o “Agendar”." : `Agendando ${picked}.`}
        </p>
      </div>

      {error && <p role="alert">{error}</p>}

      <div className="week-strip compact-week" role="group" aria-label="Dia da semana">
        {AGENDA_DAYS.map((day, index) => {
          const isSelected = day === selectedDay;
          const count = bookingsOn(schedules, day);
          return (
            <button
              key={day}
              type="button"
              className={`day-cell${isSelected ? " selected" : ""}`}
              aria-pressed={isSelected}
              aria-current={day === todayName ? "date" : undefined}
              onClick={() => setPickedDay(day)}
            >
              <span>{day.slice(0, 3)}</span>
              <strong>{addDays(monday, index).slice(8)}</strong>
              <small>{count === 0 ? "Livre" : `${count} ${count === 1 ? "horário" : "horários"}`}</small>
            </button>
          );
        })}
      </div>

      <section className="panel" aria-labelledby="day-title">
        <div className="section-heading">
          <h2 id="day-title">{dayMonthLong(selectedDate)}</h2>
          <span className="quiet-count">
            {bookedToday} {bookedToday === 1 ? "horário reservado" : "horários reservados"}
          </span>
        </div>
        <div className="slot-list">
          {AGENDA_HOURS.map((hour) => {
            const here = bookingsAt(schedules, selectedDay, hour);
            const time = `${hour.slice(0, 2)}:00`;
            return (
              <div className={`slot${here.length > 0 ? " is-booked" : ""}`} key={hour}>
                <time dateTime={time}>{time}</time>
                <div className="slot-body">
                  {here.map((booking) => {
                    const name = names.get(booking.studentId) ?? "Aluno não encontrado";
                    return (
                      <div className="slot-booking" key={booking.id}>
                        <p className="slot-name">{name}</p>
                        <button
                          type="button"
                          aria-label={`Remover ${name} de ${selectedDay} às ${hour}`}
                          onClick={() => void run(() => removeBooking(db(), booking.id))}
                        >
                          Remover
                        </button>
                      </div>
                    );
                  })}
                  {here.length === 0 && <p className="slot-empty">Livre</p>}
                </div>
                {here.length === 0 && (
                  <div className="slot-actions">
                    <button
                      type="button"
                      disabled={picked === undefined}
                      aria-label={`Agendar ${picked ?? "aluno"} em ${selectedDay} às ${hour}`}
                      onClick={() => void run(() => bookSlot(db(), trainerId, studentId, selectedDay, hour), true, Date.now())}
                    >
                      Agendar
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
