// GOALS.md §40c: the two tabs of every role's Configurações page. The routes stay `/<area>/conta/` and
// `/<area>/conta/instalar/` (the URLs in e-mails already sent must keep working), only the labels changed. Pure: the
// caller passes the pathname, with or without a trailing slash (the site exports with trailingSlash).

export interface SettingsTab {
  href: string;
  label: string;
  current: boolean;
}

export function settingsTabs(pathname: string): SettingsTab[] {
  const path = pathname.replace(/\/+$/, "");
  const root = path.replace(/\/instalar$/, "");
  return [
    { href: root, label: "Minha conta", current: path === root },
    { href: `${root}/instalar`, label: "Instalar no celular", current: path === `${root}/instalar` },
  ];
}
