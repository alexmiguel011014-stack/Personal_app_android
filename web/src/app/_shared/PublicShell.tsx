import type { ReactNode } from "react";
import { Wordmark } from "./Wordmark";

// The frame of the pages a visitor sees before signing in — landing, sign-in, invite. The same
// forest-green wordmark bar as the signed-in areas, without the navigation rail.

export function PublicShell({ action, children }: { action?: ReactNode; children: ReactNode }) {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="public-header">
        <Wordmark href="/" label="ALLU personal, página inicial" />
        {action && <nav aria-label="Acesso">{action}</nav>}
      </header>
      <main id="conteudo" className="public-page">
        {children}
      </main>
      <footer className="public-footer">
        ALLU personal <span className="footer-dot" aria-hidden="true" /> Caderno de treino
      </footer>
    </div>
  );
}
