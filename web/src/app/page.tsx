import Link from "next/link";
import { PublicShell } from "./_shared/PublicShell";
import { SignedInShortcut } from "./SignedInShortcut";

// GOALS.md §23i: the public landing — what the service is, and the ways in. Static on purpose (it's
// the one page a search engine or a first-time visitor sees); only the shortcut for someone already
// signed in runs in the browser. §23k: the ALLU template's voice — a forest-green band, then plain
// columns. The trainer asked (2026-09-30) for as few doors as possible: one "Entrar" in the header
// for people who already have an account, and the invite-code button — no other sign-in links.
export default function Landing() {
  return (
    <PublicShell
      action={
        <Link className="button button-on-dark" href="/entrar">
          Entrar
        </Link>
      }
    >
      <section className="hero">
        <div className="hero-inner">
          <h1>
            ALLU<span className="hero-dot" aria-hidden="true">.</span> <span className="hero-tag">personal</span>
          </h1>
          <p>
            Acompanhamento de alunos para personal trainers: fichas de treino, registro das sessões, evolução e
            mensalidades, num lugar só — e o aluno com a ficha dele no celular.
          </p>
          <SignedInShortcut />
          <div className="hero-actions">
            <Link className="button button-leaf" href="/convite">
              Tenho um código de convite
            </Link>
          </div>
        </div>
      </section>

      <div className="public-main">
        <div className="feature-columns">
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
          </section>

          <section>
            <h2>Para o aluno</h2>
            <ul>
              <li>A sua ficha sempre à mão, no navegador do celular.</li>
              <li>Cada treino registrado — carga e repetições — e a sua evolução ao longo do tempo.</li>
              <li>A autoavaliação respondida quando o seu personal pedir.</li>
            </ul>
            <p>Para começar, peça o link de convite ao seu personal.</p>
          </section>
        </div>
      </div>
    </PublicShell>
  );
}
