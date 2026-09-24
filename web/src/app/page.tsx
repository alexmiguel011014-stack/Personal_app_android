import Link from "next/link";

// GOALS.md §23i: the public landing. Stub — real content (what the service is) lands with 23i.
export default function Landing() {
  return (
    <main>
      <h1>Personal Tracker</h1>
      <p>Página pública — em construção (GOALS.md §23i).</p>
      <p>
        <Link href="/entrar">Entrar</Link>
      </p>
      <p>Aluno: use o link de convite que seu personal enviou.</p>
    </main>
  );
}
