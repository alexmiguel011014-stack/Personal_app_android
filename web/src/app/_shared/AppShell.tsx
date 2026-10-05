"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useSession } from "../SessionProvider";
import { SignOutButton } from "../SignOutButton";
import { Avatar } from "./Avatar";
import { NavIcon, type IconName } from "./icons";
import { Wordmark } from "./Wordmark";

// The ALLU template's frame (DESIGN.md): a forest-green rail with the wordmark and the navigation
// on a desktop; on a tablet or phone (<= 860px, see globals.css) the rail shrinks to a slim top bar
// and the navigation moves to a tab bar at the bottom of the screen, where a thumb reaches it. One
// component for both areas — `area` only changes the content width and the copy.

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Current only on this exact path, not on the paths beneath it (the area's home). */
  exact?: boolean;
}

function isCurrent(pathname: string, item: NavItem): boolean {
  // trailingSlash: true — "/app/alunos/" and "/app/alunos" are the same place.
  const path = pathname.replace(/\/+$/, "") || "/";
  return item.exact ? path === item.href : path === item.href || path.startsWith(`${item.href}/`);
}

export function AppShell({
  area,
  home,
  caption,
  note,
  roleLabel,
  nav,
  children,
}: {
  area: "trainer" | "student" | "admin";
  home: string;
  caption: string;
  note: string;
  roleLabel: string;
  nav: readonly NavItem[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { session } = useSession();
  const who = session.status === "signedIn" ? (session.email ?? "Minha conta") : "";
  const accountHref = `${home.replace(/\/$/, "")}/conta`;

  return (
    <>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="app-shell" data-area={area}>
        <aside className="rail">
          <Wordmark href={home} label="ALLU personal, início" />
          <p className="rail-caption">{caption}</p>
          <nav className="primary-nav" aria-label="Navegação principal">
            {nav.map((item) => (
              <Link
                key={item.href}
                className="nav-link"
                href={item.href}
                aria-current={isCurrent(pathname, item) ? "page" : undefined}
              >
                <NavIcon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            ))}
          </nav>
          <div className="rail-note">
            <p>{note}</p>
            <span className="note-byline">Caderno ALLU</span>
          </div>
          <div className="profile-chip">
            <Link
              className="profile-account"
              href={accountHref}
              title="Abrir configurações da minha conta"
              aria-label="Abrir configurações da minha conta"
              aria-current={pathname.replace(/\/+$/, "") === accountHref ? "page" : undefined}
            >
              <Avatar name={who || "ALLU"} tone="dark" uid={session.status === "signedIn" ? session.uid : undefined} />
              <span className="profile-meta">
                <strong title={who}>{who}</strong>
                <small>{roleLabel} · Minha conta</small>
              </span>
              <span className="account-mobile-label" aria-hidden="true">Conta</span>
            </Link>
            <SignOutButton className="signout" />
          </div>
        </aside>

        <div className="main-content" id="conteudo">
          <div className="content-column">
            {children}
            <footer className="page-footer">
              <span>
                ALLU personal <span className="footer-dot" aria-hidden="true" /> Caderno de treino
              </span>
              {area === "trainer" && (
                <span>O uso do site é contabilizado de forma agregada (quantidade de ações e dias de uso) para a administração da plataforma; nenhum dado de aluno é incluído.</span>
              )}
            </footer>
          </div>
        </div>
      </div>
    </>
  );
}
