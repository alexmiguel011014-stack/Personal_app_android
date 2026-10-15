"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { settingsTabs } from "../../domain/settingsTabs";

// GOALS.md §40c: "Minha conta" became "Configurações" — one header and two tabs, "Minha conta" (the account form, as
// before) and "Instalar no celular" (§40d). The tabs are real routes (`…/conta/` and `…/conta/instalar/`), so each has
// a link and a title; the role's area is read from the pathname, so the three areas share this frame.
export function SettingsFrame({ eyebrow, subtitle, children }: { eyebrow?: string; subtitle: string; children: ReactNode }) {
  const tabs = settingsTabs(usePathname());
  return (
    <main>
      <header className="page-header">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h1>Configurações</h1>
          <p className="header-subtitle">{subtitle}</p>
        </div>
      </header>
      <nav className="settings-tabs" aria-label="Seções das configurações">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href} aria-current={tab.current ? "page" : undefined}>
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </main>
  );
}
