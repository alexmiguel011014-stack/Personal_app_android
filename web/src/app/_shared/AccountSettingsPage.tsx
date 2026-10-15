import type { ReactNode } from "react";
import { AccountSettings } from "./AccountSettings";
import { SettingsFrame } from "./SettingsFrame";

export function AccountSettingsPage({ children }: { children?: ReactNode }) {
  return (
    <SettingsFrame subtitle="Seus dados de acesso e como usar o ALLU no celular.">
      <AccountSettings />
      {children}
    </SettingsFrame>
  );
}
