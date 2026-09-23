import Link from "next/link";

// GOALS.md §23i: the public landing. Stub — real content (what the service is, login and invite
// entry points) lands with 23i.
export default function Landing() {
  return (
    <main>
      <h1>Personal Tracker</h1>
      <p>Página pública — em construção (GOALS.md §23i).</p>
      <ul>
        <li>
          <Link href="/app">Área do treinador</Link>
        </li>
        <li>
          <Link href="/aluno">Área do aluno</Link>
        </li>
      </ul>
    </main>
  );
}
