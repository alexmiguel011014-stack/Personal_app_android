import { AccountSettings } from "./AccountSettings";
import { SettingsFrame } from "./SettingsFrame";

export function AccountSettingsPage() {
  return (
    <SettingsFrame subtitle="Seus dados de acesso e como usar o ALLU no celular.">
      <AccountSettings />
    </SettingsFrame>
  );
}
