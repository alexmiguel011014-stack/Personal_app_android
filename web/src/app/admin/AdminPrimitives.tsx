import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeading({ eyebrow = "Administração", title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return <header className="page-header"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1>{children && <p className="header-subtitle">{children}</p>}</div></header>;
}

export function LoadingOrError({ loading, error, retry }: { loading: boolean; error: string | null; retry?: () => void }) {
  if (loading) return <p className="loading" role="status">Carregando dados…</p>;
  if (error) return <div><p role="alert">{error}</p>{retry && <button type="button" onClick={retry}>Tentar de novo</button>}</div>;
  return null;
}

export function Money({ cents }: { cents: number | null }) {
  return <>{cents === null ? "Ainda sem dados" : (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</>;
}

export function DateTime({ at }: { at: number | null }) {
  return <>{at === null || at <= 0 ? "Ainda sem dados" : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(at)}</>;
}

export function AdminLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link className="button" href={href}>{children}</Link>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="admin-empty">{children}</p>;
}
