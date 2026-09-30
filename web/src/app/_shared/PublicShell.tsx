import Link from "next/link";
import type { ReactNode } from "react";

// The frame of the pages a visitor sees before signing in — landing, sign-in, invite. The same
// forest-green wordmark bar as the signed-in areas, without the navigation rail.

export function PublicShell({ action, children }: { action?: ReactNode; children: ReactNode }) {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <header className="public-header">
        <Link className="wordmark" href="/" aria-label="ALLU, página inicial">
          ALLU<span>.</span>
        </Link>
        {action && <nav aria-label="Acesso">{action}</nav>}
      </header>
      <main id="conteudo" className="public-page">
        {children}
      </main>
      <footer className="public-footer">
        ALLU <span className="footer-dot" aria-hidden="true" /> Caderno de treino
      </footer>
    </div>
  );
}
