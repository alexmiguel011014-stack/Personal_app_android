import { RequireArea } from "../RequireArea";
import { SignOutButton } from "../SignOutButton";

// GOALS.md §23h: the student surface. Mobile-first from the first line of markup — a student is on
// a phone browser essentially always, so this layout never inherits the trainer dashboard's.
// §23f's gate: only a STUDENT connected to a trainer gets past RequireArea.
export default function StudentLayout({ children }: LayoutProps<"/aluno">) {
  return (
    <RequireArea area="/aluno">
      <header>
        <p>
          Personal Tracker — aluno <SignOutButton />
        </p>
      </header>
      {children}
    </RequireArea>
  );
}
