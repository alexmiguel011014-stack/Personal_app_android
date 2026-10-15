import type { ReactNode } from "react";
import { AccountSettings } from "./AccountSettings";

export function AccountSettingsPage({ children }: { children?: ReactNode }) {
  return (
    <main>
      <header className="page-header">
        <div>
          <p className="eyebrow">Configurações</p>
          <h1>Minha conta</h1>
          <p className="header-subtitle">Mantenha seus dados pessoais atualizados.</p>
        </div>
      </header>
      <AccountSettings />
      {children}
    </main>
  );
}
