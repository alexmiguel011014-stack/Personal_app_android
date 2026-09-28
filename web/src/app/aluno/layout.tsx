import Link from "next/link";
import { RequireArea } from "../RequireArea";
import { SignOutButton } from "../SignOutButton";

// GOALS.md §23h: the student surface. Mobile-first from the first line of markup — a student is on
// a phone browser essentially always, so this layout never inherits the trainer dashboard's: one
// column, one thing at a time, the phone's two tabs (Treinos / Evolução) as a two-link nav.
// §23f's gate: only a STUDENT connected to a trainer gets past RequireArea.
export default function StudentLayout({ children }: LayoutProps<"/aluno">) {
  return (
    <RequireArea area="/aluno">
      <header>
        <p>
          Personal Tracker <SignOutButton />
        </p>
        <nav>
          <ul>
            <li>
              <Link href="/aluno">Fichas</Link>
            </li>
            <li>
              <Link href="/aluno/evolucao">Evolução</Link>
            </li>
          </ul>
        </nav>
      </header>
      {children}
    </RequireArea>
  );
}
