import Link from "next/link";
import { SignedInShortcut } from "./SignedInShortcut";

// GOALS.md §23i: the public landing — what the service is, and the two ways in: signing in, and
// the invite link a student gets from their trainer. Static on purpose (it's the one page a search
// engine or a first-time visitor sees); only the shortcut for someone already signed in runs in the
// browser.
export default function Landing() {
  return (
    <>
      <header>
        <p>
          Personal Tracker — <Link href="/entrar">Entrar</Link>
        </p>
      </header>
      <main>
        <h1>Personal Tracker</h1>
        <p>
          Acompanhamento de alunos para personal trainers: fichas de treino, registro das sessões, evolução e
          mensalidades, num lugar só — e o aluno com a ficha dele no celular.
        </p>
        <SignedInShortcut />

        <section>
          <h2>Para o personal</h2>
          <ul>
            <li>Um painel com a semana: sessões, aderência ao plano, quem sumiu e avaliações pendentes.</li>
            <li>
              Fichas montadas à mão ou com a IA que você já usa: o site monta o pedido com o perfil do aluno, e a
              resposta colada vira a ficha.
            </li>
            <li>A evolução de cada aluno: medidas, progressão de carga, sessões registradas e o questionário PAR-Q+.</li>
            <li>A agenda da semana e as mensalidades — quem pagou e quem está em atraso.</li>
          </ul>
          <p>
            <Link href="/entrar">Entrar como personal</Link>
          </p>
        </section>

        <section>
          <h2>Para o aluno</h2>
          <ul>
            <li>A sua ficha sempre à mão, no navegador do celular.</li>
            <li>Cada treino registrado — carga e repetições — e a sua evolução ao longo do tempo.</li>
            <li>A autoavaliação respondida quando o seu personal pedir.</li>
          </ul>
          <p>Para começar, peça o link de convite ao seu personal.</p>
          <p>
            <Link href="/convite">Tenho um código de convite</Link> · <Link href="/entrar">Já tenho conta</Link>
          </p>
        </section>
      </main>
    </>
  );
}
