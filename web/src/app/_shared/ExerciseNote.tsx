import type { Exercise } from "../../domain/exercise";
import { summarizeExercise } from "../../domain/exerciseDetails";

// GOALS.md §38d: what the trainer wrote about an exercise, under its line — the observação as plain text (React escapes
// it) and, when it holds an http(s) link, "Ver vídeo". The link opens in a new tab without handing it this page.
export function ExerciseNote({ exercise }: { exercise: Exercise }) {
  const { note, videoUrl } = summarizeExercise(exercise);
  if (note === null) return null;
  return (
    <small className="exercise-note">
      {note}
      {videoUrl !== null && (
        <>
          {" "}
          <a href={videoUrl} target="_blank" rel="noopener noreferrer">
            Ver vídeo
          </a>
        </>
      )}
    </small>
  );
}
